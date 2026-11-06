"""Python Nexus 自动判题。

不保存固定参考代码，而是用测试用例检查程序行为：
  - 输入输出题：{"stdin": "...", "expected": "..."}
  - 函数题：    {"call": "add(2, 3)", "expected": "5"}（比较 repr）
每个用例在全新命名空间中运行，并限制执行行数，防止死循环。

扩展题型：
  - 代码填空：代码中不得残留 "____"；
  - 算法题：limits = {"max_lines": 每个用例最多执行行数, "time_ms": 每个用例时间上限}；
  - 流程图 / 结构题：requires = {"loops": 1, "ifs": 1, "recursion": True, "forbid_calls": ["sorted"]}；
  - 模块设计题：requires = {"functions": {"area": ["w", "h"]}, "classes": {"Stack": ["push", "pop"]}}；
  - 随机参数题：random_params() 生成参数，check_random() 用表达式在本地计算正确答案。
"""
import ast
import builtins
import io
import random
import sys
import time
from contextlib import redirect_stderr, redirect_stdout

from nexus_core import StepLimitExceeded, format_user_traceback, make_input

__all__ = ["judge", "expected_for", "normalize_output", "check_structure", "random_params", "render_template", "check_random"]

BLANK = "____"


def normalize_output(text):
    lines = [ln.rstrip() for ln in (text or "").replace("\r\n", "\n").split("\n")]
    while lines and not lines[-1]:
        lines.pop()
    return "\n".join(lines)


def _counting_limiter(max_lines, counter):
    def tracer(frame, event, arg):
        if event == "line":
            counter[0] += 1
            if counter[0] > max_lines:
                raise StepLimitExceeded(f"执行超过 {max_lines} 行，疑似死循环或算法效率过低，已终止")
        return tracer
    return tracer


def _run_case(source, case, max_lines):
    out = io.StringIO()
    g = {"__name__": "__main__", "__builtins__": builtins,
         "input": make_input(case.get("stdin", ""), echo_to=io.StringIO(), interactive=False)}
    counter = [0]
    old = sys.gettrace()
    t0 = time.perf_counter()
    try:
        code = compile(source, "solution.py", "exec")
        sys.settrace(_counting_limiter(max_lines, counter))
        try:
            with redirect_stdout(out), redirect_stderr(out):
                exec(code, g)
                if "call" in case:
                    value = eval(case["call"], g)
        finally:
            sys.settrace(old)
    except StepLimitExceeded as e:
        return {"passed": False, "actual": "", "error": str(e), "lines": counter[0], "ms": _ms(t0)}
    except SyntaxError as e:
        return {"passed": False, "actual": "", "error": f"第 {e.lineno} 行语法错误：{e.msg}", "lines": 0, "ms": 0}
    except BaseException as e:  # noqa: BLE001
        return {"passed": False, "actual": out.getvalue(),
                "error": format_user_traceback(e, {"solution.py"}).strip(), "lines": counter[0], "ms": _ms(t0)}
    ms = _ms(t0)
    if "call" in case:
        actual = repr(value)
        passed = actual == case.get("expected")
    else:
        actual = normalize_output(out.getvalue())
        passed = "expected" in case and actual == normalize_output(case["expected"])
    return {"passed": passed, "actual": actual, "error": None, "lines": counter[0], "ms": ms}


def expected_for(source, case, max_lines=2_000_000):
    """出题工具：用参考解计算用例的期望输出。"""
    r = _run_case(source, {k: v for k, v in case.items() if k != "expected"}, max_lines)
    if r["error"]:
        raise ValueError(f"参考解运行出错：{r['error']}")
    return r["actual"]


def _ms(t0):
    return round((time.perf_counter() - t0) * 1000, 2)


class _Structure(ast.NodeVisitor):
    def __init__(self):
        self.loops = 0
        self.ifs = 0
        self.functions = {}
        self.classes = {}
        self.calls = set()
        self.recursive = set()
        self.tries = 0
        self.comprehensions = 0
        self._fn_stack = []

    def visit_For(self, node):
        self.loops += 1
        self.generic_visit(node)

    visit_While = visit_For
    visit_AsyncFor = visit_For

    def visit_If(self, node):
        self.ifs += 1
        self.generic_visit(node)

    def visit_Try(self, node):
        self.tries += 1
        self.generic_visit(node)

    def visit_ListComp(self, node):
        self.comprehensions += 1
        self.generic_visit(node)

    visit_DictComp = visit_SetComp = visit_GeneratorExp = visit_ListComp

    def visit_FunctionDef(self, node):
        self.functions[node.name] = [a.arg for a in node.args.args]
        self._fn_stack.append(node.name)
        self.generic_visit(node)
        self._fn_stack.pop()

    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_ClassDef(self, node):
        self.classes[node.name] = [m.name for m in node.body if isinstance(m, (ast.FunctionDef, ast.AsyncFunctionDef))]
        self.generic_visit(node)

    def visit_Call(self, node):
        name = node.func.id if isinstance(node.func, ast.Name) else (
            node.func.attr if isinstance(node.func, ast.Attribute) else None)
        if name:
            self.calls.add(name)
            if self._fn_stack and name == self._fn_stack[-1]:
                self.recursive.add(name)
        self.generic_visit(node)


