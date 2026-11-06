// 答案校验：与 tools/build_question_bank.py 使用相同的规范化规则和 PBKDF2-HMAC-SHA256 参数。
// 题库中只保存「随机盐 + 慢速哈希」，不保存明文答案。

export function normalizeAnswer(answer) {
  if (Array.isArray(answer)) return answer.map(normalizeAnswer).sort().join(",");
  return String(answer).normalize("NFKC").trim().toLowerCase().split(/\s+/).filter(Boolean).join(" ");
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

export async function hashAnswer(answer, saltHex, iterations) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(normalizeAnswer(answer)), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(saltHex), iterations }, key, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyAnswer(answer, check) {
  if (!check || check.algo !== "PBKDF2-SHA256") throw new Error("不支持的校验算法");
  const h = await hashAnswer(answer, check.salt, check.iterations);
  return check.hashes.includes(h);
}
