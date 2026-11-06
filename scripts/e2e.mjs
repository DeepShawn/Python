// 端到端测试：启动本地静态服务器，用 Playwright 打开网页版并验证核心功能。
//   npm run vendor && npm run test:e2e
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "web");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".py": "text/plain; charset=utf-8", ".json": "application/json", ".wasm": "application/wasm",
  ".zip": "application/zip", ".whl": "application/zip", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };

const server = createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  let file = join(webRoot, p || "index.html");
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    // 跨源隔离头：启用 SharedArrayBuffer（交互式 input），与 Service Worker 注入的头一致
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream",
      "Cross-Origin-Opener-Policy": "same-origin", "Cross-Origin-Embedder-Policy": "require-corp" });
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end("not found"); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.setDefaultTimeout(15000);
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
// 断网：除本地服务器外的请求全部拒绝，验证完全离线
await page.route("**/*", (route) => (route.request().url().startsWith(base) ? route.continue() : route.abort()));

let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log("✓", name); } catch (e) { failed++; console.log("✗", name, "\n   ", e.message.split("\n")[0]); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const outText = () => page.textContent("#pane-out");
const waitOut = (s, timeout = 20000) => page.waitForFunction((t) => document.querySelector("#pane-out").textContent.includes(t), s, { timeout });

async function setStdin(text) {
  await page.click('[data-pane="stdin"]');
  await page.fill("#stdinInput", text);
}
async function setCode(code) {
  await page.evaluate((c) => window.nexus.editor.replaceAll(c), code);
}

await page.goto(base);
await check("Python 运行时离线加载（CodeMirror 6 + 交互输入）", async () => {
  await page.waitForSelector("#runtimeStatus.ready", { timeout: 60000 });
  assert((await page.textContent("#sbRuntime")).includes("离线"), "应使用本地 Pyodide");
  assert(await page.evaluate(() => window.nexus.editor.constructor.name === "CMEditor"), "应使用 CodeMirror 6");
  assert(await page.evaluate(() => window.nexus.runtime.interactive), "应支持交互式 input");
});

await check("直接运行多文件项目（import utils）", async () => {
  await page.click("#runBtn");
  await waitOut("Exit Code");
  const out = await outText();
  assert(out.includes("Hello, World!") && out.includes("5 5") && out.includes("Exit Code 0"), out);
});

await check("标准输入与错误行标记", async () => {
  await setStdin("21");
  await setCode("n = int(input('n: '))\nprint(n * 2)\nprint(1 / 0)\n");
  await page.click("#runBtn");
  await waitOut("Exit Code");
  const out = await outText();
  assert(out.includes("n: 21") && out.includes("42") && out.includes("ZeroDivisionError"), out);
  assert(await page.$(".cm-line.mark-error"), "应标记错误行");
});

await check("交互式 input()（标准输入用完后实时输入）", async () => {
  await setStdin("");
  await setCode("name = input('名字: ')\nage = int(input('年龄: '))\nprint(name, age + 1)\n");
  await page.click("#runBtn");
  await page.waitForSelector("#inputRow:not([hidden])");
  assert((await page.textContent("#inputPrompt")).includes("名字"), "应显示提示语");
  await page.fill("#inputField", "小明");
  await page.press("#inputField", "Enter");
  await page.waitForFunction(() => !document.querySelector("#inputRow").hidden && document.querySelector("#inputPrompt").textContent.includes("年龄"));
  await page.fill("#inputField", "17");
  await page.press("#inputField", "Enter");
  await waitOut("Exit Code");
  assert((await outText()).includes("小明 18"), await outText());
});

await check("离线爬虫：requests + BeautifulSoup（本地 wheel）", async () => {
  await setCode("import requests\nfrom bs4 import BeautifulSoup\nr = requests.get('http://nexus.local/news', params={'page': 2})\n" +
    "soup = BeautifulSoup(r.text, 'html.parser')\nprint(r.status_code, len(soup.select('.news-item')), soup.select_one('.next')['href'])\n" +
    "print(requests.get('http://nexus.local/api/products').json()['total'])\n");
  await page.click("#runBtn");
  await waitOut("Exit Code", 30000);
  const out = await outText();
  assert(out.includes("200 4 /news?page=3") && out.includes("12") && out.includes("Exit Code 0"), out);
});

await check("终止死循环", async () => {
  await setCode("i = 0\nwhile True:\n    i += 1\n");
  await page.click("#runBtn");
  await page.waitForTimeout(500);
  await page.click("#stopBtn");
  await page.waitForSelector("#runtimeStatus.ready", { timeout: 60000 });
  assert((await outText()).includes("已被终止"), "应提示已终止");
});

await check("可视化逐行运行（循环按真实顺序）", async () => {
  await setStdin("");
  await setCode("total = 0\nfor i in range(3):\n    total += i\nprint(total)\n");
  await page.selectOption("#speedSelect", "4");
  await page.click("#visualBtn");
  await page.waitForSelector("#playBtn:not([disabled])");
  await page.evaluate(() => { const t = window.nexus.state.trace; t.playing = false; clearTimeout(t.timer); });
  const lines = await page.evaluate(() => window.nexus.state.trace.events.filter((e) => e.e === "line").map((e) => e.ln));
  assert(JSON.stringify(lines) === JSON.stringify([1, 2, 3, 2, 3, 2, 3, 2, 4]), JSON.stringify(lines));
  await page.click("#stepBtn");
  await page.click("#stepBtn");
  assert(await page.$(".cm-line.mark-active"), "应高亮当前行");
  await page.click("#endBtn");
  const out = await outText();
  assert(out.includes("3") && out.includes("Exit Code 0"), out);
  assert((await page.textContent("#varsBody")).includes("total"), "变量面板");
});

await check("断点暂停", async () => {
  await page.evaluate(() => window.nexus.editor.breakpoints.add(4));
  await page.click("#visualBtn");
  await page.waitForFunction(() => { const t = window.nexus.state.trace; return t && !t.playing && t.idx > 0; }, null, { timeout: 15000 });
  const ln = await page.evaluate(() => window.nexus.state.trace.events[window.nexus.state.trace.idx].ln);
  assert(ln === 4, "应停在第 4 行，实际 " + ln);
  await page.evaluate(() => window.nexus.editor.breakpoints.clear());
});

await check("流程图生成、点击定位与类继承图", async () => {
  await setCode('n = int(input("n: "))\nif n % 2 == 0:\n    print("偶数")\nelse:\n    print("奇数")\nclass A:\n    pass\nclass B(A):\n    def f(self): pass\n');
  await page.click("#flowBtn");
  await page.waitForFunction(() => document.querySelector("#flowHost svg")?.textContent.includes("输入 n"));
  const text = await page.textContent("#flowHost svg");
  for (const s of ["开始", "输入 n", "n % 2 == 0 ?", "是", "否", '输出 "偶数"', '输出 "奇数"', "结束"]) assert(text.includes(s), "缺少 " + s);
  await page.click('#flowHost [data-line="3"]');
  assert((await page.textContent("#sbCursor")).startsWith("Ln 3"), await page.textContent("#sbCursor"));
  assert((await page.textContent("#classGraph")).includes("继承"), "类继承图");
});

await check("编译检查", async () => {
  await setCode("if True\n    pass\n");
  await page.click("#checkBtn");
  await page.waitForFunction(() => document.querySelector("#pane-check").textContent.includes("第 1 行"));
});

await check("单元测试", async () => {
  await page.click("#projectMenuBtn");
  page.once("dialog", (d) => d.accept());
  await page.click('#projectMenu [data-act="reset"]');
  await page.click("#testBtn");
  await waitOut("个测试");
  assert((await outText()).includes("全部通过（2 个测试）"), await outText());
});

await check("交互控制台", async () => {
  await page.click('[data-pane="repl"]');
  await page.fill("#replInput", "x = 6");
  await page.press("#replInput", "Enter");
  await page.fill("#replInput", "x * 7");
  await page.press("#replInput", "Enter");
  await page.waitForFunction(() => document.querySelector("#replLog").textContent.includes("42"));
});

await check("三种主题切换", async () => {
  for (const t of ["quantum", "matrix", "standard"]) {
    await page.selectOption("#themeSelect", t);
    assert((await page.getAttribute("html", "data-theme")) === t, t);
  }
});

await check("题库签名校验（篡改检测）", async () => {
  const r = await page.evaluate(async () => {
    const { verifySignature } = await import("./js/crypto.js");
    const { SIGNED_BANK } = await import("./data/exercises.js");
    return [await verifySignature(SIGNED_BANK.payload, SIGNED_BANK.signature),
      await verifySignature(SIGNED_BANK.payload.replace("argon2id", "argon2ix"), SIGNED_BANK.signature)];
  });
  assert(r[0] === true && r[1] === false, JSON.stringify(r));
});

await check("习题：Argon2id 选择题、随机参数题、结构题、编程题", async () => {
  await page.click('.tabs [data-view="practice"]');
  await page.click('[data-q="q-print-1"]');
  await page.click('.option:nth-child(1) input');
  await page.click("#submitQ");
  await page.waitForSelector("#qResult .err");
  await page.click('.option:nth-child(2) input');
  await page.click("#submitQ");
  await page.waitForSelector("#qResult .ok");
  // 随机参数题：根据当前参数计算正确答案
  await page.click('[data-q="rf-arith"]');
  await page.waitForSelector("[data-fill]");
  const ans = await page.evaluate(() => { const p = window.nexus.practiceCtrl.params; return String(p.a * p.b + p.c); });
  await page.fill("[data-fill]", ans);
  await page.click("#submitQ");
  await page.waitForSelector("#qResult .ok", { timeout: 15000 });
  // 结构题：用了 max() 应提示不允许
  await page.click('[data-q="p-max3"]');
  await page.waitForSelector("[data-editor] .cm-editor");
  await page.evaluate(() => { window.nexus.practiceCtrl.editor.value = "a = int(input())\nb = int(input())\nc = int(input())\nprint(max(a, b, c))\n"; });
  await page.click("#submitQ");
  await page.waitForFunction(() => document.querySelector("#qResult").textContent.includes("不允许调用 max()"), null, { timeout: 20000 });
  await page.click('[data-q="p-sum"]');
  await page.waitForSelector("[data-editor] .cm-editor");
  await page.evaluate(() => { window.nexus.practiceCtrl.editor.value = "a = int(input())\nb = int(input())\nprint(a + b)\n"; });
  await page.click("#submitQ");
  await page.waitForFunction(() => document.querySelector("#qResult").textContent.includes("全部通过"), null, { timeout: 20000 });
});

await check("考试：限时作答、交卷评分、成绩记录", async () => {
  await page.click('.tabs [data-view="exam"]');
  await page.click('[data-exam="exam-basic"]');
  await page.click("#startExam");
  await page.waitForSelector(".exam-timer");
  await page.click('#examQ .option:nth-child(2) input');   // 第 1 题 q-print-1 的正确答案
  await page.click('[data-go="1"]');
  await page.waitForSelector('#examQ .option');
  page.once("dialog", (d) => d.accept());
  await page.click("#examSubmit");
  await page.waitForSelector(".exam-score", { timeout: 60000 });
  const score = await page.textContent(".exam-score");
  assert(/10 分/.test(score), score);
  assert((await page.textContent("#examHistory")).includes("分"), "成绩记录");
});

await check("积木编程：生成 Python 并运行", async () => {
  await page.click('.tabs [data-view="ide"]');
  await setStdin("4");
  await page.click('.tabs [data-view="blocks"]');
  await page.waitForSelector("#blocklyHost .blocklySvg", { timeout: 20000 });
  await page.waitForFunction(() => window.nexus.blocks.code().includes("int(input("));
  const code = await page.evaluate(() => window.nexus.blocks.code());
  assert(code.includes("for i in range(1, n + 1)") && code.includes("% 2 == 0"), code);
  await page.click("#blkRun");
  await page.waitForFunction(() => document.querySelector("#blkOut").textContent.includes("Exit Code"), null, { timeout: 20000 });
  const out = await page.textContent("#blkOut");
  assert(out.includes("1 奇数") && out.includes("4 偶数"), out);
  await page.click("#blkSave");
  assert(await page.evaluate(() => "blocks_main.blocks.json" in window.nexus.state.project.files), "应保存积木文件");
});

await check("学习：打开课程并可视化运行", async () => {
  await page.click('.tabs [data-view="learn"]');
  await page.evaluate(() => document.querySelectorAll("#courseTree details").forEach((d) => (d.open = true)));
  await page.click('[data-lesson="l-recursion"]');
  await page.click('#lesson [data-act="visual"]');
  await page.waitForSelector("#playBtn:not([disabled])");
  const maxDepth = await page.evaluate(() => Math.max(...window.nexus.state.trace.events.map((e) => e.depth)));
  assert(maxDepth >= 4, "递归深度 " + maxDepth);
});

await check("移动端：窄屏布局与符号栏", async () => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('.tabs [data-view="ide"]');
  assert(await page.isVisible("#symbar"), "窄屏应显示符号栏");
  await page.evaluate(() => window.nexus.editor.replaceAll(""));
  await page.click('#symbar [data-ins="()"]');
  assert((await page.evaluate(() => window.nexus.editor.value)) === "()", "符号栏插入");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  assert(!overflow, "不应出现横向滚动");
  await page.setViewportSize({ width: 1440, height: 900 });
});

