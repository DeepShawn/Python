// 习题系统：题库加载（验签）、各题型渲染与判分、练习视图。考试视图复用这里的渲染与判分。
import { $, $$, esc, toast } from "./ui.js";
import { store } from "./storage.js";
import { loadSignedBank, verifyAnswer } from "./crypto.js";
import { SIGNED_BANK } from "../data/exercises.js";

export const TYPE_NAMES = {
  single: "单选", multi: "多选", fill: "填空", random_fill: "随机", code_io: "编程", code_func: "函数",
  code_fill: "代码填空", debug: "调试", algorithm: "算法", structure: "结构", design: "模块设计",
};
export const isCode = (q) => Array.isArray(q.cases);

let bankPromise = null;
export function getBank() {
  if (!bankPromise) bankPromise = loadSignedBank(SIGNED_BANK);
  return bankPromise;
}

// ------------------------------------------------------------------ 随机参数
export function randomParams(spec) {
  const out = {};
  for (const [name, rule] of Object.entries(spec)) {
    if (Array.isArray(rule) && rule.length === 2 && rule.every(Number.isInteger)) {
      out[name] = rule[0] + Math.floor(Math.random() * (rule[1] - rule[0] + 1));
    } else if (Array.isArray(rule)) {
      out[name] = rule[Math.floor(Math.random() * rule.length)];
    } else if (rule && Array.isArray(rule.choice)) {
      out[name] = rule.choice[Math.floor(Math.random() * rule.choice.length)];
    } else out[name] = rule;
  }
  return out;
}
export const renderTemplate = (tpl, params) => tpl.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m));

function paramsFor(q, fresh = false) {
  let p = store.get(`params:${q.id}`, null);
  if (!p || fresh) { p = randomParams(q.params); store.set(`params:${q.id}`, p); }
  return p;
}

// ------------------------------------------------------------------ 渲染
/**
 * 在容器中渲染题目，返回控制器：getAnswer() 读取当前作答，setAnswer() 恢复作答。
 * opts.exam：考试模式（不显示用例细节）；opts.saved：已保存的作答。
 */
