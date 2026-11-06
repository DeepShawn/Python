// Python Nexus Service Worker：首次打开后缓存全部资源，之后可完全离线（包括飞行模式）。
const CACHE = "python-nexus-v1";
const SHELL = [
  "./", "index.html", "manifest.webmanifest", "icons/icon.svg", "css/app.css",
  "js/app.js", "js/runtime.js", "js/worker.js", "js/editor.js", "js/flowchart.js",
  "js/effects.js", "js/crypto.js", "js/storage.js",
  "data/lessons.js", "data/exercises.js",
  "py/nexus_core.py", "py/nexus_tracer.py", "py/nexus_flow.py", "py/nexus_repl.py", "py/nexus_judge.py",
];
const PYODIDE = [
  "vendor/pyodide/pyodide.js", "vendor/pyodide/pyodide.asm.js", "vendor/pyodide/pyodide.asm.wasm",
  "vendor/pyodide/python_stdlib.zip", "vendor/pyodide/pyodide-lock.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    // 本地 Pyodide 可能尚未打包（使用 CDN 回退时），逐个缓存并忽略失败
    await Promise.all(PYODIDE.map((u) => cache.add(u).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

// 网络优先（开发时总能拿到最新文件），离线时回退到缓存；跨域的 Pyodide CDN 文件同样缓存
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const res = await fetch(req);
      if (res.ok && (new URL(req.url).origin === location.origin || req.url.includes("/pyodide/"))) {
        cache.put(req, res.clone());
      }
      return res;
    } catch (err) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      throw err;
    }
  })());
});
