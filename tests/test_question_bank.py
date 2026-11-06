import json
import os
import sys
import tempfile
import unittest

ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, os.path.join(ROOT, "tools"))
sys.path.insert(0, os.path.join(ROOT, "web", "py"))

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey  # noqa: E402

import nexus_net  # noqa: E402
from build_question_bank import (compile_bank, fill_expected, hash_answer, load_or_create_key,  # noqa: E402
                                 normalize, sign_bank)
from nexus_judge import check_random, judge, random_params, render_template  # noqa: E402


def load_json(*parts):
    with open(os.path.join(ROOT, *parts), encoding="utf-8") as f:
        return json.load(f)


class QuestionBankTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.src = load_json("content", "exercises.src.json")
        cls.solutions = load_json("content", "solutions.json")
        fill_expected(cls.src, cls.solutions)
        cls.bank = compile_bank(cls.src)

    def setUp(self):
        nexus_net.install(force=True)

    def tearDown(self):
        sys.modules.pop("requests", None)

    def test_normalize(self):
        self.assertEqual(normalize("  [2,  5] "), "[2, 5]")
        self.assertEqual(normalize(["4", "0", "2"]), "0,2,4")
        self.assertEqual(normalize("ＡＢＣ"), "abc")  # 全角转半角

    def test_no_plaintext_answers_shipped(self):
        for q in self.bank["questions"]:
            for field in ("answer", "answers", "solution"):
                self.assertNotIn(field, q)
        shipped = open(os.path.join(ROOT, "web", "data", "exercises.js"), encoding="utf-8").read()
        starters = {q["id"]: q.get("starter", "") for q in self.src["questions"]}
        for qid, code in self.solutions.items():
            # 参考解中不在初始代码里的关键行，不能出现在发布的题库中
            secret = [ln.strip() for ln in code.splitlines() if len(ln.strip()) > 12 and ln.strip() not in starters[qid]]
            for line in secret:
                self.assertNotIn(json.dumps(line, ensure_ascii=False)[1:-1], shipped, (qid, line))
        for q in self.src["questions"]:
            for a in ([q["answer"]] if isinstance(q.get("answer"), str) and len(q["answer"]) > 3 else []):
                self.assertNotIn(a, shipped)

    def test_argon2_hashes_verify(self):
        bank = {q["id"]: q for q in self.bank["questions"]}
        for q in self.src["questions"]:
            if q["type"] not in ("single", "multi", "fill"):
                continue
            check = bank[q["id"]]["check"]
            self.assertEqual(check["algo"], "argon2id")
            for a in q.get("answers") or [q["answer"]]:
                self.assertIn(hash_answer(a, check["salt"], check), check["hashes"])
            self.assertNotIn(hash_answer("wrong", check["salt"], check), check["hashes"])

    def test_signature(self):
        with tempfile.TemporaryDirectory() as d:
            key, pub = load_or_create_key(os.path.join(d, "k.pem"), None)
            signed = sign_bank(self.bank, key)
            public = Ed25519PublicKey.from_public_bytes(bytes.fromhex(pub))
            public.verify(bytes.fromhex(signed["signature"]), signed["payload"].encode("utf-8"))
            tampered = signed["payload"].replace("argon2id", "argon2ix", 1)
            with self.assertRaises(Exception):
                public.verify(bytes.fromhex(signed["signature"]), tampered.encode("utf-8"))

    def test_shipped_bank_is_signed_with_committed_key(self):
        text = open(os.path.join(ROOT, "web", "data", "exercises.js"), encoding="utf-8").read()
        signed = json.loads(text[text.index("{"): text.rindex("}") + 1])
        keyjs = open(os.path.join(ROOT, "web", "js", "bank-key.js"), encoding="utf-8").read()
        pub = keyjs.split('"')[1]
        Ed25519PublicKey.from_public_bytes(bytes.fromhex(pub)).verify(
            bytes.fromhex(signed["signature"]), signed["payload"].encode("utf-8"))
        payload = json.loads(signed["payload"])
        self.assertEqual(len(payload["questions"]), len(self.src["questions"]))

    def test_code_questions_consistent(self):
        """出题自检：参考解通过全部用例与结构要求；初始代码不能直接通过。"""
        for q in self.src["questions"]:
            if "cases" not in q:
                continue
            kw = {"requires": q.get("requires"), "limits": q.get("limits")}
            r = judge(self.solutions[q["id"]], q["cases"], **kw)
            self.assertTrue(r["all_passed"], (q["id"], r))
            self.assertFalse(judge(q["starter"], q["cases"], **kw)["all_passed"], q["id"])

    def test_random_questions(self):
        for q in self.src["questions"]:
            if q["type"] != "random_fill":
                continue
            for seed in range(5):
                p = random_params(q["params"], seed)
                render_template(q["title"], p)
                value = eval(q["expr"], {}, dict(p))
                answer = value if isinstance(value, str) else repr(value)
                self.assertTrue(check_random(q["expr"], p, answer)["correct"], (q["id"], p))
                self.assertFalse(check_random(q["expr"], p, answer + "9")["correct"])

    def test_exams_reference_existing_questions(self):
        ids = {q["id"] for q in self.src["questions"]}
        for exam in self.src["exams"]:
            self.assertTrue(set(exam["questions"]) <= ids)
            self.assertGreater(exam["minutes"], 0)


if __name__ == "__main__":
    unittest.main()
