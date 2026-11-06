# Python Nexus — 全平台离线 Python 学习与开发系统

项目总体设计方案 V1.0 ｜ HTML + Android + Windows

> 定位：集 Python 学习、编程、代码运行、交互调试、习题训练、流程图生成与可视化编程于一体的全平台离线开发环境。
> 它不是普通的 Python 教程网站，而是一套面向初学者、进阶学习者和开发者的轻量化 IDE。
>
> 关键词：完全离线使用 · 三端统一 · Python IDE · 可视化编程
> 项目代号：Python Nexus（暂定）

---

## 一、总体架构：一套核心，三个平台

采用 **Web 技术统一界面 + 多种 Python 执行引擎 + 原生平台封装** 的架构，而不是同时开发三个互不相关的程序。

```text
┌──────────────────────────── Python Nexus 统一前端 ────────────────────────────┐
│                   HTML · CSS · TypeScript · React                             │
│        网页版（离线 Web App）   Android（独立 APK）   Windows（独立 EXE）        │
├──────────────────────────────── 统一业务核心 ─────────────────────────────────┤
│        编辑器 · 教学 · 习题 · AST 分析 · 流程图 · 可视化调试                     │
├────────────────────────────── Python 执行适配层 ──────────────────────────────┤
│  浏览器：Pyodide / WebAssembly │ Windows：嵌入式 CPython │ Android：嵌入式 Python │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 三端能力规划

| 功能 | HTML 网页 | Android | Windows |
| --- | --- | --- | --- |
| 离线运行 Python | 支持 | 支持 | 支持 |
| 语法高亮、自动补全 | 支持 | 支持 | 支持 |
| 交互式控制台 | 支持 | 支持 | 支持 |
| 单步调试与变量追踪 | 支持基础功能 | 支持 | 支持 |
| 教程、习题、测试 | 支持 | 支持 | 支持 |
| 流程图与模块编程 | 支持 | 支持 | 支持 |
| 三种沉浸式主题 | 支持 | 支持 | 支持 |
| 本地文件管理 | 浏览器沙盒内 | 应用沙盒内 | 支持 |
| 第三方 Python 库 | 兼容子集 | 依赖打包情况 | 兼容范围较广 |

重要的技术区别：

- **浏览器版**使用 Pyodide，在 WebAssembly 环境中执行 Python，不需要云端服务器，但不能完全代替桌面 Python。
- **Windows 版**可以捆绑完整的 CPython 运行时，实现更接近普通电脑 IDE 的体验。
- **Android 版**前期可以复用 Pyodide，后期再接入原生 Python，以获得更好的兼容性。

这样能先开发一个真正可用的版本，再逐步扩大原生能力，而不会在第一阶段就被三套运行环境拖垮。

---

## 二、核心功能：六大系统

| 编号 | 系统 | 内容 |
| --- | --- | --- |
| 01 | Python IDE 编程系统 | 多文件编辑、运行、交互式解释器、调试、编译检查、单元测试、代码自动补全、本地项目管理 |
| 02 | Python 知识学习系统 | 从输入输出、变量、循环、函数，到面向对象、第三方库、数据分析、自动化和网页爬虫 |
| 03 | 习题与考试系统 | 题库、自动判题、单元测试、错题本、学习进度、离线成绩统计，以及减少直接读取答案的保护机制 |
| 04 | 可视化代码执行系统 | 普通、科幻、黑客三种主题；执行行高亮、控制流动画、变量变化、函数调用轨迹、光效与声音反馈 |
| 05 | 流程图与代码结构系统 | 代码自动生成流程图、函数关系图、模块依赖图，支持导出 SVG、PNG |
| 06 | 模块化与可视化编程系统 | 拖拽代码积木、创建独立函数模块、连接逻辑、生成 Python 代码，并组织成多文件项目 |

### 2.1 Python IDE 详细设计

编程界面采用可调整大小的分栏布局：左侧项目管理，中间编辑器与控制台，右侧执行追踪 / 流程图 / 代码结构，底部状态栏显示 `Python · UTF-8 · Ln 3` 与运行时来源。

| 模式 | 功能 |
| --- | --- |
| ▶ 直接运行 | 执行当前 Python 文件 |
| 单步运行 | 跟踪每一行源代码的执行 |
| 调试模式 | 断点、变量检查、调用栈 |
| 交互模式 | 类似 IDLE Shell 的 `>>>` 解释器 |
| 测试模式 | 运行 unittest、assert 或已打包的测试框架 |
| 编译检查 | `compile()`、`py_compile` 语法及字节码检查 |

> `py_compile` 生成 Python 字节码，不等于把 Python 程序编译成独立 Windows EXE。真正的 EXE 打包作为后期单独功能。

### 2.2 Python 学习课程规划

课程采取 **知识讲解 → 可执行示例 → 运行过程动画 → 练习 → 自动评测** 的闭环设计。

| 阶段 | 学习内容 | 预设课时 |
| --- | --- | --- |
| 零基础 | print、input、变量、数据类型 | 20 |
| 基础语法 | 运算符、条件、循环、字符串、容器 | 35 |
| 函数编程 | 函数、作用域、递归、异常 | 25 |
| 进阶编程 | 文件、模块、面向对象、迭代器 | 35 |
| 标准库 | math、random、json、datetime、os 等 | 35 |
| 算法与结构 | 排序、搜索、栈、队列、递归、复杂度 | 40 |
| 第三方库 | NumPy、pandas、Matplotlib 等 | 35 |
| 实战应用 | 自动化、数据处理、爬虫、项目开发 | 35 |

合计 260 个规划课时，是课程建设目标，不是现有资源数量。

**离线爬虫课程**需要特别设计。软件要求无需联网，不能让学生直接抓取互联网上的实时网页，因此内置：

- 静态 HTML 测试网页以及 JSON 响应样本；
- 模拟登录、分页、表格、文章详情页等教学数据；
- 本地 HTML 解析课程，学习 BeautifulSoup、正则表达式、XPath 等；
- Windows / Android 适用时可选用本机模拟 HTTP 服务（`127.0.0.1`），训练 requests 的使用方法。

这样即使打开飞行模式，仍然可以完成网页解析和爬虫逻辑训练。真实网络爬取视为超出严格离线模式的可选扩展。

---

## 三、习题系统与答案保护

这一部分分开设计：**题目判分正确性** 和 **答案防读取能力**。

### 3.1 习题类型

| 类型 | 判题方案 |
| --- | --- |
| 单选、多选 | 本地答案验证 |
| 填空 | 规范化答案后计算哈希验证 |
| 代码填空 | 语法及运行结果测试 |
| 编程题 | 输入输出测试、单元测试 |
| 调试题 | 修复错误后执行测试 |
| 算法题 | 正确性 + 时间和资源限制 |
| 流程图题 | 检查必要节点与控制逻辑 |
| 模块设计题 | 函数签名、模块接口及集成测试 |

### 3.2 加密与防反编译设计

必须明确的技术事实：**在完全离线、用户能够控制软件及其所有文件的条件下，不能保证答案绝对无法被逆向分析。**
哈希也不等于加密。哈希无法直接解密，但例如四选一的正确答案只有四种可能，攻击者可以依次尝试所有候选值。

因此采用分层保护：

- **答案不明文存储**：对适合的填空答案使用随机盐 + Argon2id 等慢速哈希；
- **编程题动态评测**：不保存一份固定的参考代码作为唯一判分依据，而是使用测试逻辑检查行为；
- **题目参数随机化**：同一题型自动生成不同变量与数据；
- **题库完整性校验**：对正式题包进行数字签名，验证文件是否被修改；
- **考试与练习分离**：考试模式不直接展示测试用例和解析，完成后按设定解锁；
- **本地数据保护**：学习记录放在应用私有存储区，可选用数据库加密。

Argon2id 和随机盐是成熟的哈希保护方法（参见 OWASP Password Storage Cheat Sheet），但其效果仍取决于答案的猜测空间，不应宣传为绝对不可破解。对于需要防止用户伪造成绩的正式考试，纯离线环境也无法提供与可信服务器同等级别的保证：可以提供防篡改措施，但不能把它描述成绝对安全。

> **实现说明**：
> - 客观题答案使用 **Argon2id（随机盐，m = 19 MiB、t = 2、p = 1，OWASP 推荐参数）**。出题工具用 `argon2-cffi` 计算，浏览器用本地打包的 `hash-wasm` 以相同参数校验，两端结果经测试逐字节一致。
> - 整个题库序列化为 JSON 字符串后用 **Ed25519** 签名；前端先验签（WebCrypto Ed25519，浏览器不支持时用 tweetnacl）再解析，签名不符则拒绝加载。私钥 `content/keys/` 不入库，公钥在 `web/js/bank-key.js`。
> - 编程题只发布测试用例，期望输出由不随应用分发的参考解（`content/solutions.json`）在出题时计算；单元测试保证参考解通过、初始代码不通过，且参考解的关键行不出现在发布文件中。
> - 随机参数题只发布参数规格和计算表达式，答案在本地即时计算（答案本来就可由题目推出，无需保密）。
> - 考试模式不显示用例细节与解析，交卷后公开客观题解析，编程题用例保持隐藏。

---

## 四、三种沉浸式运行风格

三种风格不只是换背景颜色，而是有独立的视觉语言、音效和代码执行动画。

| 风格 | 标识 | 视觉语言 | 目标 |
| --- | --- | --- | --- |
| 普通模式 · Professional | `STANDARD` | 极简浅色或深色 IDE，柔和蓝色行高亮，细腻的进度条、变量变化渐变和控制台反馈 | 阅读清晰、响应迅速、适合长时间学习 |
| 科幻模式 · Quantum | `NEXUS // RUN` | 深蓝黑背景、青紫霓虹、全息浮窗、发光执行轨迹、数据粒子、悬浮式函数调用卡片 | 让程序运行像科幻电影中的计算系统 |
| 黑客模式 · Matrix | `ROOT://PYTHON` | 纯黑或暗绿色终端、荧光绿文字、字符流、扫描线、指令脉冲、打字机效果 | 沉浸式终端体验，同时保留完整代码可读性 |

