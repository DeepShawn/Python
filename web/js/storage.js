// 本地存储：浏览器版保存在 localStorage（应用沙盒内）。
// 隐私模式或存储被禁用时自动降级为内存存储，界面照常可用。
const memory = new Map();

export const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem("nexus:" + key);
      return raw == null ? (memory.has(key) ? memory.get(key) : fallback) : JSON.parse(raw);
    } catch {
      return memory.has(key) ? memory.get(key) : fallback;
    }
  },
  set(key, value) {
    memory.set(key, value);
    try { localStorage.setItem("nexus:" + key, JSON.stringify(value)); } catch { /* 忽略 */ }
  },
};

export function download(filename, content, type = "text/plain") {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
