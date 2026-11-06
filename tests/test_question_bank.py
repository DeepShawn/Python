import json
import os
import sys
import unittest

ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, os.path.join(ROOT, "tools"))
sys.path.insert(0, os.path.join(ROOT, "web", "py"))

from build_question_bank import compile_bank, hash_answer, normalize  # noqa: E402
from nexus_judge import judge  # noqa: E402


class QuestionBankTest(unittest.TestCase):
    def setUp(self):
        with open(os.path.join(ROOT, "content", "exercises.src.json"), encoding="utf-8") as f:
            self.src = json.load(f)

    def test_normalize(self):
        self.assertEqual(normalize("  [2,  5] "), "[2, 5]")
        self.assertEqual(normalize(["4", "0", "2"]), "0,2,4")
        self.assertEqual(normalize("ＡＢＣ"), "abc")  # 全角转半角

    def test_no_plaintext_answers_shipped(self):
        bank = compile_bank(self.src)
        for q in bank["questions"]:
            self.assertNotIn("answer", q)
            self.assertNotIn("answers", q)

    def test_hashes_verify(self):
        bank = {q["id"]: q for q in compile_bank(self.src)["questions"]}
        for q in self.src["questions"]:
            if q["type"] not in ("single", "multi", "fill"):
                continue
            check = bank[q["id"]]["check"]
            for a in q.get("answers") or [q["answer"]]:
                self.assertIn(hash_answer(a, check["salt"], check["iterations"]), check["hashes"])
            self.assertNotIn(hash_answer("wrong", check["salt"], check["iterations"]),
                             check["hashes"])

    def test_programming_cases_are_consistent(self):
        """出题自检：每道编程题必须有一个能通过全部用例的参考解（只在此测试中存在）。"""
        solutions = {
            "p-sum": "a = int(input())\nb = int(input())\nprint(a + b)",
            "p-parity": "n = int(input())\nprint('偶数' if n % 2 == 0 else '奇数')",
            "p-fact": "def fact(n):\n    r = 1\n    for i in range(2, n + 1):\n        r *= i\n    return r",
            "p-debug-avg": "def average(nums):\n    return sum(nums) / len(nums) if nums else 0",
            "p-bubble": ("def bubble_sort(items):\n    d = list(items)\n    for i in range(len(d)):\n"
                         "        for j in range(len(d) - 1 - i):\n"
                         "            if d[j] > d[j + 1]:\n                d[j], d[j + 1] = d[j + 1], d[j]\n"
                         "    return d"),
        }
        for q in self.src["questions"]:
            if q["type"].startswith("code"):
                r = judge(solutions[q["id"]], q["cases"])
                self.assertTrue(r["all_passed"], (q["id"], r))
                self.assertFalse(judge(q["starter"], q["cases"])["all_passed"], q["id"])


if __name__ == "__main__":
    unittest.main()
