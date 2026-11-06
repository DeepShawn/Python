#!/usr/bin/env python3
"""把题库源文件编译为前端使用的已签名题库（答案不以明文发布）。

    python tools/build_question_bank.py [源文件] [输出 exercises.js]

保护措施（详见 docs/DESIGN.md 第三节）：
- 单选 / 多选 / 填空：答案规范化后使用「随机盐 + Argon2id」慢速哈希（OWASP 推荐参数
  m=19 MiB, t=2, p=1）。浏览器端用 hash-wasm 以相同参数计算并比对。
- 编程题：只发布测试用例（hidden 用例在界面上不展示期望值），不发布参考代码。
- 随机参数题：只发布参数规格与计算表达式，正确答案在本地即时计算。
- 题库完整性：整个题库 JSON 用 Ed25519 签名，前端验证签名后才加载，检测文件被篡改。
  私钥保存在 content/keys/bank_ed25519.pem（不入库）；首次运行自动生成，公钥写入 web/js/bank-key.js。

注意：哈希只提高直接读取答案的成本，选项很少的题目仍可被穷举；签名只能发现篡改，
在完全离线、用户掌控全部文件的条件下无法做到绝对防破解。

源文件 content/exercises.src.json 含明文答案，仅用于出题，不应随应用分发。
"""
import json
import os
import secrets
import sys
import unicodedata

from argon2.low_level import Type, hash_secret_raw
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "web", "py"))
KEY_PATH = os.path.join(ROOT, "content", "keys", "bank_ed25519.pem")
PUBKEY_JS = os.path.join(ROOT, "web", "js", "bank-key.js")
ARGON2 = {"algo": "argon2id", "memory": 19456, "iterations": 2, "parallelism": 1, "length": 32}
HASHED_TYPES = ("single", "multi", "fill")
SECRET_FIELDS = ("answer", "answers", "solution")


def normalize(answer):
    """与前端 web/js/crypto.js 中的 normalizeAnswer 保持一致。"""
    if isinstance(answer, list):  # 多选：排序后用逗号连接
        return ",".join(sorted(normalize(a) for a in answer))
    text = unicodedata.normalize("NFKC", str(answer)).strip().lower()
    return " ".join(text.split())


def hash_answer(answer, salt_hex, params=ARGON2):
    digest = hash_secret_raw(normalize(answer).encode("utf-8"), bytes.fromhex(salt_hex),
                             time_cost=params["iterations"], memory_cost=params["memory"],
                             parallelism=params["parallelism"], hash_len=params["length"], type=Type.ID)
    return digest.hex()


def fill_expected(src, solutions):
    """用例未写 expected 时，用参考解（content/solutions.json，不随应用分发）计算期望输出。"""
    import nexus_judge
    import nexus_net

    nexus_net.install(force=True)  # 爬虫题在出题环境中同样访问离线教学网站
    for q in src["questions"]:
        for case in q.get("cases", []):
            if "expected" not in case:
                if q["id"] not in solutions:
                    raise ValueError(f"题目 {q['id']} 的用例缺少 expected，且没有参考解")
                case["expected"] = nexus_judge.expected_for(solutions[q["id"]], case)
    return src


def compile_bank(src):
    out = []
    for q in src["questions"]:
        item = {k: v for k, v in q.items() if k not in SECRET_FIELDS}
        if q["type"] in HASHED_TYPES:
            salt = secrets.token_hex(16)
            accepted = q.get("answers") or [q["answer"]]
            item["check"] = dict(ARGON2, salt=salt, hashes=sorted(hash_answer(a, salt) for a in accepted))
        out.append(item)
    ids = {q["id"] for q in out}
    for exam in src.get("exams", []):
        missing = [i for i in exam["questions"] if i not in ids]
        if missing:
            raise ValueError(f"考试 {exam['id']} 引用了不存在的题目：{missing}")
    return {"version": src.get("version", 1), "questions": out, "exams": src.get("exams", [])}


def load_or_create_key(path=KEY_PATH, pubkey_js=PUBKEY_JS):
    if os.path.exists(path):
        with open(path, "rb") as f:
            key = serialization.load_pem_private_key(f.read(), password=None)
    else:
        key = Ed25519PrivateKey.generate()
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "wb") as f:
            f.write(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                                      serialization.NoEncryption()))
        print(f"已生成新的题库签名私钥：{path}（请妥善保管，不要提交到仓库）")
    pub = key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw).hex()
    if pubkey_js:
        with open(pubkey_js, "w", encoding="utf-8") as f:
            f.write("// 题库签名公钥（Ed25519），由 tools/build_question_bank.py 生成。\n")
            f.write(f'export const BANK_PUBLIC_KEY = "{pub}";\n')
    return key, pub


def sign_bank(bank, key):
    """签名的是 payload 字符串本身的 UTF-8 字节，前端先验签再 JSON.parse，避免规范化差异。"""
    payload = json.dumps(bank, ensure_ascii=False, separators=(",", ":"))
    signature = key.sign(payload.encode("utf-8")).hex()
    return {"payload": payload, "signature": signature, "algo": "Ed25519"}


def main(argv):
    src_path = argv[1] if len(argv) > 1 else os.path.join(ROOT, "content", "exercises.src.json")
    dst_path = argv[2] if len(argv) > 2 else os.path.join(ROOT, "web", "data", "exercises.js")
    with open(src_path, encoding="utf-8") as f:
        src = json.load(f)
    sol_path = os.path.join(os.path.dirname(src_path), "solutions.json")
    solutions = {}
    if os.path.exists(sol_path):
        with open(sol_path, encoding="utf-8") as f:
            solutions = json.load(f)
    bank = compile_bank(fill_expected(src, solutions))
    key, pub = load_or_create_key()
    signed = sign_bank(bank, key)
    with open(dst_path, "w", encoding="utf-8") as f:
        f.write("// 由 tools/build_question_bank.py 生成，请勿手工编辑（修改会导致签名校验失败）。\n")
        f.write("export const SIGNED_BANK = ")
        json.dump(signed, f, ensure_ascii=False, indent=1)
        f.write(";\n")
    print(f"已生成 {dst_path}：{len(bank['questions'])} 道题，{len(bank['exams'])} 套试卷，公钥 {pub[:16]}…")


if __name__ == "__main__":
    main(sys.argv)
