// IDLE 式 Shell：程序输出、程序的 input() 与 >>> 交互解释器都在同一个控制台中。
//  - 运行程序：打印 RESTART 分隔线，输出流式显示；
//  - 程序调用 input()：在输出末尾原位出现输入光标，回车提交（Ctrl+D 结束输入）；
//  - 程序结束：出现 >>> 提示符，可以继续使用程序中定义的变量（与 IDLE 相同）。
import { inStringOrComment } from "./editor.js";

export class Shell {
  constructor(el, { runtime = null, repl = true } = {}) {
    this.el = el;
    this.runtime = runtime;
    this.repl = repl;
    this.history = [];
    this.histIdx = 0;
    this.running = false;
    this.more = false;
    this._pendingInput = null;
    el.classList.add("shell");
    el.innerHTML = "";
    this.log = document.createElement("span");
    this.log.className = "shell-log";
    this.line = document.createElement("span");
    this.line.className = "shell-line";
    this.promptEl = document.createElement("span");
    this.promptEl.className = "shell-prompt";
    this.edit = document.createElement("span");
    this.edit.className = "shell-edit";
    this.edit.contentEditable = "true";
    this.edit.spellcheck = false;
    this.edit.setAttribute("role", "textbox");
    this.edit.setAttribute("aria-label", "Shell 输入");
    this.edit.setAttribute("autocapitalize", "off");
    this.edit.setAttribute("autocorrect", "off");
    this.line.append(this.promptEl, this.edit);
    el.append(this.log, this.line);

    el.addEventListener("mouseup", () => {
      if (!this.line.hidden && !window.getSelection().toString()) this.focus();
    });
    this.edit.addEventListener("keydown", (e) => this._onKey(e));
    this.edit.addEventListener("paste", (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData("text");
      document.execCommand("insertText", false, text.replace(/\r/g, ""));
    });
    this._showIdle();
  }

  get text() { return this.log.textContent; }

  /** 追加输出；cls：err / sys / ok / in */
  write(text, cls = "") {
    if (!text) return;
    const last = this.log.lastChild;
    if (last && (last.className || "") === cls && last.nodeType === 1) last.textContent += text;
    else {
      const span = document.createElement("span");
      if (cls) span.className = cls;
      span.textContent = text;
      this.log.appendChild(span);
    }
    this._scroll();
  }

  /** 确保后续输出从新的一行开始 */
  newline() {
    const t = this.log.textContent;
    if (t && !t.endsWith("\n")) this.write("\n");
  }

  clear() {
    this.log.textContent = "";
    this._scroll();
  }

  /** 用一段完整的文本替换输出（可视化执行回放时使用） */
  setText(text) {
    this.log.textContent = text;
    this._scroll();
  }

  restart(title) {
    this.newline();
    this.write(`==================== RESTART: ${title} ====================\n`, "sys");
  }

  /** 程序运行中：隐藏 >>> 提示符（程序调用 input() 时会临时出现输入位置） */
  setRunning(on) {
    this.running = on;
    if (!on) {
      if (this._pendingInput) { this._pendingInput(null); this._pendingInput = null; }
      this.more = false;
      this.newline();
      this._showIdle();
    } else {
      this.line.hidden = true;
    }
  }

  /** 程序的 input()：在输出末尾原位输入，返回输入内容（EOF 时为 null） */
  requestInput(prompt) {
    if (this._pendingInput) this._pendingInput(null);
    this.line.hidden = false;
    this.line.classList.add("program");
    this.promptEl.textContent = prompt || "";
    this.edit.textContent = "";
    this.focus();
    this._scroll();
    return new Promise((resolve) => { this._pendingInput = resolve; });
  }

  focus() {
    this.edit.focus();
    const r = document.createRange();
    r.selectNodeContents(this.edit);
    r.collapse(false);
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }

  _showIdle() {
    this.line.classList.remove("program");
    if (!this.repl || this.running) { this.line.hidden = true; return; }
    this.line.hidden = false;
    this.promptEl.textContent = this.more ? "... " : ">>> ";
    this.edit.textContent = "";
    this._scroll();
  }

  _scroll() { this.el.scrollTop = this.el.scrollHeight; }

  async _onKey(e) {
    const value = () => this.edit.textContent.replace(/ /g, " ");
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      const v = value();
      // 把提示语和输入固定到输出中（输入用不同颜色显示，与 IDLE 一致）
      this.write(this.promptEl.textContent, this._pendingInput ? "" : "sys");
      this.write(v + "\n", "in");
      this.edit.textContent = "";
      if (this._pendingInput) {
        const resolve = this._pendingInput;
        this._pendingInput = null;
        this.line.hidden = true;
        resolve(v);
        return;
      }
      if (v.trim()) { this.history.push(v); }
      this.histIdx = this.history.length;
      await this._replPush(v);
      return;
    }
    if (e.key === "d" && e.ctrlKey && this._pendingInput) {
      e.preventDefault();
      this.write(this.promptEl.textContent + "^D\n", "sys");
      const resolve = this._pendingInput;
      this._pendingInput = null;
      this.line.hidden = true;
      resolve(null);
      return;
    }
    if (e.key === "l" && e.ctrlKey) { e.preventDefault(); this.clear(); return; }
    if (this._pendingInput) return;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      this.histIdx = Math.max(0, Math.min(this.history.length, this.histIdx + (e.key === "ArrowUp" ? -1 : 1)));
      this.edit.textContent = this.history[this.histIdx] ?? "";
      this.focus();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const v = value();
      const m = v.match(/[A-Za-z_]\w*$/);
      if (!m || inStringOrComment(v)) { document.execCommand("insertText", false, "    "); return; }
      const list = await this.runtime.complete(m[0]);
      if (list.length === 1) { this.edit.textContent = v + list[0].slice(m[0].length); this.focus(); }
      else if (list.length > 1) {
        this.write(this.promptEl.textContent + v + "\n", "sys");
        this.write(list.join("  ") + "\n", "sys");
        this.edit.textContent = v;
        this.focus();
      }
    }
  }

  async _replPush(line) {
    if (!this.runtime) return;
    if (line.trim() === "%reset" || line.trim() === "%clear") {
      if (line.trim() === "%clear") this.clear();
      else { await this.runtime.replReset(); this.write("命名空间已重置\n", "sys"); }
      this.more = false;
      this._showIdle();
      return;
    }
    this.line.hidden = true;
    try {
      const r = await this.runtime.replPush(line);
      if (r.output) this.write(r.output, r.error ? "err" : "");
      this.more = r.more;
    } catch (err) {
      this.write(err.message + "\n", "err");
      this.more = false;
    }
    this._showIdle();
    this.focus();
  }
}
