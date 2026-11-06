// Python Nexus 主程序：IDE、可视化执行、流程图、课程与习题。
import { PythonRuntime } from "./runtime.js";
import { Editor } from "./editor.js";
import { renderChart, standaloneSvg, svgToPng } from "./flowchart.js";
import { Effects } from "./effects.js";
import { verifyAnswer } from "./crypto.js";
import { store, download } from "./storage.js";
import { COURSE } from "../data/lessons.js";
import { QUESTION_BANK } from "../data/exercises.js";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const PROJECT_PREFIX = "/home/pyodide/project/";

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
  progress: store.get("progress", {}),   // 习题进度
  lessonsDone: store.get("lessonsDone", {}),
  prefs: store.get("prefs", { theme: "standard", sound: false, motion: null }),
};

const runtime = new PythonRuntime();
const effects = new Effects($("#fx-bg"), $("#fx-fg"));
const editor = new Editor($("#editor"));

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

function toast(msg, ms = 2200) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.hidden = true), ms);
}

// ------------------------------------------------------------------ 运行时状态
runtime.addEventListener("status", (e) => {
  const { state: s, info, message } = e.detail;
  const pill = $("#runtimeStatus");
  pill.className = `status-pill ${s}`;
  if (s === "loading") pill.textContent = "加载 Python…";
  if (s === "ready") {
    pill.textContent = `Python ${info.python}`;
    pill.title = `Pyodide ${info.version}（${info.source === "local" ? "本地离线包" : "CDN 回退，建议运行 npm run vendor"}）`;
    $("#sbRuntime").textContent = info.source === "local" ? "Local Runtime · 离线" : "CDN Runtime";
  }
  if (s === "error") { pill.textContent = "运行时错误"; pill.title = message; appendOut(`运行时加载失败：${message}\n`, "err"); }
});
runtime.addEventListener("stream", (e) => {
  if (!state.trace) appendOut(e.detail.text + "\n", e.detail.stream === "stderr" ? "err" : "");
});

// ------------------------------------------------------------------ 视图与主题
$$(".tabs button").forEach((b) => b.addEventListener("click", () => showView(b.dataset.view)));
function showView(name) {
  $$(".tabs button").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  $$(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));
  store.set("view", name);
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
  $$(".bottom .pane").forEach((p) => p.classList.toggle("active", p.id === `pane-${name}`));
  if (name === "repl") $("#replInput").focus();
}
$$(".inspector .subtabs button").forEach((b) => b.addEventListener("click", () => showIPane(b.dataset.ipane)));
function showIPane(name) {
  $$(".inspector .subtabs button").forEach((b) => b.classList.toggle("active", b.dataset.ipane === name));
  $$(".inspector .ipane").forEach((p) => p.classList.toggle("active", p.id === `ipane-${name}`));
}

