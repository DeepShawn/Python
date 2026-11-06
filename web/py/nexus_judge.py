"""Python Nexus 自动判题。

不保存固定参考代码，而是用测试用例检查程序行为：
  - 输入输出题：{"stdin": "...", "expected": "..."}
  - 函数题：    {"call": "add(2, 3)", "expected": "5"}（比较 repr）
每个用例在全新命名空间中运行，并限制执行行数，防止死循环。
"""
import builtins
import io
import sys
from contextlib import redirect_stderr, redirect_stdout

from nexus_core import StepLimitExceeded, _line_limiter, format_user_traceback, make_input

__all__ = ["judge", "normalize_output"]


def normalize_output(text):
    lines = [ln.rstrip() for ln in (text or "").replace("\r\n", "\n").split("\n")]
    while lines and not lines[-1]:
        lines.pop()
    return "\n".join(lines)


def _run_case(source, case, max_lines):
    out = io.StringIO()
    g = {"__name__": "__main__", "__builtins__": builtins,
         "input": make_input(case.get("stdin", ""), echo_to=io.StringIO())}
    old = sys.gettrace()
    try:
        code = compile(source, "solution.py", "exec")
        sys.settrace(_line_limiter(max_lines))
        try:
            with redirect_stdout(out), redirect_stderr(out):
                exec(code, g)
                if "call" in case:
                    value = eval(case["call"], g)
        finally:
            sys.settrace(old)
    except StepLimitExceeded as e:
        return {"passed": False, "actual": "", "error": str(e)}
    except SyntaxError as e:
        return {"passed": False, "actual": "", "error": f"第 {e.lineno} 行语法错误：{e.msg}"}
    except BaseException as e:  # noqa: BLE001
        return {"passed": False, "actual": out.getvalue(),
                "error": format_user_traceback(e, {"solution.py"}).strip()}
    if "call" in case:
        actual = repr(value)
        passed = actual == case["expected"]
    else:
        actual = normalize_output(out.getvalue())
        passed = actual == normalize_output(case["expected"])
    return {"passed": passed, "actual": actual, "error": None}


def judge(source, cases, max_lines=200_000, reveal=True):
    """运行全部用例。reveal=False（考试模式）时不返回期望值与实际输出。"""
    results = []
    for i, case in enumerate(cases):
        r = _run_case(source, case, max_lines)
        item = {"index": i, "passed": r["passed"], "error": r["error"]}
        if reveal and not case.get("hidden"):
            item["input"] = case.get("call", case.get("stdin", ""))
            item["expected"] = case["expected"]
            item["actual"] = r["actual"]
        results.append(item)
    passed = sum(1 for r in results if r["passed"])
    return {"passed": passed, "total": len(results), "all_passed": passed == len(results),
            "results": results}
