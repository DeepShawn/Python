// 打包全部离线依赖到 web/vendor/，使网页版与 Tauri 封装完全离线运行。
//   npm run vendor                      Pyodide 核心、hash-wasm、tweetnacl、CodeMirror 6、Blockly、纯 Python 库 wheel
//   npm run vendor -- --pyodide-packages numpy,pandas,matplotlib
//                                       额外下载 Pyodide 编译好的科学计算包（需能访问 cdn.jsdelivr.net）
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { build } from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nm = join(root, "node_modules");
const vendor = join(root, "web", "vendor");
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
const PYODIDE_VERSION = JSON.parse(readFileSync(join(nm, "pyodide", "package.json"), "utf8")).version;

function copy(pkg, files, dest) {
  const src = join(nm, pkg);
  if (!existsSync(src)) throw new Error(`未找到 node_modules/${pkg}，请先运行 npm install`);
  const out = join(vendor, dest);
  mkdirSync(out, { recursive: true });
  for (const f of files) cpSync(join(src, f), join(out, f.split("/").pop()));
  console.log(`✓ ${pkg} → web/vendor/${dest}`);
}

// 1. Pyodide 核心运行时
copy("pyodide", ["pyodide.js", "pyodide.mjs", "pyodide.asm.js", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"], "pyodide");
// 2. 题库安全
copy("hash-wasm", ["dist/index.esm.min.js"], "hash-wasm");
copy("tweetnacl", ["nacl-fast.min.js"], "tweetnacl");

// 3. CodeMirror 6 与 Blockly（esbuild 打包为单个 ES 模块）
for (const [name, entry] of [["codemirror", "codemirror.js"], ["blockly", "blockly.js"]]) {
  await build({
    entryPoints: [join(root, "scripts", "bundles", entry)],
    bundle: true, minify: true, format: "esm", platform: "browser", target: "es2020",
    outfile: join(vendor, name, `${name}.js`), legalComments: "none", logLevel: "warning",
  });
  console.log(`✓ ${name} → web/vendor/${name}/${name}.js`);
}
cpSync(join(nm, "blockly", "media"), join(vendor, "blockly", "media"), { recursive: true });  // 缩放、垃圾桶等图标

// 4. 纯 Python 第三方库（从 PyPI 下载 py3-none-any wheel，Pyodide 中离线解压安装）
const WHEELS = [
  { pkg: "beautifulsoup4==4.12.3", imports: ["bs4"] },
  { pkg: "soupsieve==2.6", imports: ["soupsieve"] },
];
const wheelDir = join(vendor, "wheels");
mkdirSync(wheelDir, { recursive: true });
const index = [];
for (const w of WHEELS) {
  const before = new Set(readdirSync(wheelDir));
  try {
    execFileSync("python3", ["-m", "pip", "download", "--quiet", "--no-deps", "--only-binary=:all:",
      "--python-version", "3.12", "--implementation", "py", "--dest", wheelDir, w.pkg], { stdio: "inherit" });
  } catch {
    console.warn(`! 无法下载 ${w.pkg}（需要 pip 与网络），跳过`);
    continue;
  }
  const file = readdirSync(wheelDir).find((f) => f.toLowerCase().startsWith(w.pkg.split("==")[0].replace(/-/g, "_").toLowerCase()) && f.endsWith(".whl"))
    || [...readdirSync(wheelDir)].find((f) => !before.has(f));
  if (file) index.push({ file, imports: w.imports, requires: w.pkg.startsWith("beautifulsoup4") ? ["soupsieve"] : [] });
}
writeFileSync(join(wheelDir, "index.json"), JSON.stringify(index, null, 2));
console.log(`✓ ${index.length} 个纯 Python wheel → web/vendor/wheels`);

// 5. 可选：Pyodide 编译好的科学计算包（numpy、pandas、matplotlib 等）
const extra = opt("--pyodide-packages");
if (extra) {
  const lock = JSON.parse(readFileSync(join(vendor, "pyodide", "pyodide-lock.json"), "utf8"));
  const want = new Set();
  const visit = (name) => {
    const p = lock.packages[name.toLowerCase()];
    if (!p) throw new Error(`Pyodide 没有提供包：${name}`);
    if (want.has(p.name.toLowerCase())) return;
    want.add(p.name.toLowerCase());
    for (const d of p.depends || []) visit(d);
  };
  extra.split(",").map((s) => s.trim()).filter(Boolean).forEach(visit);
  const base = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
  for (const name of want) {
    const file = lock.packages[name].file_name;
    const dest = join(vendor, "pyodide", file);
    if (existsSync(dest)) continue;
    const res = await fetch(base + file);
    if (!res.ok) throw new Error(`下载失败 ${file}: HTTP ${res.status}`);
    writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    console.log(`  ↓ ${file}`);
  }
  console.log(`✓ ${want.size} 个 Pyodide 包（含依赖）→ web/vendor/pyodide`);
}

// 6. 记录清单，供 Service Worker 预缓存
const manifest = [];
const walk = (dir, rel = "") => {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = rel ? `${rel}/${f.name}` : f.name;
    if (f.isDirectory()) walk(join(dir, f.name), p); else manifest.push(`vendor/${p}`);
  }
};
walk(vendor);
writeFileSync(join(vendor, "manifest.json"), JSON.stringify(manifest.filter((f) => !f.endsWith("manifest.json")), null, 1));
console.log(`✓ 离线资源清单：${manifest.length} 个文件`);
