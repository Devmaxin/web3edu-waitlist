/**
 * Token derivation, signing and hashing. A faithful TypeScript port of app/Lib/Crypto.php:
 * double-HMAC keyed derivation, purpose-separated, so a token derived for one purpose
 * can never be presented as a different purpose. Only hashes of tokens are stored.
 */
import crypto from "node:crypto";
import { ENV } from "./env";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function b64u(buf: Buffer): string {
  return buf.toString("base64").replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function b64uDecode(s: string): Buffer | null {
  try {
    const norm = s.replaceAll("-", "+").replaceAll("_", "/");
    const pad = norm.length % 4 === 0 ? "" : "=".repeat(4 - (norm.length % 4));
    const buf = Buffer.from(norm + pad, "base64");
    // Reject non-canonical output like PHP's strict base64_decode.
    if (b64u(buf) !== s) return null;
    return buf;
  } catch {
    return null;
  }
}

export function token(bytes = 32): string {
  return b64u(crypto.randomBytes(bytes));
}

/** App key as a Buffer; throws with a clear message when unset/placeholder. */
function key(): Buffer {
  const v = ENV.appKey;
  const buf = Buffer.from(v, "base64");
  if (buf.length < 16) {
    throw new Error(
      "APP_KEY missing: set it to 32+ random base64 bytes (node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\")",
    );
  }
  return buf;
}

/** Random string from the Crockford base32 alphabet (no I L O U), like Crypto::code(). */
export function code(len: number): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += CROCKFORD[crypto.randomInt(0, CROCKFORD.length)];
  }
  return out;
}

export function sha256(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

/** Purpose-separated HMAC derivation; raw 32 bytes. Mirrors Crypto::derive(). */
export function derive(purpose: string, data: string): Buffer {
  const k = crypto.createHmac("sha256", key()).update(`w3e/${purpose}`).digest();
  return crypto.createHmac("sha256", k).update(data).digest();
}

/** Deterministic opaque token, re-derivable from (purpose, id, version). Mirrors Crypto::derivedToken(). */
export function derivedToken(purpose: string, id: number, version: number): string {
  return b64u(derive(purpose, `${id}|${version}`));
}

/** Signed value "payload.sig" for cookies/links. Mirrors Crypto::sign(). */
export function sign(purpose: string, payload: string): string {
  return `${payload}.${b64u(derive(purpose, payload))}`;
}

/** Returns the payload if the signature is valid, else null. */
export function unsign(purpose: string, signed: string): string | null {
  const i = signed.lastIndexOf(".");
  if (i < 1) return null;
  const payload = signed.slice(0, i);
  const sig = signed.slice(i + 1);
  const good = b64u(derive(purpose, payload));
  if (good.length !== sig.length) return null;
  return crypto.timingSafeEqual(Buffer.from(good), Buffer.from(sig)) ? payload : null;
}

/** Keyed IP hash for abuse heuristics (never identity proof). Mirrors Crypto::ipHash(). */
export function ipHash(ip: string): string {
  return derive("ip", ip).toString("hex");
}

export function randomHex(bytes: number): string {
  return crypto.randomBytes(bytes).toString("hex");
}

/** Constant-time string comparison over equal-length buffers. */
export function secureEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // Still burn comparable time to avoid a trivial length oracle.
    crypto.timingSafeEqual(Buffer.alloc(32), Buffer.alloc(32));
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}
