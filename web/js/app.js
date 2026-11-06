// Python Nexus 主程序：IDE、可视化执行、流程图；学习、习题、考试、积木编程由各自模块实现。
import { createRuntime } from "./runtime.js";
import { createEditor } from "./editor.js";
import { renderChart, standaloneSvg, svgToPng } from "./flowchart.js";
import { Effects } from "./effects.js";
import { store, download } from "./storage.js";
import { $, $$, esc, toast } from "./ui.js";
import { initLearn } from "./learn.js";
import { initPractice } from "./practice.js";
import { initExam } from "./exam.js";
import { initBlocks } from "./blocks.js";

const PROJECT_PREFIX = "/home/pyodide/project/";

// 低性能设备（多为入门级安卓手机）：默认关闭动态特效并减少追踪步数
const LOW_END = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 3;
const MAX_STEPS = LOW_END ? 1500 : 3000;

const DEFAULT_PROJECT = {
  current: "main.py",
  files: {
    "main.py": `from utils import greet, fib

print(greet("World"))

# 斐波那契数列：试试「◉ 可视化运行」和「⬡ 流程图」
for i in range(6):
    print(i, fib(i))
`,
    "utils.py": `def greet(name):
    return f"Hello, {name}!"


def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
`,
    "tests/test_utils.py": `import unittest
from utils import greet, fib


class TestUtils(unittest.TestCase):
    def test_greet(self):
        self.assertEqual(greet("Nexus"), "Hello, Nexus!")

    def test_fib(self):
        self.assertEqual([fib(i) for i in range(7)], [0, 1, 1, 2, 3, 5, 8])
`,
  },
  stdin: "",
};

// ------------------------------------------------------------------ 状态
const state = {
  project: store.get("project", null) || structuredClone(DEFAULT_PROJECT),
  trace: null,      // { events, stdout, error, idx, playing, timer, file }
  flow: null,
  breakpoints: {},  // 文件名 -> Set(行号)
  replHistory: [],
  replIdx: 0,
  progress: store.get("progress", {}),
  lessonsDone: store.get("lessonsDone", {}),
  prefs: store.get("prefs", { theme: "standard", sound: false, motion: null }),
};
if (LOW_END && (state.prefs.motion === null || state.prefs.motion === undefined)) state.prefs.motion = false;

const effects = new Effects($("#fx-bg"), $("#fx-fg"));
const runtime = await createRuntime();
const editor = await createEditor($("#editor"));
document.documentElement.classList.toggle("native", !!runtime.native);

function saveProject() {
  state.project.files[state.project.current] = editor.value;
  state.project.stdin = $("#stdinInput").value;
  store.set("project", state.project);
}

let saveTimer = 0;
editor.addEventListener("change", () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveProject, 400);
  if (state.trace) endTrace(false);
  editor.setMarks({});
});
editor.addEventListener("cursor", () => {
  const { line, col } = editor.cursor();
  $("#sbCursor").textContent = `Ln ${line}, Col ${col}`;
});

// ------------------------------------------------------------------ 运行时状态与输入
runtime.addEventListener("status", (e) => {
  const { state: s, info, message } = e.detail;
  const pill = $("#runtimeStatus");
  pill.className = `status-pill ${s}`;
  if (s === "loading") pill.textContent = "加载 Python…";
  if (s === "ready") {
    pill.textContent = `Python ${info.python}`;
    const where = info.source === "native" ? "嵌入式 CPython（原生）" : info.source === "local" ? "Pyodide 本地离线包" : "Pyodide CDN 回退，建议运行 npm run vendor";
    pill.title = `${info.version} · ${where}${info.interactive ? " · 支持交互式 input()" : ""}`;
    $("#sbRuntime").textContent = info.source === "native" ? "Native CPython · 离线" : info.source === "local" ? "Local Runtime · 离线" : "CDN Runtime";
  }
  if (s === "error") { pill.textContent = "运行时错误"; pill.title = message; appendOut(`运行时加载失败：${message}\n`, "err"); }
});
runtime.addEventListener("stream", (e) => {
  if (!state.trace && !ctx.blocksRunning) appendOut(e.detail.text, e.detail.stream === "stderr" ? "err" : "");
});
runtime.addEventListener("input", (e) => {
  // 程序调用 input() 且标准输入面板已读完：在输出面板中实时向用户索取
  const prompt = e.detail.prompt;
  if (ctx.blocksRunning) {
    const v = window.prompt(prompt || "input()");
    runtime.provideInput(v === null ? null : v);
    return;
  }
  showPane("out");
  $("#inputPrompt").textContent = prompt || "input()";
  $("#inputRow").hidden = false;
  $("#inputField").value = "";
  $("#inputField").focus();
});
$("#inputRow").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("#inputField").value;
  $("#inputRow").hidden = true;
  runtime.provideInput(v);   // 提示语与输入内容会随程序输出一起显示
});
$("#inputEof").addEventListener("click", () => { $("#inputRow").hidden = true; runtime.provideInput(null); });

