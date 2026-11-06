// 端到端测试：启动本地静态服务器，用 Playwright 打开网页版并验证核心功能。
//   npm run vendor && npm run test:e2e
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "web");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".py": "text/plain; charset=utf-8", ".json": "application/json", ".wasm": "application/wasm",
  ".zip": "application/zip", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };

const server = createServer(async (req, res) => {
  let p = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^([/\\])+/, "");
  let file = join(webRoot, p || "index.html");
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream" });
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
  try { await fn(); console.log("✓", name); } catch (e) { failed++; console.log("✗", name, "\n   ", e.message); }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

await page.goto(base);
await check("Python 运行时离线加载", async () => {
  await page.waitForSelector("#runtimeStatus.ready", { timeout: 60000 });
  assert((await page.textContent("#sbRuntime")).includes("离线"), "应使用本地 Pyodide");
});

async function setStdin(text) {
  await page.click('[data-pane="stdin"]');
  await page.fill("#stdinInput", text);
}
async function setCode(code) {
  await page.evaluate((c) => { const ed = window.nexus.editor; ed.ta.value = c; ed.ta.dispatchEvent(new Event("input")); }, code);
}

await check("直接运行多文件项目（import utils）", async () => {
  await page.click("#runBtn");
  await page.waitForFunction(() => document.querySelector("#pane-out").textContent.includes("Exit Code"));
  const out = await page.textContent("#pane-out");
  assert(out.includes("Hello, World!") && out.includes("5 5") && out.includes("Exit Code 0"), out);
});

await check("标准输入与错误行标记", async () => {
  await setStdin("21");
  await setCode("n = int(input('n: '))\nprint(n * 2)\nprint(1 / 0)\n");
  await page.click("#runBtn");
  await page.waitForFunction(() => document.querySelector("#pane-out").textContent.includes("Exit Code"));
  const out = await page.textContent("#pane-out");
  assert(out.includes("n: 21") && out.includes("42") && out.includes("ZeroDivisionError"), out);
  assert(await page.$(".ed-mark.mark-error"), "应标记错误行");
});

await check("终止死循环", async () => {
  await setCode("i = 0\nwhile True:\n    i += 1\n");
  await page.click("#runBtn");
  await page.waitForTimeout(500);
  await page.click("#stopBtn");
  await page.waitForSelector("#runtimeStatus.ready", { timeout: 60000 });
  assert((await page.textContent("#pane-out")).includes("已被终止"), "应提示已终止");
});

await check("可视化逐行运行（循环按真实顺序）", async () => {
  await setStdin("");
  await setCode("total = 0\nfor i in range(3):\n    total += i\nprint(total)\n");
  await page.selectOption("#speedSelect", "4");
  await page.click("#visualBtn");
  await page.waitForSelector("#playBtn:not([disabled])");
  await page.click("#playBtn"); // 暂停
  await page.evaluate(() => { const t = window.nexus.state.trace; t.playing = false; });
  const lines = await page.evaluate(() => window.nexus.state.trace.events.filter((e) => e.e === "line").map((e) => e.ln));
  assert(JSON.stringify(lines) === JSON.stringify([1, 2, 3, 2, 3, 2, 3, 2, 4]), JSON.stringify(lines));
  await page.click("#stepBtn");
  await page.click("#stepBtn");
  assert(await page.$(".ed-mark.mark-active"), "应高亮当前行");
  assert((await page.textContent("#stepCounter")).startsWith("STEP"), "应显示步数");
  await page.click("#endBtn");
  const out = await page.textContent("#pane-out");
  assert(out.includes("3") && out.includes("Exit Code 0"), out);
  const vars = await page.textContent("#varsBody");
  assert(vars.includes("total") && vars.includes("3"), vars);
});

await check("断点暂停", async () => {
  await page.evaluate(() => window.nexus.editor.breakpoints.add(4));
  await page.selectOption("#speedSelect", "4");
  await page.click("#visualBtn");
  await page.waitForFunction(() => { const t = window.nexus.state.trace; return t && !t.playing && t.idx > 0; }, null, { timeout: 15000 });
  const ln = await page.evaluate(() => window.nexus.state.trace.events[window.nexus.state.trace.idx].ln);
  assert(ln === 4, "应停在第 4 行，实际 " + ln);
  await page.evaluate(() => window.nexus.editor.breakpoints.clear());
});

await check("流程图生成与点击定位", async () => {
  await setCode('n = int(input("n: "))\nif n % 2 == 0:\n    print("偶数")\nelse:\n    print("奇数")\n');
  await page.click("#flowBtn");
  await page.waitForSelector("#flowHost svg .fc-cond");
  const text = await page.textContent("#flowHost svg");
  for (const s of ["开始", "输入 n", "n % 2 == 0 ?", "是", "否", '输出 "偶数"', '输出 "奇数"', "结束"]) assert(text.includes(s), "缺少 " + s);
  await page.click('#flowHost [data-line="3"]');
  const cur = await page.textContent("#sbCursor");
  assert(cur.startsWith("Ln 3"), cur);
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
  await page.waitForFunction(() => /全部通过|失败/.test(document.querySelector("#pane-out").textContent), null, { timeout: 20000 });
  assert((await page.textContent("#pane-out")).includes("全部通过（2 个测试）"), await page.textContent("#pane-out"));
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

await check("习题：哈希校验选择题 + 编程题判题", async () => {
  await page.click('.tabs [data-view="practice"]');
  await page.click('[data-q="q-print-1"]');
  await page.click('.option:nth-child(1) input');
  await page.click("#submitQ");
  await page.waitForSelector("#qResult .err");
  await page.click('.option:nth-child(2) input');
  await page.click("#submitQ");
  await page.waitForSelector("#qResult .ok");
  await page.click('[data-q="p-sum"]');
  await page.evaluate(() => { const ta = document.querySelector("#qEditor textarea"); ta.value = "a = int(input())\nb = int(input())\nprint(a + b)\n"; ta.dispatchEvent(new Event("input")); });
  await page.click("#submitQ");
  await page.waitForFunction(() => document.querySelector("#qResult").textContent.includes("全部通过"), null, { timeout: 20000 });
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

if (process.env.SHOTS) {
  for (const t of ["standard", "quantum", "matrix"]) {
    await page.selectOption("#themeSelect", t);
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${process.env.SHOTS}/ide-${t}.png` });
  }
}

await check("无页面错误", async () => assert(!errors.length, errors.join("\n")));
await browser.close();
server.close();
console.log(failed ? `\n${failed} 项失败` : "\n全部通过");
process.exit(failed ? 1 : 0);