### 4.1 最重要的技术：逐行代码运行特效

```python
x = 3
y = 5
z = x + y
print(z)
```

理想的运行过程：`STEP 1 / 4` → 高亮第 1 行「赋值 · 创建变量 x」→ 变量面板出现 `x = 3` → 下一步……

实际开发时，**不能只用定时器逐行播放代码**，否则循环、递归和条件跳转会显示错误的执行顺序。推荐方案：

```text
Python 源代码 → 执行引擎 → 执行追踪器（行号 · 事件 · 变量变化 · 函数栈）
                                   ├→ 代码高亮
                                   ├→ 视觉特效
                                   └→ 变量面板 / 调用栈 / 流程图路径
```

Python 原生环境使用 `sys.settrace()` 追踪行事件、函数调用、返回和异常，结合前端动画系统呈现真实的执行流程。

设计约束：

- 默认按源代码行追踪，而不是每条字节码指令都做动画；
- 对高频循环提供动画降采样和快速跳过，防止数万次循环使界面卡死（MVP：记录上限 3 000 步，超出时提示截断）；
- 允许设置 0.25×、0.5×、1×、2× 速度；
- 支持暂停、断点、单步与快速运行；
- Python 标准库和第三方库内部执行默认不逐行展示，只展开用户代码；
- 允许关闭闪光、动态背景、音效，特别优化低性能安卓手机（并遵循系统「减少动态效果」设置）。

