# Python Nexus

**全平台离线 Python 学习与开发系统**：集 Python 学习、编程、代码运行、交互调试、习题训练、流程图生成与可视化执行于一体的轻量化 IDE。

完整设计方案见 [docs/DESIGN.md](docs/DESIGN.md)。本仓库目前实现的是第一阶段 **网页版 MVP**（同时作为后续 Windows / Android 封装的统一前端）。

## 功能

| 模块 | 已实现 |
| --- | --- |
| IDE | 多文件项目、语法高亮、自动补全、断点、直接运行、终止死循环、标准输入、交互式解释器、编译检查（字节码）、unittest |
| 可视化执行 | `sys.settrace` 真实执行顺序回放：当前行高亮、变量变化、调用栈、输出逐步出现、单步 / 回退 / 断点 / 0.25×–4× 速度 |
| 流程图 | Python `ast` → SVG 流程图，节点点击定位代码，执行时同步高亮，导出 SVG / PNG / Mermaid；函数调用图、模块导入图 |
| 三种风格 | 普通 Professional · 科幻 Quantum（粒子、全息）· 黑客 Matrix（字符流、扫描线），合成音效，可关闭特效 |
| 学习 | 8 阶段 260 课时规划，首批 14 个可运行课时（含离线爬虫示例） |
| 习题 | 单选 / 多选 / 填空（随机盐 + PBKDF2 哈希，不发布明文答案）、编程题 / 函数题 / 调试题动态判题、隐藏用例、错题本、考试模式 |
| 离线 | Pyodide 本地打包 + Service Worker，首次打开后断网可用，可安装为 PWA |

## 快速开始

需要 Node.js（用于下载 Pyodide）和 Python 3（用于本地服务器和测试）。

```bash
npm install          # 下载 Pyodide 0.27.7
npm run vendor       # 复制到 web/vendor/pyodide，实现完全离线
npm run serve        # 打开 http://localhost:8000
```

> 必须通过 `http://` 打开，`file://` 下浏览器禁止 Web Worker。
> 如果未执行 `npm run vendor`，运行时会回退到 jsDelivr CDN（需联网）。

### 快捷键

| 按键 | 功能 |
| --- | --- |
| `Ctrl+Enter` | 运行 |
| `F5` | 可视化运行 |
| `F10` | 下一步 |
| `Ctrl+S` | 保存到本地 |
| `Ctrl+/` | 注释 / 取消注释 |
| `Ctrl+Space` | 自动补全 |
| 点击行号 | 设置 / 取消断点 |

## 测试

```bash
npm test             # Python 核心单元测试（执行追踪、流程图、判题、题库）
npm run test:e2e     # Playwright 端到端测试（断网环境下验证全部功能）
```

## 题库

题库源文件 `content/exercises.src.json` 含明文答案，仅供出题使用。修改后运行：

```bash
npm run bank         # 生成 web/data/exercises.js（只含盐和哈希）
```

注意：离线环境下无法保证答案绝对不可逆向（详见设计方案第三节），哈希只用于提高直接读取答案的成本。

## 目录结构

```text
web/            网页版前端（index.html、css、js、Python 核心 py/、课程与题库 data/）
content/        题库源文件
tools/          题库编译工具
tests/          Python 核心单元测试
scripts/        Pyodide 打包脚本、端到端测试
docs/           设计方案
```

## 路线图

P2 完整课程与考试系统 → P3 Windows 版（Tauri 2 + 嵌入式 CPython）→ P4 Android 版 → P5 Blockly 可视化积木编程。详见 [docs/DESIGN.md 第九节](docs/DESIGN.md#九开发路线)。