// ------------------------------------------------------------------ 原生运行时（模拟 Tauri 外壳 + 真实 CPython 宿主）
await check("原生运行时：Tauri 桥接 + 嵌入式 CPython 宿主", async () => {
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p2 = await ctx2.newPage();
  const errs = [];
  p2.on("pageerror", (e) => errs.push(e.message));
  let proc = null;
  const startHost = () => {
    proc = spawn("python3", ["-u", join(webRoot, "py", "nexus_host.py")], { stdio: ["pipe", "pipe", "inherit"] });
    const current = proc;
    createInterface({ input: proc.stdout }).on("line", (line) => {
      p2.evaluate((l) => window.__tauriEmit("py-line", l), line).catch(() => {});
    });
    proc.on("exit", () => { if (current === proc) p2.evaluate(() => window.__tauriEmit("py-exit", null)).catch(() => {}); });
  };
  await p2.exposeFunction("__nexusInvoke", async (cmd, args) => {
    if (cmd === "runtime_info") return { native: true, platform: "test", python: "python3" };
    if (cmd === "py_start") { if (!proc || proc.exitCode !== null) startHost(); return null; }
    if (cmd === "py_send") { proc.stdin.write(args.line + "\n"); return null; }
    if (cmd === "py_kill") { const old = proc; proc = null; old?.kill(); return null; }
    throw new Error("unsupported " + cmd);
  });
  await p2.addInitScript(() => {
    const listeners = {};
    window.__tauriEmit = (name, payload) => (listeners[name] || []).forEach((f) => f({ payload }));
    window.__TAURI__ = {
      core: { invoke: (cmd, args) => window.__nexusInvoke(cmd, args || {}) },
      event: { listen: async (name, f) => { (listeners[name] ||= []).push(f); return () => {}; } },
    };
  });
  await p2.route("**/*", (route) => (route.request().url().startsWith(base) ? route.continue() : route.abort()));
  await p2.goto(base);
  await p2.waitForSelector("#runtimeStatus.ready", { timeout: 30000 });
  assert((await p2.textContent("#sbRuntime")).includes("Native CPython"), await p2.textContent("#sbRuntime"));
  assert(await p2.evaluate(() => document.documentElement.classList.contains("native")), "应显示原生菜单");
  await p2.evaluate(() => window.nexus.editor.replaceAll("import requests, sys\nn = int(input('n: '))\nprint(sys.implementation.name, n * 2, requests.get('http://nexus.local/api/products').json()['total'])\n"));
  await p2.click('[data-pane="stdin"]');
  await p2.fill("#stdinInput", "");
  await p2.click("#runBtn");
  await p2.waitForSelector("#inputRow:not([hidden])", { timeout: 20000 });
  await p2.fill("#inputField", "21");
  await p2.press("#inputField", "Enter");
  await p2.waitForFunction(() => document.querySelector("#pane-out").textContent.includes("Exit Code"), null, { timeout: 20000 });
  const out = await p2.textContent("#pane-out");
  assert(out.includes("cpython 42 12"), out);
  // 可视化执行与终止重启
  await p2.evaluate(() => window.nexus.editor.replaceAll("x = 1\nfor i in range(2):\n    x += i\n"));
  await p2.click("#visualBtn");
  await p2.waitForSelector("#playBtn:not([disabled])", { timeout: 20000 });
  const lines = await p2.evaluate(() => window.nexus.state.trace.events.filter((e) => e.e === "line").map((e) => e.ln));
  assert(JSON.stringify(lines) === "[1,2,3,2,3,2]", JSON.stringify(lines));
  await p2.click("#stopBtn");
  await p2.evaluate(() => window.nexus.editor.replaceAll("while True:\n    pass\n"));
  await p2.click("#runBtn");
  await p2.waitForTimeout(500);
  await p2.click("#stopBtn");
  await p2.waitForSelector("#runtimeStatus.ready", { timeout: 20000 });
  await p2.evaluate(() => window.nexus.editor.replaceAll("print('restarted')\n"));
  await p2.click("#runBtn");
  await p2.waitForFunction(() => document.querySelector("#pane-out").textContent.includes("restarted"), null, { timeout: 20000 });
  assert(!errs.length, errs.join("\n"));
  proc?.kill();
  await ctx2.close();
});

if (process.env.SHOTS) {
  for (const [view, t] of [["ide", "standard"], ["ide", "quantum"], ["ide", "matrix"], ["blocks", "standard"], ["exam", "quantum"], ["practice", "standard"]]) {
    await page.click(`.tabs [data-view="${view}"]`);
    await page.selectOption("#themeSelect", t);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${process.env.SHOTS}/${view}-${t}.png` });
  }
}

await check("无页面错误", async () => assert(!errors.length, errors.join("\n")));
await browser.close();
server.close();
console.log(failed ? `\n${failed} 项失败` : "\n全部通过");
process.exit(failed ? 1 : 0);
