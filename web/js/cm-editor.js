// CodeMirror 6 编辑器：与 editor.js 中的简易编辑器提供相同接口，
// 额外提供撤销历史、括号匹配、代码折叠、搜索、多光标与更好的移动端输入体验。
import { PY_BUILTINS, PY_KEYWORDS } from "./editor.js";

export async function loadCodeMirror() {
  return import(new URL("../vendor/codemirror/codemirror.js", import.meta.url).href);
}

export class CMEditor extends EventTarget {
  constructor(root, cm, { readOnly = false, gutter = true } = {}) {
    super();
    this.cm = cm;
    this.root = root;
    this.breakpoints = new Set();
    root.classList.add("nx-editor", "nx-cm");
    root.innerHTML = "";

    const {
      EditorView, EditorState, StateField, StateEffect, Decoration, keymap, lineNumbers, highlightActiveLine,
      highlightActiveLineGutter, drawSelection, highlightSpecialChars, gutter: makeGutter, GutterMarker,
      indentOnInput, bracketMatching, foldGutter, foldKeymap, syntaxHighlighting, HighlightStyle, indentUnit,
      defaultKeymap, history, historyKeymap, indentWithTab, toggleComment, autocompletion, completionKeymap,
      closeBrackets, closeBracketsKeymap, completeFromList, searchKeymap, highlightSelectionMatches,
      python, pythonLanguage, tags,
    } = cm;

    // 行标记（执行高亮、错误行等）
    const setMarks = StateEffect.define();
    this._setMarks = setMarks;
    const marksField = StateField.define({
      create: () => Decoration.none,
      update(deco, tr) {
        deco = deco.map(tr.changes);
        for (const e of tr.effects) if (e.is(setMarks)) deco = e.value;
        return deco;
      },
      provide: (f) => EditorView.decorations.from(f),
    });
    this._marksField = marksField;

    // 断点栏
    const bpEffect = StateEffect.define();
    this._bpEffect = bpEffect;
    class BpMarker extends GutterMarker { toDOM() { const d = document.createElement("span"); d.className = "cm-bp-dot"; return d; } }
    const bpMarker = new BpMarker();
    const toggleBp = (view, line) => {
      const ln = view.state.doc.lineAt(line.from).number;
      if (this.breakpoints.has(ln)) this.breakpoints.delete(ln); else this.breakpoints.add(ln);
      view.dispatch({ effects: bpEffect.of(null) });
      this._emit("breakpoints");
      return true;
    };
    const bpGutter = makeGutter({
      class: "cm-bp-gutter",
      lineMarker: (view, line) => (this.breakpoints.has(view.state.doc.lineAt(line.from).number) ? bpMarker : null),
      lineMarkerChange: (update) => update.transactions.some((tr) => tr.effects.some((e) => e.is(bpEffect))),
      initialSpacer: () => bpMarker,
      domEventHandlers: { mousedown: (view, line) => toggleBp(view, line) },
    });

    const highlight = HighlightStyle.define([
      { tag: [tags.keyword, tags.controlKeyword, tags.operatorKeyword, tags.definitionKeyword, tags.moduleKeyword, tags.bool, tags.null, tags.self], color: "var(--t-kw)", fontWeight: "600" },
      { tag: [tags.string, tags.special(tags.string)], color: "var(--t-str)" },
      { tag: tags.comment, color: "var(--t-com)", fontStyle: "italic" },
      { tag: [tags.number, tags.integer, tags.float], color: "var(--t-num)" },
      { tag: [tags.function(tags.definition(tags.variableName))], color: "var(--t-fn)" },
      { tag: [tags.definition(tags.className), tags.className], color: "var(--t-cls)" },
      { tag: [tags.standard(tags.variableName), tags.function(tags.variableName)], color: "var(--t-bi)" },
      { tag: tags.meta, color: "var(--t-deco)" },
    ]);

    const words = [...PY_KEYWORDS.map((label) => ({ label, type: "keyword" })),
      ...PY_BUILTINS.map((label) => ({ label, type: "function" }))];

    const theme = EditorView.theme({
      "&": { height: "100%", backgroundColor: "var(--ed-bg)", color: "var(--text)", fontSize: "var(--code-size)" },
      ".cm-scroller": { fontFamily: "var(--font-code)", lineHeight: "var(--code-lh)" },
      ".cm-content": { caretColor: "var(--ed-caret)", padding: "16px 0" },
      ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--ed-caret)", borderLeftWidth: "2px" },
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "var(--ed-sel) !important" },
      ".cm-gutters": { backgroundColor: "var(--ed-gutter)", color: "var(--ed-gutter-text)", borderRight: "1px solid var(--border)" },
      ".cm-activeLine": { backgroundColor: "transparent" },
      ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--accent)" },
      ".cm-tooltip": { backgroundColor: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)" },
      ".cm-tooltip-autocomplete > ul > li[aria-selected]": { backgroundColor: "var(--accent)", color: "var(--accent-text)" },
      ".cm-matchingBracket": { backgroundColor: "var(--ed-sel)", outline: "1px solid var(--accent)" },
    });

    const extensions = [
      gutter ? bpGutter : [],
      gutter ? lineNumbers({ domEventHandlers: { mousedown: (view, line) => toggleBp(view, line) } }) : [],
      gutter ? foldGutter() : [],
      highlightSpecialChars(), history(), drawSelection(), indentOnInput(), bracketMatching(), closeBrackets(),
      highlightActiveLine(), highlightActiveLineGutter(), highlightSelectionMatches(),
      indentUnit.of("    "), EditorState.tabSize.of(4),
      python(), pythonLanguage.data.of({ autocomplete: completeFromList(words) }),
      autocompletion({ activateOnTyping: true }),
      syntaxHighlighting(highlight), theme, marksField,
      keymap.of([
        { key: "Mod-/", run: toggleComment },
        ...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap, ...foldKeymap,
        ...completionKeymap, indentWithTab,
      ]),
      EditorView.updateListener.of((u) => {
        if (u.docChanged && !this._silent) this._emit("change");
        if (u.selectionSet || u.docChanged) this._emit("cursor");
      }),
    ];
    if (readOnly) extensions.push(EditorState.readOnly.of(true), EditorView.editable.of(false));
    this._extensions = extensions;
    this.view = new EditorView({ state: EditorState.create({ doc: "", extensions }), parent: root });
  }

  _emit(type) { this.dispatchEvent(new Event(type)); }

  get value() { return this.view.state.doc.toString(); }
  set value(v) {
    this._silent = true;
    this.view.setState(this.cm.EditorState.create({ doc: v, extensions: this._extensions }));
    this._silent = false;
    this.breakpoints = new Set();
  }

  /** 以「用户输入」的方式替换全部内容（会触发 change 事件，可撤销）。 */
  replaceAll(text) {
    this.view.dispatch({ changes: { from: 0, to: this.view.state.doc.length, insert: text } });
  }

  get lineHeight() { return this.view.defaultLineHeight; }

  cursor() {
    const pos = this.view.state.selection.main.head;
    const line = this.view.state.doc.lineAt(pos);
    return { line: line.number, col: pos - line.from + 1 };
  }

  setBreakpoints(set) {
    this.breakpoints = set;
    this.view.dispatch({ effects: this._bpEffect.of(null) });
  }

  setMarks(marks) {
    const { Decoration } = this.cm;
    const doc = this.view.state.doc;
    const ranges = Object.entries(marks || {})
      .map(([ln, cls]) => [Number(ln), cls])
      .filter(([ln]) => ln >= 1 && ln <= doc.lines)
      .sort((a, b) => a[0] - b[0])
      .map(([ln, cls]) => Decoration.line({ class: `cm-mark ${cls}` }).range(doc.line(ln).from));
    this.view.dispatch({ effects: this._setMarks.of(Decoration.set(ranges, true)) });
  }

  revealLine(ln) {
    const doc = this.view.state.doc;
    if (ln < 1 || ln > doc.lines) return;
    const pos = doc.line(ln).from;
    const block = this.view.lineBlockAt(pos);
    const sc = this.view.scrollDOM;
    if (block.top < sc.scrollTop + 20 || block.bottom > sc.scrollTop + sc.clientHeight - 20) {
      this.view.dispatch({ effects: this.cm.EditorView.scrollIntoView(pos, { y: "center" }) });
    }
  }

  gotoLine(ln) {
    const doc = this.view.state.doc;
    if (ln < 1 || ln > doc.lines) return;
    const line = doc.line(ln);
    const indent = line.text.match(/^\s*/)[0].length;
    this.view.dispatch({ selection: { anchor: line.from + indent, head: line.to }, scrollIntoView: true });
    this.view.focus();
    this.setMarks({ [ln]: "mark-goto" });
  }

  lineRect(ln) {
    const doc = this.view.state.doc;
    if (ln < 1 || ln > doc.lines) return null;
    const block = this.view.lineBlockAt(doc.line(ln).from);
    const content = this.view.contentDOM.getBoundingClientRect();
    const top = this.view.documentTop + block.top;
    return { left: content.left, top, width: Math.min(content.width, this.view.scrollDOM.clientWidth), height: block.height };
  }

  focus() { this.view.focus(); }

  /** 在光标处插入文本；back 为插入后光标回退的字符数（用于成对括号）。 */
  insertText(text, back = 0) {
    const { from, to } = this.view.state.selection.main;
    const anchor = from + text.length - back;
    this.view.dispatch({ changes: { from, to, insert: text }, selection: { anchor }, scrollIntoView: true });
    this.view.focus();
  }
}
