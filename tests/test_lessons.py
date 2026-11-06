"""课程自检：每个课时的示例代码都能运行，配套练习都存在。"""
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = os.path.join(os.path.dirname(__file__), "..")
sys.path.insert(0, os.path.join(ROOT, "web", "py"))

import nexus_net  # noqa: E402
from nexus_core import run_plain  # noqa: E402

THIRD_PARTY = {"l-numpy": "numpy", "l-pandas": "pandas", "l-matplotlib": "matplotlib"}


def load_course():
    node = shutil.which("node")
    if not node:
        raise unittest.SkipTest("需要 Node.js 读取 web/data/lessons.js")
    out = subprocess.run([node, "--input-type=module", "-e",
                          "import('./web/data/lessons.js').then(m => console.log(JSON.stringify(m.COURSE)))"],
                         cwd=ROOT, capture_output=True, text=True, check=True).stdout
    return json.loads(out)


class LessonTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.course = load_course()
        with open(os.path.join(ROOT, "content", "exercises.src.json"), encoding="utf-8") as f:
            cls.question_ids = {q["id"] for q in json.load(f)["questions"]}

    def test_structure(self):
        self.assertEqual(len(self.course), 8)
        ids = [l["id"] for st in self.course for l in st["lessons"]]
        self.assertEqual(len(ids), len(set(ids)), "课时 id 不能重复")
        self.assertGreaterEqual(len(ids), 40)
        for st in self.course:
            self.assertTrue(st["lessons"], f"阶段 {st['stage']} 没有课时")
            for l in st["lessons"]:
                if "practice" in l:
                    self.assertIn(l["practice"], self.question_ids, l["id"])

    def test_all_examples_run(self):
        saved = sys.modules.pop("requests", None)
        nexus_net.install(force=True)   # 与网页版一致：requests 访问离线教学网站
        old_cwd = os.getcwd()
        try:
            for st in self.course:
                for lesson in st["lessons"]:
                    mod = THIRD_PARTY.get(lesson["id"])
                    if mod and importlib.util.find_spec(mod) is None:
                        continue
                    with self.subTest(lesson=lesson["id"]), tempfile.TemporaryDirectory() as d:
                        for name, content in (lesson.get("files") or {}).items():
                            path = os.path.join(d, name)
                            os.makedirs(os.path.dirname(path), exist_ok=True)
                            with open(path, "w", encoding="utf-8") as f:
                                f.write(content)
                        os.chdir(d)
                        sys.path.insert(0, d)
                        try:
                            r = run_plain(lesson["code"], stdin=lesson.get("stdin", ""), capture=True,
                                          filename=os.path.join(d, "main.py"))
                        finally:
                            sys.path.remove(d)
                            os.chdir(old_cwd)
                            for name in [n for n, m in sys.modules.items() if (getattr(m, "__file__", "") or "").startswith(d)]:
                                del sys.modules[name]
                        self.assertTrue(r["ok"], f"{lesson['id']}: {r['error']}")
                        self.assertTrue(r["stdout"].strip(), f"{lesson['id']} 没有输出")
        finally:
            sys.modules.pop("requests", None)
            if saved:
                sys.modules["requests"] = saved


if __name__ == "__main__":
    unittest.main()
