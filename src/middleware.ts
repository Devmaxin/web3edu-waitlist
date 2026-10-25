/**
 * Edge middleware:
 *  1. Captures ?ref=CODE into a signed HttpOnly cookie (Web Crypto HMAC — same
 *     derivation as src/lib/crypto.ts). Attribution lives in the cookie; the URL
 *     parameter is stripped by redirecting to the clean path.
 *  2. Applies the security header set (CSP with a per-request nonce, nosniff,
 *     DENY framing, no-referrer, Permissions-Policy, COOP, HSTS on https).
 *     The campaign email preview endpoint sets its own sandboxed CSP, so it is skipped.
 */
import { NextRequest, NextResponse } from "next/server";

const CROCKFORD_CODE_RE = /^[0-9A-Z]{10}$/;

async function hmac(key: BufferSource, data: string): Promise<ArrayBuffer> {
  return crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), new TextEncoder().encode(data));
}

function b64url(buf: ArrayBuffer): string {
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/**
 * Random device chip used for abuse heuristics (hashed at submit time; raw value is
 * never stored). Issued here because server components cannot set cookies in Next.
 */
function issueDeviceToken(): string {
  const buf = new ArrayBuffer(24);
  crypto.getRandomValues(new Uint8Array(buf));
  return b64url(buf);
}

/** Web Crypto port of lib/crypto.ts derive(): double HMAC, purpose-separated. */
async function signWithAppKey(purpose: string, payload: string): Promise<string> {
  const appKeyB64 = process.env.APP_KEY ?? "";
  if (!appKeyB64) return "";
  let keyBytes: Uint8Array<ArrayBuffer>;
  try {
    const buf = new ArrayBuffer(atob(appKeyB64).length);
    const bin = atob(appKeyB64);
    keyBytes = new Uint8Array(buf);
    for (let i = 0; i < bin.length; i++) keyBytes[i] = bin.charCodeAt(i);
  } catch {
    return "";
  }
  const k = await hmac(keyBytes, `w3e/${purpose}`);
  const sig = await hmac(k, payload);
  return b64url(sig);
}

export async function middleware(req: NextRequest) {
  // ── 0. device chip (anonymous, hashed server-side) ────────────────────────
  let devIssued = "";
  if (!req.cookies.get("w3e_dev")) {
    devIssued = issueDeviceToken();
    req.cookies.set("w3e_dev", devIssued); // make it visible to this request's server code too
  }

  let res: NextResponse;

  // ── 1. ?ref=CODE capture ───────────────────────────────────────────────
  const refParam = req.nextUrl.searchParams.get("ref");
  const isGet = req.method === "GET";
  if (isGet && refParam && CROCKFORD_CODE_RE.test(refParam.toUpperCase())) {
    const forwardedHost = req.headers.get("x-forwarded-host") ?? req.nextUrl.host;
    if (!process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL.includes(forwardedHost) || process.env.NODE_ENV !== "production") {
      const code = refParam.toUpperCase();
      const payload = `${code}|${Math.floor(Date.now() / 1000) + 30 * 86400}`;
      const sig = await signWithAppKey("ref", payload);
      if (sig) {
        const clean = req.nextUrl.clone();
        clean.searchParams.delete("ref");
        res = NextResponse.redirect(clean, 303);
        res.cookies.set("w3e_ref", `${payload}.${sig}`, {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
          secure: process.env.NODE_ENV === "production",
          maxAge: 30 * 86400,
        });
        if (devIssued) setDeviceCookie(res, devIssued);
        res.headers.set("Cache-Control", "no-store");
        return res;
      }
    }
  }

  res = NextResponse.next({ request: req });
  if (devIssued) setDeviceCookie(res, devIssued);

  // ── 2. headers ─────────────────────────────────────────────────────────
  const isPreview = /^\/admin\/campaigns\/\d+\/preview\/?$/.test(req.nextUrl.pathname);
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  if (!isPreview) {
    res.headers.set("X-Frame-Options", "DENY");
    const nonce = crypto.randomUUID().replaceAll("-", "");
    const csp = [
      `default-src 'self'`,
      `img-src 'self' data: blob:`,
      `style-src 'self' 'nonce-${nonce}'`,
      `script-src 'self' 'nonce-${nonce}'`,
      `connect-src 'self'`,
      `font-src 'self'`,
      `object-src 'none'`,
      `base-uri 'none'`,
      `form-action 'self'`,
      `frame-ancestors 'none'`,
    ].join("; ");
    res.headers.set("Content-Security-Policy", csp);
    // Next.js reads this header and forwards the nonce to its own inline scripts/styles.
    res.headers.set("x-nonce", nonce);
  }
  if (req.nextUrl.protocol === "https:") {
    res.headers.set("Strict-Transport-Security", "max-age=31536000");
  }

  return res;
}

/** Signed referral/member cookies stay HttpOnly; the device chip is the same shape. */
function setDeviceCookie(res: NextResponse, token: string): void {
  res.cookies.set("w3e_dev", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 365 * 86400,
  });
}

export const config = {
  matcher: [
    // Everything except Next internals and static assets.
    "/((?!_next/static|_next/image|assets/|favicon.png|robots.txt).*)",
  ],
};