export async function renderQuestion(ctx, container, q, opts = {}) {
  const exam = !!opts.exam;
  const params = q.type === "random_fill" ? (opts.saved?.params || paramsFor(q, opts.freshParams)) : null;
  const title = params ? renderTemplate(q.title, params) : q.title;
  let body = "";
  if (q.type === "single" || q.type === "multi") {
    const t = q.type === "single" ? "radio" : "checkbox";
    body = `<div class="options">${q.options.map((o, i) => `
      <label class="option"><input type="${t}" name="opt-${q.id}" value="${i}"><span class="opt-key">${String.fromCharCode(65 + i)}</span><code>${esc(o)}</code></label>`).join("")}</div>`;
  } else if (q.type === "fill" || q.type === "random_fill") {
    body = `<input class="fill-input" data-fill autocomplete="off" spellcheck="false" placeholder="在此输入答案">
      ${q.type === "random_fill" && !exam ? '<button class="mini" data-act="reroll">换一组数字</button>' : ""}`;
  } else if (isCode(q)) {
    const visible = q.cases.filter((c) => !c.hidden);
    const req = describeRequires(q);
    body = `<p>${esc(q.prompt)}</p>
      ${req ? `<p class="req">${req}</p>` : ""}
      <div class="q-editor" data-editor></div>
      ${exam ? `<p class="muted small">考试模式：共 ${q.cases.length} 个测试用例，细节在交卷后也不公开。</p>` : `
      <details class="cases"><summary>示例测试用例（${visible.length} 个公开，${q.cases.length - visible.length} 个隐藏）</summary>
        ${visible.map((c) => `<div class="case"><span>${c.call ? "调用" : "输入"}</span><code>${esc(c.call || c.stdin || "（无）").replace(/\n/g, " ⏎ ")}</code><span>期望</span><code>${esc(c.expected)}</code></div>`).join("")}
      </details>`}`;
  }
  container.innerHTML = `
    <h2 class="q-heading">${esc(title)}</h2>
    ${q.code ? `<pre class="q-code">${esc(q.code)}</pre>` : ""}
    ${body}`;

  let editor = null;
  if (isCode(q)) {
    editor = await ctx.createEditor($("[data-editor]", container));
    const draftKey = opts.draftKey === undefined ? `draft:${q.id}` : opts.draftKey;
    editor.value = opts.saved ?? (draftKey ? store.get(draftKey, null) : null) ?? q.starter;
    if (draftKey) editor.addEventListener("change", () => store.set(draftKey, editor.value));
    if (opts.onChange) editor.addEventListener("change", opts.onChange);
  }
  const reroll = $('[data-act="reroll"]', container);
  if (reroll) reroll.onclick = () => opts.onReroll && opts.onReroll();

  const ctrl = {
    q, editor, params,
    getAnswer() {
      if (q.type === "single") return $(`input[name="opt-${q.id}"]:checked`, container)?.value ?? null;
      if (q.type === "multi") {
        const v = $$(`input[name="opt-${q.id}"]:checked`, container).map((i) => i.value);
        return v.length ? v : null;
      }
      if (q.type === "fill") return $("[data-fill]", container).value.trim() || null;
      if (q.type === "random_fill") {
        const value = $("[data-fill]", container).value.trim();
        return value ? { params, value } : null;
      }
      return editor ? editor.value : null;
    },
    setAnswer(a) {
      if (a == null) return;
      if (q.type === "single") { const i = $(`input[name="opt-${q.id}"][value="${a}"]`, container); if (i) i.checked = true; }
      else if (q.type === "multi") a.forEach((v) => { const i = $(`input[name="opt-${q.id}"][value="${v}"]`, container); if (i) i.checked = true; });
      else if (q.type === "fill") $("[data-fill]", container).value = a;
      else if (q.type === "random_fill") $("[data-fill]", container).value = a.value;
    },
  };
  if (opts.saved && !isCode(q)) ctrl.setAnswer(opts.saved);
  if (opts.onChange) container.addEventListener("change", opts.onChange);
  return ctrl;
}

function describeRequires(q) {
  const r = q.requires || {};
  const parts = [];
  if (r.loops) parts.push(`至少 ${r.loops} 个循环`);
  if (r.ifs) parts.push(`至少 ${r.ifs} 个条件判断`);
  if (r.tries) parts.push("使用 try / except");
  if (r.recursion) parts.push("使用递归");
  if (r.no_loops) parts.push("不允许使用循环");
  if (r.forbid_calls?.length) parts.push(`不允许调用 ${r.forbid_calls.map((c) => `<code>${esc(c)}()</code>`).join("、")}`);
  if (r.require_calls?.length) parts.push(`需要调用 ${r.require_calls.map((c) => `<code>${esc(c)}()</code>`).join("、")}`);
  for (const [name, params] of Object.entries(r.functions || {})) parts.push(`函数签名 <code>${esc(name)}(${esc(params.join(", "))})</code>`);
  for (const [name, methods] of Object.entries(r.classes || {})) parts.push(`类 <code>${esc(name)}</code> 提供 ${methods.map((m) => `<code>${esc(m)}</code>`).join("、")}`);
  if (q.limits?.max_lines) parts.push(`每个用例最多执行 ${q.limits.max_lines} 行`);
  if (q.limits?.time_ms) parts.push(`每个用例最多 ${q.limits.time_ms} ms`);
  return parts.length ? "要求：" + parts.join("；") : "";
}

