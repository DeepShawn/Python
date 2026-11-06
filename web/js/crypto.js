// 题库安全：答案校验（Argon2id）与题库签名验证（Ed25519）。
// 规范化规则与参数和 tools/build_question_bank.py 保持一致。所有依赖均从本地 vendor/ 加载，
// 缺失时（开发环境未运行 npm run vendor）才回退到 CDN。
import { BANK_PUBLIC_KEY } from "./bank-key.js";

const VENDOR = new URL("../vendor/", import.meta.url).href;
const HASH_WASM_CDN = "https://cdn.jsdelivr.net/npm/hash-wasm@4.12.0/dist/index.esm.min.js";
const NACL_CDN = "https://cdn.jsdelivr.net/npm/tweetnacl@1.0.3/nacl-fast.min.js";

export function normalizeAnswer(answer) {
  if (Array.isArray(answer)) return answer.map(normalizeAnswer).sort().join(",");
  return String(answer).normalize("NFKC").trim().toLowerCase().split(/\s+/).filter(Boolean).join(" ");
}

const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
function fromHex(h) {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}

let hashWasm = null;
async function loadHashWasm() {
  if (!hashWasm) {
    hashWasm = import(VENDOR + "hash-wasm/index.esm.min.js").catch(() => import(HASH_WASM_CDN));
  }
  return hashWasm;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("无法加载 " + src));
    document.head.appendChild(s);
  });
}

async function loadNacl() {
  if (globalThis.nacl) return globalThis.nacl;
  try { await loadScript(VENDOR + "tweetnacl/nacl-fast.min.js"); } catch { await loadScript(NACL_CDN); }
  return globalThis.nacl;
}

export async function hashAnswer(answer, check) {
  const text = normalizeAnswer(answer);
  if (check.algo === "argon2id") {
    const { argon2id } = await loadHashWasm();
    return argon2id({
      password: text, salt: fromHex(check.salt), parallelism: check.parallelism,
      iterations: check.iterations, memorySize: check.memory, hashLength: check.length, outputType: "hex",
    });
  }
  if (check.algo === "PBKDF2-SHA256") { // 兼容第一版题库
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(text), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: fromHex(check.salt), iterations: check.iterations }, key, 256);
    return hex(bits);
  }
  throw new Error("不支持的校验算法：" + check.algo);
}

export async function verifyAnswer(answer, check) {
  return check.hashes.includes(await hashAnswer(answer, check));
}

/** 验证题库签名：优先使用 WebCrypto Ed25519，浏览器不支持时使用 tweetnacl。 */
export async function verifySignature(payload, signatureHex, publicKeyHex = BANK_PUBLIC_KEY) {
  const data = new TextEncoder().encode(payload);
  const sig = fromHex(signatureHex);
  const pub = fromHex(publicKeyHex);
  try {
    const key = await crypto.subtle.importKey("raw", pub, { name: "Ed25519" }, false, ["verify"]);
    return await crypto.subtle.verify({ name: "Ed25519" }, key, sig, data);
  } catch {
    const nacl = await loadNacl();
    return nacl.sign.detached.verify(data, sig, pub);
  }
}

/** 加载已签名题库：签名不通过时拒绝加载，防止题库被篡改（例如替换答案哈希）。 */
export async function loadSignedBank(signed) {
  if (!signed || signed.algo !== "Ed25519") return { ok: false, error: "题库格式无效" };
  let valid = false;
  try { valid = await verifySignature(signed.payload, signed.signature); } catch (e) { return { ok: false, error: e.message }; }
  if (!valid) return { ok: false, error: "题库签名校验失败：文件可能被修改" };
  return { ok: true, bank: JSON.parse(signed.payload) };
}
