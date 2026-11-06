// 考试系统：限时作答、交卷后统一评分、成绩记录。
// 考试中不显示测试用例细节与解析；交卷后公开客观题解析（编程题用例保持隐藏）。
import { $, esc, fmtTime, toast } from "./ui.js";
import { store } from "./storage.js";
import { TYPE_NAMES, getBank, gradeQuestion, isCode, renderQuestion } from "./practice.js";

export async function initExam(ctx) {
  const res = await getBank();
  if (!res.ok) { $("#examMain").innerHTML = `<p class="err">${esc(res.error)}</p>`; return; }
  const bank = res.bank;
  const Q = Object.fromEntries(bank.questions.map((q) => [q.id, q]));
  let session = store.get("examSession", null);   // {examId, startedAt, deadline, answers, idx}
  let ctrl = null;
  let timer = 0;

  const history = () => store.get("examHistory", []);

  function renderSide() {
    $("#examList").innerHTML = bank.exams.map((e) => {
      const best = Math.max(-1, ...history().filter((h) => h.examId === e.id).map((h) => h.score));
      return `<li data-exam="${e.id}" class="${session?.examId === e.id ? "active" : ""}">
        <span class="q-title">${esc(e.title)}</span><small class="tag">${e.minutes} 分钟</small>
        ${best >= 0 ? `<small class="${best >= e.pass ? "ok" : "err"}">${best}</small>` : ""}</li>`;
    }).join("");
    const h = history().slice(-12).reverse();
    $("#examHistory").innerHTML = h.length ? h.map((r) => `<li><span>${esc(r.title)}</span>
      <b class="${r.passed ? "ok" : "err"}">${r.score} 分</b><small class="muted">${new Date(r.at).toLocaleString()} · 用时 ${fmtTime(r.seconds)}</small></li>`).join("")
      : '<li class="muted">还没有考试记录</li>';
  }

  function intro(examId) {
    const e = bank.exams.find((x) => x.id === examId);
    $("#examMain").innerHTML = `
      <div class="lesson-stage">考试</div>
      <h2>${esc(e.title)}</h2>
      <p>共 ${e.questions.length} 题 · 限时 ${e.minutes} 分钟 · ${e.pass} 分及格</p>
      <ul class="exam-rules">
        <li>考试期间不显示测试用例细节与解析，可以随时切换题目、修改答案。</li>
        <li>时间到会自动交卷；关闭页面后再次打开可继续作答（计时不停止）。</li>
        <li>交卷后统一评分，客观题解析随成绩公开，编程题测试用例保持隐藏。</li>
      </ul>
      <div class="lesson-actions"><button class="primary" id="startExam">开始考试</button></div>`;
    $("#startExam").onclick = () => start(examId);
  }

  function start(examId) {
    const e = bank.exams.find((x) => x.id === examId);
    session = { examId, startedAt: Date.now(), deadline: Date.now() + e.minutes * 60000, answers: {}, idx: 0 };
    store.set("examSession", session);
    renderSide();
    show();
  }

  function captureAnswer() {
    if (!session || !ctrl) return;
    session.answers[ctrl.q.id] = ctrl.getAnswer();
    store.set("examSession", session);
  }

  async function show() {
    const e = bank.exams.find((x) => x.id === session.examId);
    const ids = e.questions;
    const q = Q[ids[session.idx]];
    const answered = (id) => session.answers[id] != null && session.answers[id] !== Q[id]?.starter;
    $("#examMain").innerHTML = `
      <div class="exam-bar">
        <span class="lesson-stage">${esc(e.title)}</span>
        <span id="examTimer" class="exam-timer">--:--</span>
      </div>
      <div class="exam-grid">${ids.map((id, i) => `<button data-go="${i}" class="${i === session.idx ? "cur" : ""} ${answered(id) ? "done" : ""}">${i + 1}</button>`).join("")}</div>
      <div class="muted small">第 ${session.idx + 1} / ${ids.length} 题 · ${TYPE_NAMES[q.type] || q.type}</div>
      <div id="examQ"></div>
      <div class="lesson-actions">
        <button id="examPrev" ${session.idx === 0 ? "disabled" : ""}>上一题</button>
        <button id="examNext" ${session.idx === ids.length - 1 ? "disabled" : ""}>下一题</button>
        <span class="grow"></span>
        <button id="examSubmit" class="primary">交卷</button>
      </div>`;
    ctrl = await renderQuestion(ctx, $("#examQ"), q, {
      exam: true, draftKey: null, saved: session.answers[q.id] ?? undefined,
      onChange: () => captureAnswer(),
    });
    $(".exam-grid").onclick = (ev) => { const b = ev.target.closest("[data-go]"); if (b) go(Number(b.dataset.go)); };
    $("#examPrev").onclick = () => go(session.idx - 1);
    $("#examNext").onclick = () => go(session.idx + 1);
    $("#examSubmit").onclick = () => {
      captureAnswer();
      const left = ids.filter((id) => !answered(id)).length;
      if (left && !confirm(`还有 ${left} 题未作答，确定交卷吗？`)) return;
      submit();
    };
    tick();
  }

  function go(i) {
    captureAnswer();
    session.idx = i;
    store.set("examSession", session);
    show();
  }

  function tick() {
    clearInterval(timer);
    const update = () => {
      if (!session) { clearInterval(timer); return; }
      const left = (session.deadline - Date.now()) / 1000;
      const el = $("#examTimer");
      if (el) { el.textContent = fmtTime(left); el.classList.toggle("urgent", left < 60); }
      if (left <= 0) { clearInterval(timer); captureAnswer(); toast("时间到，自动交卷"); submit(); }
    };
    update();
    timer = setInterval(update, 1000);
  }

  async function submit() {
    clearInterval(timer);
    const s = session;
    session = null;
    store.set("examSession", null);
    const e = bank.exams.find((x) => x.id === s.examId);
    $("#examMain").innerHTML = '<h2>正在评分…</h2><progress id="gradeProg" max="' + e.questions.length + '" value="0"></progress>';
    const results = [];
    for (const id of e.questions) {
      const q = Q[id];
      let r;
      try { r = await gradeQuestion(ctx, q, s.answers[id] ?? null, { exam: true }); } catch (err) { r = { correct: false, html: esc(err.message) }; }
      results.push({ id, correct: r.correct });
      $("#gradeProg").value = results.length;
    }
    const correct = results.filter((r) => r.correct).length;
    const score = Math.round((correct / results.length) * 100);
    const seconds = Math.min((Date.now() - s.startedAt) / 1000, e.minutes * 60);
    const record = { examId: e.id, title: e.title, score, passed: score >= e.pass, at: Date.now(), seconds, results };
    store.set("examHistory", [...history(), record].slice(-100));
    ctx.effects.beep(record.passed ? "end" : "exception");
    renderSide();
    $("#examMain").innerHTML = `
      <div class="lesson-stage">成绩</div>
      <h2>${esc(e.title)}</h2>
      <p class="exam-score ${record.passed ? "ok" : "err"}">${score} 分 <small>${record.passed ? "通过" : "未通过"}（及格 ${e.pass} 分）</small></p>
      <p class="muted">答对 ${correct} / ${results.length} 题 · 用时 ${fmtTime(seconds)}</p>
      <table class="vars results"><thead><tr><th>#</th><th>题目</th><th>题型</th><th>结果</th><th>解析</th></tr></thead><tbody>
      ${results.map((r, i) => { const q = Q[r.id]; return `<tr class="${r.correct ? "" : "v-fail"}"><td>${i + 1}</td>
        <td>${esc((q.type === "random_fill" ? q.title.replace(/\{\w+\}/g, "?") : q.title).split("\n")[0])}</td><td>${TYPE_NAMES[q.type] || q.type}</td>
        <td>${r.correct ? "✓" : "✗"}</td><td class="wrap">${q.explain && !isCode(q) ? esc(q.explain) : '<span class="muted">—</span>'}</td></tr>`; }).join("")}
      </tbody></table>
      <div class="lesson-actions"><button id="examAgain">再考一次</button><button id="examPractice">去练习错题</button></div>`;
    for (const r of results) {
      if (!r.correct) {
        const p = ctx.state.progress[r.id] || { done: false, attempts: 0, wrong: 0 };
        p.wrong += 1;
        ctx.state.progress[r.id] = p;
      }
    }
    store.set("progress", ctx.state.progress);
    $("#examAgain").onclick = () => intro(e.id);
    $("#examPractice").onclick = () => { ctx.showView("practice"); $("#qWrongOnly").checked = true; $("#qWrongOnly").dispatchEvent(new Event("change")); };
  }

  $("#examList").addEventListener("click", (ev) => {
    const li = ev.target.closest("[data-exam]");
    if (!li) return;
    if (session && session.examId !== li.dataset.exam) { toast("请先完成当前考试"); return; }
    if (session) show(); else intro(li.dataset.exam);
  });

  renderSide();
  if (session && Q[bank.exams.find((x) => x.id === session.examId)?.questions[0]]) show();
  else if (bank.exams.length) intro(bank.exams[0].id);
}