// ------------------------------------------------------------------ 判分
/** 判分，返回 {correct, html}。exam=true 时不泄露用例细节与解析。 */
export async function gradeQuestion(ctx, q, answer, { exam = false } = {}) {
  const explain = !exam && q.explain ? `<div class="explain"><b>解析：</b>${esc(q.explain)}</div>` : "";
  if (answer == null || answer === "") return { correct: false, html: '<p class="muted">未作答</p>' };
  if (q.type === "single" || q.type === "multi" || q.type === "fill") {
    const ok = await verifyAnswer(answer, q.check);
    return { correct: ok, html: ok ? `<p class="ok big">✓ 回答正确</p>${explain}` : `<p class="err big">✗ 回答错误</p>${exam ? "" : '<p class="muted">再想想？解析会在答对后显示。</p>'}` };
  }
  if (q.type === "random_fill") {
    const r = await ctx.runtime.checkRandom({ expr: q.expr, params: answer.params, answer: answer.value });
    return { correct: r.correct, html: r.correct ? `<p class="ok big">✓ 回答正确</p>${explain}` : '<p class="err big">✗ 回答错误</p>' };
  }
  const cases = q.cases.map((c) => (exam ? { ...c, hidden: true } : c));
  const r = await ctx.runtime.judge({ code: answer, cases, reveal: !exam, requires: q.requires || null, limits: q.limits || null });
  const showPerf = q.type === "algorithm";
  const structure = r.structure?.length ? `<ul class="err structure">${r.structure.map((s) => `<li>${esc(s)}</li>`).join("")}</ul>` : "";
  const html = `<p class="${r.all_passed ? "ok" : "err"} big">${r.all_passed ? "✓ 全部通过" : "✗ 未全部通过"}：测试 ${r.passed} / ${r.total}${showPerf ? ` · 共执行 ${r.total_lines} 行` : ""}</p>
    ${structure}
    <table class="vars results"><thead><tr><th>#</th><th>结果</th><th>输入 / 调用</th><th>期望</th><th>实际</th>${showPerf ? "<th>行数</th>" : ""}</tr></thead><tbody>
    ${r.results.map((x) => `<tr class="${x.passed ? "" : "v-fail"}"><td>${x.index + 1}</td><td>${x.passed ? "✓" : "✗"}</td>
      ${"expected" in x ? `<td><code>${esc(x.input).replace(/\n/g, " ⏎ ")}</code></td><td><code>${esc(x.expected)}</code></td><td><code>${esc(x.actual)}</code></td>` : '<td colspan="3" class="muted">隐藏用例</td>'}
      ${showPerf ? `<td>${x.lines}</td>` : ""}</tr>
      ${x.error && !exam ? `<tr><td></td><td colspan="${showPerf ? 5 : 4}"><pre class="err small">${esc(x.error)}</pre></td></tr>` : ""}`).join("")}
    </tbody></table>${r.all_passed ? explain : ""}`;
  return { correct: r.all_passed, html };
}

