import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "web", "py"))

from nexus_core import check_syntax, run_plain, run_unittests  # noqa: E402
from nexus_judge import judge, normalize_output  # noqa: E402
from nexus_repl import Repl  # noqa: E402
from nexus_tracer import run_traced  # noqa: E402


class RunPlainTest(unittest.TestCase):
    def test_output_and_input(self):
        r = run_plain("n = input('n: ')\nprint(int(n) * 2)", stdin="21", capture=True)
        self.assertTrue(r["ok"])
        self.assertEqual(r["stdout"], "n: 21\n42\n")

    def test_error_hides_runner_frames(self):
        r = run_plain("def f():\n    1/0\nf()", capture=True)
        self.assertFalse(r["ok"])
        self.assertIn("ZeroDivisionError", r["error"])
        self.assertIn('File "main.py", line 2', r["error"])
        self.assertNotIn("nexus_core", r["error"])

    def test_missing_input(self):
        r = run_plain("input()", capture=True)
        self.assertIn("EOFError", r["error"])

    def test_infinite_loop_is_stopped(self):
        r = run_plain("while True:\n    pass", max_lines=1000, capture=True)
        self.assertFalse(r["ok"])
        self.assertIn("死循环", r["error"])

    def test_step_limit_not_swallowed_by_except_exception(self):
        src = "try:\n    while True:\n        pass\nexcept Exception:\n    print('caught')"
        r = run_plain(src, max_lines=500, capture=True)
        self.assertFalse(r["ok"])
        self.assertNotIn("caught", r["stdout"])


class SyntaxCheckTest(unittest.TestCase):
    def test_ok_has_bytecode(self):
        r = check_syntax("x = 1\nprint(x)")
        self.assertTrue(r["ok"])
        self.assertIn("LOAD", r["bytecode"])

    def test_error_location(self):
        r = check_syntax("x = 1\nif x\n    print(x)")
        self.assertFalse(r["ok"])
        self.assertEqual(r["line"], 2)


class TracerTest(unittest.TestCase):
    def test_line_order_and_vars(self):
        r = run_traced("x = 3\ny = 5\nz = x + y\nprint(z)")
        self.assertTrue(r["ok"])
        lines = [e["ln"] for e in r["events"] if e["e"] == "line"]
        self.assertEqual(lines, [1, 2, 3, 4])
        end = r["events"][-1]
        self.assertEqual(end["e"], "end")
        self.assertEqual(end["vars"]["z"]["v"], "8")
        self.assertEqual(r["stdout"], "8\n")

    def test_loop_follows_real_order(self):
        r = run_traced("for i in range(2):\n    print(i)\nprint('done')")
        lines = [e["ln"] for e in r["events"] if e["e"] == "line"]
        self.assertEqual(lines, [1, 2, 1, 2, 1, 3])

    def test_recursion_call_stack(self):
        src = "def f(n):\n    if n == 0:\n        return 0\n    return f(n - 1)\nf(2)"
        r = run_traced(src)
        depths = [e["depth"] for e in r["events"] if e["e"] == "call"]
        self.assertEqual(depths, [1, 2, 3])
        rets = [e for e in r["events"] if e["e"] == "return"]
        self.assertEqual(rets[0]["ret"], "0")
        deepest = max(r["events"], key=lambda e: e["depth"])
        self.assertEqual(deepest["stack"], ["<module>", "f", "f", "f"])

    def test_output_progress(self):
        r = run_traced("print('a')\nprint('b')")
        line_events = [e for e in r["events"] if e["e"] == "line"]
        self.assertEqual(line_events[0]["out"], 0)
        self.assertEqual(line_events[1]["out"], 2)

    def test_step_limit(self):
        r = run_traced("while True:\n    pass", max_steps=50)
        self.assertTrue(r["truncated"])

    def test_exception_reported(self):
        r = run_traced("x = [1]\nx[5]")
        self.assertFalse(r["ok"])
        self.assertIn("IndexError", r["error"])
        self.assertTrue(any(e["e"] == "exception" for e in r["events"]))


class ReplTest(unittest.TestCase):
    def test_expression_echo_and_state(self):
        repl = Repl()
        self.assertEqual(repl.push("a = 2")["output"], "")
        self.assertEqual(repl.push("a * 21")["output"], "42\n")

    def test_multiline(self):
        repl = Repl()
        self.assertTrue(repl.push("def f():")["more"])
        self.assertTrue(repl.push("    return 7")["more"])
        self.assertFalse(repl.push("")["more"])
        self.assertEqual(repl.push("f()")["output"], "7\n")

    def test_error(self):
        r = Repl().push("1/0")
        self.assertTrue(r["error"])
        self.assertIn("ZeroDivisionError", r["output"])

    def test_completions(self):
        repl = Repl()
        repl.push("my_value = 1")
        self.assertIn("my_value", repl.completions("my_"))
        self.assertIn("print", repl.completions("pri"))


class JudgeTest(unittest.TestCase):
    def test_io_cases(self):
        src = "a = int(input())\nb = int(input())\nprint(a + b)"
        r = judge(src, [{"stdin": "1\n2", "expected": "3"}, {"stdin": "5\n5", "expected": "10\n"}])
        self.assertTrue(r["all_passed"])

    def test_function_cases(self):
        r = judge("def add(a, b):\n    return a - b", [{"call": "add(2, 2)", "expected": "4"}])
        self.assertFalse(r["all_passed"])
        self.assertEqual(r["results"][0]["actual"], "0")

    def test_hidden_and_exam_mode(self):
        r = judge("print(1)", [{"stdin": "", "expected": "1", "hidden": True}])
        self.assertNotIn("expected", r["results"][0])
        r = judge("print(1)", [{"stdin": "", "expected": "1"}], reveal=False)
        self.assertNotIn("expected", r["results"][0])

    def test_infinite_loop(self):
        r = judge("while True: pass", [{"stdin": "", "expected": ""}], max_lines=1000)
        self.assertIn("死循环", r["results"][0]["error"])

    def test_normalize(self):
        self.assertEqual(normalize_output("a  \r\nb\n\n"), "a\nb")


class UnittestRunnerTest(unittest.TestCase):
    def test_discover_project_tests(self):
        with tempfile.TemporaryDirectory() as d:
            os.makedirs(os.path.join(d, "tests"))
            with open(os.path.join(d, "calc.py"), "w") as f:
                f.write("def add(a, b):\n    return a + b\n")
            with open(os.path.join(d, "tests", "test_calc.py"), "w") as f:
                f.write("import unittest\nfrom calc import add\n"
                        "class T(unittest.TestCase):\n"
                        "    def test_add(self):\n        self.assertEqual(add(1, 2), 3)\n")
            r = run_unittests(d)
            self.assertTrue(r["ok"], r["output"])
            self.assertEqual(r["run"], 1)


if __name__ == "__main__":
    unittest.main()
