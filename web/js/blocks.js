// 可视化积木编程（Blockly）：拖拽积木 → 实时生成 Python 代码 → 与 IDE 共用同一执行引擎运行、可视化与调试。
// 积木保存为项目中的 <模块名>.py（生成的代码）与 <模块名>.blocks.json（积木布局），可在 IDE 中 import。
import { $, esc, toast } from "./ui.js";
import { store } from "./storage.js";

const TOOLBOX = {
  kind: "categoryToolbox",
  contents: [
    { kind: "category", name: "逻辑", categorystyle: "logic_category", contents: [
      { kind: "block", type: "controls_if" }, { kind: "block", type: "logic_compare" },
      { kind: "block", type: "logic_operation" }, { kind: "block", type: "logic_negate" },
      { kind: "block", type: "logic_boolean" }, { kind: "block", type: "logic_ternary" }] },
    { kind: "category", name: "循环", categorystyle: "loop_category", contents: [
      { kind: "block", type: "controls_repeat_ext", inputs: { TIMES: { shadow: { type: "math_number", fields: { NUM: 5 } } } } },
      { kind: "block", type: "controls_whileUntil" },
      { kind: "block", type: "controls_for", inputs: {
        FROM: { shadow: { type: "math_number", fields: { NUM: 1 } } },
        TO: { shadow: { type: "math_number", fields: { NUM: 10 } } },
        BY: { shadow: { type: "math_number", fields: { NUM: 1 } } } } },
      { kind: "block", type: "controls_forEach" }, { kind: "block", type: "controls_flow_statements" }] },
    { kind: "category", name: "数学", categorystyle: "math_category", contents: [
      { kind: "block", type: "math_number" }, { kind: "block", type: "math_arithmetic" },
      { kind: "block", type: "math_modulo" }, { kind: "block", type: "math_single" },
      { kind: "block", type: "math_round" }, { kind: "block", type: "math_number_property" },
      { kind: "block", type: "math_random_int", inputs: {
        FROM: { shadow: { type: "math_number", fields: { NUM: 1 } } },
        TO: { shadow: { type: "math_number", fields: { NUM: 100 } } } } }] },
    { kind: "category", name: "文本与输入输出", categorystyle: "text_category", contents: [
      { kind: "block", type: "text_print" }, { kind: "block", type: "nx_print_multi" },
      { kind: "block", type: "nx_input" }, { kind: "block", type: "nx_int_input" },
      { kind: "block", type: "text" }, { kind: "block", type: "text_join" }, { kind: "block", type: "text_length" },
      { kind: "block", type: "nx_str" }] },
    { kind: "category", name: "列表", categorystyle: "list_category", contents: [
      { kind: "block", type: "lists_create_empty" }, { kind: "block", type: "lists_create_with" },
      { kind: "block", type: "lists_length" }, { kind: "block", type: "lists_getIndex" },
      { kind: "block", type: "lists_setIndex" }, { kind: "block", type: "nx_append" }] },
    { kind: "sep" },
    { kind: "category", name: "变量", categorystyle: "variable_category", custom: "VARIABLE" },
    { kind: "category", name: "函数模块", categorystyle: "procedure_category", custom: "PROCEDURE" },
  ],
};

const CUSTOM_BLOCKS = [
  { type: "nx_input", message0: "输入 提示 %1", args0: [{ type: "input_value", name: "PROMPT", check: "String" }],
    output: "String", style: "text_blocks", tooltip: "input()：读取一行文本" },
  { type: "nx_int_input", message0: "输入整数 提示 %1", args0: [{ type: "input_value", name: "PROMPT", check: "String" }],
    output: "Number", style: "math_blocks", tooltip: "int(input())：读取一个整数" },
  { type: "nx_print_multi", message0: "输出 %1 和 %2", args0: [{ type: "input_value", name: "A" }, { type: "input_value", name: "B" }],
    previousStatement: null, nextStatement: null, style: "text_blocks", tooltip: "print(a, b)" },
  { type: "nx_str", message0: "转为文本 %1", args0: [{ type: "input_value", name: "VALUE" }],
    output: "String", style: "text_blocks", tooltip: "str(x)" },
  { type: "nx_append", message0: "在列表 %1 末尾添加 %2", args0: [{ type: "input_value", name: "LIST", check: "Array" }, { type: "input_value", name: "ITEM" }],
    previousStatement: null, nextStatement: null, style: "list_blocks", tooltip: "list.append(x)" },
];

