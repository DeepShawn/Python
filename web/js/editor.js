// Python Nexus 代码编辑器：textarea + 语法高亮叠加层。
// 无需构建工具即可离线运行；提供行号、断点、执行行高亮、自动缩进、Tab 缩进与自动补全。
// 后续版本可替换为 CodeMirror 6，保持相同的对外接口。

export const PY_KEYWORDS = [
  "False", "None", "True", "and", "as", "assert", "async", "await", "break", "class",
  "continue", "def", "del", "elif", "else", "except", "finally", "for", "from", "global",
  "if", "import", "in", "is", "lambda", "match", "case", "nonlocal", "not", "or", "pass",
  "raise", "return", "try", "while", "with", "yield",
];
export const PY_BUILTINS = [
  "abs", "all", "any", "bin", "bool", "bytes", "callable", "chr", "dict", "dir", "divmod",
  "enumerate", "eval", "exec", "filter", "float", "format", "frozenset", "getattr", "hasattr",
  "hash", "help", "hex", "id", "input", "int", "isinstance", "issubclass", "iter", "len",
  "list", "map", "max", "min", "next", "object", "oct", "open", "ord", "pow", "print",
  "range", "repr", "reversed", "round", "set", "setattr", "slice", "sorted", "str", "sum",
  "super", "tuple", "type", "vars", "zip", "self", "Exception", "ValueError", "TypeError",
  "KeyError", "IndexError", "ZeroDivisionError", "NameError", "__init__", "__name__",
];
const KW = new Set(PY_KEYWORDS);
const BI = new Set(PY_BUILTINS);