// ------------------------------------------------------------------ 视图与主题
const onViewChange = [];
const onThemeChange = [];
$$(".tabs button").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));
function showView(name) {
  $$(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));
  store.set("view", name);
  onViewChange.forEach((f) => f(name));
}

const THEME_TAGS = { standard: "STANDARD", quantum: "NEXUS // RUN", matrix: "ROOT://PYTHON" };
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $("#themeSelect").value = theme;
  $("#brandTag").textContent = THEME_TAGS[theme];
  effects.setTheme(theme);
  state.prefs.theme = theme;
  store.set("prefs", state.prefs);
  if (state.flow) renderFlow();
  onThemeChange.forEach((f) => f(theme));
}
$("#themeSelect").addEventListener("change", (e) => applyTheme(e.target.value));
$("#soundBtn").addEventListener("click", () => {
  state.prefs.sound = !state.prefs.sound;
  applyPrefs();
  if (state.prefs.sound) effects.beep("end");
});
$("#motionBtn").addEventListener("click", () => {
  state.prefs.motion = !effects.motion;
  applyPrefs();
});
function applyPrefs() {
  effects.setSound(state.prefs.sound);
  if (state.prefs.motion !== null && state.prefs.motion !== undefined) effects.setMotion(state.prefs.motion);
  document.documentElement.classList.toggle("no-motion", !effects.motion);
  $("#soundBtn").textContent = state.prefs.sound ? "🔊" : "🔇";
  $("#soundBtn").setAttribute("aria-pressed", String(state.prefs.sound));
  $("#motionBtn").setAttribute("aria-pressed", String(effects.motion));
  $("#motionBtn").classList.toggle("off", !effects.motion);
  store.set("prefs", state.prefs);
}

$$(".bottom .subtabs button[data-pane]").forEach((b) => b.addEventListener("click", () => showPane(b.dataset.pane)));
function showPane(name) {
  $$(".bottom .subtabs button[data-pane]").forEach((b) => b.classList.toggle("active", b.dataset.pane === name));
  $$(".bottom .pane").forEach((p) => p.classList.toggle("active", p.id === `pane-${name}` || p.id === `pane-${name}-wrap`));
  if (name === "repl") $("#replInput").focus();
}
$$(".inspector .subtabs button").forEach((b) => b.addEventListener("click", () => showIPane(b.dataset.ipane)));
function showIPane(name) {
  $$(".inspector .subtabs button").forEach((b) => b.classList.toggle("active", b.dataset.ipane === name));
  $$(".inspector .ipane").forEach((p) => p.classList.toggle("active", p.id === `ipane-${name}`));
}

// 移动端符号快捷栏
$("#symbar").addEventListener("mousedown", (e) => e.preventDefault());
$("#symbar").addEventListener("click", (e) => {
  const b = e.target.closest("[data-ins]");
  if (!b) return;
  editor.insertText(b.dataset.ins, Number(b.dataset.back || 0));
});