---

## 五、自动流程图与模块化编程

### 5.1 一键生成流程图

```python
n = int(input("n: "))
if n % 2 == 0:
    print("偶数")
else:
    print("奇数")
```

点击「生成流程图」，自动得到：`开始 → 输入 n → n % 2 == 0 ?（是 → 输出「偶数」／否 → 输出「奇数」）→ 结束`。

技术方案：

- 使用 Python `ast` 模块解析源代码的语法结构；
- 将 `if`、`for`、`while`、`return`、`break`、`continue`、`try`、`with`、`match` 等转换为控制流节点；
- 使用本地集成的渲染组件绘图，并可导出 Mermaid 文本；
- 同时生成函数调用图、类继承图和文件导入关系图；
- 点击流程图节点，定位到对应代码；
- 调试时在图中高亮当前实际执行路径。

第一版只实现「代码 → 流程图」的自动转换。反向编辑流程图并无损修改任意 Python 源代码非常复杂，放在后期。

> **MVP 实现说明**：为保证零依赖离线，网页版使用自研的结构化 SVG 布局器（`web/js/flowchart.js`）直接渲染 `ast` 生成的控制流树，同时由 `nexus_flow.to_mermaid()` 输出 Mermaid 文本供复制；需要 Mermaid 渲染时再将其打包进 `vendor/`。

