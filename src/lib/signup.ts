/**
 * Signup domain logic: email normalisation, validation and the referral capture cookie.
 * Mirrors app/Services/Signup.php. The atomic create itself lives in the join_waitlist
 * Postgres function (one transaction).
 */
import { sign, unsign, code, sha256 } from "./crypto";
import { AVATARS, avatarIsValid } from "./avatar";

export const REF_COOKIE = "w3e_ref";
export const DEV_COOKIE = "w3e_dev";
const REF_TTL = 30 * 86400;

/** Canonical email: lowercased; gmail dots/+tag collapsed; googlemail.com folded in. */
export function canonicalEmail(email: string): string {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at === -1) return e;
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") {
    local = local.split("+")[0];
    local = local.replaceAll(".", "");
  }
  return local + "@" + domain;
}

export type SignupInput = { email: string; name: string; avatar: string };
export type SignupErrors = Partial<Record<"email" | "name" | "avatar" | "form", string>>;

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Server-side validation. Returns [errors, clean]. */
export function validateSignup(raw: {
  email?: unknown;
  name?: unknown;
  avatar?: unknown;
}): [SignupErrors, SignupInput] {
  const err: SignupErrors = {};
  const email = String(raw.email ?? "").trim();
  if (email === "" || email.length > 190 || !/^[\x20-\x7e]+$/.test(email) || !EMAIL_OK.test(email) || email.includes("..")) {
    err.email = "Enter a valid email address (up to 190 characters).";
  }
  const name = String(raw.name ?? "")
    .replace(/\s+/gu, " ")
    .trim();
  if (name !== "") {
    if (
      [...name].length > 40 ||
      /[<>]|[\u0000-\u001f\u007f-\u009f]/u.test(name) ||
      /https?:|www\./i.test(name)
    ) {
      err.name = "Use up to 40 letters, without links or symbols.";
    }
  }
  const avatar = String(raw.avatar ?? "").trim();
  if (avatar !== "" && !avatarIsValid(avatar)) {
    err.avatar = "Choose one of the avatars shown.";
  }
  return [err, { email, name, avatar }];
}

/** Waitlist ID format W3E-XXXX-XXXX (Crockford alphabet). */
export function waitlistIdRegex(): RegExp {
  return /^W3E-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
}

/** referral_code format: 10 Crockford chars. */
export function referralCodeRegex(): RegExp {
  return /^[0-9A-Z]{10}$/;
}

/** Validate a referral code from the ?ref= parameter. */
export function validReferralCode(c: string): string | null {
  const codePart = c.trim().toUpperCase();
  return referralCodeRegex().test(codePart) ? codePart : null;
}

type CookieSetter = {
  set: (name: string, value: string, opts: { httpOnly: boolean; sameSite: "lax"; path: string; maxAge: number }) => void;
  get: (name: string) => { value: string } | undefined;
};

/**
 * Capture ?ref=CODE into a signed cookie (30 days). Called on every landing hit:
 * the cookie is signed, so the browser value is never trusted at attribution time.
 */
export function captureReferralCookie(setCookie: CookieSetter, codeCandidate: string): void {
  const c = validReferralCode(codeCandidate);
  if (!c) return;
  const payload = `${c}|${Math.floor(Date.now() / 1000) + REF_TTL}`;
  setCookie.set(REF_COOKIE, sign("ref", payload), { httpOnly: true, sameSite: "lax", path: "/", maxAge: REF_TTL });
}

/** Resolve the signed referral cookie to a code valid until expiry, else null. */
export function referrerCodeFromCookie(cookieGetter: { get: (name: string) => { value: string } | undefined }): string | null {
  const raw = cookieGetter.get(REF_COOKIE)?.value ?? "";
  if (!raw) return null;
  const payload = unsign("ref", raw);
  if (!payload) return null;
  const idx = payload.indexOf("|");
  if (idx === -1) return null;
  const codePart = payload.slice(0, idx);
  const exp = Number(payload.slice(idx + 1));
  if (!Number.isFinite(exp) || exp * 1000 < Date.now() || !referralCodeRegex().test(codePart)) {
    return null;
  }
  return codePart;
}

/** Random device cookie used only for abuse checks. */
export function deviceTokenCookie(cookieGetter: CookieSetter): string {
  const existing = cookieGetter.get(DEV_COOKIE)?.value ?? "";
  if (/^[A-Za-z0-9_-]{32}$/.test(existing)) return existing;
  const t = code(24);
  cookieGetter.set(DEV_COOKIE, t, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 365 * 86400 });
  return t;
}

/** Hashed value stored in the DB (raw cookie/token never kept). */
export function deviceHash(deviceToken: string): string {
  return sha256(deviceToken);
}

export { AVATARS };