// ------------------------------------------------------------------ 文件管理
function renderFiles() {
  const names = Object.keys(state.project.files).sort((a, b) => {
    const da = a.includes("/"), db = b.includes("/");
    return da === db ? a.localeCompare(b) : da ? 1 : -1;
  });
  $("#fileList").innerHTML = names.map((n) => {
    const depth = n.split("/").length - 1;
    const icon = n.endsWith(".blocks.json") ? "🧩" : n.endsWith(".py") ? (n.includes("test") ? "🧪" : "🐍") : "📄";
    return `<li class="${n === state.project.current ? "active" : ""}" data-file="${esc(n)}" style="padding-left:${10 + depth * 12}px" title="${esc(n)}">${icon} ${esc(n)}</li>`;
  }).join("");
  $("#sbFile").textContent = state.project.current;
}
$("#fileList").addEventListener("click", (e) => {
  const li = e.target.closest("li[data-file]");
  if (li) openFile(li.dataset.file);
});
function showInEditor(name) {
  state.project.current = name;
  editor.value = state.project.files[name];
  editor.setBreakpoints(state.breakpoints[name] || (state.breakpoints[name] = new Set()));
}
function openFile(name) {
  if (state.project.files[name] === undefined) return;
  saveProject();
  endTrace(false);
  showInEditor(name);
  renderFiles();
  store.set("project", state.project);
}
/** 把代码（及附带文件、标准输入）放入项目并在 IDE 中打开。 */
function openInIde(name, code, extraFiles = null, stdin = undefined) {
  saveProject();
  state.project.files[name] = code;
  for (const [f, c] of Object.entries(extraFiles || {})) state.project.files[f] = c;
  if (stdin !== undefined) { $("#stdinInput").value = stdin; state.project.stdin = stdin; }
  showView("ide");
  openFile(name);
}
function validName(name) {
  return name && /^[\w\-./一-龥]+$/.test(name) && !name.startsWith("/") && !name.includes("..");
}
$("#newFileBtn").addEventListener("click", () => {
  let name = prompt("新文件名（可包含目录，例如 modules/calc.py）", "new_module.py");
  if (!name) return;
  name = name.trim();
  if (!validName(name)) { toast("文件名无效"); return; }
  if (!/\.\w+$/.test(name)) name += ".py";
  if (state.project.files[name] !== undefined) { toast("文件已存在"); return; }
  state.project.files[name] = "";
  openFile(name);
});
$("#projectMenuBtn").addEventListener("click", (e) => { e.stopPropagation(); $("#projectMenu").hidden = !$("#projectMenu").hidden; });
document.addEventListener("click", () => ($("#projectMenu").hidden = true));
$("#projectMenu").addEventListener("click", async (e) => {
  const act = e.target.dataset.act;
  if (!act) return;
  saveProject();
  const p = state.project;
  if (act === "rename") {
    const name = prompt("新的文件名", p.current);
    if (!name || name === p.current) return;
    if (!validName(name) || p.files[name] !== undefined) { toast("文件名无效或已存在"); return; }
    p.files[name] = p.files[p.current];
    delete p.files[p.current];
    p.current = name;
    renderFiles();
    saveProject();
  } else if (act === "delete") {
    if (Object.keys(p.files).length <= 1) { toast("至少保留一个文件"); return; }
    if (!confirm(`删除 ${p.current}？`)) return;
    delete p.files[p.current];
    showInEditor(Object.keys(p.files)[0]);
    renderFiles();
    store.set("project", p);
  } else if (act === "download") {
    download(p.current.split("/").pop(), editor.value, "text/x-python");
  } else if (act === "export") {
    download("python-nexus-project.json", JSON.stringify({ ...p, version: 1, createdWith: "Python Nexus" }, null, 2), "application/json");
  } else if (act === "import") {
    $("#importInput").click();
  } else if (act === "reset") {
    if (!confirm("恢复示例项目会覆盖当前项目，确定吗？")) return;
    loadProject(structuredClone(DEFAULT_PROJECT));
  } else {
    await nativeAction(act);
  }
});
$("#importInput").addEventListener("change", async (e) => {
  for (const file of e.target.files) {
    const text = await file.text();
    if (file.name.endsWith(".json") && !file.name.endsWith(".blocks.json")) {
      try {
        const p = JSON.parse(text);
        if (!p.files || typeof p.files !== "object") throw new Error();
        loadProject({ current: p.current in p.files ? p.current : Object.keys(p.files)[0], files: p.files, stdin: p.stdin || "" });
      } catch { toast("不是有效的 Python Nexus 项目文件"); }
    } else {
      state.project.files[file.name] = text;
      openFile(file.name);
    }
  }
  e.target.value = "";
});
function loadProject(p) {
  state.project = p;
  state.breakpoints = {};
  showInEditor(p.current);
  $("#stdinInput").value = p.stdin || "";
  renderFiles();
  store.set("project", p);
}
$("#stdinInput").addEventListener("input", () => { state.project.stdin = $("#stdinInput").value; store.set("project", state.project); });

// 原生（Windows / 桌面）专属功能
async function nativeAction(act) {
  if (!runtime.native) return;
  showPane("out");
  try {
    if (act === "openFolder") {
      const r = await runtime.openFolder();
      if (!r) return;
      state.project.folder = r.dir;
      loadProject({ current: r.files["main.py"] !== undefined ? "main.py" : Object.keys(r.files)[0], files: r.files, stdin: "", folder: r.dir });
      toast(`已打开 ${r.dir}`);
    } else if (act === "saveFolder") {
      const dir = await runtime.saveFolder(state.project.folder || null, state.project.files);
      if (dir) { state.project.folder = dir; store.set("project", state.project); toast(`已保存到 ${dir}`); }
    } else if (act === "netServe") {
      const r = await runtime.netServe();
      appendOut(`本机教学网站已启动：${r.url}（也可以直接用 http://nexus.local 访问离线网站）\n`, "sys");
    } else if (act === "installWheel") {
      const paths = await runtime.pickFiles([{ name: "Python wheel", extensions: ["whl"] }]);
      if (!paths || !paths.length) return;
      appendOut("$ pip install --no-index " + paths.join(" ") + "\n", "sys");
      const r = await runtime.installLocal(paths);
      appendOut(r.output, r.ok ? "" : "err");
    } else if (act === "buildExe") {
      const name = prompt("可执行文件名称", state.project.current.replace(/\.py$/, "").split("/").pop());
      if (!name) return;
      appendOut(`$ pyinstaller --onefile ${state.project.current}\n`, "sys");
      setRunning(true);
      const r = await runtime.buildExe({ files: state.project.files, filename: state.project.current, name, onefile: true });
      appendOut(r.output + "\n", r.ok ? "" : "err");
      if (r.ok) { appendOut(`✓ 已生成到 ${r.dist}\n`, "ok"); runtime.revealPath(r.dist); }
    }
  } catch (err) { appendOut(String(err.message || err) + "\n", "err"); } finally { setRunning(false); }
}

