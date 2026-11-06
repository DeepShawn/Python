"""Python Nexus 流程图生成器。

使用 ast 模块把源代码转换为结构化控制流树，前端据此绘制 SVG 流程图；
同时可导出 Mermaid 文本，并生成函数调用图与模块导入关系。
"""
import ast

__all__ = ["build_flow", "to_mermaid", "call_graph", "import_graph", "analyze"]

MAX_TEXT = 48


def _src(node, source):
    try:
        text = ast.get_source_segment(source, node) or ast.unparse(node)
    except Exception:  # noqa: BLE001
        text = ast.unparse(node)
    text = " ".join(text.split())
    if len(text) > MAX_TEXT:
        text = text[: MAX_TEXT - 1] + "…"
    return text


def _is_call_to(node, names):
    return (isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
            and node.func.id in names)


def _contains_input(node):
    return any(_is_call_to(n, {"input"}) for n in ast.walk(node))


class _Builder:
    def __init__(self, source):
        self.source = source
        self.functions = []

    def block(self, stmts):
        nodes = []
        for s in stmts:
            nodes.extend(self.stmt(s))
        return nodes

    def stmt(self, s):
        src = self.source
        ln = getattr(s, "lineno", None)
        if isinstance(s, ast.If):
            return [self._if(s)]
        if isinstance(s, (ast.For, ast.AsyncFor)):
            cond = f"遍历 {_src(s.target, src)} ∈ {_src(s.iter, src)}"
            return [{"type": "loop", "kind": "for", "text": cond, "line": ln,
                     "body": self.block(s.body), "orelse": self.block(s.orelse)}]
        if isinstance(s, ast.While):
            return [{"type": "loop", "kind": "while", "text": _src(s.test, src) + " ?",
                     "line": ln, "body": self.block(s.body), "orelse": self.block(s.orelse)}]
        if isinstance(s, (ast.FunctionDef, ast.AsyncFunctionDef)):
            args = ", ".join(a.arg for a in s.args.args)
            self.functions.append({
                "name": s.name, "args": args, "line": ln,
                "body": self.block(s.body),
            })
            return [{"type": "process", "text": f"定义函数 {s.name}({args})", "line": ln}]
        if isinstance(s, ast.ClassDef):
            for item in s.body:
                if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    args = ", ".join(a.arg for a in item.args.args)
                    self.functions.append({
                        "name": f"{s.name}.{item.name}", "args": args,
                        "line": item.lineno, "body": self.block(item.body),
                    })
            return [{"type": "process", "text": f"定义类 {s.name}", "line": ln}]
        if isinstance(s, ast.Return):
            text = "返回 " + _src(s.value, src) if s.value is not None else "返回"
            return [{"type": "return", "text": text, "line": ln}]
        if isinstance(s, ast.Break):
            return [{"type": "jump", "kind": "break", "text": "break 跳出循环", "line": ln}]
        if isinstance(s, ast.Continue):
            return [{"type": "jump", "kind": "continue", "text": "continue 下一轮", "line": ln}]
        if isinstance(s, (ast.Try,) + ((ast.TryStar,) if hasattr(ast, "TryStar") else ())):
            groups = [{"type": "group", "text": "try 尝试执行", "line": ln,
                       "body": self.block(s.body)}]
            for h in s.handlers:
                name = _src(h.type, src) if h.type is not None else "任意异常"
                groups.append({"type": "group", "text": f"except {name}", "line": h.lineno,
                               "body": self.block(h.body)})
            if s.orelse:
                groups.append({"type": "group", "text": "else 无异常时", "line": ln,
                               "body": self.block(s.orelse)})
            if s.finalbody:
                groups.append({"type": "group", "text": "finally 最终执行", "line": ln,
                               "body": self.block(s.finalbody)})
            return groups
        if isinstance(s, (ast.With, ast.AsyncWith)):
            items = ", ".join(_src(i, src) for i in s.items)
            return [{"type": "group", "text": f"with {items}", "line": ln,
                     "body": self.block(s.body)}]
        if isinstance(s, ast.Match):
            return [self._match(s)]
        if isinstance(s, (ast.Import, ast.ImportFrom)):
            return [{"type": "process", "text": _src(s, src), "line": ln}]
        if isinstance(s, ast.Expr) and _is_call_to(s.value, {"print"}):
            args = ", ".join(_src(a, src) for a in s.value.args)
            return [{"type": "io", "text": f"输出 {args}", "line": ln}]
        if isinstance(s, ast.Pass):
            return [{"type": "process", "text": "pass（空操作）", "line": ln}]
        if _contains_input(s):
            if isinstance(s, (ast.Assign, ast.AnnAssign)):
                targets = s.targets if isinstance(s, ast.Assign) else [s.target]
                names = ", ".join(_src(t, src) for t in targets)
                return [{"type": "io", "text": f"输入 {names}", "line": ln}]
            return [{"type": "io", "text": _src(s, src), "line": ln}]
        return [{"type": "process", "text": _src(s, src), "line": ln}]

    def _if(self, s):
        node = {"type": "if", "text": _src(s.test, self.source) + " ?", "line": s.lineno,
                "yes": self.block(s.body), "no": []}
        if len(s.orelse) == 1 and isinstance(s.orelse[0], ast.If):
            node["no"] = [self._if(s.orelse[0])]  # elif
        else:
            node["no"] = self.block(s.orelse)
        return node

    def _match(self, s):
        subject = _src(s.subject, self.source)
        tail = []
        for case in reversed(s.cases):
            pattern = _src(case.pattern, self.source)
            node = {"type": "if", "text": f"{subject} 匹配 {pattern} ?", "line": case.pattern.lineno,
                    "yes": self.block(case.body), "no": tail}
            tail = [node]
        return tail[0] if tail else {"type": "process", "text": f"match {subject}", "line": s.lineno}


