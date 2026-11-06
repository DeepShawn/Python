// Python 执行适配层。三端实现同一接口：
//   PythonRuntime  浏览器 / Android WebView：Pyodide 运行在 Web Worker 中
//   NativeRuntime  Windows / 桌面（Tauri）：嵌入式 CPython 子进程（web/py/nexus_host.py）
// 事件：status（loading/ready/error）、stream（程序输出）、input（程序等待 input()）

const INPUT_BYTES = 64 * 1024;

class BaseRuntime extends EventTarget {
  constructor() {
    super();
    this.info = null;
    this.busy = false;
    this._seq = 0;
    this._pending = new Map();
  }

  _status(detail) { this.dispatchEvent(new CustomEvent("status", { detail })); }

  _onMessage(msg) {
    if (msg.type === "stream") { this.dispatchEvent(new CustomEvent("stream", { detail: msg })); return; }
    if (msg.type === "input") { this.dispatchEvent(new CustomEvent("input", { detail: msg })); return; }
    if (msg.type === "ready") return;
    const p = this._pending.get(msg.id);
    if (!p) return;
    this._pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.result); else p.reject(new Error(msg.error));
  }

  _request(type, payload) {
    const id = ++this._seq;
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
      this._post({ id, type, payload });
    });
  }

  _boot(payload) {
    this._status({ state: "loading" });
    this.ready = this._request("boot", payload).then((info) => {
      this.info = info;
      this._status({ state: "ready", info });
      return info;
    }, (err) => {
      this._status({ state: "error", message: err.message });
      throw err;
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

  get interactive() { return !!(this.info && this.info.interactive); }

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
}

export class PythonRuntime extends BaseRuntime {
  constructor() {
    super();
    this.native = false;
    // 跨源隔离（COOP/COEP，由 Service Worker 或服务器设置）时才能使用 SharedArrayBuffer 实现交互输入
    this.sab = typeof SharedArrayBuffer !== "undefined" && self.crossOriginIsolated
      ? new SharedArrayBuffer(8 + INPUT_BYTES) : null;
    this._start();
  }

  _start() {
    this.worker = new Worker(new URL("./worker.js", import.meta.url));
    this.worker.onmessage = (e) => this._onMessage(e.data);
    this.worker.onerror = (e) => this._status({ state: "error", message: e.message || "Worker 出错" });
    this._boot({ sab: this.sab });
  }

  _post(msg) { this.worker.postMessage(msg); }

  /** 回应程序的 input() 请求；value 为 null 表示输入结束（EOF）。 */
  provideInput(value) {
    if (!this.sab) return;
    const ctrl = new Int32Array(this.sab, 0, 2);
    if (value === null) {
      Atomics.store(ctrl, 0, 2);
    } else {
      const bytes = new TextEncoder().encode(String(value)).slice(0, INPUT_BYTES);
      new Uint8Array(this.sab, 8).set(bytes);
      Atomics.store(ctrl, 1, bytes.length);
      Atomics.store(ctrl, 0, 1);
    }
    Atomics.notify(ctrl, 0);
  }

  /** 强制终止正在运行的程序（例如死循环），并重启运行时。 */
  restart() {
    this.worker.terminate();
    this._rejectAll("程序已被用户终止");
    this._start();
  }
}

/** 根据运行环境选择执行引擎：Tauri 外壳中使用原生 CPython，否则使用 Pyodide。 */
export async function createRuntime() {
  const core = globalThis.__TAURI__?.core;
  if (core) {
    try {
      // 桌面端有嵌入式 CPython 时使用原生运行时；Android 等没有 Python 子进程的平台使用 WebView 中的 Pyodide
      const info = await core.invoke("runtime_info");
      if (info.native) {
        const { NativeRuntime } = await import("./runtime-native.js");
        return new NativeRuntime();
      }
    } catch (err) {
      console.warn("原生运行时不可用，回退到 Pyodide：", err);
    }
  }
  return new PythonRuntime();
}