// ------------------------------------------------------------------ 输出
function appendOut(text, cls = "") {
  const out = $("#pane-out");
  const span = document.createElement("span");
  if (cls) span.className = cls;
  span.textContent = text;
  out.appendChild(span);
  out.scrollTop = out.scrollHeight;
}
function clearOut() { $("#pane-out").textContent = ""; $("#inputRow").hidden = true; }
$("#clearOutBtn").addEventListener("click", () => {
  const active = $(".bottom .pane.active");
  if (active.id === "pane-repl") $("#replLog").textContent = "";
  else if (active.id === "pane-out-wrap") $("#pane-out").textContent = "";
  else if (active.id !== "pane-stdin") active.textContent = "";
});

function setRunning(on) {
  $("#stopBtn").disabled = !on;
  $("#runBtn").disabled = on;
  $("#visualBtn").disabled = on;
  if (!on) $("#inputRow").hidden = true;
}

function runArgs() {
  saveProject();
  return { code: editor.value, stdin: $("#stdinInput").value, files: state.project.files, filename: state.project.current };
}

async function runPlain() {
  endTrace(false);
  clearOut();
  showPane("out");
  editor.setMarks({});
  appendOut(`$ python ${state.project.current}\n`, "sys");
  setRunning(true);
  const t0 = performance.now();
  try {
    const r = await runtime.run(runArgs());
    if (r.error) { appendOut(r.error, "err"); markErrorLine(r.error); }
    const ms = Math.round(performance.now() - t0);
    appendOut(`\n进程结束 · Exit Code ${r.ok ? 0 : 1} · ${ms} ms\n`, "sys");
    effects.beep(r.ok ? "end" : "exception");
  } catch (err) {
    appendOut(`\n${err.message}\n`, "err");
  } finally {
    setRunning(false);
  }
}

function markErrorLine(errorText) {
  const re = new RegExp(`File "(?:${PROJECT_PREFIX}|[^"]*[\\\\/]project[\\\\/])?${state.project.current.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}", line (\\d+)`, "g");
  let m, last = null;
  while ((m = re.exec(errorText))) last = Number(m[1]);
  const syntax = errorText.match(/line (\d+)/);
  const ln = last || (syntax && Number(syntax[1]));
  if (ln) { editor.setMarks({ [ln]: "mark-error" }); editor.revealLine(ln); }
}

$("#runBtn").addEventListener("click", runPlain);
$("#stopBtn").addEventListener("click", () => {
  if (state.trace) { endTrace(true); return; }
  runtime.restart();
  appendOut("\n■ 程序已被终止，Python 运行时正在重启…\n", "err");
  setRunning(false);
});

// ------------------------------------------------------------------ 编译检查 / 测试
$("#checkBtn").addEventListener("click", async () => {
  showPane("check");
  const pane = $("#pane-check");
  pane.textContent = "检查中…";
  try {
    const r = await runtime.check({ code: editor.value, filename: state.project.current });
    if (r.ok) {
      pane.innerHTML = `<span class="ok">✓ ${esc(state.project.current)}：语法检查通过（${r.code_objects} 个代码对象）</span>\n` +
        `<span class="sys">提示：py_compile 只生成 .pyc 字节码，不等于打包为独立 EXE${runtime.native ? "（打包请用项目菜单中的「打包为 EXE」）" : ""}。下面是 dis 反汇编结果：</span>\n\n${esc(r.bytecode)}`;
      editor.setMarks({});
    } else {
      pane.innerHTML = `<span class="err">✗ 第 ${r.line} 行，第 ${r.col} 列：${esc(r.msg)}</span>\n    ${esc(r.text)}\n    ${" ".repeat(Math.max(0, (r.col || 1) - 1))}^`;
      editor.setMarks({ [r.line]: "mark-error" });
      editor.revealLine(r.line);
    }
  } catch (err) { pane.textContent = err.message; }
});

