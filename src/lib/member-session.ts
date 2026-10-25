/**
 * Member session: an HMAC-signed cookie carrying the member id (never derivable without
 * APP_KEY). Mirrors the PHP session member_id. The session cookie changes at signup
 * because it is set post-transaction (fresh value = no fixation).
 */
import { sign, unsign } from "./crypto";
export type MemberCookieGetter = { get: (name: string) => { value: string } | undefined };

export const MEMBER_COOKIE = "w3e_member";

export function memberSessionSet(setCookie: CookieWriter, memberId: number): void {
  setCookie.set(MEMBER_COOKIE, sign("member", String(memberId)), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 86400,
  });
}

export function memberSessionGet(getCookie: MemberCookieGetter): number | null {
  const raw = getCookie.get(MEMBER_COOKIE)?.value ?? "";
  if (!raw) return null;
  const payload = unsign("member", raw);
  if (!payload) return null;
  const id = Number(payload);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function memberSessionClear(setCookie: CookieWriter): void {
  setCookie.set(MEMBER_COOKIE, "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
}

type CookieWriter = {
  set: (name: string, value: string, opts: { httpOnly: boolean; sameSite: "lax"; path: string; maxAge: number }) => void;
};