### 5.2 模块化编程系统

**A. 专业模块开发**

```text
MyProject/
├── main.py
├── modules/
│   ├── calculator.py
│   └── validator.py
├── tests/
│   └── test_calculator.py
└── project.json
```

可视化显示 `main.py` 导入哪些模块、每个模块提供哪些函数、函数如何相互调用。

**B. 可视化积木编程**

使用 Blockly 实现拖拽逻辑块，积木自动生成可编辑的 Python 代码。Blockly 本身提供 Python 代码生成器，可以作为基础。两种模式共享同一 Python 运行引擎，积木和手写代码都能调试、运行和自动评测。

---

## 六、技术选型与离线架构

### 6.1 推荐技术栈

| 技术层 | 推荐方案 | 用途 |
| --- | --- | --- |
| 前端 | 原生 ES Modules（无构建步骤）；规模扩大后可迁移到 React + TypeScript + Vite | 三端统一 UI |
| 代码编辑 | CodeMirror 6 | 高亮、补全、折叠、移动端编辑 |
| Python 网页引擎 | Pyodide | 浏览器离线执行 Python |
| Windows 引擎 | 嵌入式 CPython（embeddable package） | 本机 Python 执行 |
| Android 引擎 | WebView 中的 Pyodide（已实现）；Chaquopy 原生 CPython（可选扩展） | 离线 Python 执行 |
| 跨平台容器 | Tauri 2 | Windows / Android 封装 |
| 流程图 | Python AST + Mermaid / 自研 SVG 布局 | 自动结构分析与绘图 |
| 可视化编程 | Blockly | 代码积木与 Python 生成 |
| 动画 | CSS + Web Animations / Canvas | 代码运行特效 |
| 音效 | Web Audio API（合成音，无需音频文件） | 执行反馈 |
| 数据存储 | localStorage（应用私有存储，失败时降级为内存）；Windows 版可直接读写本地项目文件夹 | 项目、进度、错题本、成绩 |
| 离线缓存 | Service Worker + Cache Storage | 网页版首次加载后完全离线 |
| 答案保护 | Argon2id（hash-wasm / argon2-cffi）；Ed25519 题包签名（WebCrypto / tweetnacl / cryptography） | 防读取、防篡改 |
| 离线网络 | 内置教学网站 `http://nexus.local` + requests 兼容层；桌面端可启动本机 HTTP 服务 | 爬虫课程 |
| 测试 | Python unittest、Playwright 端到端测试、cargo test、GitHub Actions | 核心逻辑、界面与打包 |

### 6.2 离线架构