$("#testBtn").addEventListener("click", async () => {
  clearOut();
  showPane("out");
  appendOut("$ python -m unittest discover tests\n", "sys");
  setRunning(true);
  try {
    const r = await runtime.test({ files: runArgs().files });
    appendOut(r.output);
    appendOut(r.ok ? `\n✓ 全部通过（${r.run} 个测试）\n` : `\n✗ 失败 ${r.failures}，错误 ${r.errors}（共 ${r.run} 个）\n`, r.ok ? "ok" : "err");
    if (!r.run) appendOut("提示：在 tests/ 目录中创建 test_*.py 文件来编写单元测试。\n", "sys");
  } catch (err) { appendOut(err.message, "err"); } finally { setRunning(false); }
});

// ------------------------------------------------------------------ 交互控制台
$("#replInput").addEventListener("keydown", async (e) => {
  const input = e.target;
  if (e.key === "ArrowUp" || e.key === "ArrowDown") {
    e.preventDefault();
    const h = state.replHistory;
    state.replIdx = Math.max(0, Math.min(h.length, state.replIdx + (e.key === "ArrowUp" ? -1 : 1)));
    input.value = h[state.replIdx] ?? "";
    return;
  }
  if (e.key === "Tab") {
    e.preventDefault();
    const m = input.value.match(/[A-Za-z_]\w*$/);
    if (!m) { input.value += "    "; return; }
    const list = await runtime.complete(m[0]);
    if (list.length === 1) input.value += list[0].slice(m[0].length);
    else if (list.length) replLog(list.join("  ") + "\n", "sys");
    return;
  }
  if (e.key !== "Enter") return;
  const line = input.value;
  input.value = "";
  if (line.trim()) state.replHistory.push(line);
  state.replIdx = state.replHistory.length;
  replLog(`${$("#replPrompt").textContent} ${line}\n`, "in");
  if (line.trim() === "%reset") { await runtime.replReset(); replLog("命名空间已重置\n", "sys"); return; }
  try {
    const r = await runtime.replPush(line);
    if (r.output) replLog(r.output, r.error ? "err" : "");
    $("#replPrompt").textContent = r.more ? "..." : ">>>";
  } catch (err) { replLog(err.message + "\n", "err"); }
});
function replLog(text, cls) {
  const log = $("#replLog");
  const s = document.createElement("span");
  if (cls) s.className = cls;
  s.textContent = text;
  log.appendChild(s);
  log.scrollTop = log.scrollHeight;
}

