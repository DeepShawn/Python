# Python Nexus

**全平台离线 Python 学习与开发系统**（网页版 · Windows · Android）：集 Python 学习、编程、代码运行、交互调试、习题训练、考试、流程图生成与可视化积木编程于一体的轻量化 IDE。

完整设计方案见 [docs/DESIGN.md](docs/DESIGN.md)。

## 功能

| 模块 | 内容 |
| --- | --- |
| IDE | CodeMirror 6 编辑器（补全、折叠、搜索、断点）、多文件项目、直接运行、终止死循环、编译检查（字节码）、unittest；**IDLE 式 Shell**：输出、`input()` 与 `>>>` 在同一处，程序结束后可继续使用其中的变量；字符串和注释中不弹出补全 |
| 可视化执行 | `sys.settrace` 真实执行顺序回放：当前行高亮、变量变化、调用栈、输出逐步出现、单步 / 回退 / 断点 / 0.25×–4× 速度 |
| 流程图 | Python `ast` → SVG 流程图，点击定位代码，执行时同步高亮，导出 SVG / PNG / Mermaid；函数调用图、模块导入图、类继承图 |
| 三种风格 | 普通 Professional · 科幻 Quantum（粒子、全息）· 黑客 Matrix（字符流、扫描线），合成音效，低性能设备自动降级 |
| 学习 | 8 个阶段 52 个可运行课时：零基础 → 基础语法 → 函数 → 面向对象 → 标准库 → 算法 → 第三方库 → 实战（离线爬虫、自动化、数据处理、项目） |
| 习题 | 36 道题、11 种题型：选择 / 填空（Argon2id 加盐哈希）、随机参数题、编程题、代码填空、调试题、算法题（限制执行步数）、结构 / 流程图题、模块设计题；隐藏用例、错题本 |
| 考试 | 限时试卷、答题卡、断点续考、自动交卷、评分与成绩记录；考试中不显示用例与解析 |
| 积木编程 | Blockly 中文积木 → 实时生成 Python，可运行、在 IDE 中可视化、保存为可 `import` 的模块 |
| 离线网络 | 内置教学网站 `http://nexus.local`（分页新闻、商品表格、JSON 接口、登录会话）+ `requests` 兼容层 + 离线 BeautifulSoup，飞行模式下也能学爬虫 |
| 安全 | 题库整体 Ed25519 签名，篡改后拒绝加载；参考解不随应用分发 |
| Windows | Tauri 2 外壳 + 嵌入式 CPython：原生运行、打开 / 保存本地项目文件夹、本机 HTTP 教学网站、离线安装 `.whl`、PyInstaller 打包为 EXE |
| Android | Tauri 2 Android + WebView 中的 Pyodide（含交互输入）；触屏符号快捷栏 |

## 网页版快速开始

需要 Node.js 18+ 与 Python 3.10+。

```bash
npm install
npm run vendor       # 打包全部离线依赖到 web/vendor（Pyodide、CodeMirror、Blockly、hash-wasm、bs4 wheel…）
npm run serve        # 打开 http://localhost:8000
```

- 必须通过 `http://` 打开（`file://` 下浏览器禁止 Web Worker）。首次打开后 Service Worker 会缓存全部资源，之后断网可用。
- 交互式 `input()` 需要跨源隔离：Service Worker 会自动加上 COOP/COEP 头并刷新一次页面，无需配置服务器。
- 科学计算库需额外打包：`npm run vendor -- --pyodide-packages numpy,pandas,matplotlib`（需能访问 cdn.jsdelivr.net）。

## Windows 版

```powershell
npm install
npm run vendor
powershell -ExecutionPolicy Bypass -File scripts/fetch-python-embed.ps1   # 嵌入式 CPython（-Scientific 预装 numpy 等）
npm run desktop:build      # 生成 NSIS 安装程序与 MSI：src-tauri/target/release/bundle/
```

开发调试：`npm run desktop:dev`。没有嵌入式 Python 时应用会使用系统中的 Python；都没有时回退到 Pyodide。

## Android 版

需要 Android SDK、NDK 与 Rust Android 目标（见 [Tauri 文档](https://v2.tauri.app/start/prerequisites/#android)）：

```bash
npm run vendor
npm run android:init
npm run android:build      # APK 位于 src-tauri/gen/android/app/build/outputs/apk/
```

也可以直接在 Android Chrome 中打开网页版并「添加到主屏幕」，作为离线 PWA 使用。

## 测试

```bash
pip install -r requirements-dev.txt
npm test               # Python：执行追踪、流程图、判题、题库签名、全部课时示例、离线网站、原生宿主协议
npm run test:e2e       # Playwright：断网环境下验证网页版全部功能 + 模拟 Tauri 的原生运行时
npm run test:rust      # Rust 外壳单元测试
```

GitHub Actions（`.github/workflows/build.yml`）运行全部测试，并构建 Windows 安装包与 Android APK。

## 题库

题库源文件 `content/exercises.src.json`（含明文答案）与参考解 `content/solutions.json` 仅供出题，不随应用分发。修改后运行：

```bash
npm run bank           # 生成 web/data/exercises.js（Argon2id 哈希 + Ed25519 签名）
```

签名私钥保存在 `content/keys/`（不入库），首次运行自动生成并更新公钥 `web/js/bank-key.js`。

> 离线环境下无法保证答案绝对不可逆向（详见设计方案第三节）：哈希提高直接读取答案的成本，签名用于发现篡改。

### 快捷键

| 按键 | 功能 |
| --- | --- |
| `Ctrl+Enter` | 运行 |
| `F5` / `F10` | 可视化运行 / 下一步 |
| `Ctrl+S` | 保存到本地 |
| `Ctrl+/` | 注释 / 取消注释 |
| `Ctrl+F` | 搜索 |
| `Ctrl+Space` | 自动补全 |
| 点击行号 | 设置 / 取消断点 |

## 目录结构

```text
web/            前端（三端共用）：页面、样式、JS 模块、Python 核心 py/、课程与题库 data/
src-tauri/      Windows / Android 外壳（Tauri 2，Rust）
content/        题库源文件与参考解（不随应用分发）
tools/          题库编译工具
tests/          Python 测试
scripts/        离线依赖打包、端到端测试、嵌入式 Python 下载
docs/           设计方案
```
