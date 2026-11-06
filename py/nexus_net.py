"""Python Nexus 离线网络：爬虫课程用的虚拟网站。

严格离线模式下不访问互联网。本模块内置一个教学网站 http://nexus.local，包含：

    /                       首页（导航链接）
    /news?page=N            新闻列表（分页，每页 4 条）
    /news/<id>              文章详情
    /products               商品表格（HTML table）
    /api/products?page=N    商品 JSON 接口（分页）
    /login                  登录表单（GET）/ 登录（POST username、password）
    /profile                需要登录 Cookie 的个人主页
    /robots.txt

三种访问方式（同一套路由，保证三端行为一致）：
  1. 浏览器 / Android（Pyodide）：install() 注册一个与 requests 兼容的模块；
  2. Windows / 桌面：若已安装真实 requests，patch_real_requests() 把 nexus.local 的请求就地应答；
  3. 桌面端可调用 serve() 在 127.0.0.1 启动真实 HTTP 服务，练习真正的网络请求。
"""
import html
import json
import sys
import types
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlencode, urlsplit

__all__ = ["HOST", "BASE", "handle", "Response", "Session", "get", "post", "request",
           "install", "patch_real_requests", "serve", "HTTPError", "RequestException"]

HOST = "nexus.local"
BASE = f"http://{HOST}"
TOKEN = "nexus-session-7f3a"
USERS = {"student": "python123"}

NEWS = [
    {"id": i, "title": t, "author": a, "date": f"2026-0{1 + i % 9}-{10 + i:02d}", "views": 120 + i * 37,
     "body": b}
    for i, (t, a, b) in enumerate([
        ("Python Nexus 离线 IDE 发布", "编辑部", "全平台离线 Python 学习与开发系统正式发布，支持网页、Windows 与 Android。"),
        ("流程图功能上线", "产品组", "一键把 Python 代码转换为流程图，并在调试时高亮实际执行路径。"),
        ("三种沉浸式主题", "设计组", "普通、科幻、黑客三种风格，让代码运行过程更直观。"),
        ("逐行执行动画原理", "技术组", "基于 sys.settrace 记录真实执行事件，循环与递归都能正确回放。"),
        ("如何写好单元测试", "教研组", "测试应该覆盖正常输入、边界条件和异常情况。"),
        ("列表推导式入门", "教研组", "列表推导式可以用一行代码生成新列表：[x * 2 for x in data]。"),
        ("字典的常见用法", "教研组", "dict.get、setdefault 与 collections.Counter 是统计数据的利器。"),
        ("异常处理最佳实践", "技术组", "只捕获你能处理的异常，并保留有用的错误信息。"),
        ("认识生成器", "教研组", "生成器按需产生数据，可以处理很大的数据流而不占用大量内存。"),
        ("爬虫的礼仪", "编辑部", "遵守 robots.txt，控制请求频率，尊重网站的服务条款。"),
    ], start=1)
]
PAGE_SIZE = 4
PRODUCTS = [
    {"id": i, "name": n, "price": p, "stock": s, "category": c}
    for i, (n, p, s, c) in enumerate([
        ("机械键盘", 399.0, 12, "外设"), ("无线鼠标", 129.0, 30, "外设"), ("显示器支架", 89.5, 0, "配件"),
        ("USB-C 扩展坞", 259.0, 8, "配件"), ("降噪耳机", 899.0, 5, "音频"), ("蓝牙音箱", 199.0, 17, "音频"),
        ("笔记本电脑包", 159.0, 22, "配件"), ("4K 摄像头", 499.0, 3, "外设"), ("桌面麦克风", 329.0, 9, "音频"),
        ("散热底座", 69.0, 40, "配件"), ("绘图板", 459.0, 6, "外设"), ("移动硬盘 1TB", 379.0, 14, "存储"),
    ], start=1)
]


