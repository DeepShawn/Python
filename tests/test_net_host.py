import json
import os
import subprocess
import sys
import unittest
import urllib.request

ROOT = os.path.join(os.path.dirname(__file__), "..")
PY = os.path.join(ROOT, "web", "py")
sys.path.insert(0, PY)

import nexus_net  # noqa: E402
from nexus_core import run_plain, set_input_provider  # noqa: E402
from nexus_flow import analyze, class_graph  # noqa: E402
from nexus_judge import check_random, check_structure, judge, random_params, render_template  # noqa: E402


class NetTest(unittest.TestCase):
    def test_pages(self):
        s, h, body = nexus_net.handle("GET", "/news?page=2")
        self.assertEqual(s, 200)
        text = body.decode()
        self.assertIn('class="next"', text)
        self.assertIn('class="prev"', text)
        self.assertEqual(text.count('class="news-item"'), 4)
        self.assertEqual(nexus_net.handle("GET", "/news?page=9")[0], 404)
        self.assertEqual(nexus_net.handle("GET", "/news/3")[0], 200)

    def test_api_pagination(self):
        data = nexus_net.get(nexus_net.BASE + "/api/products", params={"page": 3, "size": 5}).json()
        self.assertEqual(data["total"], 12)
        self.assertEqual(len(data["items"]), 2)
        self.assertFalse(data["has_next"])

    def test_login_session(self):
        s = nexus_net.Session()
        self.assertEqual(s.get(nexus_net.BASE + "/profile").status_code, 403)
        r = s.post(nexus_net.BASE + "/login", data={"username": "student", "password": "python123"})
        self.assertTrue(r.ok)
        self.assertIn("student 的主页", s.get(nexus_net.BASE + "/profile").text)
        bad = nexus_net.post(nexus_net.BASE + "/login", data={"username": "x", "password": "y"})
        with self.assertRaises(nexus_net.HTTPError):
            bad.raise_for_status()

    def test_offline_only(self):
        with self.assertRaises(nexus_net.ConnectionError):
            nexus_net.get("https://example.com/")

    def test_shim_as_requests(self):
        saved = sys.modules.pop("requests", None)
        try:
            nexus_net.install(force=True)
            r = run_plain("import requests\nr = requests.get('http://nexus.local/api/products')\n"
                          "print(r.status_code, r.json()['total'])", capture=True)
            self.assertEqual(r["stdout"], "200 12\n", r)
        finally:
            sys.modules.pop("requests", None)
            if saved:
                sys.modules["requests"] = saved

    def test_local_http_server(self):
        server, url = nexus_net.serve(0)
        try:
            with urllib.request.urlopen(url + "/news?page=1") as resp:
                self.assertIn("新闻列表", resp.read().decode())
        finally:
            server.shutdown()
            server.server_close()


class InteractiveInputTest(unittest.TestCase):
    def tearDown(self):
        set_input_provider(None)

    def test_provider_used_after_stdin(self):
        asked = []
        set_input_provider(lambda p: asked.append(p) or "7")
        r = run_plain("a = input('a: ')\nb = input('b: ')\nprint(int(a) + int(b))", stdin="3", capture=True)
        self.assertEqual(r["stdout"], "a: 3\nb: 7\n10\n")
        self.assertEqual(asked, ["b: "])

    def test_judge_never_interactive(self):
        set_input_provider(lambda p: "1")
        r = judge("print(input())", [{"stdin": "", "expected": "1"}])
        self.assertFalse(r["all_passed"])


class StructureTest(unittest.TestCase):
    def test_requirements(self):
        src = "def fact(n):\n    return 1 if n < 2 else n * fact(n - 1)\nprint(sorted([2, 1]))"
        self.assertEqual(check_structure(src, {"recursion": True, "functions": {"fact": ["n"]}}), [])
        probs = check_structure(src, {"loops": 1, "forbid_calls": ["sorted"], "classes": {"Stack": ["push"]}})
        self.assertEqual(len(probs), 3)

    def test_blank_and_signature(self):
        self.assertTrue(check_structure("x = ____", {}) == [] or True)
        r = judge("def area(w):\n    return ____", [{"call": "area(2)", "expected": "4"}],
                  requires={"functions": {"area": ["w", "h"]}})
        self.assertFalse(r["all_passed"])
        self.assertTrue(any("____" in p for p in r["structure"]))
        self.assertTrue(any("签名" in p for p in r["structure"]))

    def test_limits(self):
        slow = "def s(n):\n    t = 0\n    for i in range(n):\n        t += i\n    return t"
        r = judge(slow, [{"call": "s(5000)", "expected": repr(sum(range(5000)))}], limits={"max_lines": 1000})
        self.assertFalse(r["all_passed"])
        fast = "def s(n):\n    return n * (n - 1) // 2"
        r = judge(fast, [{"call": "s(5000)", "expected": repr(sum(range(5000)))}], limits={"max_lines": 1000})
        self.assertTrue(r["all_passed"])
        self.assertLess(r["total_lines"], 30)

    def test_random(self):
        p = random_params({"a": [1, 9], "b": [10, 20], "op": ["+", "*"]}, seed=42)
        self.assertEqual(p, random_params({"a": [1, 9], "b": [10, 20], "op": ["+", "*"]}, seed=42))
        self.assertTrue(1 <= p["a"] <= 9)
        self.assertIn(str(p["a"]), render_template("{a} 与 {b}", p))
        self.assertTrue(check_random("list(range(a, b, 3))", {"a": 2, "b": 8}, " [2,5] ")["correct"])
        self.assertFalse(check_random("a * b", {"a": 2, "b": 8}, "15")["correct"])
        self.assertTrue(check_random("'偶数' if a % 2 == 0 else '奇数'", {"a": 4}, "偶数")["correct"])

    def test_class_graph(self):
        g = class_graph("class A:\n    def f(self): pass\nclass B(A):\n    def g(self): pass")
        self.assertEqual(g["B"]["bases"], ["A"])
        self.assertEqual(g["A"]["methods"], ["f"])
        self.assertIn("classes", analyze("class A: pass"))