def build_flow(source):
    """返回 {"main": [...], "functions": [...]} 结构化流程树。"""
    tree = ast.parse(source)
    b = _Builder(source)
    main = b.block(tree.body)
    return {"main": main, "functions": b.functions}


def _mermaid_text(text):
    return text.replace('"', "#quot;").replace("<", "#lt;").replace(">", "#gt;")


def to_mermaid(flow):
    """把结构化流程树转换为 Mermaid flowchart 文本。"""
    lines = ["flowchart TD"]
    counter = [0]

    def new_id():
        counter[0] += 1
        return f"n{counter[0]}"

    def node(shape, text):
        nid = new_id()
        t = _mermaid_text(text)
        fmt = {
            "term": '{id}(["{t}"])',
            "process": '{id}["{t}"]',
            "io": '{id}[/"{t}"/]',
            "cond": '{id}{{"{t}"}}',
            "group": '{id}[["{t}"]]',
        }[shape]
        lines.append("    " + fmt.format(id=nid, t=t))
        return nid

    def connect(preds, nid):
        for pid, label in preds:
            if label:
                lines.append(f"    {pid} -->|{label}| {nid}")
            else:
                lines.append(f"    {pid} --> {nid}")

    def seq(stmts, preds, ctx):
        for s in stmts:
            preds = one(s, preds, ctx)
        return preds

    def one(s, preds, ctx):
        t = s["type"]
        if t in ("process", "io"):
            nid = node(t, s["text"])
            connect(preds, nid)
            return [(nid, "")]
        if t == "group":
            nid = node("group", s["text"])
            connect(preds, nid)
            return seq(s["body"], [(nid, "")], ctx)
        if t == "return":
            nid = node("process", s["text"])
            connect(preds, nid)
            ctx["returns"].append((nid, ""))
            return []
        if t == "jump":
            if not ctx["loops"]:
                nid = node("process", s["text"])
                connect(preds, nid)
                return [(nid, "")]
            loop = ctx["loops"][-1]
            if s["kind"] == "break":
                loop["breaks"].extend(preds)
            else:
                connect(preds, loop["cond"])
            return []
        if t == "if":
            c = node("cond", s["text"])
            connect(preds, c)
            yes = seq(s["yes"], [(c, "是")], ctx)
            no = seq(s["no"], [(c, "否")], ctx) if s["no"] else [(c, "否")]
            return yes + no
        if t == "loop":
            c = node("cond", s["text"])
            connect(preds, c)
            loop = {"cond": c, "breaks": []}
            ctx["loops"].append(loop)
            body = seq(s["body"], [(c, "是")], ctx)
            ctx["loops"].pop()
            connect(body, c)
            exits = [(c, "否")]
            if s.get("orelse"):
                exits = seq(s["orelse"], exits, ctx)
            return exits + loop["breaks"]
        raise ValueError(f"未知节点类型 {t}")

    def chart(title, body):
        ctx = {"loops": [], "returns": []}
        start = node("term", title)
        ends = seq(body, [(start, "")], ctx)
        end = node("term", "结束")
        connect(ends + ctx["returns"], end)

    chart("开始", flow["main"])
    for fn in flow["functions"]:
        lines.append(f"    subgraph fn_{counter[0]}[\"函数 {_mermaid_text(fn['name'])}\"]")
        chart(f"{fn['name']}({fn['args']})", fn["body"])
        lines.append("    end")
    return "\n".join(lines)


def call_graph(source):
    """函数调用关系：{调用者: [被调用者...]}，只统计本文件中定义的函数与类。"""
    tree = ast.parse(source)
    defined = {n.name for n in ast.walk(tree)
               if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))}
    graph = {}

    def visit(scope_name, body_nodes):
        calls = graph.setdefault(scope_name, [])
        for stmt in body_nodes:
            for n in ast.walk(stmt):
                if isinstance(n, ast.Call):
                    name = None
                    if isinstance(n.func, ast.Name):
                        name = n.func.id
                    elif isinstance(n.func, ast.Attribute):
                        name = n.func.attr
                    if name in defined and name not in calls:
                        calls.append(name)

    top_level = [s for s in tree.body
                 if not isinstance(s, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef))]
    visit("<module>", top_level)
    for n in ast.walk(tree):
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
            visit(n.name, n.body)
    return graph


def import_graph(files):
    """模块依赖：files 为 {文件名: 源码}，返回 {文件名: [导入的模块名...]}。"""
    result = {}
    for name, source in files.items():
        if not name.endswith(".py"):
            continue
        mods = []
        try:
            tree = ast.parse(source)
        except SyntaxError:
            result[name] = ["<语法错误>"]
            continue
        for n in ast.walk(tree):
            if isinstance(n, ast.Import):
                mods.extend(a.name for a in n.names)
            elif isinstance(n, ast.ImportFrom):
                mods.append("." * n.level + (n.module or ""))
        result[name] = sorted(set(mods))
    return result


def analyze(source, files=None):
    """一次性返回流程图、Mermaid 文本、调用图、导入图。语法错误时返回错误信息。"""
    try:
        flow = build_flow(source)
    except SyntaxError as e:
        return {"ok": False, "error": f"第 {e.lineno} 行语法错误：{e.msg}"}
    return {
        "ok": True,
        "flow": flow,
        "mermaid": to_mermaid(flow),
        "calls": call_graph(source),
        "imports": import_graph(files or {}),
    }