def _page(title, body):
    return (f"<!doctype html>\n<html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><title>{html.escape(title)}</title></head>"
            f"<body>\n<nav><a href=\"/\">首页</a> | <a href=\"/news\">新闻</a> | <a href=\"/products\">商品</a> | "
            f"<a href=\"/login\">登录</a></nav>\n<main>\n{body}\n</main>\n</body></html>\n")


def _html(text, status=200, headers=None):
    h = {"Content-Type": "text/html; charset=utf-8"}
    h.update(headers or {})
    return status, h, text.encode("utf-8")


def _json(obj, status=200):
    return status, {"Content-Type": "application/json; charset=utf-8"}, json.dumps(obj, ensure_ascii=False).encode("utf-8")


def _cookies(headers):
    raw = ""
    for k, v in (headers or {}).items():
        if k.lower() == "cookie":
            raw = v
    out = {}
    for part in raw.split(";"):
        if "=" in part:
            k, v = part.strip().split("=", 1)
            out[k] = v
    return out


def handle(method, url, headers=None, body=b""):
    """虚拟网站路由：返回 (状态码, 响应头 dict, 响应体 bytes)。"""
    parts = urlsplit(url if "://" in url else BASE + url)
    path = parts.path.rstrip("/") or "/"
    query = {k: v[-1] for k, v in parse_qs(parts.query).items()}
    method = method.upper()

    if path == "/robots.txt":
        return 200, {"Content-Type": "text/plain; charset=utf-8"}, b"User-agent: *\nDisallow: /profile\nCrawl-delay: 1\n"
    if path == "/":
        return _html(_page("Nexus 教学网站", "<h1>欢迎来到 Nexus 教学网站</h1>\n"
                           "<p class=\"intro\">这是一个完全离线的爬虫练习网站。</p>\n"
                           "<ul id=\"menu\"><li><a href=\"/news\">新闻列表</a></li>"
                           "<li><a href=\"/products\">商品表格</a></li>"
                           "<li><a href=\"/api/products\">商品 JSON 接口</a></li></ul>"))
    if path == "/news":
        try:
            page = max(1, int(query.get("page", 1)))
        except ValueError:
            return _html(_page("参数错误", "<p>page 必须是整数</p>"), 400)
        pages = (len(NEWS) + PAGE_SIZE - 1) // PAGE_SIZE
        if page > pages:
            return _html(_page("页面不存在", "<p>没有更多新闻了</p>"), 404)
        items = NEWS[(page - 1) * PAGE_SIZE: page * PAGE_SIZE]
        rows = "\n".join(
            f"<li class=\"news-item\" data-id=\"{n['id']}\"><a class=\"title\" href=\"/news/{n['id']}\">{html.escape(n['title'])}</a>"
            f" <span class=\"author\">{n['author']}</span> <span class=\"date\">{n['date']}</span>"
            f" <span class=\"views\">{n['views']}</span></li>" for n in items)
        nav = []
        if page > 1:
            nav.append(f"<a class=\"prev\" href=\"/news?page={page - 1}\">上一页</a>")
        nav.append(f"<span class=\"current\">第 {page} / {pages} 页</span>")
        if page < pages:
            nav.append(f"<a class=\"next\" href=\"/news?page={page + 1}\">下一页</a>")
        return _html(_page(f"新闻列表 - 第 {page} 页",
                           f"<h1>新闻列表</h1>\n<ul id=\"news\">\n{rows}\n</ul>\n<div class=\"pager\">{' '.join(nav)}</div>"))
    if path.startswith("/news/"):
        try:
            n = NEWS[int(path.split("/")[2]) - 1]
        except (ValueError, IndexError):
            return _html(_page("页面不存在", "<p>文章不存在</p>"), 404)
        return _html(_page(n["title"], f"<article id=\"article\" data-id=\"{n['id']}\"><h1>{html.escape(n['title'])}</h1>"
                           f"<p class=\"meta\">作者：<span class=\"author\">{n['author']}</span> · "
                           f"<time>{n['date']}</time> · 阅读 <span class=\"views\">{n['views']}</span></p>"
                           f"<div class=\"content\"><p>{html.escape(n['body'])}</p></div></article>"))
    if path == "/products":
        rows = "\n".join(
            f"<tr><td>{p['id']}</td><td class=\"name\">{p['name']}</td><td class=\"price\">{p['price']:.2f}</td>"
            f"<td class=\"stock\">{p['stock']}</td><td>{p['category']}</td></tr>" for p in PRODUCTS)
        return _html(_page("商品表格", "<h1>商品</h1>\n<table id=\"products\">\n"
                           "<thead><tr><th>编号</th><th>名称</th><th>价格</th><th>库存</th><th>分类</th></tr></thead>\n"
                           f"<tbody>\n{rows}\n</tbody>\n</table>"))
    if path == "/api/products":
        try:
            page = max(1, int(query.get("page", 1)))
            size = min(10, max(1, int(query.get("size", 5))))
        except ValueError:
            return _json({"error": "page 和 size 必须是整数"}, 400)
        category = query.get("category")
        data = [p for p in PRODUCTS if not category or p["category"] == category]
        total = len(data)
        items = data[(page - 1) * size: page * size]
        return _json({"page": page, "size": size, "total": total,
                      "has_next": page * size < total, "items": items})
    if path == "/login":
        if method == "GET":
            return _html(_page("登录", "<form id=\"login\" method=\"post\" action=\"/login\">"
                               "<input name=\"username\"> <input name=\"password\" type=\"password\">"
                               "<button>登录</button></form><p class=\"hint\">测试账号 student / python123</p>"))
        form = {k: v[-1] for k, v in parse_qs(body.decode("utf-8") if isinstance(body, bytes) else body or "").items()}
        if USERS.get(form.get("username")) == form.get("password"):
            return _html(_page("登录成功", "<p class=\"ok\">登录成功</p><a href=\"/profile\">个人主页</a>"),
                         200, {"Set-Cookie": f"session={TOKEN}; Path=/"})
        return _html(_page("登录失败", "<p class=\"error\">用户名或密码错误</p>"), 401)
    if path == "/profile":
        if _cookies(headers).get("session") != TOKEN:
            return _html(_page("未登录", "<p class=\"error\">请先登录</p>"), 403)
        return _html(_page("个人主页", "<h1>student 的主页</h1><ul id=\"courses\"><li>Python 基础</li>"
                           "<li>函数编程</li><li>爬虫实战</li></ul>"))
    return _html(_page("404", "<h1>404 Not Found</h1>"), 404)