const TOKEN_RE = new RegExp([
  /(#[^\n]*)/.source,                                                     // 1 注释
  /((?:[rRbBuUfF]{0,2})(?:"""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$)|"(?:\\.|[^"\\\n])*"?|'(?:\\.|[^'\\\n])*'?))/.source, // 2 字符串
  /(@[\w.]+)/.source,                                                     // 3 装饰器
  /(\b(?:0[xX][\da-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*\.?[\d_]*(?:[eE][+-]?\d+)?j?|\.\d+)\b)/.source, // 4 数字
  /([A-Za-z_À-￿][\wÀ-￿]*)/.source,                    // 5 标识符
].join("|"), "g");

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function highlightPython(code) {
  let html = "";
  let last = 0;
  let prevWord = "";
  TOKEN_RE.lastIndex = 0;
  let m;
  while ((m = TOKEN_RE.exec(code))) {
    html += esc(code.slice(last, m.index));
    const [tok, comment, str, deco, num, ident] = m;
    if (comment) html += `<span class="t-com">${esc(tok)}</span>`;
    else if (str) html += `<span class="t-str">${esc(tok)}</span>`;
    else if (deco) html += `<span class="t-deco">${esc(tok)}</span>`;
    else if (num) html += `<span class="t-num">${esc(tok)}</span>`;
    else if (ident) {
      let cls = "";
      if (KW.has(tok)) cls = "t-kw";
      else if (prevWord === "def") cls = "t-fn";
      else if (prevWord === "class") cls = "t-cls";
      else if (BI.has(tok)) cls = "t-bi";
      html += cls ? `<span class="${cls}">${esc(tok)}</span>` : esc(tok);
      prevWord = tok;
      last = m.index + tok.length;
      continue;
    }
    prevWord = "";
    last = m.index + tok.length;
  }
  html += esc(code.slice(last));
  return html + "\n";
}

export class Editor extends EventTarget {
  constructor(root, { readOnly = false, gutter = true } = {}) {
    super();
    this.root = root;
    this.breakpoints = new Set();
    this.marks = new Map(); // line -> class
    root.classList.add("nx-editor");
    root.innerHTML = `
      <div class="ed-scroll">
        <div class="ed-inner">
          ${gutter ? '<div class="ed-gutter" aria-hidden="true"></div>' : ""}
          <div class="ed-stack">
            <div class="ed-marks" aria-hidden="true"></div>
            <pre class="ed-hl" aria-hidden="true"></pre>
            <textarea class="ed-input" spellcheck="false" autocapitalize="off"
              autocomplete="off" autocorrect="off" wrap="off" aria-label="Python 代码编辑器"></textarea>
          </div>
        </div>
      </div>
      <ul class="ed-complete" role="listbox" hidden></ul>`;
    this.scroll = root.querySelector(".ed-scroll");
    this.gutter = root.querySelector(".ed-gutter");
    this.marksEl = root.querySelector(".ed-marks");
    this.hl = root.querySelector(".ed-hl");
    this.ta = root.querySelector(".ed-input");
    this.popup = root.querySelector(".ed-complete");
    this.ta.readOnly = readOnly;
    this._completion = null;

    this.ta.addEventListener("input", () => { this._refresh(); this._emit("change"); this._suggest(); });
    this.ta.addEventListener("keydown", (e) => this._onKey(e));
    this.ta.addEventListener("keyup", () => this._emit("cursor"));
    this.ta.addEventListener("click", () => { this._emit("cursor"); this._hidePopup(); });
    this.ta.addEventListener("blur", () => setTimeout(() => this._hidePopup(), 150));
    if (this.gutter) {
      this.gutter.addEventListener("click", (e) => {
        const row = e.target.closest("[data-line]");
        if (!row) return;
        const ln = Number(row.dataset.line);
        if (this.breakpoints.has(ln)) this.breakpoints.delete(ln); else this.breakpoints.add(ln);
        this._renderGutter();
        this._emit("breakpoints");
      });
    }
    this.popup.addEventListener("mousedown", (e) => {
      const li = e.target.closest("li");
      if (li) { e.preventDefault(); this._accept(li.dataset.value); }
    });
    this._refresh();
  }

  _emit(type) { this.dispatchEvent(new Event(type)); }

  get value() { return this.ta.value; }
  set value(v) {
    this.ta.value = v;
    this.breakpoints.clear();
    this.marks.clear();
    this._refresh();
    this.scroll.scrollTop = 0;
  }

  get lineHeight() {
    return parseFloat(getComputedStyle(this.hl).lineHeight) || 20;
  }

  cursor() {
    const before = this.ta.value.slice(0, this.ta.selectionStart);
    const lines = before.split("\n");
    return { line: lines.length, col: lines[lines.length - 1].length + 1 };
  }

  _refresh() {
    this.hl.innerHTML = highlightPython(this.ta.value);
    const count = this.ta.value.split("\n").length;
    this._lineCount = count;
    // textarea 与高亮层同尺寸，由外层容器统一滚动，保证两者始终对齐
    const lh = this.lineHeight;
    const padding = 16;
    this.ta.style.height = `${count * lh + padding * 2}px`;
    this.ta.style.width = "100%";
    this.ta.style.width = `${Math.max(this.hl.scrollWidth, this.scroll.clientWidth - (this.gutter ? this.gutter.offsetWidth : 0))}px`;
    this._renderGutter();
    this._renderMarks();
  }

  _renderGutter() {
    if (!this.gutter) return;
    let html = "";
    for (let i = 1; i <= this._lineCount; i++) {
      const cls = [this.breakpoints.has(i) ? "bp" : "", this.marks.get(i) || ""].join(" ").trim();
      html += `<div data-line="${i}" class="${cls}" title="点击设置/取消断点">${i}</div>`;
    }
    this.gutter.innerHTML = html;
  }

  _renderMarks() {
    const lh = this.lineHeight;
    let html = "";
    for (const [ln, cls] of this.marks) {
      html += `<div class="ed-mark ${cls}" style="top:${16 + (ln - 1) * lh}px;height:${lh}px"></div>`;
    }
    this.marksEl.innerHTML = html;
  }

  /** 使用外部维护的断点集合（每个文件一份）。 */
  setBreakpoints(set) {
    this.breakpoints = set;
    this._renderGutter();
  }

  /** 设置一组行标记，例如 {5: "mark-active", 4: "mark-prev"}。 */
  setMarks(marks) {
    this.marks = new Map(Object.entries(marks || {}).map(([k, v]) => [Number(k), v]));
    this._renderGutter();
    this._renderMarks();
  }

  /** 把某一行滚动到可见区域。 */
  revealLine(ln) {
    const lh = this.lineHeight;
    const top = 16 + (ln - 1) * lh;
    const view = this.scroll;
    if (top < view.scrollTop + lh || top > view.scrollTop + view.clientHeight - 2 * lh) {
      view.scrollTo({ top: Math.max(0, top - view.clientHeight / 3), behavior: "smooth" });
    }
  }

  /** 光标定位到指定行（流程图节点点击时使用）。 */
  gotoLine(ln) {
    const lines = this.ta.value.split("\n");
    let pos = 0;
    for (let i = 0; i < ln - 1 && i < lines.length; i++) pos += lines[i].length + 1;
    const indent = (lines[ln - 1] || "").match(/^\s*/)[0].length;
    this.ta.focus({ preventScroll: true });
    this.ta.setSelectionRange(pos + indent, pos + (lines[ln - 1] || "").length);
    this.revealLine(ln);
    this.setMarks({ [ln]: "mark-goto" });
    this._emit("cursor");
  }

  /** 返回某一行在页面中的坐标（用于运行特效定位）。 */
  lineRect(ln) {
    const r = this.marksEl.getBoundingClientRect();
    const lh = this.lineHeight;
    const top = r.top + 16 + (ln - 1) * lh;
    return { left: r.left, top, width: Math.min(r.width, this.scroll.clientWidth), height: lh };
  }

  _insert(text, selectStart, selectEnd) {
    // execCommand 保留浏览器撤销栈；不支持时回退到 setRangeText
    this.ta.focus();
    const ok = document.execCommand && document.execCommand("insertText", false, text);
    if (!ok) {
      this.ta.setRangeText(text, this.ta.selectionStart, this.ta.selectionEnd, "end");
      this.ta.dispatchEvent(new Event("input"));
    }
    if (selectStart !== undefined) this.ta.setSelectionRange(selectStart, selectEnd);
  }

  _onKey(e) {
    if (this.ta.readOnly) return;
    if (this._completion && !this.popup.hidden) {
      const items = [...this.popup.children];
      const idx = items.findIndex((li) => li.classList.contains("sel"));
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const next = (idx + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items.forEach((li, i) => li.classList.toggle("sel", i === next));
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        this._accept(items[Math.max(0, idx)].dataset.value);
        return;
      }
      if (e.key === "Escape") { this._hidePopup(); return; }
    }
    const ta = this.ta;
    const { selectionStart: s, selectionEnd: end, value } = ta;
    if (e.key === "Tab") {
      e.preventDefault();
      const lineStart = value.lastIndexOf("\n", s - 1) + 1;
      if (s !== end && value.slice(s, end).includes("\n")) {
        const block = value.slice(lineStart, end);
        const changed = e.shiftKey ? block.replace(/^ {1,4}/gm, "") : block.replace(/^/gm, "    ");
        ta.setSelectionRange(lineStart, end);
        this._insert(changed, lineStart, lineStart + changed.length);
      } else if (e.shiftKey) {
        const line = value.slice(lineStart);
        const n = line.match(/^ {0,4}/)[0].length;
        if (n) { ta.setSelectionRange(lineStart, lineStart + n); this._insert("", s - n, s - n); }
      } else {
        this._insert("    ");
      }
    } else if (e.key === "Enter" && !e.isComposing) {
      e.preventDefault();
      const lineStart = value.lastIndexOf("\n", s - 1) + 1;
      const line = value.slice(lineStart, s);
      let indent = line.match(/^\s*/)[0];
      if (/:\s*(#.*)?$/.test(line)) indent += "    ";
      else if (/^\s*(return|pass|break|continue|raise)\b/.test(line)) indent = indent.slice(0, Math.max(0, indent.length - 4));
      this._insert("\n" + indent);
    } else if (e.key === "Backspace" && s === end) {
      const lineStart = value.lastIndexOf("\n", s - 1) + 1;
      const before = value.slice(lineStart, s);
      if (before.length >= 4 && /^ +$/.test(before) && before.length % 4 === 0) {
        e.preventDefault();
        ta.setSelectionRange(s - 4, s);
        this._insert("");
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key === "/") {
      e.preventDefault();
      const lineStart = value.lastIndexOf("\n", s - 1) + 1;
      let lineEnd = value.indexOf("\n", end);
      if (lineEnd === -1) lineEnd = value.length;
      const block = value.slice(lineStart, lineEnd);
      const allCommented = block.split("\n").every((l) => /^\s*#/.test(l) || !l.trim());
      const changed = allCommented ? block.replace(/^(\s*)# ?/gm, "$1") : block.replace(/^(\s*)(?=\S)/gm, "$1# ");
      ta.setSelectionRange(lineStart, lineEnd);
      this._insert(changed, lineStart, lineStart + changed.length);
    } else if ((e.ctrlKey || e.metaKey) && e.key === " ") {
      e.preventDefault();
      this._suggest(true);
    }
  }

  _wordBeforeCursor() {
    const s = this.ta.selectionStart;
    const m = this.ta.value.slice(0, s).match(/[A-Za-z_][\w]*$/);
    return m ? m[0] : "";
  }

  _suggest(force = false) {
    const word = this._wordBeforeCursor();
    if (!word || (word.length < 2 && !force)) { this._hidePopup(); return; }
    const idents = new Set(this.ta.value.match(/[A-Za-z_]\w{2,}/g) || []);
    idents.delete(word);
    const pool = new Set([...PY_KEYWORDS, ...PY_BUILTINS, ...idents]);
    const list = [...pool].filter((w) => w.startsWith(word) && w !== word).sort((a, b) => a.length - b.length || a.localeCompare(b)).slice(0, 8);
    if (!list.length) { this._hidePopup(); return; }
    this._completion = word;
    this.popup.innerHTML = list.map((w, i) => {
      const kind = KW.has(w) ? "关键字" : BI.has(w) ? "内置" : "变量";
      return `<li role="option" data-value="${w}" class="${i === 0 ? "sel" : ""}"><b>${w}</b><small>${kind}</small></li>`;
    }).join("");
    const { line, col } = this.cursor();
    const charW = this._charWidth();
    const stack = this.marksEl.getBoundingClientRect();
    const rootR = this.root.getBoundingClientRect();
    const lh = this.lineHeight;
    this.popup.style.left = `${Math.min(stack.left - rootR.left + 12 + (col - 1) * charW, rootR.width - 200)}px`;
    this.popup.style.top = `${stack.top - rootR.top + 16 + line * lh + 2}px`;
    this.popup.hidden = false;
  }

  _charWidth() {
    if (!this._cw) {
      const span = document.createElement("span");
      span.textContent = "M".repeat(20);
      this.hl.appendChild(span);
      this._cw = span.getBoundingClientRect().width / 20 || 8;
      span.remove();
    }
    return this._cw;
  }

  _accept(value) {
    const word = this._completion || "";
    this._hidePopup();
    this._insert(value.slice(word.length));
  }

  _hidePopup() {
    this.popup.hidden = true;
    this._completion = null;
  }
}
