/* Python Nexus 执行 Worker：在后台线程中运行 Pyodide，避免界面卡死。
 * 优先加载随应用打包的本地 Pyodide（完全离线），本地不存在时才回退到 CDN。 */
const PYODIDE_VERSION = "0.27.7";
const LOCAL_INDEX = new URL("../vendor/pyodide/", self.location.href).href;
const CDN_INDEX = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const PY_MODULES = ["nexus_core", "nexus_tracer", "nexus_flow", "nexus_repl", "nexus_judge", "nexus_net"];
const WHEEL_BASE = new URL("../vendor/wheels/", self.location.href).href;
const PROJECT_DIR = "/home/pyodide/project";

let pyodide = null;
let source = "local";
let inputCtrl = null;   // Int32Array [状态, 字节数]：0 等待，1 已输入，2 EOF
let inputData = null;   // Uint8Array 输入内容
let wheelIndex = [];
const installedWheels = new Set();

/** 交互式 input()：通过 SharedArrayBuffer + Atomics.wait 同步等待主线程输入。 */
function requestInput(prompt) {
  if (!inputCtrl) return null;
  Atomics.store(inputCtrl, 0, 0);
  postMessage({ type: "input", prompt: String(prompt ?? "") });
  Atomics.wait(inputCtrl, 0, 0);
  if (Atomics.load(inputCtrl, 0) === 2) return null;
  const n = Atomics.load(inputCtrl, 1);
  return new TextDecoder().decode(inputData.slice(0, n));
}

async function boot({ sab } = {}) {
  if (sab) {
    inputCtrl = new Int32Array(sab, 0, 2);
    inputData = new Uint8Array(sab, 8);
  }
  let indexURL = LOCAL_INDEX;
  try {
    importScripts(LOCAL_INDEX + "pyodide.js");
  } catch (e) {
    importScripts(CDN_INDEX + "pyodide.js");
    indexURL = CDN_INDEX;
    source = "cdn";
  }
  pyodide = await loadPyodide({ indexURL });
  pyodide.setStdout({ batched: (text) => postMessage({ type: "stream", stream: "stdout", text: text + "\n" }) });
  pyodide.setStderr({ batched: (text) => postMessage({ type: "stream", stream: "stderr", text: text + "\n" }) });
  pyodide.FS.mkdirTree("/home/pyodide/nexus");
  pyodide.FS.mkdirTree(PROJECT_DIR);
  for (const name of PY_MODULES) {
    const res = await fetch(new URL(`../py/${name}.py`, self.location.href));
    if (!res.ok) throw new Error(`无法加载 ${name}.py`);
    pyodide.FS.writeFile(`/home/pyodide/nexus/${name}.py`, await res.text());
  }
  pyodide.registerJsModule("nexus_js", { request_input: requestInput });
  pyodide.runPython(`
import sys
sys.path.insert(0, "/home/pyodide/nexus")
import nexus_core, nexus_tracer, nexus_flow, nexus_repl, nexus_judge, nexus_net
import nexus_js
nexus_core.set_input_provider(nexus_js.request_input)
nexus_net.install()
_nexus_repl = nexus_repl.Repl()
`);
  try {
    const res = await fetch(WHEEL_BASE + "index.json");
    if (res.ok) wheelIndex = await res.json();
  } catch { /* 未打包纯 Python 库 */ }
  return {
    version: pyodide.version, python: pyodide.runPython("import sys; sys.version.split()[0]"), source,
    interactive: !!inputCtrl, wheels: wheelIndex.flatMap((w) => w.imports),
  };
}

/** 按需安装第三方库：本地纯 Python wheel 直接解压；Pyodide 编译包从本地 vendor 加载。 */
async function ensurePackages(sources) {
  const code = sources.join("\n");
  const pySources = pyodide.toPy(sources);
  pyodide.globals.set("_nexus_sources", pySources);
  pySources.destroy();
  const namesProxy = pyodide.runPython(`
import ast
_mods = set()
for _src in _nexus_sources:
    try:
        for _n in ast.walk(ast.parse(_src)):
            if isinstance(_n, ast.Import):
                _mods.update(a.name.split(".")[0] for a in _n.names)
            elif isinstance(_n, ast.ImportFrom) and _n.module and _n.level == 0:
                _mods.add(_n.module.split(".")[0])
    except SyntaxError:
        pass
sorted(_mods)
`);
  const names = namesProxy.toJs();
  namesProxy.destroy();
  const install = (entry) => {
    if (installedWheels.has(entry.file)) return Promise.resolve();
    installedWheels.add(entry.file);
    const deps = (entry.requires || []).map((imp) => wheelIndex.find((w) => w.imports.includes(imp))).filter(Boolean);
    return Promise.all(deps.map(install)).then(async () => {
      const res = await fetch(WHEEL_BASE + entry.file);
      if (!res.ok) throw new Error("无法加载 " + entry.file);
      pyodide.FS.writeFile("/tmp/" + entry.file, new Uint8Array(await res.arrayBuffer()));
      pyodide.runPython(`
import zipfile, site, importlib
zipfile.ZipFile("/tmp/${entry.file}").extractall(site.getsitepackages()[0])
importlib.invalidate_caches()
`);
    });
  };
  for (const name of names) {
    const entry = wheelIndex.find((w) => w.imports.includes(name));
    if (entry) await install(entry);
  }
  try {
    await pyodide.loadPackagesFromImports(code, {
      messageCallback: () => {},
      errorCallback: () => {},
    });
  } catch (err) {
    postMessage({ type: "stream", stream: "stderr", text: `提示：第三方库未随应用打包（${err.message.split("\n")[0]}）。` +
      "可运行 npm run vendor -- --pyodide-packages 包名 将其打包为离线资源。\n" });
  }
}