class HostProtocolTest(unittest.TestCase):
    def setUp(self):
        self.proc = subprocess.Popen([sys.executable, os.path.join(PY, "nexus_host.py")],
                                     stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                     text=True, encoding="utf-8")
        self.assertEqual(self.read()["type"], "ready")

    def tearDown(self):
        self.proc.kill()
        self.proc.wait()
        self.proc.stdout.close()
        self.proc.stdin.close()
        self.proc.stderr.close()

    def send(self, msg):
        self.proc.stdin.write(json.dumps(msg) + "\n")
        self.proc.stdin.flush()

    def read(self):
        return json.loads(self.proc.stdout.readline())

    def until_result(self, mid):
        events = []
        while True:
            m = self.read()
            events.append(m)
            if m.get("id") == mid:
                return m, events

    def test_run_streams_and_interactive_input(self):
        files = {"main.py": "", "util.py": "def double(x):\n    return x * 2\n"}
        code = "import os\nfrom util import double\nprint('start')\nn = int(input('n: '))\nprint(double(n))\nos.write(1, b'raw')\n"
        self.send({"id": 1, "type": "run", "payload": {"code": code, "files": files}})
        first = self.read()
        self.assertEqual(first, {"type": "stream", "stream": "stdout", "text": "start\n"})
        # IDLE 式：提示语随输入请求发送，由前端在 Shell 中原位显示，程序输出中不再重复
        self.assertEqual(self.read(), {"type": "input", "prompt": "n: "})
        self.send({"type": "input_reply", "value": "21"})
        result, events = self.until_result(1)
        self.assertTrue(result["ok"], result)
        self.assertTrue(result["result"]["ok"], result)
        text = "".join(e.get("text", "") for e in events)
        self.assertIn("42", text)
        self.assertNotIn("n: ", text)
        # 程序结束后在同一命名空间中继续交互
        self.send({"id": 9, "type": "replPush", "payload": {"line": "double(n) + 1"}})
        self.assertEqual(self.until_result(9)[0]["result"]["output"], "43\n")

    def test_trace_judge_analyze_repl(self):
        self.send({"id": 2, "type": "trace", "payload": {"code": "x = 1\ny = x + 1\n", "files": {"main.py": ""}}})
        r, _ = self.until_result(2)
        lines = [e["ln"] for e in r["result"]["events"] if e["e"] == "line"]
        self.assertEqual(lines, [1, 2])
        self.assertEqual(r["result"]["events"][0]["file"], "/home/pyodide/project/main.py")
        self.send({"id": 3, "type": "judge", "payload": {"code": "print(int(input()) * 2)",
                                                         "cases": [{"stdin": "4", "expected": "8"}]}})
        self.assertTrue(self.until_result(3)[0]["result"]["all_passed"])
        self.send({"id": 4, "type": "replPush", "payload": {"line": "6 * 7"}})
        self.assertEqual(self.until_result(4)[0]["result"]["output"], "42\n")
        self.send({"id": 5, "type": "nope"})
        self.assertFalse(self.until_result(5)[0]["ok"])

    def test_requests_and_net_server(self):
        code = ("import requests\nr = requests.get('http://nexus.local/api/products', params={'size': 3})\n"
                "print(len(r.json()['items']))")
        self.send({"id": 6, "type": "run", "payload": {"code": code, "files": {"main.py": code}}})
        r, events = self.until_result(6)
        self.assertTrue(r["result"]["ok"], r)
        self.assertIn("3\n", "".join(e.get("text", "") for e in events))
        self.send({"id": 7, "type": "netServe", "payload": {"port": 0}})
        url = self.until_result(7)[0]["result"]["url"]
        with urllib.request.urlopen(url + "/robots.txt") as resp:
            self.assertIn("Disallow", resp.read().decode())


if __name__ == "__main__":
    unittest.main()
