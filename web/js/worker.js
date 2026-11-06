/* Python Nexus 执行 Worker：在后台线程中运行 Pyodide，避免界面卡死。
 * 优先加载随应用打包的本地 Pyodide（完全离线），本地不存在时才回退到 CDN。 */
const PYODIDE_VERSION = "0.27.7";
const LOCAL_INDEX = new URL("../vendor/pyodide/", self.location.href).href;
const CDN_INDEX = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`;
const PY_MODULES = ["nexus_core", "nexus_tracer", "nexus_flow", "nexus_repl", "nexus_judge"];
const PROJECT_DIR = "/home/pyodide/project";

let pyodide = null;
let source = "local";

async function boot() {
  let indexURL = LOCAL_INDEX;
  try {
    importScripts(LOCAL_INDEX + "pyodide.js");
  } catch (e) {
    importScripts(CDN_INDEX + "pyodide.js");
    indexURL = CDN_INDEX;
    source = "cdn";
  }
  pyodide = await loadPyodide({ indexURL });
  pyodide.setStdout({ batched: (text) => postMessage({ type: "stream", stream: "stdout", text }) });
  pyodide.setStderr({ batched: (text) => postMessage({ type: "stream", stream: "stderr", text }) });
  pyodide.FS.mkdirTree("/home/pyodide/nexus");
  pyodide.FS.mkdirTree(PROJECT_DIR);
  for (const name of PY_MODULES) {
    const res = await fetch(new URL(`../py/${name}.py`, self.location.href));
    if (!res.ok) throw new Error(`无法加载 ${name}.py`);
    pyodide.FS.writeFile(`/home/pyodide/nexus/${name}.py`, await res.text());
  }
  pyodide.runPython(`
import sys
sys.path.insert(0, "/home/pyodide/nexus")
import nexus_core, nexus_tracer, nexus_flow, nexus_repl, nexus_judge
_nexus_repl = nexus_repl.Repl()
`);
  return { version: pyodide.version, python: pyodide.runPython("import sys; sys.version.split()[0]"), source };
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
  run({ code, stdin, files, filename }) {
    syncProject(files);
    return call("nexus_core.run_plain", { source: code, stdin, filename: `${PROJECT_DIR}/${filename}` });
  },
  trace({ code, stdin, files, filename, maxSteps }) {
    syncProject(files);
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
  test({ files }) {
    syncProject(files);
    return call("nexus_core.run_unittests", { project_dir: PROJECT_DIR });
  },
  judge({ code, cases }) {
    return call("nexus_judge.judge", { source: code, cases });
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
