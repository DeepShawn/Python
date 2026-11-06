// CodeMirror 6 打包入口：由 scripts/vendor.mjs 用 esbuild 打包为 web/vendor/codemirror/codemirror.js
export { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, drawSelection,
  dropCursor, rectangularSelection, crosshairCursor, highlightSpecialChars, gutter, GutterMarker,
  Decoration, ViewPlugin } from "@codemirror/view";
export { EditorState, StateField, StateEffect, RangeSet, Compartment } from "@codemirror/state";
export { indentOnInput, bracketMatching, foldGutter, foldKeymap, syntaxHighlighting, HighlightStyle,
  indentUnit, syntaxTree } from "@codemirror/language";
export { defaultKeymap, history, historyKeymap, indentWithTab, toggleComment } from "@codemirror/commands";
export { autocompletion, completionKeymap, closeBrackets, closeBracketsKeymap,
  completeFromList } from "@codemirror/autocomplete";
export { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
export { python, pythonLanguage, localCompletionSource } from "@codemirror/lang-python";
export { tags } from "@lezer/highlight";
