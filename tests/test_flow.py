import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "web", "py"))

from nexus_flow import analyze, build_flow, call_graph, import_graph, to_mermaid  # noqa: E402

PARITY = 'n = int(input("n: "))\nif n % 2 == 0:\n    print("偶数")\nelse:\n    print("奇数")\n'


class FlowTest(unittest.TestCase):
    def test_parity_example(self):
        flow = build_flow(PARITY)
        main = flow["main"]
        self.assertEqual(main[0]["type"], "io")
        self.assertEqual(main[0]["text"], "输入 n")
        cond = main[1]
        self.assertEqual(cond["type"], "if")
        self.assertEqual(cond["text"], "n % 2 == 0 ?")
        self.assertEqual(cond["yes"][0]["text"], "输出 \"偶数\"")
        self.assertEqual(cond["no"][0]["text"], "输出 \"奇数\"")

    def test_elif_nested(self):
        flow = build_flow("if a:\n    x=1\nelif b:\n    x=2\nelse:\n    x=3")
        top = flow["main"][0]
        self.assertEqual(top["no"][0]["type"], "if")
        self.assertEqual(top["no"][0]["no"][0]["text"], "x=3")

    def test_loops_and_functions(self):
        src = ("def fact(n):\n    r = 1\n    for i in range(1, n + 1):\n"
               "        r *= i\n    return r\nwhile True:\n    break\nprint(fact(5))")
        flow = build_flow(src)
        self.assertEqual(flow["functions"][0]["name"], "fact")
        loop = flow["functions"][0]["body"][1]
        self.assertEqual(loop["kind"], "for")
        self.assertEqual(flow["main"][1]["kind"], "while")
        self.assertEqual(flow["main"][1]["body"][0]["kind"], "break")

    def test_mermaid(self):
        text = to_mermaid(build_flow(PARITY))
        self.assertTrue(text.startswith("flowchart TD"))
        self.assertIn("-->|是|", text)
        self.assertIn("-->|否|", text)
        self.assertIn("#quot;偶数#quot;", text)
        mermaid = to_mermaid(build_flow("for i in range(3):\n    if i == 1:\n        break\n"
                                         "    continue\nprint(1)"))
        self.assertIn("flowchart TD", mermaid)

    def test_match_and_try(self):
        flow = build_flow("match x:\n    case 1:\n        y=1\n    case _:\n        y=0\n"
                          "try:\n    f()\nexcept ValueError:\n    pass\nfinally:\n    g()")
        self.assertEqual(flow["main"][0]["type"], "if")
        self.assertEqual([n["text"] for n in flow["main"][1:]],
                         ["try 尝试执行", "except ValueError", "finally 最终执行"])
        to_mermaid(flow)

    def test_call_graph(self):
        g = call_graph("def a():\n    b()\ndef b():\n    pass\na()\nprint(1)")
        self.assertEqual(g["<module>"], ["a"])
        self.assertEqual(g["a"], ["b"])

    def test_import_graph(self):
        g = import_graph({"main.py": "import os\nfrom modules import calc\nfrom . import x",
                          "README.md": "x"})
        self.assertEqual(g["main.py"], [".", "modules", "os"])
        self.assertNotIn("README.md", g)

    def test_analyze_syntax_error(self):
        r = analyze("if x\n  y")
        self.assertFalse(r["ok"])
        self.assertIn("第 1 行", r["error"])


if __name__ == "__main__":
    unittest.main()