1. **所有资源本地化**：Pyodide 运行时（`pyodide.asm.wasm`、`python_stdlib.zip` 等约 14 MB）、字体、课程、题库、图标全部随应用打包，禁止运行时访问 CDN。
2. **网页版**：通过 Service Worker 预缓存应用外壳与运行时；首次打开后断网、飞行模式均可使用。支持安装为 PWA（Android Chrome「添加到主屏幕」即可得到离线应用）。
3. **Windows 版**：Tauri 2 打包前端；Python 执行通过 Rust 侧启动随包附带的嵌入式 CPython 子进程，使用 JSON 行协议与前端通信（与 Pyodide Worker 的消息协议相同）。
4. **Android 版**：Tauri 2 Android + WebView 内的 Pyodide（与网页版同一套离线资源）；`runtime_info` 报告没有原生 Python 时前端自动选择 Pyodide。Chaquopy 原生 CPython 作为可选扩展，可接入同一个 `nexus_host.py` 协议。
5. **执行隔离**：网页版 Python 运行在 Web Worker 中，界面永不阻塞；死循环可通过终止 Worker 立即停止并自动重启运行时。桌面版通过结束并重启 CPython 子进程实现同样效果。
6. **交互式 input()**：网页版在跨源隔离（COOP/COEP，由 Service Worker 自动添加）时用 SharedArrayBuffer + Atomics 让 Worker 同步等待用户输入；桌面版由宿主通过 JSON 行协议向前端请求输入。「标准输入」面板中的预置内容优先使用，用完后再实时询问；判题始终不使用交互输入。
7. **执行适配层接口**（三端一致，`web/js/worker.js` 与 `web/py/nexus_host.py` 实现同一协议）：

| 方法 | 说明 |
| --- | --- |
| `run({code, stdin, files, filename})` | 直接运行，流式输出 |
| `trace({..., maxSteps})` | 记录执行事件（行、调用、返回、异常、变量快照） |
| `check({code})` | 语法检查与字节码反汇编 |
| `analyze({code, files})` | 流程图、调用图、导入图 |
| `test({files})` | 发现并运行 `tests/test_*.py` |
| `judge({code, cases, requires, limits, reveal})` | 按测试用例判题，检查代码结构，限制执行行数 / 时间 |
| `checkRandom({expr, params, answer})` | 随机参数题判分 |
| `replPush(line)` / `complete(prefix)` | 交互式解释器与补全 |
| `restart()` | 强制终止并重启运行时 |
| `provideInput(value)` | 回应程序的 `input()` 请求 |
| 原生专属：`netServe`、`installLocal`、`buildExe`、`openFolder`、`saveFolder` | 本机 HTTP 教学网站、离线安装 .whl、PyInstaller 打包、真实文件夹项目 |

### 6.3 第三方库策略

| 平台 | 方案 |
| --- | --- |
| 网页 / Android（Pyodide） | 纯 Python 库（beautifulsoup4、soupsieve）从 PyPI 下载 wheel 打包到 `vendor/wheels/`，运行时按 import 自动解压安装；NumPy、pandas、Matplotlib 用 `npm run vendor -- --pyodide-packages …` 打包 Pyodide 编译版，运行时 `loadPackagesFromImports` 从本地加载 |
| Windows | 嵌入式 CPython + 预装 requests、beautifulsoup4、pyinstaller（`-Scientific` 额外预装科学计算库）；项目菜单「离线安装第三方库」用 `pip --no-index` 安装本地 `.whl` |
| 通用 | 课程只使用三端都能离线获得的库；不可用时给出明确提示而非报错 |

---

## 七、数据与存储设计

### 7.1 本地数据

| 数据 | 内容 | 存储位置 |
| --- | --- | --- |
| 项目 | 多文件源码、当前文件、标准输入；积木布局 `.blocks.json` | localStorage；Windows 版可保存到本地文件夹 |
| 学习进度 | 已完成课时、时间戳 | localStorage |
| 习题记录 | 尝试次数、错误次数、是否通过、草稿代码、随机参数 | localStorage |
| 考试 | 进行中的答卷（可断点续考）、成绩记录 | localStorage |
| 偏好设置 | 主题、音效、动态特效 | localStorage |

