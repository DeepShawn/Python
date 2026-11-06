// 原生运行时（Tauri 2 外壳）：Rust 侧启动随应用打包的嵌入式 CPython，运行 web/py/nexus_host.py，
// 通过 JSON 行协议通信。协议与浏览器 Worker 完全一致，另外支持真正的交互式 input()、
// 本机 HTTP 教学网站、离线安装 .whl 与 PyInstaller 打包。
const tauri = () => globalThis.__TAURI__;

export class NativeRuntime extends EventTarget {
  constructor() {
    super();
    this.native = true;
    this.info = null;
    this.busy = false;
    this._seq = 0;
    this._pending = new Map();
    this._unlisten = null;
    this._start();
  }

  async _start() {
    const { core, event } = tauri();
    this.dispatchEvent(new CustomEvent("status", { detail: { state: "loading" } }));
    if (!this._unlisten) {
      this._unlisten = await event.listen("py-line", (e) => {
        let msg;
        try { msg = JSON.parse(e.payload); } catch { return; }
        this._onMessage(msg);
      });
      await event.listen("py-exit", () => {
        this._rejectAll("Python 进程已退出");
      });
    }
    this.ready = core.invoke("py_start").then(() => this._request("boot")).then((info) => {
      this.info = { ...info, interactive: true };
      this.dispatchEvent(new CustomEvent("status", { detail: { state: "ready", info: this.info } }));
      return this.info;
    }, (err) => {
      this.dispatchEvent(new CustomEvent("status", { detail: { state: "error", message: String(err) } }));
      throw err;
    });
  }

  _onMessage(msg) {
    if (msg.type === "stream") { this.dispatchEvent(new CustomEvent("stream", { detail: msg })); return; }
    if (msg.type === "input") { this.dispatchEvent(new CustomEvent("input", { detail: msg })); return; }
    if (msg.type === "ready") return;
    const p = this._pending.get(msg.id);
    if (!p) return;
    this._pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.result); else p.reject(new Error(msg.error));
  }

  _send(obj) { return tauri().core.invoke("py_send", { line: JSON.stringify(obj) }); }

  _request(type, payload) {
    const id = ++this._seq;
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
      this._send({ id, type, payload }).catch((err) => { this._pending.delete(id); reject(new Error(String(err))); });
    });
  }

  _rejectAll(message) {
    for (const p of this._pending.values()) p.reject(new Error(message));
    this._pending.clear();
    this.busy = false;
  }

  async call(type, payload) {
    await this.ready;
    this.busy = true;
    try { return await this._request(type, payload); } finally { this.busy = false; }
  }

  get interactive() { return true; }

  provideInput(value) { this._send({ type: "input_reply", value }); }

  restart() {
    this._rejectAll("程序已被用户终止");
    tauri().core.invoke("py_kill").finally(() => this._start());
  }

  run(args) { return this.call("run", args); }
  trace(args) { return this.call("trace", args); }
  check(args) { return this.call("check", args); }
  analyze(args) { return this.call("analyze", args); }
  test(args) { return this.call("test", args); }
  judge(args) { return this.call("judge", args); }
  checkRandom(args) { return this.call("checkRandom", args); }
  replPush(line) { return this.call("replPush", { line }); }
  replReset() { return this.call("replReset"); }
  complete(prefix) { return this.call("complete", { prefix }); }

  // ---- 原生专属
  netServe(port = 8808) { return this.call("netServe", { port }); }
  installLocal(paths) { return this.call("installLocal", { paths }); }
  buildExe(args) { return this.call("buildExe", args); }
  listPackages() { return this.call("listPackages"); }
  pickFiles(filters) { return tauri().core.invoke("pick_files", { filters }); }
  openFolder() { return tauri().core.invoke("open_project_folder"); }
  saveFolder(dir, files) { return tauri().core.invoke("save_project_folder", { dir, files }); }
  revealPath(path) { return tauri().core.invoke("reveal_path", { path }); }
}