const EXAMPLE = {
  blocks: { languageVersion: 0, blocks: [{
    type: "variables_set", x: 30, y: 30, fields: { VAR: { id: "v_n" } },
    inputs: { VALUE: { block: { type: "nx_int_input", inputs: { PROMPT: { shadow: { type: "text", fields: { TEXT: "n: " } } } } } } },
    next: { block: {
      type: "controls_for", fields: { VAR: { id: "v_i" } },
      inputs: {
        FROM: { shadow: { type: "math_number", fields: { NUM: 1 } } },
        TO: { block: { type: "variables_get", fields: { VAR: { id: "v_n" } } } },
        BY: { shadow: { type: "math_number", fields: { NUM: 1 } } },
        DO: { block: {
          type: "controls_if", extraState: { hasElse: true },
          inputs: {
            IF0: { block: { type: "logic_compare", fields: { OP: "EQ" }, inputs: {
              A: { block: { type: "math_modulo", inputs: {
                DIVIDEND: { block: { type: "variables_get", fields: { VAR: { id: "v_i" } } } },
                DIVISOR: { shadow: { type: "math_number", fields: { NUM: 2 } } } } } },
              B: { block: { type: "math_number", fields: { NUM: 0 } } } } } },
            DO0: { block: { type: "nx_print_multi", inputs: {
              A: { block: { type: "variables_get", fields: { VAR: { id: "v_i" } } } },
              B: { block: { type: "text", fields: { TEXT: "偶数" } } } } } },
            ELSE: { block: { type: "nx_print_multi", inputs: {
              A: { block: { type: "variables_get", fields: { VAR: { id: "v_i" } } } },
              B: { block: { type: "text", fields: { TEXT: "奇数" } } } } } },
          } } },
      } } },
  }] },
  variables: [{ name: "n", id: "v_n" }, { name: "i", id: "v_i" }],
};

let B = null;  // { Blockly, pythonGenerator, Order }

async function loadBlockly() {
  if (!B) B = await import(new URL("../vendor/blockly/blockly.js", import.meta.url).href);
  return B;
}

function defineCustom({ Blockly, pythonGenerator, Order }) {
  Blockly.common.defineBlocksWithJsonArray(CUSTOM_BLOCKS);
  const val = (block, gen, name, fallback = "''") => gen.valueToCode(block, name, Order.NONE) || fallback;
  pythonGenerator.forBlock.nx_input = (b, g) => [`input(${val(b, g, "PROMPT")})`, Order.FUNCTION_CALL];
  pythonGenerator.forBlock.nx_int_input = (b, g) => [`int(input(${val(b, g, "PROMPT")}))`, Order.FUNCTION_CALL];
  pythonGenerator.forBlock.nx_print_multi = (b, g) => `print(${val(b, g, "A")}, ${val(b, g, "B")})\n`;
  pythonGenerator.forBlock.nx_str = (b, g) => [`str(${val(b, g, "VALUE")})`, Order.FUNCTION_CALL];
  pythonGenerator.forBlock.nx_append = (b, g) => `${val(b, g, "LIST", "[]")}.append(${val(b, g, "ITEM", "None")})\n`;
  // 计数循环生成初学者熟悉的 range() 写法（默认生成器在边界为变量时会引入 upRange/downRange 辅助函数）
  pythonGenerator.forBlock.controls_for = (b, g) => {
    const v = g.getVariableName(b.getFieldValue("VAR"));
    const from = g.valueToCode(b, "FROM", Order.NONE) || "0";
    const to = g.valueToCode(b, "TO", Order.ADDITIVE) || "0";
    const by = g.valueToCode(b, "BY", Order.NONE) || "1";
    const body = g.statementToCode(b, "DO") || g.PASS;
    const negative = /^-\s*\d/.test(by);
    const stop = negative ? `${to} - 1` : `${to} + 1`;
    const args = by === "1" ? `${from}, ${stop}` : `${from}, ${stop}, ${by}`;
    return `for ${v} in range(${args}):\n${body}`;
  };
}

function nexusTheme(Blockly) {
  const cs = getComputedStyle(document.documentElement);
  const v = (n) => cs.getPropertyValue(n).trim();
  const solid = (c, fallback) => (c && !c.startsWith("rgba") && !c.includes("gradient") ? c : fallback);
  const dark = document.documentElement.dataset.theme !== "standard" || matchMedia("(prefers-color-scheme: dark)").matches;
  return Blockly.Theme.defineTheme(`nexus-${document.documentElement.dataset.theme}-${dark ? "d" : "l"}`, {
    base: Blockly.Themes.Classic,
    componentStyles: {
      workspaceBackgroundColour: solid(v("--ed-bg"), dark ? "#0b1020" : "#ffffff"),
      toolboxBackgroundColour: solid(v("--panel"), dark ? "#111827" : "#f4f6fa"),
      toolboxForegroundColour: v("--text"),
      flyoutBackgroundColour: solid(v("--panel-2"), dark ? "#1b2333" : "#eef2f7"),
      flyoutForegroundColour: v("--text"),
      flyoutOpacity: 0.95,
      scrollbarColour: v("--muted"),
      insertionMarkerColour: v("--accent"),
      cursorColour: v("--accent"),
    },
    fontStyle: { family: v("--font-ui"), size: 12 },
  });
}