# ---------------------------------------------------------------------------- requests 兼容层
class RequestException(Exception):
    pass


class HTTPError(RequestException):
    def __init__(self, msg, response=None):
        super().__init__(msg)
        self.response = response


class ConnectionError(RequestException):  # noqa: A001 - 与 requests 同名
    pass


class Response:
    def __init__(self, url, status, headers, content):
        self.url = url
        self.status_code = status
        self.headers = headers
        self.content = content
        self.encoding = "utf-8"
        self.cookies = {}
        sc = headers.get("Set-Cookie")
        if sc:
            k, v = sc.split(";", 1)[0].split("=", 1)
            self.cookies[k.strip()] = v.strip()

    @property
    def ok(self):
        return self.status_code < 400

    @property
    def text(self):
        return self.content.decode(self.encoding or "utf-8", errors="replace")

    def json(self):
        return json.loads(self.text)

    def raise_for_status(self):
        if self.status_code >= 400:
            raise HTTPError(f"{self.status_code} Error for url: {self.url}", response=self)

    def __repr__(self):
        return f"<Response [{self.status_code}]>"


def _build_url(url, params):
    if params:
        sep = "&" if "?" in url else "?"
        url = url + sep + urlencode(params)
    return url


class Session:
    def __init__(self):
        self.cookies = {}
        self.headers = {"User-Agent": "python-nexus-requests/1.0"}

    def request(self, method, url, params=None, data=None, json=None, headers=None, cookies=None, timeout=None, **_):
        url = _build_url(url, params)
        host = urlsplit(url).hostname
        if host != HOST:
            raise ConnectionError(f"离线模式：只能访问教学网站 {BASE}，无法连接 {host}")
        h = dict(self.headers)
        h.update(headers or {})
        jar = dict(self.cookies)
        jar.update(cookies or {})
        if jar:
            h["Cookie"] = "; ".join(f"{k}={v}" for k, v in jar.items())
        body = b""
        if json is not None:
            import json as _json_mod
            body = _json_mod.dumps(json).encode("utf-8")
            h["Content-Type"] = "application/json"
        elif isinstance(data, dict):
            body = urlencode(data).encode("utf-8")
            h["Content-Type"] = "application/x-www-form-urlencoded"
        elif data:
            body = data.encode("utf-8") if isinstance(data, str) else data
        status, rh, content = handle(method, url, h, body)
        resp = Response(url, status, rh, content)
        self.cookies.update(resp.cookies)
        return resp

    def get(self, url, **kw):
        return self.request("GET", url, **kw)

    def post(self, url, data=None, json=None, **kw):
        return self.request("POST", url, data=data, json=json, **kw)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def request(method, url, **kw):
    return Session().request(method, url, **kw)