// ------------------------------------------------------------------ 可视化执行
function describeLine(code) {
  const s = code.trim();
  if (/^(if|elif)\b/.test(s)) return ["条件判断", "计算条件，决定走哪个分支"];
  if (/^else\b/.test(s)) return ["条件分支", "前面的条件都不成立"];
  if (/^for\b/.test(s)) return ["循环", "取出下一个元素；没有元素时结束循环"];
  if (/^while\b/.test(s)) return ["循环", "检查循环条件"];
  if (/^def\b/.test(s)) return ["定义函数", "创建函数对象（此时不执行函数体）"];
  if (/^class\b/.test(s)) return ["定义类", "创建类对象"];
  if (/^return\b/.test(s)) return ["返回", "计算返回值并离开函数"];
  if (/^(import|from)\b/.test(s)) return ["导入", "加载模块"];
  if (/^(try|except|finally)\b/.test(s)) return ["异常处理", s.split(/[\s:]/)[0]];
  if (/^(break|continue)\b/.test(s)) return ["跳转", s];
  if (/\bprint\s*\(/.test(s)) return ["输出", "把结果写到控制台"];
  if (/\binput\s*\(/.test(s)) return ["输入", "从标准输入读取一行"];
  if (/^[\w.,\s[\]()]+\s*(\+|-|\*|\/|\/\/|%|\*\*)?=(?!=)/.test(s)) return ["赋值", "计算右侧表达式并绑定到变量"];
  return ["执行", "执行这一行代码"];
}

function eventFile(ev) {
  return ev.file && ev.file.startsWith(PROJECT_PREFIX) ? ev.file.slice(PROJECT_PREFIX.length) : ev.file;
}

async function startTrace() {
  endTrace(false);
  clearOut();
  showPane("out");
  showIPane("exec");
  setRunning(true);
  $("#eventCard").innerHTML = '<p class="muted">正在记录执行轨迹…</p>';
  try {
    const r = await runtime.trace({ ...runArgs(), maxSteps: MAX_STEPS });
    setRunning(false);
    state.trace = { ...r, idx: -1, playing: false, timer: 0, file: state.project.current };
    const sc = $("#scrubber");
    sc.max = r.events.length - 1;
    sc.value = 0;
    sc.hidden = false;
    ["backBtn", "playBtn", "stepBtn", "endBtn", "stopBtn"].forEach((id) => ($("#" + id).disabled = false));
    if (!state.flow || state.flow.code !== editor.value) await buildFlow(false);
    gotoStep(0);
    play(true);
  } catch (err) {
    setRunning(false);
    appendOut(err.message + "\n", "err");
  }
}

function gotoStep(i) {
  const t = state.trace;
  if (!t) return;
  i = Math.max(0, Math.min(t.events.length - 1, i));
  const prev = t.events[t.idx];
  t.idx = i;
  const ev = t.events[i];
  $("#scrubber").value = i;
  $("#stepCounter").textContent = `STEP ${i + 1} / ${t.events.length}`;

  const file = eventFile(ev);
  if (ev.e !== "end" && file && file !== state.project.current && state.project.files[file] !== undefined) {
    state.project.files[state.project.current] = editor.value;
    showInEditor(file);
    renderFiles();
  }

  const marks = {};
  if (prev && prev.ln && eventFile(prev) === state.project.current && prev.e !== "end") marks[prev.ln] = "mark-prev";
  const kindCls = { line: "mark-active", call: "mark-call", return: "mark-return", exception: "mark-error" }[ev.e];
  if (ev.ln && kindCls) marks[ev.ln] = kindCls;
  editor.setMarks(marks);
  if (ev.ln) editor.revealLine(ev.ln);

  const code = ev.ln ? (editor.value.split("\n")[ev.ln - 1] || "") : "";
  let title, detail;
  if (ev.e === "line") [title, detail] = describeLine(code);
  else if (ev.e === "call") { title = "调用函数"; detail = `进入 ${ev.fn}()，创建新的局部作用域`; }
  else if (ev.e === "return") { title = "函数返回"; detail = `${ev.fn}() 返回 ${ev.ret}`; }
  else if (ev.e === "exception") { title = "异常"; detail = ev.exc; }
  else { title = t.ok ? "程序结束" : "程序异常结束"; detail = t.error || "所有代码执行完毕"; }
  $("#stepKind").textContent = title;
  $("#stepKind").className = `step-kind k-${ev.e}`;

  let before = null;
  for (let j = i - 1; j >= 0; j--) {
    const pj = t.events[j];
    if (pj.depth === ev.depth && pj.fn === ev.fn) { before = pj.vars; break; }
    if (pj.depth < ev.depth) break;
  }
  const changes = [];
  for (const [name, val] of Object.entries(ev.vars)) {
    if (!before || !(name in before)) changes.push(`<b>${esc(name)}</b> 新建 = ${esc(val.v)}`);
    else if (before[name].v !== val.v) changes.push(`<b>${esc(name)}</b>: ${esc(before[name].v)} → ${esc(val.v)}`);
  }
  $("#eventCard").innerHTML = `
    <div class="ev-title">${esc(title)} <small>${ev.ln ? `第 ${ev.ln} 行` : ""}${ev.fn && ev.fn !== "<module>" ? ` · ${esc(ev.fn)}()` : ""}</small></div>
    ${code ? `<code class="ev-code">${esc(code.trim())}</code>` : ""}
    <div class="ev-detail">${esc(detail)}</div>
    ${changes.length && before ? `<div class="ev-changes">${changes.join("<br>")}</div>` : ""}
    ${ev.e === "line" ? '<div class="muted small">高亮行为「即将执行」的代码；变量为执行这一行之前的值。</div>' : ""}`;

  renderVars($("#varsBody"), ev.vars, before);
  $("#globalsWrap").hidden = !ev.globals;
  if (ev.globals) renderVars($("#globalsBody"), ev.globals, null);
  $("#stackList").innerHTML = (ev.stack.length ? ev.stack : ["<module>"]).slice().reverse()
    .map((fn, k) => `<li class="${k === 0 ? "top" : ""}">${fn === "<module>" ? "主程序 &lt;module&gt;" : esc(fn) + "()"}</li>`).join("");

  const out = $("#pane-out");
  out.textContent = t.stdout.slice(0, ev.out);
  if (ev.e === "end" && t.error) appendOut("\n" + t.error, t.ok ? "sys" : "err");
  if (ev.e === "end") appendOut(`\n进程结束 · Exit Code ${t.ok ? 0 : 1} · 共 ${t.events.length} 步${t.truncated ? "（已截断）" : ""}\n`, "sys");
  out.scrollTop = out.scrollHeight;

  $$("#flowHost .fc-active").forEach((n) => n.classList.remove("fc-active"));
  if (ev.ln && state.project.current === state.flowFile) {
    $$(`#flowHost [data-line="${ev.ln}"]`).forEach((n) => n.classList.add("fc-active"));
  }

  if (ev.ln) effects.pulse(editor.lineRect(ev.ln), ev.e);
  else effects.beep("end");
  if (ev.e === "end") { pause(); $("#playBtn").textContent = "⏯"; }
}

function renderVars(tbody, vars, before) {
  const rows = Object.entries(vars);
  tbody.innerHTML = rows.length ? rows.map(([name, val]) => {
    const isNew = before && !(name in before);
    const changed = before && name in before && before[name].v !== val.v;
    return `<tr class="${isNew ? "v-new" : changed ? "v-changed" : ""}"><td>${esc(name)}</td><td><code>${esc(val.v)}</code></td><td class="muted">${esc(val.t)}</td></tr>`;
  }).join("") : '<tr><td colspan="3" class="muted">（暂无变量）</td></tr>';
}

function stepDelay() { return 750 / Number($("#speedSelect").value); }
function play(fromStart = false) {
  const t = state.trace;
  if (!t) return;
  t.playing = true;
  $("#playBtn").textContent = "⏸";
  clearTimeout(t.timer);
  const tick = () => {
    if (!state.trace || !t.playing) return;
    if (t.idx >= t.events.length - 1) { pause(); return; }
    gotoStep(t.idx + 1);
    const ev = t.events[t.idx];
    if (ev.e === "line" && eventFile(ev) === state.project.current && editor.breakpoints.has(ev.ln)) {
      pause();
      toast(`在第 ${ev.ln} 行的断点处暂停`);
      return;
    }
    t.timer = setTimeout(tick, stepDelay());
  };
  t.timer = setTimeout(tick, fromStart ? stepDelay() : 0);
}
function pause() {
  const t = state.trace;
  if (!t) return;
  t.playing = false;
  clearTimeout(t.timer);
  $("#playBtn").textContent = "▶";
}
function endTrace(showMsg) {
  const t = state.trace;
  if (!t) return;
  pause();
  state.trace = null;
  $("#scrubber").hidden = true;
  ["backBtn", "playBtn", "stepBtn", "endBtn", "stopBtn"].forEach((id) => ($("#" + id).disabled = true));
  $("#playBtn").textContent = "⏯";
  editor.setMarks({});
  $$("#flowHost .fc-active").forEach((n) => n.classList.remove("fc-active"));
  if (t.file !== state.project.current && state.project.files[t.file] !== undefined) openFile(t.file);
  if (showMsg) appendOut("\n■ 已退出可视化运行\n", "sys");
}

$("#visualBtn").addEventListener("click", startTrace);
$("#playBtn").addEventListener("click", () => (state.trace?.playing ? pause() : play()));
$("#stepBtn").addEventListener("click", () => { pause(); gotoStep(state.trace.idx + 1); });
$("#backBtn").addEventListener("click", () => { pause(); gotoStep(state.trace.idx - 1); });
$("#endBtn").addEventListener("click", () => {
  const t = state.trace;
  pause();
  for (let i = t.idx + 1; i < t.events.length; i++) {
    const ev = t.events[i];
    if (ev.e === "line" && editor.breakpoints.has(ev.ln) && eventFile(ev) === state.project.current) { gotoStep(i); toast(`断点：第 ${ev.ln} 行`); return; }
  }
  gotoStep(t.events.length - 1);
});
$("#scrubber").addEventListener("input", (e) => { pause(); gotoStep(Number(e.target.value)); });

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); if (!$("#runBtn").disabled) runPlain(); }
  else if (e.key === "F5") { e.preventDefault(); if (!$("#visualBtn").disabled) startTrace(); }
  else if (e.key === "F10" && state.trace) { e.preventDefault(); pause(); gotoStep(state.trace.idx + 1); }
  else if ((e.ctrlKey || e.metaKey) && e.key === "s") { e.preventDefault(); saveProject(); toast("已保存到本地"); }
});

