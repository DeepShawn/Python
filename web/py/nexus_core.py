"""Python Nexus 运行核心：普通运行、语法/字节码检查、单元测试。

本模块同时运行在 Pyodide（浏览器 / Android WebView）和桌面 CPython 中，
因此只依赖标准库。
"""
import builtins
import dis
import io
import os
import sys
import traceback
import unittest
from contextlib import redirect_stderr, redirect_stdout

__all__ = [
    "StepLimitExceeded",
    "make_input",
    "format_user_traceback",
    "run_plain",
    "check_syntax",
    "run_unittests",
]


class StepLimitExceeded(BaseException):
    """执行行数超过上限（防止死循环卡死界面）。"""


def make_input(stdin_text, echo_to=None):
    """返回一个从预置文本读取的 input() 替代函数。

    浏览器中无法同步阻塞等待键盘输入，因此程序的输入通过“标准输入”面板预先提供，
    每次 input() 读取一行。
    """
    lines = iter((stdin_text or "").splitlines())

    def fake_input(prompt=""):
        out = echo_to if echo_to is not None else sys.stdout
        out.write(str(prompt))
        try:
            value = next(lines)
        except StopIteration:
            raise EOFError("没有更多输入：请在「标准输入」面板中为 input() 提供数据") from None
        out.write(value + "\n")
        return value

    return fake_input


def format_user_traceback(exc, user_files):
    """只保留用户代码中的栈帧，隐藏运行器内部细节。"""
    tb = traceback.TracebackException.from_exception(exc)
    frames = [f for f in tb.stack if f.filename in user_files]
    tb.stack = traceback.StackSummary.from_list(frames)
    return "".join(tb.format())


def _line_limiter(max_lines):
    counter = [0]

    def tracer(frame, event, arg):
        if event == "line":
            counter[0] += 1
            if counter[0] > max_lines:
                raise StepLimitExceeded(f"执行超过 {max_lines} 行，疑似死循环，已终止")
        return tracer

    return tracer


def run_plain(source, stdin="", filename="main.py", max_lines=None, capture=False):
    """直接运行源代码。

    capture=False 时 print 直接写到 sys.stdout（Pyodide 中由 Worker 流式转发）。
    返回 {"ok", "error", "stdout"}。
    """
    out = io.StringIO() if capture else None
    g = {"__name__": "__main__", "__file__": filename, "__builtins__": builtins}
    g["input"] = make_input(stdin, echo_to=out)
    result = {"ok": True, "error": None, "stdout": ""}
    old_trace = sys.gettrace()
    try:
        code = compile(source, filename, "exec")
        if max_lines:
            sys.settrace(_line_limiter(max_lines))
        if capture:
            with redirect_stdout(out), redirect_stderr(out):
                exec(code, g)
        else:
            exec(code, g)
    except SystemExit as e:
        if e.code not in (None, 0):
            result["ok"] = False
            result["error"] = f"SystemExit: {e.code}"
    except BaseException as e:  # noqa: BLE001 - 需要把所有错误报告给学习者
        result["ok"] = False
        if isinstance(e, SyntaxError):
            result["error"] = "".join(traceback.format_exception_only(type(e), e))
        else:
            result["error"] = format_user_traceback(e, {filename})
    finally:
        sys.settrace(old_trace)
    if capture:
        result["stdout"] = out.getvalue()
    return result


def check_syntax(source, filename="main.py", with_bytecode=True, max_bytecode_lines=400):
    """编译检查：等价于 compile() / py_compile，返回错误位置或字节码清单。"""
    try:
        code = compile(source, filename, "exec")
    except SyntaxError as e:
        return {
            "ok": False,
            "line": e.lineno,
            "col": e.offset,
            "msg": f"{type(e).__name__}: {e.msg}",
            "text": (e.text or "").rstrip("\n"),
        }
    info = {"ok": True, "line": None, "col": None, "msg": "语法检查通过", "bytecode": ""}
    if with_bytecode:
        buf = io.StringIO()
        dis.dis(code, file=buf)
        lines = buf.getvalue().splitlines()
        if len(lines) > max_bytecode_lines:
            lines = lines[:max_bytecode_lines] + [f"... 已截断（共 {len(lines)} 行）"]
        info["bytecode"] = "\n".join(lines)
        info["code_objects"] = _count_code_objects(code)
    return info


def _count_code_objects(code):
    n = 1
    for const in code.co_consts:
        if hasattr(const, "co_code"):
            n += _count_code_objects(const)
    return n


def run_unittests(project_dir, pattern="test*.py"):
    """在项目目录中发现并运行 unittest 测试。"""
    stream = io.StringIO()
    old_cwd = os.getcwd()
    added = False
    if project_dir not in sys.path:
        sys.path.insert(0, project_dir)
        added = True
    try:
        os.chdir(project_dir)
        # 清除上次导入的项目模块，保证修改后的代码被重新加载
        for name, mod in list(sys.modules.items()):
            path = getattr(mod, "__file__", None) or ""
            if path.startswith(project_dir):
                del sys.modules[name]
        tests_dir = os.path.join(project_dir, "tests")
        start = tests_dir if os.path.isdir(tests_dir) else project_dir
        # tests/ 可以没有 __init__.py：以测试目录本身为顶层，项目根目录已在 sys.path 中
        suite = unittest.defaultTestLoader.discover(start, pattern=pattern, top_level_dir=start)
        runner = unittest.TextTestRunner(stream=stream, verbosity=2)
        with redirect_stdout(stream):
            res = runner.run(suite)
        return {
            "ok": res.wasSuccessful(),
            "run": res.testsRun,
            "failures": len(res.failures),
            "errors": len(res.errors),
            "output": stream.getvalue(),
        }
    finally:
        os.chdir(old_cwd)
        if added:
            sys.path.remove(project_dir)
