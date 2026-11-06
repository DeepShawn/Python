// Python 执行适配层（浏览器端：Pyodide / WebAssembly）。
// Windows（嵌入式 CPython）和 Android（Chaquopy）后期实现同一接口即可替换。

export class PythonRuntime extends EventTarget {
  constructor() {
    super();
    this.info = null;
    this._seq = 0;
    this._pending = new Map();
    this._start();
  }

  _start() {
    this.worker = new Worker(new URL("./worker.js", import.meta.url));
    this.worker.onmessage = (e) => this._onMessage(e.data);
    this.worker.onerror = (e) => {
      this.dispatchEvent(new CustomEvent("status", { detail: { state: "error", message: e.message || "Worker 出错" } }));
    };
    this.dispatchEvent(new CustomEvent("status", { detail: { state: "loading" } }));
    this.ready = this._send("boot").then((info) => {
      this.info = info;
      this.dispatchEvent(new CustomEvent("status", { detail: { state: "ready", info } }));
      return info;
    }, (err) => {
      this.dispatchEvent(new CustomEvent("status", { detail: { state: "error", message: err.message } }));
      throw err;
    });
  }

  _onMessage(msg) {
    if (msg.type === "stream") {
      this.dispatchEvent(new CustomEvent("stream", { detail: msg }));
      return;
    }
    const p = this._pending.get(msg.id);
    if (!p) return;
    this._pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.result); else p.reject(new Error(msg.error));
  }

  _send(type, payload) {
    const id = ++this._seq;
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
      this.worker.postMessage({ id, type, payload });
    });
  }

  async call(type, payload) {
    await this.ready;
    this.busy = true;
    try { return await this._send(type, payload); } finally { this.busy = false; }
  }

  /** 强制终止正在运行的程序（例如死循环），并重启运行时。 */
  restart() {
    this.worker.terminate();
    for (const p of this._pending.values()) p.reject(new Error("程序已被用户终止"));
    this._pending.clear();
    this.busy = false;
    this._start();
  }

  run(args) { return this.call("run", args); }
  trace(args) { return this.call("trace", args); }
  check(args) { return this.call("check", args); }
  analyze(args) { return this.call("analyze", args); }
  test(args) { return this.call("test", args); }
  judge(args) { return this.call("judge", args); }
  replPush(line) { return this.call("replPush", { line }); }
  replReset() { return this.call("replReset"); }
  complete(prefix) { return this.call("complete", { prefix }); }
}
