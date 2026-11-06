"""Python Nexus 交互式解释器（类似 IDLE Shell 的 >>> 模式）。"""
import builtins
import codeop
import io
import sys
import traceback
from contextlib import redirect_stderr, redirect_stdout

from nexus_core import make_input, run_plain

__all__ = ["Repl", "shell", "run_main"]


class Repl:
    def __init__(self):
        self.reset()

    def reset(self):
        self.namespace = {"__name__": "__main__", "__builtins__": builtins, "input": make_input("")}
        self.buffer = []
        self._compiler = codeop.CommandCompiler()

    def push(self, line):
        """输入一行。返回 {"more": 是否需要续行, "output": 输出文本, "error": bool}。"""
        self.buffer.append(line)
        source = "\n".join(self.buffer)
        try:
            code = self._compiler(source, "<console>", "single")
        except (SyntaxError, OverflowError, ValueError) as e:
            self.buffer = []
            return {"more": False, "output": "".join(
                traceback.format_exception_only(type(e), e)), "error": True}
        if code is None:
            return {"more": True, "output": "", "error": False}
        self.buffer = []
        out = io.StringIO()
        error = False
        try:
            with redirect_stdout(out), redirect_stderr(out):
                exec(code, self.namespace)
        except SystemExit:
            out.write("（交互模式中忽略 exit()）\n")
        except BaseException as e:  # noqa: BLE001
            error = True
            tb = traceback.TracebackException.from_exception(e)
            tb.stack = traceback.StackSummary.from_list(
                [f for f in tb.stack if f.filename == "<console>"])
            out.write("".join(tb.format()))
        return {"more": False, "output": out.getvalue(), "error": error}

    def completions(self, prefix):
        """返回命名空间与内置名称中以 prefix 开头的名字。"""
        names = set(self.namespace) | set(dir(builtins))
        return sorted(n for n in names if n.startswith(prefix) and not n.startswith("__"))


# IDLE 式 Shell：运行程序前重启（清空命名空间），程序在 Shell 的命名空间中运行，
# 结束后可以在 >>> 提示符下继续访问程序中定义的变量和函数。
shell = Repl()


def run_main(source, stdin="", filename="main.py"):
    shell.reset()
    return run_plain(source, stdin=stdin, filename=filename, namespace=shell.namespace)