// ------------------------------------------------------------------ 文件管理
function renderFiles() {
  const names = Object.keys(state.project.files).sort((a, b) => {
    const da = a.includes("/"), db = b.includes("/");
    return da === db ? a.localeCompare(b) : da ? 1 : -1;
  });
  $("#fileList").innerHTML = names.map((n) => {
    const depth = n.split("/").length - 1;
    const icon = n.endsWith(".py") ? (n.includes("test") ? "🧪" : "🐍") : "📄";
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
$("#projectMenu").addEventListener("click", (e) => {
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
    download("python-nexus-project.json", JSON.stringify(p, null, 2), "application/json");
  } else if (act === "import") {
    $("#importInput").click();
  } else if (act === "reset") {
    if (!confirm("恢复示例项目会覆盖当前项目，确定吗？")) return;
    loadProject(structuredClone(DEFAULT_PROJECT));
  }
});
$("#importInput").addEventListener("change", async (e) => {
  for (const file of e.target.files) {
    const text = await file.text();
    if (file.name.endsWith(".json")) {
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

// ------------------------------------------------------------------ 输出
function appendOut(text, cls = "") {
  const out = $("#pane-out");
  const span = document.createElement("span");
  if (cls) span.className = cls;
  span.textContent = text;
  out.appendChild(span);
  out.scrollTop = out.scrollHeight;
}
function clearOut() { $("#pane-out").textContent = ""; }
$("#clearOutBtn").addEventListener("click", () => {
  const active = $(".bottom .pane.active");
  if (active.id === "pane-repl") $("#replLog").textContent = ""; else if (active.id !== "pane-stdin") active.textContent = "";
});

function setRunning(on) {
  $("#stopBtn").disabled = !on;
  $("#runBtn").disabled = on;
  $("#visualBtn").disabled = on;
}

function runArgs() {
  saveProject();
  return {
    code: editor.value,
    stdin: $("#stdinInput").value,
    files: state.project.files,
    filename: state.project.current,
  };
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
    if (r.error) {
      appendOut(r.error, "err");
      markErrorLine(r.error);
    }
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
  const re = new RegExp(`File "(?:${PROJECT_PREFIX})?${state.project.current.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}", line (\\d+)`, "g");
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
        `<span class="sys">提示：py_compile 只生成 .pyc 字节码，不等于打包为独立 EXE。下面是 dis 反汇编结果：</span>\n\n${esc(r.bytecode)}`;
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
  if (line.trim()) { state.replHistory.push(line); }
  state.replIdx = state.replHistory.length;
  const prompt = $("#replPrompt").textContent;
  replLog(`${prompt} ${line}\n`, "in");
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
    const r = await runtime.trace({ ...runArgs(), maxSteps: 3000 });
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

  // 切换到事件所在文件（跨模块调用时）
  const file = eventFile(ev);
  if (ev.e !== "end" && file && file !== state.project.current && state.project.files[file] !== undefined) {
    state.project.files[state.project.current] = editor.value;
    showInEditor(file);
    renderFiles();
  }

  // 代码行高亮：当前行 + 上一次执行的行
  const marks = {};
  if (prev && prev.ln && eventFile(prev) === state.project.current && prev.e !== "end") marks[prev.ln] = "mark-prev";
  const kindCls = { line: "mark-active", call: "mark-call", return: "mark-return", exception: "mark-error" }[ev.e];
  if (ev.ln && kindCls) marks[ev.ln] = kindCls;
  editor.setMarks(marks);
  if (ev.ln) editor.revealLine(ev.ln);

  // 事件说明
  const code = ev.ln ? (editor.value.split("\n")[ev.ln - 1] || "") : "";
  let title, detail;
  if (ev.e === "line") [title, detail] = describeLine(code);
  else if (ev.e === "call") { title = "调用函数"; detail = `进入 ${ev.fn}()，创建新的局部作用域`; }
  else if (ev.e === "return") { title = "函数返回"; detail = `${ev.fn}() 返回 ${ev.ret}`; }
  else if (ev.e === "exception") { title = "异常"; detail = ev.exc; }
  else { title = t.ok ? "程序结束" : "程序异常结束"; detail = t.error || "所有代码执行完毕"; }
  $("#stepKind").textContent = title;
  $("#stepKind").className = `step-kind k-${ev.e}`;

  // 变量变化：与同一函数帧的上一个事件比较
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

  // 输出逐步出现
  const out = $("#pane-out");
  out.textContent = t.stdout.slice(0, ev.out);
  if (ev.e === "end" && t.error) appendOut("\n" + t.error, t.ok ? "sys" : "err");
  if (ev.e === "end") appendOut(`\n进程结束 · Exit Code ${t.ok ? 0 : 1} · 共 ${t.events.length} 步${t.truncated ? "（已截断）" : ""}\n`, "sys");
  out.scrollTop = out.scrollHeight;

  // 流程图同步高亮
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

function stepDelay() {
  return 750 / Number($("#speedSelect").value);
}
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
    state.flow = { ...r, code, selected: 0 };
    state.flowFile = state.project.current;
    const sel = $("#flowSelect");
    sel.innerHTML = `<option value="0">主程序 ${esc(state.project.current)}</option>` +
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
  if (k === 0) {
    $("#flowHost").innerHTML = renderChart("开始", f.flow.main);
  } else {
    const fn = f.flow.functions[k - 1];
    $("#flowHost").innerHTML = renderChart(`函数 ${fn.name}(${fn.args})`, fn.body, { endText: "返回调用者（None）" });
  }
}
function renderStructure() {
  const { calls, imports } = state.flow;
  const callRows = Object.entries(calls).filter(([, v]) => v.length);
  $("#callGraph").innerHTML = callRows.length
    ? callRows.map(([k, v]) => `<div><code>${esc(k === "<module>" ? "主程序" : k + "()")}</code> → ${v.map((x) => `<code>${esc(x)}()</code>`).join(" ")}</div>`).join("")
    : '<span class="muted">当前文件中没有对本地函数的调用。</span>';
  const importRows = Object.entries(imports);
  $("#importGraph").innerHTML = importRows.length
    ? importRows.map(([k, v]) => {
        const local = v.map((m) => {
          const isLocal = state.project.files[m.replace(/\./g, "/") + ".py"] !== undefined;
          return `<code class="${isLocal ? "local" : ""}" title="${isLocal ? "项目内模块" : "标准库 / 第三方"}">${esc(m)}</code>`;
        });
        return `<div><code>${esc(k)}</code> ${local.length ? "→ " + local.join(" ") : '<span class="muted">无导入</span>'}</div>`;
      }).join("")
    : "";
}
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

// ------------------------------------------------------------------ 学习
const QUESTIONS = Object.fromEntries(QUESTION_BANK.questions.map((q) => [q.id, q]));
let currentLesson = null;

function renderCourse() {
  const total = COURSE.reduce((s, st) => s + st.lessons.length, 0);
  const done = Object.keys(state.lessonsDone).length;
  $("#courseProgress").textContent = `${done} / ${total}`;
  $("#courseTree").innerHTML = COURSE.map((st, si) => `
    <details ${si < 2 || st.lessons.some((l) => l.id === currentLesson?.id) ? "open" : ""}>
      <summary><span>${esc(st.stage)}</span><small class="muted">规划 ${st.hours} 课时</small></summary>
      <ul>
        ${st.lessons.map((l) => `<li data-lesson="${l.id}" class="${l.id === currentLesson?.id ? "active" : ""}">${state.lessonsDone[l.id] ? "✓" : "○"} ${esc(l.title)}</li>`).join("")}
        ${st.lessons.length ? "" : '<li class="muted planned">课程建设中</li>'}
      </ul>
      <div class="topics muted">${st.topics.map(esc).join(" · ")}</div>
    </details>`).join("") +
    '<p class="muted small course-note">合计规划 260 课时（课程建设目标）。已完成课时可直接在 IDE 中运行与可视化。</p>';
}
$("#courseTree").addEventListener("click", (e) => {
  const li = e.target.closest("[data-lesson]");
  if (li) openLesson(li.dataset.lesson);
});
function findLesson(id) {
  for (const st of COURSE) for (const l of st.lessons) if (l.id === id) return { ...l, stage: st.stage, note: st.note };
  return null;
}
function openLesson(id) {
  const l = findLesson(id);
  if (!l) return;
  currentLesson = l;
  store.set("lesson", id);
  const q = l.practice && QUESTIONS[l.practice];
  $("#lesson").innerHTML = `
    <div class="lesson-stage">${esc(l.stage)}</div>
    <h2>${esc(l.title)}</h2>
    <div class="lesson-body">${l.body}</div>
    <div class="lesson-code"><div class="code-title">示例代码${l.files ? `（另含 ${Object.keys(l.files).map(esc).join("、")}）` : ""}</div>
      <div id="lessonEditor" class="lesson-editor"></div></div>
    ${l.stdin ? `<p class="muted small">标准输入：<code>${esc(l.stdin).replace(/\n/g, " ⏎ ")}</code></p>` : ""}
    <div class="lesson-actions">
      <button class="primary" data-act="open">在编辑器中打开</button>
      <button data-act="visual">◉ 可视化运行</button>
      <button data-act="flow">⬡ 查看流程图</button>
      ${q ? `<button data-act="practice">练习：${esc(q.title.split("\n")[0].slice(0, 18))}</button>` : ""}
      <button data-act="done">${state.lessonsDone[l.id] ? "✓ 已学完" : "标记为已学完"}</button>
    </div>`;
  const ed = new Editor($("#lessonEditor"), { readOnly: true, gutter: true });
  ed.value = l.code;
  renderCourse();
}
$("#lesson").addEventListener("click", (e) => {
  const act = e.target.dataset.act;
  const l = currentLesson;
  if (!act || !l) return;
  if (act === "done") {
    state.lessonsDone[l.id] = Date.now();
    store.set("lessonsDone", state.lessonsDone);
    openLesson(l.id);
    return;
  }
  if (act === "practice") { showView("practice"); openQuestion(l.practice); return; }
  // 把课程示例放进项目 lessons/ 目录以外的独立文件，避免覆盖用户代码
  saveProject();
  const name = `lesson_${l.id.replace(/^l-/, "")}.py`;
  state.project.files[name] = l.code;
  for (const [fname, content] of Object.entries(l.files || {})) state.project.files[fname] = content;
  if (l.stdin !== undefined) $("#stdinInput").value = l.stdin;
  showView("ide");
  openFile(name);
  if (act === "visual") startTrace();
  if (act === "flow") buildFlow(true);
});

// ------------------------------------------------------------------ 习题
function qStatus(id) { return state.progress[id] || { done: false, attempts: 0, wrong: 0 }; }
function saveProgress(id, ok) {
  const p = qStatus(id);
  p.attempts += 1;
  if (ok) p.done = true; else p.wrong += 1;
  p.last = Date.now();
  state.progress[id] = p;
  store.set("progress", state.progress);
  renderQList();
}
const TYPE_NAMES = { single: "单选", multi: "多选", fill: "填空", code_io: "编程", code_func: "函数" };

function renderQList() {
  const stage = $("#qStage").value;
  const wrongOnly = $("#qWrongOnly").checked;
  const qs = QUESTION_BANK.questions.filter((q) => (!stage || q.stage === stage) && (!wrongOnly || (qStatus(q.id).wrong > 0)));
  $("#qList").innerHTML = qs.map((q) => {
    const st = qStatus(q.id);
    const icon = st.done ? "✓" : st.wrong ? "✗" : "○";
    return `<li data-q="${q.id}" class="${st.done ? "done" : st.wrong ? "wrong" : ""} ${q.id === state.currentQ ? "active" : ""}">
      <span class="q-icon">${icon}</span><span class="q-title">${esc(q.title.split("\n")[0])}</span><small class="tag">${TYPE_NAMES[q.type]}</small></li>`;
  }).join("") || '<li class="muted">没有符合条件的题目</li>';
  const all = QUESTION_BANK.questions;
  const done = all.filter((q) => qStatus(q.id).done).length;
  $("#qStats").textContent = `完成 ${done} / ${all.length}`;
}
$("#qStage").innerHTML += [...new Set(QUESTION_BANK.questions.map((q) => q.stage))].map((s) => `<option>${esc(s)}</option>`).join("");
["qStage", "qWrongOnly"].forEach((id) => $("#" + id).addEventListener("change", renderQList));
$("#qExam").addEventListener("change", () => state.currentQ && openQuestion(state.currentQ));
$("#qList").addEventListener("click", (e) => {
  const li = e.target.closest("[data-q]");
  if (li) openQuestion(li.dataset.q);
});

let qEditor = null;
function openQuestion(id) {
  const q = QUESTIONS[id];
  if (!q) return;
  state.currentQ = id;
  const exam = $("#qExam").checked;
  const st = qStatus(id);
  let body = "";
  if (q.type === "single" || q.type === "multi") {
    const inputType = q.type === "single" ? "radio" : "checkbox";
    body = `<div class="options">${q.options.map((o, i) => `
      <label class="option"><input type="${inputType}" name="opt" value="${i}"><span class="opt-key">${String.fromCharCode(65 + i)}</span><code>${esc(o)}</code></label>`).join("")}</div>`;
  } else if (q.type === "fill") {
    body = `<input id="fillInput" class="fill-input" autocomplete="off" spellcheck="false" placeholder="在此输入答案">`;
  } else {
    const visible = q.cases.filter((c) => !c.hidden);
    body = `<p>${esc(q.prompt)}</p>
      <div id="qEditor" class="q-editor"></div>
      ${exam ? `<p class="muted small">考试模式：共 ${q.cases.length} 个测试用例，细节在提交后不显示。</p>` : `
      <details class="cases"><summary>示例测试用例（${visible.length} 个公开，${q.cases.length - visible.length} 个隐藏）</summary>
        ${visible.map((c) => `<div class="case"><span>${c.call ? "调用" : "输入"}</span><code>${esc(c.call || c.stdin || "（无）").replace(/\n/g, " ⏎ ")}</code><span>期望</span><code>${esc(c.expected)}</code></div>`).join("")}
      </details>`}`;
  }
  $("#question").innerHTML = `
    <div class="lesson-stage">${esc(q.stage)} · ${TYPE_NAMES[q.type]}题 ${st.attempts ? `<span class="muted">· 已提交 ${st.attempts} 次${st.done ? " · 已通过" : ""}</span>` : ""}</div>
    <h2 class="q-heading">${esc(q.title)}</h2>
    ${q.code ? `<pre class="q-code">${esc(q.code)}</pre>` : ""}
    ${body}
    <div class="lesson-actions">
      <button class="primary" id="submitQ">${q.type.startsWith("code") ? "▶ 运行测试并提交" : "提交答案"}</button>
      ${q.type.startsWith("code") ? '<button id="resetQ">重置代码</button><button id="toIdeQ">在 IDE 中打开</button>' : ""}
    </div>
    <div id="qResult" class="q-result" aria-live="polite"></div>`;
  if (q.type.startsWith("code")) {
    qEditor = new Editor($("#qEditor"));
    qEditor.value = store.get(`draft:${id}`, null) ?? q.starter;
    qEditor.addEventListener("change", () => store.set(`draft:${id}`, qEditor.value));
    $("#resetQ").onclick = () => { qEditor.value = q.starter; store.set(`draft:${id}`, q.starter); };
    $("#toIdeQ").onclick = () => {
      saveProject();
      const name = `exercise_${id.replace(/^p-/, "").replace(/-/g, "_")}.py`;
      state.project.files[name] = qEditor.value;
      showView("ide");
      openFile(name);
    };
  }
  $("#submitQ").onclick = () => submitQuestion(q);
  renderQList();
}

async function submitQuestion(q) {
  const res = $("#qResult");
  const exam = $("#qExam").checked;
  const explain = !exam && q.explain ? `<div class="explain"><b>解析：</b>${esc(q.explain)}</div>` : "";
  if (q.type === "single" || q.type === "multi" || q.type === "fill") {
    let answer;
    if (q.type === "fill") answer = $("#fillInput").value;
    else {
      const picked = $$('#question input[name="opt"]:checked').map((i) => i.value);
      if (!picked.length) { res.innerHTML = '<p class="muted">请先选择答案</p>'; return; }
      answer = q.type === "single" ? picked[0] : picked;
    }
    if (!String(answer).trim()) { res.innerHTML = '<p class="muted">请先输入答案</p>'; return; }
    res.innerHTML = '<p class="muted">校验中…</p>';
    try {
      const ok = await verifyAnswer(answer, q.check);
      saveProgress(q.id, ok);
      res.innerHTML = ok ? `<p class="ok big">✓ 回答正确</p>${explain}` : `<p class="err big">✗ 回答错误，已加入错题本</p>${exam ? "" : '<p class="muted">再想想？解析会在答对后显示。</p>'}`;
      effects.beep(ok ? "end" : "exception");
    } catch (err) { res.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
    return;
  }
  // 编程题：动态评测
  const code = qEditor.value;
  const banned = (q.forbid || []).filter((f) => code.includes(f));
  if (banned.length) { res.innerHTML = `<p class="err">本题不允许使用：${banned.map((b) => `<code>${esc(b)}</code>`).join(" ")}</p>`; return; }
  res.innerHTML = '<p class="muted">正在运行测试…</p>';
  try {
    const r = await runtime.judge({ code, cases: q.cases.map((c) => (exam ? { ...c, hidden: true } : c)) });
    saveProgress(q.id, r.all_passed);
    res.innerHTML = `<p class="${r.all_passed ? "ok" : "err"} big">${r.all_passed ? "✓ 全部通过" : "✗ 未全部通过"}：${r.passed} / ${r.total}</p>
      <table class="vars results"><thead><tr><th>#</th><th>结果</th><th>输入 / 调用</th><th>期望</th><th>实际</th></tr></thead><tbody>
      ${r.results.map((x) => `<tr class="${x.passed ? "" : "v-fail"}"><td>${x.index + 1}</td><td>${x.passed ? "✓" : "✗"}</td>
        ${"expected" in x ? `<td><code>${esc(x.input).replace(/\n/g, " ⏎ ")}</code></td><td><code>${esc(x.expected)}</code></td><td><code>${esc(x.actual)}</code></td>` : '<td colspan="3" class="muted">隐藏用例</td>'}</tr>
        ${x.error && !exam ? `<tr><td></td><td colspan="4"><pre class="err small">${esc(x.error)}</pre></td></tr>` : ""}`).join("")}
      </tbody></table>${r.all_passed ? explain : ""}`;
    effects.beep(r.all_passed ? "end" : "exception");
  } catch (err) { res.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
}

// ------------------------------------------------------------------ 初始化
function init() {
  applyTheme(state.prefs.theme || "standard");
  applyPrefs();
  if (state.project.files[state.project.current] === undefined) state.project.current = Object.keys(state.project.files)[0];
  showInEditor(state.project.current);
  $("#stdinInput").value = state.project.stdin || "";
  renderFiles();
  renderCourse();
  openLesson(store.get("lesson", COURSE[0].lessons[0].id));
  renderQList();
  openQuestion(QUESTION_BANK.questions[0].id);
  showView(store.get("view", "ide"));
  replLog("Python Nexus 交互式解释器 · 输入 %reset 重置命名空间\n", "sys");

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}
init();
window.nexus = { state, runtime, editor }; // 便于调试与自动化测试