所有数据只存于本机，不上传。提供项目导出 / 导入（JSON、`.py`）作为备份和跨设备迁移方式。

### 7.2 项目文件格式 `project.json`

```json
{
  "name": "MyProject",
  "version": 1,
  "entry": "main.py",
  "files": { "main.py": "print('hi')", "modules/calculator.py": "..." },
  "stdin": "",
  "createdWith": "Python Nexus 0.1"
}
```

### 7.3 题库包格式

发布文件 `web/data/exercises.js` 导出 `SIGNED_BANK = { payload, signature, algo: "Ed25519" }`，`payload` 是下面 JSON 的字符串：

```json
{
  "version": 2,
  "questions": [
    { "id": "q-print-1", "stage": "零基础", "type": "single", "title": "...", "options": ["..."],
      "check": { "algo": "argon2id", "memory": 19456, "iterations": 2, "parallelism": 1, "length": 32,
                 "salt": "…", "hashes": ["…"] } },
    { "id": "rf-arith", "type": "random_fill", "title": "计算：{a} * {b} + {c} 的值是 ____。",
      "params": { "a": [2, 12], "b": [2, 12], "c": [1, 30] }, "expr": "a * b + c" },
    { "id": "p-binsearch", "type": "algorithm", "starter": "...", "limits": { "max_lines": 2000 },
      "cases": [{ "call": "bsearch([1, 3, 5, 7], 5)", "expected": "2" }, { "call": "…", "expected": "…", "hidden": true }] },
    { "id": "md-stack", "type": "design", "requires": { "classes": { "Stack": ["push", "pop"] } }, "cases": ["…"] }
  ],
  "exams": [{ "id": "exam-basic", "title": "…", "minutes": 20, "pass": 60, "questions": ["q-print-1", "…"] }]
}
```

题型：`single`、`multi`、`fill`、`random_fill`、`code_io`、`code_func`、`code_fill`（代码填空，`____` 必须填完）、`debug`、`algorithm`（`limits` 限制执行行数 / 时间）、`structure`（流程图 / 结构题：`requires` 检查循环、条件、递归、try、禁用或必须调用的函数）、`design`（模块设计：检查函数签名与类方法）。

---

## 八、项目目录结构

```text
Python/
├── docs/DESIGN.md                    # 本设计方案
├── web/                              # 网页版（同时作为 Tauri 前端）
│   ├── index.html · sw.js · manifest.webmanifest
│   ├── css/app.css                   # 三种主题
│   ├── js/
│   │   ├── app.js                    # IDE、可视化执行、流程图、模块装配
│   │   ├── learn.js · practice.js · exam.js · blocks.js   # 学习、习题、考试、积木编程
│   │   ├── runtime.js · worker.js    # 执行适配层：Pyodide Worker（含交互输入、离线库安装）
│   │   ├── runtime-native.js         # 执行适配层：Tauri + 嵌入式 CPython
│   │   ├── editor.js · cm-editor.js  # 轻量编辑器 / CodeMirror 6（同一接口）
│   │   ├── flowchart.js              # SVG 流程图布局与导出
│   │   ├── effects.js                # 粒子、字符流、音效
│   │   ├── crypto.js · bank-key.js   # Argon2id 答案校验、Ed25519 题库验签
│   │   └── storage.js · ui.js
│   ├── py/                           # 三端共用的 Python 核心（只依赖标准库）
│   │   ├── nexus_core.py             # 运行、交互输入、编译检查、unittest
│   │   ├── nexus_tracer.py           # sys.settrace 执行追踪
│   │   ├── nexus_flow.py             # AST → 流程图 / Mermaid / 调用图 / 导入图 / 类继承图
│   │   ├── nexus_repl.py             # 交互式解释器
│   │   ├── nexus_judge.py            # 自动判题（用例、结构、性能、随机参数）
│   │   ├── nexus_net.py              # 离线教学网站与 requests 兼容层
│   │   └── nexus_host.py             # 原生执行宿主（JSON 行协议）
│   ├── data/lessons.js · exercises.js
│   └── vendor/                       # npm run vendor 生成（不入库）
├── src-tauri/                        # Windows / Android 外壳（Tauri 2，Rust）
├── content/                          # 题库源文件、参考解（不随应用分发）
├── tools/build_question_bank.py      # 题库编译：Argon2id + Ed25519 签名
├── tests/                            # Python 单元测试（核心、判题、题库、课程、宿主协议）
├── scripts/                          # vendor 打包、端到端测试、嵌入式 Python 下载
└── .github/workflows/build.yml       # 测试 + Windows / Android 构建
```

