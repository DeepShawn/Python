// Python Nexus Service Worker
//  1. 首次打开后缓存全部资源（含 vendor/ 中的 Pyodide、CodeMirror、Blockly 等），之后完全离线可用；
//  2. 为同源响应加上 COOP / COEP 头，使页面进入跨源隔离状态，从而可以使用 SharedArrayBuffer
//     实现真正的交互式 input()（普通静态服务器无需任何配置）。
const CACHE = "python-nexus-v2";
const SHELL = [
  "./", "index.html", "manifest.webmanifest", "icons/icon.svg", "css/app.css",
  "js/app.js", "js/ui.js", "js/runtime.js", "js/runtime-native.js", "js/worker.js", "js/editor.js",
  "js/cm-editor.js", "js/flowchart.js", "js/effects.js", "js/crypto.js", "js/bank-key.js", "js/storage.js",
  "js/learn.js", "js/practice.js", "js/exam.js", "js/blocks.js",
  "data/lessons.js", "data/exercises.js",
  "py/nexus_core.py", "py/nexus_tracer.py", "py/nexus_flow.py", "py/nexus_repl.py", "py/nexus_judge.py", "py/nexus_net.py",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    try {
      const res = await fetch("vendor/manifest.json");
      if (res.ok) {
        const files = await res.json();
        await Promise.all(files.map((u) => cache.add(u).catch(() => {})));
      }
    } catch { /* 未运行 npm run vendor */ }
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

function isolate(res) {
  if (!res || res.status === 0 || res.type === "opaque") return res;
  const headers = new Headers(res.headers);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "credentialless");
  headers.set("Cross-Origin-Resource-Policy", "cross-origin");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

// 网络优先（开发时总能拿到最新文件），离线时回退到缓存
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const sameOrigin = new URL(req.url).origin === location.origin;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    let res;
    try {
      res = await fetch(req);
      if (res.ok && (sameOrigin || req.url.includes("/pyodide/"))) cache.put(req, res.clone());
    } catch (err) {
      res = await cache.match(req, { ignoreSearch: true });
      if (!res) throw err;
    }
    return sameOrigin ? isolate(res) : res;
  })());
});