def check_structure(source, requires):
    """检查代码结构是否满足题目要求，返回不满足的条目列表（空列表表示通过）。"""
    if not requires:
        return []
    problems = []
    if BLANK in source:
        problems.append(f"代码中还有未填写的空白 {BLANK}")
    try:
        tree = ast.parse(source)
    except SyntaxError as e:
        return problems + [f"第 {e.lineno} 行语法错误：{e.msg}"]
    s = _Structure()
    s.visit(tree)
    names = {"loops": ("循环", s.loops), "ifs": ("条件判断", s.ifs), "tries": ("try 异常处理", s.tries),
             "comprehensions": ("推导式", s.comprehensions)}
    for key, (label, count) in names.items():
        need = requires.get(key)
        if need and count < need:
            problems.append(f"至少需要 {need} 个{label}，当前 {count} 个")
    if requires.get("recursion") and not s.recursive:
        problems.append("需要使用递归（函数调用自身）")
    if requires.get("no_loops") and s.loops:
        problems.append("本题不允许使用循环")
    for call in requires.get("forbid_calls", []):
        if call in s.calls:
            problems.append(f"本题不允许调用 {call}()")
    for call in requires.get("require_calls", []):
        if call not in s.calls:
            problems.append(f"需要调用 {call}()")
    for name, params in (requires.get("functions") or {}).items():
        if name not in s.functions:
            problems.append(f"缺少函数 {name}({', '.join(params)})")
        elif params is not None and s.functions[name] != params:
            problems.append(f"函数签名应为 {name}({', '.join(params)})，当前为 {name}({', '.join(s.functions[name])})")
    for name, methods in (requires.get("classes") or {}).items():
        if name not in s.classes:
            problems.append(f"缺少类 {name}")
            continue
        missing = [m for m in methods if m not in s.classes[name]]
        if missing:
            problems.append(f"类 {name} 缺少方法：{', '.join(missing)}")
    return problems


def judge(source, cases, max_lines=200_000, reveal=True, requires=None, limits=None):
    """运行全部用例。reveal=False（考试模式）时不返回期望值与实际输出。"""
    limits = limits or {}
    structure = check_structure(source, requires) if requires or BLANK in source else []
    if BLANK in source and not structure:
        structure = [f"代码中还有未填写的空白 {BLANK}"]
    line_budget = limits.get("max_lines", max_lines)
    results = []
    for i, case in enumerate(cases):
        r = _run_case(source, case, line_budget)
        if r["passed"] and limits.get("time_ms") and r["ms"] > limits["time_ms"]:
            r["passed"] = False
            r["error"] = f"运行时间 {r['ms']} ms 超过限制 {limits['time_ms']} ms"
        item = {"index": i, "passed": r["passed"], "error": r["error"], "lines": r["lines"], "ms": r["ms"]}
        if reveal and not case.get("hidden"):
            item["input"] = case.get("call", case.get("stdin", ""))
            item["expected"] = case["expected"]
            item["actual"] = r["actual"]
        results.append(item)
    passed = sum(1 for r in results if r["passed"])
    return {"passed": passed, "total": len(results),
            "all_passed": passed == len(results) and not structure,
            "structure": structure, "results": results,
            "total_lines": sum(r["lines"] for r in results)}


# ---------------------------------------------------------------------------- 随机参数题
def random_params(spec, seed=None):
    """按规格生成参数：{"a": [1, 9]} 整数区间，{"op": ["+", "-"]} 列表任选，{"n": {"choice": [...]}}。"""
    rng = random.Random(seed)
    params = {}
    for name, rule in spec.items():
        if isinstance(rule, list) and len(rule) == 2 and all(isinstance(x, int) for x in rule):
            params[name] = rng.randint(rule[0], rule[1])
        elif isinstance(rule, list):
            params[name] = rng.choice(rule)
        elif isinstance(rule, dict) and "choice" in rule:
            params[name] = rng.choice(rule["choice"])
        else:
            params[name] = rule
    return params


def render_template(template, params):
    return template.format(**params)


_SAFE_BUILTINS = {n: getattr(builtins, n) for n in (
    "abs", "len", "list", "range", "sum", "min", "max", "sorted", "str", "int", "float", "round",
    "repr", "tuple", "set", "dict", "bool", "divmod", "pow", "reversed", "enumerate", "zip", "map")}


def check_random(expr, params, answer):
    """用表达式在本地计算正确答案并与学生答案比较（规范化后比较字符串）。"""
    from unicodedata import normalize as _nfkc

    value = eval(expr, {"__builtins__": _SAFE_BUILTINS}, dict(params))  # noqa: S307 - 题库作者提供的表达式

    def norm(x):
        return " ".join(_nfkc("NFKC", str(x)).strip().lower().split()).replace(" ,", ",").replace(", ", ",")

    answer = str(answer).strip()
    if isinstance(value, str) and len(answer) >= 2 and answer[0] == answer[-1] and answer[0] in "'\"":
        answer = answer[1:-1]  # 字符串答案允许带引号
    correct = norm(value if isinstance(value, str) else repr(value)) == norm(answer)
    return {"correct": correct}