// ------------------------------------------------------------------ 流程图
async function buildFlow(switchPane = true) {
  if (switchPane) showIPane("flow");
  const code = editor.value;
  try {
    const r = await runtime.analyze({ code, files: runArgs().files });
    if (!r.ok) {
      $("#flowHost").innerHTML = `<p class="err">${esc(r.error)}</p>`;
      state.flow = null;
      return;
    }
    state.flow = { ...r, code };
    state.flowFile = state.project.current;
    $("#flowSelect").innerHTML = `<option value="0">主程序 ${esc(state.project.current)}</option>` +
      r.flow.functions.map((f, i) => `<option value="${i + 1}">函数 ${esc(f.name)}()</option>`).join("");
    renderFlow();
    renderStructure();
  } catch (err) {
    $("#flowHost").innerHTML = `<p class="err">${esc(err.message)}</p>`;
  }
}
function renderFlow() {
  const f = state.flow;
  if (!f) return;
  const k = Number($("#flowSelect").value || 0);
  if (k === 0) $("#flowHost").innerHTML = renderChart("开始", f.flow.main);
  else {
    const fn = f.flow.functions[k - 1];
    $("#flowHost").innerHTML = renderChart(`函数 ${fn.name}(${fn.args})`, fn.body, { endText: "返回调用者（None）" });
  }
}
function renderStructure() {
  const { calls, imports, classes } = state.flow;
  const callRows = Object.entries(calls).filter(([, v]) => v.length);
  $("#callGraph").innerHTML = callRows.length
    ? callRows.map(([k, v]) => `<div><code>${esc(k === "<module>" ? "主程序" : k + "()")}</code> → ${v.map((x) => `<code>${esc(x)}()</code>`).join(" ")}</div>`).join("")
    : '<span class="muted">当前文件中没有对本地函数的调用。</span>';
  const importRows = Object.entries(imports);
  $("#importGraph").innerHTML = importRows.length
    ? importRows.map(([k, v]) => {
        const mods = v.map((m) => {
          const isLocal = state.project.files[m.replace(/\./g, "/") + ".py"] !== undefined;
          return `<code class="${isLocal ? "local" : ""}" title="${isLocal ? "项目内模块" : "标准库 / 第三方"}">${esc(m)}</code>`;
        });
        return `<div><code>${esc(k)}</code> ${mods.length ? "→ " + mods.join(" ") : '<span class="muted">无导入</span>'}</div>`;
      }).join("")
    : "";
  const classRows = Object.entries(classes || {});
  $("#classGraph").innerHTML = classRows.length
    ? classRows.map(([name, c]) => `<div class="class-row" data-line="${c.line}"><code class="local">${esc(name)}</code>${c.bases.length ? ` ⟵ 继承 ${c.bases.map((b) => `<code>${esc(b)}</code>`).join(" ")}` : ""}
        <div class="muted small">方法：${c.methods.length ? c.methods.map(esc).join("、") : "无"}</div></div>`).join("")
    : '<span class="muted">当前文件中没有定义类。</span>';
}
$("#classGraph").addEventListener("click", (e) => {
  const row = e.target.closest("[data-line]");
  if (row) editor.gotoLine(Number(row.dataset.line));
});
$("#flowBtn").addEventListener("click", () => buildFlow(true));
$("#flowSelect").addEventListener("change", renderFlow);
$("#zoomBtn").addEventListener("click", () => {
  const zoomed = $("#flowHost").classList.toggle("zoom");
  $("#zoomBtn").textContent = zoomed ? "适应" : "1:1";
});
$("#flowHost").addEventListener("click", (e) => {
  const node = e.target.closest("[data-line]");
  if (!node) return;
  if (state.flowFile !== state.project.current) openFile(state.flowFile);
  editor.gotoLine(Number(node.dataset.line));
});
$("#svgBtn").addEventListener("click", () => {
  const svg = $("#flowHost svg");
  if (!svg) { toast("请先生成流程图"); return; }
  download("flowchart.svg", standaloneSvg(svg), "image/svg+xml");
});
$("#pngBtn").addEventListener("click", async () => {
  const svg = $("#flowHost svg");
  if (!svg) { toast("请先生成流程图"); return; }
  try {
    const blob = await svgToPng(standaloneSvg(svg), svg.width.baseVal.value, svg.height.baseVal.value);
    download("flowchart.png", blob);
  } catch (err) { toast(err.message); }
});
$("#mermaidBtn").addEventListener("click", async () => {
  if (!state.flow) { toast("请先生成流程图"); return; }
  try { await navigator.clipboard.writeText(state.flow.mermaid); toast("Mermaid 文本已复制"); }
  catch { download("flowchart.mmd", state.flow.mermaid); }
});

