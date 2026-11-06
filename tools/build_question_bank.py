#!/usr/bin/env python3
"""把题库源文件编译为前端使用的题库（答案不以明文发布）。

    python tools/build_question_bank.py [content/exercises.src.json] [web/data/exercises.js]

- 单选 / 多选 / 填空：答案规范化后使用「随机盐 + PBKDF2-HMAC-SHA256」慢速哈希。
  浏览器端用 WebCrypto 以相同参数计算并比对。
  注意：哈希只能提高读取答案的成本；选项很少的题目仍可被穷举，见 docs/DESIGN.md 第三节。
- 编程题：只发布测试用例（标记 hidden 的用例不展示期望值），不发布参考代码。

源文件 content/exercises.src.json 含明文答案，仅用于出题，不应随应用分发。
"""
import hashlib
import json
import os
import secrets
import sys
import unicodedata

ITERATIONS = 120_000
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def normalize(answer):
    """与前端 web/js/crypto.js 中的 normalizeAnswer 保持一致。"""
    if isinstance(answer, list):  # 多选：排序后用逗号连接
        return ",".join(sorted(normalize(a) for a in answer))
    text = unicodedata.normalize("NFKC", str(answer)).strip().lower()
    return " ".join(text.split())


def hash_answer(answer, salt_hex, iterations=ITERATIONS):
    digest = hashlib.pbkdf2_hmac("sha256", normalize(answer).encode("utf-8"),
                                 bytes.fromhex(salt_hex), iterations)
    return digest.hex()


def compile_bank(src):
    out = []
    for q in src["questions"]:
        item = {k: v for k, v in q.items() if k not in ("answer", "answers", "solution")}
        if q["type"] in ("single", "multi", "fill"):
            salt = secrets.token_hex(16)
            accepted = q.get("answers") or [q["answer"]]
            item["check"] = {
                "algo": "PBKDF2-SHA256",
                "iterations": ITERATIONS,
                "salt": salt,
                "hashes": sorted(hash_answer(a, salt) for a in accepted),
            }
        out.append(item)
    return {"version": src.get("version", 1), "questions": out}


def main(argv):
    src_path = argv[1] if len(argv) > 1 else os.path.join(ROOT, "content", "exercises.src.json")
    dst_path = argv[2] if len(argv) > 2 else os.path.join(ROOT, "web", "data", "exercises.js")
    with open(src_path, encoding="utf-8") as f:
        src = json.load(f)
    bank = compile_bank(src)
    with open(dst_path, "w", encoding="utf-8") as f:
        f.write("// 由 tools/build_question_bank.py 生成，请勿手工编辑。\n")
        f.write("export const QUESTION_BANK = ")
        json.dump(bank, f, ensure_ascii=False, indent=2)
        f.write(";\n")
    print(f"已生成 {dst_path}：{len(bank['questions'])} 道题")


if __name__ == "__main__":
    main(sys.argv)