/** 把编辑器中的项目文件同步到 Pyodide 虚拟文件系统，使 import 本地模块可用。 */
function syncProject(files) {
  const FS = pyodide.FS;
  const rm = (dir) => {
    for (const name of FS.readdir(dir)) {
      if (name === "." || name === "..") continue;
      const p = `${dir}/${name}`;
      if (FS.isDir(FS.stat(p).mode)) { rm(p); FS.rmdir(p); } else FS.unlink(p);
    }
  };
  rm(PROJECT_DIR);
  for (const [name, content] of Object.entries(files || {})) {
    const path = `${PROJECT_DIR}/${name}`;
    const dir = path.slice(0, path.lastIndexOf("/"));
    FS.mkdirTree(dir);
    FS.writeFile(path, content);
  }
  pyodide.runPython(`
import sys, os
os.chdir(${JSON.stringify(PROJECT_DIR)})
if ${JSON.stringify(PROJECT_DIR)} not in sys.path:
    sys.path.insert(0, ${JSON.stringify(PROJECT_DIR)})
for _name, _mod in list(sys.modules.items()):
    if (getattr(_mod, "__file__", None) or "").startswith(${JSON.stringify(PROJECT_DIR)}):
        del sys.modules[_name]
`);
}

function call(fn, kwargs) {
  const [modName, attr] = fn.split(".");
  const mod = pyodide.pyimport(modName);
  const func = mod[attr];
  // 每个参数单独转换为 Python 对象（dict / list / str），保证 Python 侧拿到原生类型
  const pyArgs = {};
  for (const [k, v] of Object.entries(kwargs)) {
    if (v !== undefined) pyArgs[k] = v !== null && typeof v === "object" ? pyodide.toPy(v) : v;
  }
  try {
    const result = func.callKwargs(pyArgs);
    const js = result && result.toJs ? result.toJs({ dict_converter: Object.fromEntries }) : result;
    if (result && result.destroy) result.destroy();
    return js;
  } finally {
    for (const v of Object.values(pyArgs)) if (v && v.destroy) v.destroy();
    func.destroy();
    mod.destroy();
  }
}

const handlers = {
  boot,
  async run({ code, stdin, files, filename }) {
    syncProject(files);
    await ensurePackages(Object.values(files || {}).concat(code));
    return call("nexus_core.run_plain", { source: code, stdin, filename: `${PROJECT_DIR}/${filename}` });
  },
  async trace({ code, stdin, files, filename, maxSteps }) {
    syncProject(files);
    await ensurePackages(Object.values(files || {}).concat(code));
    return call("nexus_tracer.run_traced", {
      source: code, stdin, filename: `${PROJECT_DIR}/${filename}`,
      trace_prefix: PROJECT_DIR + "/", max_steps: maxSteps || 3000,
    });
  },
  check({ code, filename }) {
    return call("nexus_core.check_syntax", { source: code, filename });
  },
  analyze({ code, files }) {
    return call("nexus_flow.analyze", { source: code, files });
  },
  async test({ files }) {
    syncProject(files);
    await ensurePackages(Object.values(files || {}));
    return call("nexus_core.run_unittests", { project_dir: PROJECT_DIR });
  },
  async judge({ code, cases, reveal = true, requires = null, limits = null }) {
    await ensurePackages([code]);
    return call("nexus_judge.judge", { source: code, cases, reveal, requires, limits });
  },
  checkRandom({ expr, params, answer }) {
    return call("nexus_judge.check_random", { expr, params, answer });
  },
  replPush({ line }) {
    const repl = pyodide.globals.get("_nexus_repl");
    try {
      const r = repl.push(line);
      const js = r.toJs({ dict_converter: Object.fromEntries });
      r.destroy();
      return js;
    } finally { repl.destroy(); }
  },
  replReset() {
    pyodide.runPython("_nexus_repl.reset()");
    return true;
  },
  complete({ prefix }) {
    const repl = pyodide.globals.get("_nexus_repl");
    try {
      const r = repl.completions(prefix);
      const js = r.toJs();
      r.destroy();
      return js;
    } finally { repl.destroy(); }
  },
};

self.onmessage = async (event) => {
  const { id, type, payload } = event.data;
  try {
    if (type !== "boot" && !pyodide) throw new Error("Python 运行时尚未就绪");
    const result = await handlers[type](payload || {});
    postMessage({ id, ok: true, result });
  } catch (err) {
    postMessage({ id, ok: false, error: String(err && err.message ? err.message : err) });
  }
};