def get(url, **kw):
    return request("GET", url, **kw)


def post(url, data=None, json=None, **kw):
    return request("POST", url, data=data, json=json, **kw)


def install(force=False):
    """在没有真实 requests 的环境（Pyodide）中注册兼容模块；已安装真实 requests 时改为就地拦截。"""
    if not force:
        try:
            import requests  # noqa: F401
            return patch_real_requests()
        except ImportError:
            pass
    mod = types.ModuleType("requests")
    mod.__doc__ = "Python Nexus 离线 requests 兼容模块（只能访问 http://nexus.local）"
    for name in ("get", "post", "request", "Session", "Response", "HTTPError", "RequestException", "ConnectionError"):
        setattr(mod, name, globals()[name])
    mod.exceptions = types.SimpleNamespace(HTTPError=HTTPError, RequestException=RequestException,
                                           ConnectionError=ConnectionError)
    mod.__version__ = "nexus-offline"
    sys.modules["requests"] = mod
    return "shim"


def patch_real_requests():
    """桌面端：保留真实 requests，只把发往 nexus.local 的请求交给虚拟网站应答。"""
    import requests
    from requests.adapters import HTTPAdapter

    if getattr(HTTPAdapter.send, "_nexus", False):
        return "patched"
    original = HTTPAdapter.send

    def send(self, req, **kw):
        if urlsplit(req.url).hostname != HOST:
            return original(self, req, **kw)
        body = req.body or b""
        status, headers, content = handle(req.method, req.url, dict(req.headers), body)
        resp = requests.Response()
        resp.status_code = status
        resp.headers.update(headers)
        resp._content = content
        resp.url = req.url
        resp.request = req
        resp.encoding = "utf-8"
        if "Set-Cookie" in headers:
            k, v = headers["Set-Cookie"].split(";", 1)[0].split("=", 1)
            resp.cookies.set(k, v)
        return resp

    send._nexus = True
    HTTPAdapter.send = send
    return "patched"


def serve(port=8808, host="127.0.0.1"):
    """启动真实的本机 HTTP 服务（仅桌面端可用），返回 (server, 根地址)。在后台线程中运行。"""
    import threading

    class Handler(BaseHTTPRequestHandler):
        def _go(self, method):
            length = int(self.headers.get("Content-Length") or 0)
            body = self.rfile.read(length) if length else b""
            status, headers, content = handle(method, self.path, dict(self.headers), body)
            self.send_response(status)
            for k, v in headers.items():
                self.send_header(k, v)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)

        def do_GET(self):  # noqa: N802
            self._go("GET")

        def do_POST(self):  # noqa: N802
            self._go("POST")

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer((host, port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server, f"http://{host}:{server.server_address[1]}"