// ------------------------------------------------------------------ 模块装配
const ctx = {
  state, runtime, editor, effects, onViewChange, onThemeChange, blocksRunning: false,
  createEditor, showView, openFile, openInIde, saveProject, renderFiles, startTrace, buildFlow,
  questions: null, openQuestion: () => {}, openLesson: () => {},
};

applyTheme(state.prefs.theme || "standard");
applyPrefs();
if (state.project.files[state.project.current] === undefined) state.project.current = Object.keys(state.project.files)[0];
showInEditor(state.project.current);
$("#stdinInput").value = state.project.stdin || "";
renderFiles();
replLog("Python Nexus 交互式解释器 · 输入 %reset 重置命名空间\n", "sys");
initBlocks(ctx);
await initPractice(ctx);
initLearn(ctx);
initExam(ctx);
showView(store.get("view", "ide"));

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").then(() => {
    // Service Worker 为页面加上 COOP/COEP 头后才能使用 SharedArrayBuffer（交互式 input）：首次安装后自动刷新一次
    if (!self.crossOriginIsolated && navigator.serviceWorker.controller === null) {
      navigator.serviceWorker.ready.then(() => {
        try {
          if (!sessionStorage.getItem("nexus:coi-reload")) { sessionStorage.setItem("nexus:coi-reload", "1"); location.reload(); }
        } catch { /* 忽略 */ }
      });
    }
  }).catch(() => {});
}
window.nexus = ctx; // 便于调试与自动化测试