export function initBlocks(ctx) {
  let ws = null;
  let codeView = null;
  let loading = null;

  async function ensure() {
    if (ws) return ws;
    if (!loading) {
      loading = (async () => {
        let mod;
        try { mod = await loadBlockly(); } catch {
          $("#blocklyHost").innerHTML = '<p class="err pad">积木编辑器未打包：请运行 <code>npm run vendor</code>。</p>';
          throw new Error("Blockly 不可用");
        }
        defineCustom(mod);
        const { Blockly } = mod;
        $("#blocklyHost").innerHTML = "";
        ws = Blockly.inject($("#blocklyHost"), {
          toolbox: TOOLBOX, theme: nexusTheme(Blockly), trashcan: true, renderer: "thrasos",
          media: new URL("../vendor/blockly/media/", import.meta.url).href,
          grid: { spacing: 24, length: 2, colour: "rgba(128,128,128,0.25)", snap: true },
          zoom: { controls: true, wheel: true, startScale: 0.9, minScale: 0.4, maxScale: 2 },
          move: { scrollbars: true, drag: true, wheel: false },
        });
        codeView = await ctx.createEditor($("#blkCode"), { readOnly: true, gutter: true });
        const saved = store.get("blocks", null);
        try { Blockly.serialization.workspaces.load(saved || EXAMPLE, ws); } catch { Blockly.serialization.workspaces.load(EXAMPLE, ws); }
        ws.addChangeListener((e) => {
          if (e.isUiEvent) return;
          update();
          store.set("blocks", Blockly.serialization.workspaces.save(ws));
        });
        update();
        new ResizeObserver(() => Blockly.svgResize(ws)).observe($("#blocklyHost"));
        return ws;
      })();
    }
    return loading;
  }

  function code() { return B.pythonGenerator.workspaceToCode(ws); }
  function update() { if (codeView) codeView.value = code() || "# 从左侧拖入积木，这里会实时生成 Python 代码\n"; }
  function moduleName() {
    const n = $("#blkName").value.trim().replace(/\.py$/, "");
    return /^[A-Za-z_]\w*$/.test(n) ? n : null;
  }

  function refreshLoadList() {
    const files = Object.keys(ctx.state.project.files).filter((f) => f.endsWith(".blocks.json"));
    $("#blkLoad").innerHTML = '<option value="">加载积木…</option>' + files.map((f) => `<option value="${esc(f)}">${esc(f)}</option>`).join("");
  }

  $("#blkRun").onclick = async () => {
    await ensure();
    const out = $("#blkOut");
    out.textContent = "";
    const src = code();
    if (!src.trim()) { out.textContent = "工作区是空的"; return; }
    const onStream = (e) => { out.textContent += e.detail.text; };
    ctx.runtime.addEventListener("stream", onStream);
    ctx.blocksRunning = true;
    try {
      const r = await ctx.runtime.run({ code: src, stdin: $("#stdinInput").value, files: { ...ctx.state.project.files, "blocks_run.py": src }, filename: "blocks_run.py" });
      if (r.error) out.textContent += r.error;
      out.textContent += `\n进程结束 · Exit Code ${r.ok ? 0 : 1}\n`;
    } catch (err) { out.textContent += err.message; } finally {
      ctx.blocksRunning = false;
      ctx.runtime.removeEventListener("stream", onStream);
    }
  };
  $("#blkVisual").onclick = async () => {
    await ensure();
    const name = moduleName() || "blocks_main";
    ctx.openInIde(`${name}.py`, code());
    ctx.startTrace();
  };
  $("#blkSave").onclick = async () => {
    await ensure();
    const name = moduleName();
    if (!name) { toast("模块名只能包含字母、数字和下划线，且不能以数字开头"); return; }
    ctx.saveProject();
    ctx.state.project.files[`${name}.py`] = code();
    ctx.state.project.files[`${name}.blocks.json`] = JSON.stringify(B.Blockly.serialization.workspaces.save(ws));
    ctx.saveProject();
    ctx.renderFiles();
    refreshLoadList();
    toast(`已保存 ${name}.py 与 ${name}.blocks.json，可在 IDE 中 import ${name}`);
  };
  $("#blkLoad").onchange = async (e) => {
    const f = e.target.value;
    if (!f) return;
    await ensure();
    try {
      B.Blockly.serialization.workspaces.load(JSON.parse(ctx.state.project.files[f]), ws);
      $("#blkName").value = f.replace(/\.blocks\.json$/, "");
    } catch { toast("积木文件已损坏"); }
    e.target.value = "";
  };
  $("#blkExample").onclick = async () => { await ensure(); B.Blockly.serialization.workspaces.load(EXAMPLE, ws); };
  $("#blkClear").onclick = async () => { await ensure(); if (confirm("清空工作区？")) ws.clear(); };

  ctx.onViewChange.push((view) => {
    if (view === "blocks") { refreshLoadList(); ensure().then((w) => B.Blockly.svgResize(w)).catch(() => {}); }
  });
  ctx.onThemeChange.push(() => { if (ws) ws.setTheme(nexusTheme(B.Blockly)); });
  ctx.blocks = { ensure, code: () => (ws ? code() : "") };
}