---

## 九、开发路线

| 阶段 | 周期（参考） | 交付内容 | 验收标准 | 状态 |
| --- | --- | --- | --- | --- |
| **P1 网页版 MVP** | 6–8 周 | IDE（多文件、运行、终止、stdin、编译检查、unittest、REPL、补全）、逐行可视化执行（断点、速度、回退、进度条）、三种主题、AST 流程图与导出、首批课程与题库、PWA 离线 | 断网状态下全部功能可用；Python 核心与端到端测试通过 | ✅ 已完成 |
| **P2 学习体系** | 8–10 周 | 零基础至算法阶段完整课程；题型扩展（代码填空、调试、算法时间限制、流程图题）；参数随机化；考试模式与成绩统计；Argon2id；题包签名；CodeMirror 6 替换编辑器 | 前 6 个阶段课程上线；考试模式不泄露用例与解析 | ✅ 已完成（8 个阶段 52 课时、36 题、2 套试卷） |
| **P3 Windows 版** | 4–6 周 | Tauri 2 封装；嵌入式 CPython 执行器；真实文件系统项目管理；本机模拟 HTTP 服务（爬虫课程）；离线安装第三方库；EXE 打包向导（PyInstaller） | 安装包可在无网络 Windows 10/11 上运行全部课程 | ✅ 已实现；安装包由 CI 在 Windows 上构建 |
| **P4 Android 版** | 4–6 周 | Tauri 2 Android；触屏编辑优化（符号快捷栏、缩放）；低性能设备特效降级；后期 Chaquopy 原生引擎 | 中端手机可流畅运行可视化执行（≥ 30 FPS） | ✅ 已实现（Pyodide 引擎）；APK 由 CI 构建；Chaquopy 为可选扩展 |
| **P5 可视化编程** | 6–8 周 | Blockly 积木编程、函数模块积木、积木 ↔ 代码同步、类继承图、模块依赖图交互、第三方库课程 | 积木生成的代码可运行、调试和判题 | ✅ 已完成（积木 → 代码单向同步） |

---

## 十、性能与兼容性

- Pyodide 首次加载约 2–5 秒（取决于设备），之后由 Service Worker 缓存；加载期间界面可用，并显示运行时状态。
- 执行追踪每步保存变量快照，值的 `repr` 截断为 120 字符，记录上限 3 000 步（低性能设备 1 500 步），避免内存暴涨。
- 低性能设备（CPU ≤ 4 核或内存 ≤ 3 GB）默认关闭动态特效。
- 判题对每个用例限制执行行数（默认 20 万行），死循环会被判为「疑似死循环」，而不会卡住评测。
- 特效全部可关闭；系统开启「减少动态效果」时默认关闭动画背景；后台标签页暂停动画。
- 浏览器要求：支持 WebAssembly、Web Worker、ES Modules 的现代浏览器（Chrome / Edge 90+、Firefox 90+、Safari 15+）。
- 网页版需通过 `http(s)://` 访问（`file://` 下浏览器禁止 Worker 和 Service Worker），Tauri 封装后无此限制。

## 十一、风险与对策