// ------------------------------------------------------------------ 练习视图
export async function initPractice(ctx) {
  const { state } = ctx;
  const res = await getBank();
  if (!res.ok) {
    $("#question").innerHTML = `<h2 class="err">无法加载题库</h2><p>${esc(res.error)}</p>`;
    $("#qList").innerHTML = "";
    return;
  }
  const bank = res.bank;
  const QUESTIONS = Object.fromEntries(bank.questions.map((q) => [q.id, q]));
  ctx.questions = QUESTIONS;
  const status = (id) => state.progress[id] || { done: false, attempts: 0, wrong: 0 };
  let current = null;
  let ctrl = null;

  function saveProgress(id, ok) {
    const p = status(id);
    p.attempts += 1;
    if (ok) p.done = true; else p.wrong += 1;
    p.last = Date.now();
    state.progress[id] = p;
    store.set("progress", state.progress);
    renderList();
  }

  function renderList() {
    const stage = $("#qStage").value;
    const wrongOnly = $("#qWrongOnly").checked;
    const qs = bank.questions.filter((q) => (!stage || q.stage === stage) && (!wrongOnly || (status(q.id).wrong > 0 && !status(q.id).done)));
    $("#qList").innerHTML = qs.map((q) => {
      const st = status(q.id);
      const icon = st.done ? "✓" : st.wrong ? "✗" : "○";
      const t = q.type === "random_fill" ? q.title.replace(/\{\w+\}/g, "?") : q.title;
      return `<li data-q="${q.id}" class="${st.done ? "done" : st.wrong ? "wrong" : ""} ${q.id === current ? "active" : ""}">
        <span class="q-icon">${icon}</span><span class="q-title">${esc(t.split("\n")[0])}</span><small class="tag">${TYPE_NAMES[q.type] || q.type}</small></li>`;
    }).join("") || '<li class="muted">没有符合条件的题目</li>';
    const done = bank.questions.filter((q) => status(q.id).done).length;
    const wrong = bank.questions.filter((q) => status(q.id).wrong && !status(q.id).done).length;
    $("#qStats").textContent = `完成 ${done} / ${bank.questions.length}${wrong ? ` · 错题 ${wrong}` : ""}`;
  }

  async function open(id, { fresh = false } = {}) {
    const q = QUESTIONS[id];
    if (!q) return;
    current = id;
    const exam = $("#qExam").checked;
    const st = status(id);
    const main = $("#question");
    main.innerHTML = `
      <div class="lesson-stage">${esc(q.stage)} · ${TYPE_NAMES[q.type] || q.type}题 ${st.attempts ? `<span class="muted">· 已提交 ${st.attempts} 次${st.done ? " · 已通过" : ""}</span>` : ""}</div>
      <div id="qBody"></div>
      <div class="lesson-actions">
        <button class="primary" id="submitQ">${isCode(q) ? "▶ 运行测试并提交" : "提交答案"}</button>
        ${isCode(q) ? '<button id="resetQ">重置代码</button><button id="toIdeQ">在 IDE 中打开</button>' : ""}
      </div>
      <div id="qResult" class="q-result" aria-live="polite"></div>`;
    store.set("question", id);
    ctrl = await renderQuestion(ctx, $("#qBody"), q, { exam, freshParams: fresh, onReroll: () => open(id, { fresh: true }) });
    ctx.practiceCtrl = ctrl;
    if (isCode(q)) {
      $("#resetQ").onclick = () => { ctrl.editor.value = q.starter; store.set(`draft:${id}`, q.starter); };
      $("#toIdeQ").onclick = () => ctx.openInIde(`exercise_${id.replace(/-/g, "_")}.py`, ctrl.editor.value);
    }
    $("#submitQ").onclick = async () => {
      const resEl = $("#qResult");
      const answer = ctrl.getAnswer();
      if (answer == null) { resEl.innerHTML = '<p class="muted">请先作答</p>'; return; }
      resEl.innerHTML = `<p class="muted">${isCode(q) ? "正在运行测试…" : "校验中…"}</p>`;
      try {
        const r = await gradeQuestion(ctx, q, answer, { exam });
        saveProgress(id, r.correct);
        resEl.innerHTML = r.html + (!r.correct ? '<p class="muted small">已加入错题本。</p>' : "");
        ctx.effects.beep(r.correct ? "end" : "exception");
      } catch (err) { resEl.innerHTML = `<p class="err">${esc(err.message)}</p>`; }
    };
    renderList();
  }

  $("#qStage").innerHTML = '<option value="">全部阶段</option>' +
    [...new Set(bank.questions.map((q) => q.stage))].map((s) => `<option>${esc(s)}</option>`).join("");
  ["qStage", "qWrongOnly"].forEach((id) => $("#" + id).addEventListener("change", renderList));
  $("#qExam").addEventListener("change", () => current && open(current));
  $("#qList").addEventListener("click", (e) => {
    const li = e.target.closest("[data-q]");
    if (li) open(li.dataset.q);
  });
  ctx.openQuestion = (id) => { ctx.showView("practice"); open(id); };
  renderList();
  await open(store.get("question", null) && QUESTIONS[store.get("question")] ? store.get("question") : bank.questions[0].id);
  return bank;
}
