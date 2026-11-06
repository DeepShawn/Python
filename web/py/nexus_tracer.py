"""Python Nexus 执行追踪器。

使用 sys.settrace() 记录真实的执行顺序（行、调用、返回、异常）以及每一步的变量快照，
前端据此播放逐行执行动画。动画按真实事件回放，因此循环、递归和条件跳转都能正确显示。
"""
import builtins
import io
import sys
import types
from contextlib import redirect_stderr, redirect_stdout

from nexus_core import format_user_traceback, make_input

__all__ = ["run_traced"]

_HIDDEN_GLOBALS = {"__name__", "__file__", "__builtins__", "input", "__doc__",
                   "__loader__", "__spec__", "__package__", "__annotations__",
                   "__cached__"}


class _StepLimit(BaseException):  # 不被用户的 except Exception 吞掉
    pass


def _short_repr(value, limit=120):
    try:
        if isinstance(value, types.FunctionType):
            text = f"<函数 {value.__name__}>"
        elif isinstance(value, type):
            text = f"<类 {value.__name__}>"
        elif isinstance(value, types.ModuleType):
            text = f"<模块 {value.__name__}>"
        else:
            text = repr(value)
    except Exception as e:  # noqa: BLE001
        text = f"<repr 出错: {type(e).__name__}>"
    if len(text) > limit:
        text = text[: limit - 1] + "…"
    return text


def _snapshot(frame, is_module):
    src = frame.f_globals if is_module else frame.f_locals
    result = {}
    for name, value in list(src.items()):
        if name in _HIDDEN_GLOBALS or (name.startswith("__") and name.endswith("__")):
            continue
        if is_module and isinstance(value, types.ModuleType):
            continue
        result[name] = {"v": _short_repr(value), "t": type(value).__name__}
    return result


def run_traced(source, stdin="", filename="main.py", trace_prefix=None, max_steps=3000):
    """运行代码并返回执行事件列表。

    每个事件：
      {"e": "line"|"call"|"return"|"exception"|"end",
       "ln": 行号, "file": 文件名, "fn": 函数名, "depth": 调用深度,
       "stack": [函数名...], "vars": {名称: {"v": 值, "t": 类型}},
       "globals": {...}（仅函数内事件附带）, "out": 当前累计输出长度,
       "ret": 返回值 / "exc": 异常描述}
    """
    out = io.StringIO()
    events = []
    g = {"__name__": "__main__", "__file__": filename, "__builtins__": builtins,
         "input": make_input(stdin, echo_to=out)}

    def is_user(code):
        fn = code.co_filename
        return fn == filename or (trace_prefix is not None and fn.startswith(trace_prefix))

    def stack_of(frame):
        names = []
        f = frame
        while f is not None:
            if is_user(f.f_code):
                names.append(f.f_code.co_name)
            f = f.f_back
        names.reverse()
        return names

    def record(frame, event, **extra):
        if len(events) >= max_steps:
            raise _StepLimit()
        is_module = frame.f_code.co_name == "<module>"
        stack = stack_of(frame)
        ev = {
            "e": event,
            "ln": frame.f_lineno,
            "file": frame.f_code.co_filename,
            "fn": frame.f_code.co_name,
            "depth": len(stack) - 1,
            "stack": stack,
            "vars": _snapshot(frame, is_module),
            "out": len(out.getvalue()),
        }
        if not is_module:
            ev["globals"] = _snapshot(frame, True)
        ev.update(extra)
        events.append(ev)

    def tracer(frame, event, arg):
        if not is_user(frame.f_code):
            return None
        if event == "call":
            if frame.f_code.co_name != "<module>":
                record(frame, "call")
        elif event == "line":
            record(frame, "line")
        elif event == "return":
            if frame.f_code.co_name != "<module>":
                record(frame, "return", ret=_short_repr(arg))
        elif event == "exception":
            exc_type, exc_value, _ = arg
            record(frame, "exception", exc=f"{exc_type.__name__}: {exc_value}")
        return tracer

    result = {"ok": True, "error": None, "truncated": False}
    old_trace = sys.gettrace()
    try:
        code = compile(source, filename, "exec")
        with redirect_stdout(out), redirect_stderr(out):
            sys.settrace(tracer)
            try:
                exec(code, g)
            finally:
                sys.settrace(old_trace)
    except _StepLimit:
        result["truncated"] = True
        result["error"] = f"已记录 {max_steps} 步，超过可视化上限，后续执行未展示"
    except SystemExit:
        pass
    except BaseException as e:  # noqa: BLE001
        result["ok"] = False
        if isinstance(e, SyntaxError):
            import traceback
            result["error"] = "".join(traceback.format_exception_only(type(e), e))
        else:
            result["error"] = format_user_traceback(e, {filename} | (
                {ev["file"] for ev in events}))

    final_vars = {}
    for name, value in g.items():
        if name in _HIDDEN_GLOBALS or isinstance(value, types.ModuleType):
            continue
        final_vars[name] = {"v": _short_repr(value), "t": type(value).__name__}
    events.append({"e": "end", "ln": None, "file": filename, "fn": "<module>",
                   "depth": 0, "stack": [], "vars": final_vars,
                   "out": len(out.getvalue())})
    result["events"] = events
    result["stdout"] = out.getvalue()
    return result
