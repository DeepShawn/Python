// 把 node_modules/pyodide 中的核心运行时复制到 web/vendor/pyodide，使网页版完全离线运行。
import { cpSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "pyodide");
const dst = join(root, "web", "vendor", "pyodide");
const FILES = ["pyodide.js", "pyodide.mjs", "pyodide.asm.js", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"];

if (!existsSync(src)) {
  console.error("未找到 node_modules/pyodide，请先运行 npm install");
  process.exit(1);
}
mkdirSync(dst, { recursive: true });
for (const f of FILES) cpSync(join(src, f), join(dst, f));
console.log(`Pyodide 已复制到 ${dst}`);