| 风险 | 影响 | 对策 |
| --- | --- | --- |
| Pyodide 与 CPython 行为差异（无线程、无子进程、无真实网络） | 部分课程无法在网页版运行 | 课程标注平台要求；爬虫课程使用本地样本 |
| `input()` 无法在 Worker 中同步阻塞读取键盘 | 交互式输入体验差 | 已解决：SharedArrayBuffer + Atomics（Service Worker 自动开启跨源隔离）；Safari 等不支持 `credentialless` 的环境退回「标准输入」面板 |
| CI 构建产物未在真机验证 | Windows / Android 安装包可能存在平台问题 | 发布前在 Windows 10/11 与 Android 真机上冒烟测试；外壳逻辑已有 cargo 单元测试，宿主协议有 Python 与浏览器端到端测试 |
| 离线环境下答案可被逆向 | 练习作弊 | 分层保护 + 明确告知「不能绝对防破解」；正式考试需要可信服务器 |
| 安装包体积（Pyodide 约 14 MB，CPython 约 25 MB，第三方库更大） | 下载与存储成本 | 第三方库按课程分包，按需导入离线包 |
| 三端维护成本 | 进度拖延 | 统一前端与 Python 核心，平台差异只存在于执行适配层 |

## 十二、当前实现状态

**网页版（P1）**
- [x] 多文件项目管理（新建、重命名、删除、导入导出、下载 `.py`），本地自动保存
- [x] CodeMirror 6 编辑器：语法高亮、自动补全、括号匹配、折叠、搜索、撤销历史、断点栏；未打包时回退到轻量编辑器
- [x] 直接运行（流式输出、错误行标记、终止死循环）与**交互式 input()**
- [x] 可视化逐行运行：真实执行顺序；单步 / 回退 / 播放 / 跳到断点 / 进度条；0.25×–4× 速度；变量变化；调用栈；流程图同步高亮
- [x] 交互式解释器、编译检查（字节码）、unittest 测试模式
- [x] AST 流程图，SVG / PNG / Mermaid 导出；函数调用图、模块导入图、类继承图
- [x] 三种沉浸式主题、合成音效、特效开关、低性能设备降级
- [x] PWA 离线缓存；移动端符号快捷栏与窄屏布局

**学习体系（P2）**
- [x] 8 个阶段 52 个可运行课时（每个示例由自动测试验证可运行），含离线爬虫、自动化、数据处理与项目实战
- [x] 36 道题、11 种题型；Argon2id 答案保护；Ed25519 题库签名；随机参数题；隐藏用例；错题本
- [x] 限时考试：答题卡、断点续考、自动交卷、评分与成绩记录

**Windows 版（P3）**
- [x] Tauri 2 外壳：嵌入式 CPython 执行宿主、真实交互输入、终止重启
- [x] 打开 / 保存本地项目文件夹、本机 HTTP 教学网站、离线安装 `.whl`、PyInstaller 打包为 EXE
- [x] 嵌入式 Python 下载脚本与 Windows 安装包 CI（NSIS / MSI）

**Android 版（P4）**
- [x] Tauri 2 Android 配置与图标、WebView 中的 Pyodide 离线运行（含交互输入）、APK CI
- [ ] Chaquopy 原生 CPython（可选扩展：将 `nexus_host.py` 作为 Chaquopy 模块运行即可复用同一协议）

**可视化编程（P5）**
- [x] Blockly 积木编程（中文积木、输入输出积木、函数模块），实时生成 Python；运行、在 IDE 中可视化、保存为可 import 的模块
- [ ] 代码 → 积木的反向转换（仅支持积木 → 代码）

## 十三、结论

Python Nexus 以「一套前端 + 一套 Python 核心 + 可替换的执行引擎」为原则：先用网页版验证完整的学习—编程—可视化—评测闭环，再通过 Tauri 与原生 Python 引擎扩展到 Windows 和 Android。在离线安全方面，系统坦诚说明能力边界——提供分层的答案保护与防篡改措施，而不宣称绝对安全。
