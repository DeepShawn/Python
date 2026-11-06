// 学习系统：课程目录、课时内容、示例代码（只读编辑器）、在 IDE 中运行 / 可视化 / 流程图、配套练习。
import { $, esc } from "./ui.js";
import { store } from "./storage.js";
import { COURSE } from "../data/lessons.js";

export function initLearn(ctx) {
  const { state } = ctx;
  let current = null;

  const total = COURSE.reduce((s, st) => s + st.lessons.length, 0);
  const planned = COURSE.reduce((s, st) => s + st.hours, 0);

  function findLesson(id) {
    for (const st of COURSE) {
      const i = st.lessons.findIndex((l) => l.id === id);
      if (i >= 0) return { ...st.lessons[i], stage: st.stage, note: st.note };
    }
    return null;
  }
  const flat = COURSE.flatMap((st) => st.lessons.map((l) => l.id));

  function renderTree() {
    const done = flat.filter((id) => state.lessonsDone[id]).length;
    $("#courseProgress").textContent = `${done} / ${total}`;
    $("#courseTree").innerHTML = COURSE.map((st) => {
      const stDone = st.lessons.filter((l) => state.lessonsDone[l.id]).length;
      return `<details ${st.lessons.some((l) => l.id === current?.id) ? "open" : ""}>
        <summary><span>${esc(st.stage)}</span><small class="muted">${stDone}/${st.lessons.length} · 规划 ${st.hours} 课时</small></summary>
        <ul>
          ${st.lessons.map((l) => `<li data-lesson="${l.id}" class="${l.id === current?.id ? "active" : ""}">${state.lessonsDone[l.id] ? "✓" : "○"} ${esc(l.title)}</li>`).join("")}
        </ul>
        <div class="topics muted">${st.topics.map(esc).join(" · ")}</div>
      </details>`;
    }).join("") + `<p class="muted small course-note">共 ${total} 个可运行课时；课程规划合计 ${planned} 课时（含练习与项目）。</p>`;
  }

  async function open(id) {
    const l = findLesson(id);
    if (!l) return;
    current = l;
    store.set("lesson", id);
    const q = l.practice && ctx.questions?.[l.practice];
    const idx = flat.indexOf(id);
    $("#lesson").innerHTML = `
      <div class="lesson-stage">${esc(l.stage)} · 第 ${idx + 1} / ${flat.length} 课</div>
      <h2>${esc(l.title)}</h2>
      <div class="lesson-body">${l.body}</div>
      ${l.note ? `<p class="note">${esc(l.note)}</p>` : ""}
      <div class="lesson-code"><div class="code-title">示例代码${l.files ? `（另含 ${Object.keys(l.files).map(esc).join("、")}）` : ""}</div>
        <div id="lessonEditor" class="lesson-editor"></div></div>
      <div class="lesson-actions">
        <button class="primary" data-act="open">在编辑器中打开</button>
        <button data-act="visual">◉ 可视化运行</button>
        <button data-act="flow">⬡ 查看流程图</button>
        ${q ? `<button data-act="practice">练习：${esc(q.title.replace(/\{\w+\}/g, "?").split("\n")[0].slice(0, 18))}</button>` : ""}
        <button data-act="done">${state.lessonsDone[l.id] ? "✓ 已学完" : "标记为已学完"}</button>
      </div>
      <div class="lesson-nav">
        ${idx > 0 ? `<button data-go="${flat[idx - 1]}">← 上一课</button>` : "<span></span>"}
        ${idx < flat.length - 1 ? `<button data-go="${flat[idx + 1]}">下一课 →</button>` : ""}
      </div>`;
    const ed = await ctx.createEditor($("#lessonEditor"), { readOnly: true });
    ed.value = l.code;
    renderTree();
  }

  $("#courseTree").addEventListener("click", (e) => {
    const li = e.target.closest("[data-lesson]");
    if (li) open(li.dataset.lesson);
  });
  $("#lesson").addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]");
    if (go) { open(go.dataset.go); $("#lesson").scrollTop = 0; return; }
    const act = e.target.dataset.act;
    const l = current;
    if (!act || !l) return;
    if (act === "done") {
      state.lessonsDone[l.id] = Date.now();
      store.set("lessonsDone", state.lessonsDone);
      open(l.id);
      return;
    }
    if (act === "practice") { ctx.openQuestion(l.practice); return; }
    // 课程示例放进独立文件，避免覆盖用户代码
    const name = `lesson_${l.id.replace(/^l-/, "").replace(/-/g, "_")}.py`;
    ctx.openInIde(name, l.code, l.files);
    if (act === "visual") ctx.startTrace();
    if (act === "flow") ctx.buildFlow(true);
  });

  ctx.openLesson = open;
  renderTree();
  open(store.get("lesson", null) && findLesson(store.get("lesson")) ? store.get("lesson") : flat[0]);
}
