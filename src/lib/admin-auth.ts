/**
 * Administrator authentication built on Supabase Auth.
 *
 * - Sessions are Supabase Auth (GoTrue) password sessions; the access token + refresh
 *   token are kept in HttpOnly, SameSite=Lax cookies set by the server.
 * - Every admin request re-verifies the JWT against Supabase AND re-checks the `admins`
 *   table (a disabled admin loses access immediately).
 * - Admin records are bootstrap-inserted into `admins` by you (documented in README);
 *   a Supabase Auth user absent from `admins` is NOT an admin.
 * - High-impact actions require the password again (reauth), like the PHP build.
 * - Idle timeout 2h, mirroring the old build.
 */
import "server-only";
import { cookies } from "next/headers";
import crypto from "node:crypto";
import { anonClient, db, qOrNull } from "./db";
import { ENV } from "./env";

export const ACCESS_COOKIE = "w3e_admin_at";
export const REFRESH_COOKIE = "w3e_admin_rt";
export const SEEN_COOKIE = "w3e_admin_seen";
const IDLE_SECONDS = 7200;
const ROLL_EVERY = 300;

export type AdminRow = { id: string; email: string; disabled_at: string | null; last_login_at: string | null };

type CookieJarLike = {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, opts?: Record<string, unknown>): unknown;
};

/**
 * True when cookie WRITES are allowed in the current execution context. Next.js
 * page renders may only read cookies — writes throw there. Detect once per call
 * with a harmless same-value probe instead of letting the real write crash.
 */
function jarWritable(jar: CookieJarLike, opts: Record<string, unknown>): boolean {
  const current = jar.get(SEEN_COOKIE)?.value ?? "0";
  try {
    jar.set(SEEN_COOKIE, current, opts);
    return true;
  } catch {
    return false;
  }
}

const SEEN_OPTS = { httpOnly: true, sameSite: "lax" as const, path: "/", secure: ENV.isProduction, maxAge: IDLE_SECONDS };

async function setSessionCookies(
  access: string,
  refresh: string,
  maxAge: number,
): Promise<void> {
  const jar = await cookies();
  if (!jarWritable(jar, SEEN_OPTS)) return; // render context: tokens are persisted in a route/action instead
  const opts = { httpOnly: true, sameSite: "lax" as const, path: "/", secure: ENV.isProduction };
  jar.set(ACCESS_COOKIE, access, { ...opts, maxAge });
  jar.set(REFRESH_COOKIE, refresh, { ...opts, maxAge });
  jar.set(SEEN_COOKIE, String(Math.floor(Date.now() / 1000)), SEEN_OPTS);
}

export async function clearSessionCookies(): Promise<void> {
  const jar = await cookies();
  if (!jarWritable(jar, SEEN_OPTS)) return; // render context: reads still treat the session as over
  for (const c of [ACCESS_COOKIE, REFRESH_COOKIE, SEEN_COOKIE]) {
    jar.set(c, "", { httpOnly: true, sameSite: "lax", path: "/", secure: ENV.isProduction, maxAge: 0 });
  }
}

/** Route-handler probe: same verification as currentAdmin; cookie writes persist here. */
export async function pingAdmin(): Promise<AdminRow | null> {
  return currentAdmin();
}

/** Verify the current request's admin session. Returns the admins row, or null. */
export async function currentAdmin(): Promise<AdminRow | null> {
  const jar = await cookies();
  const at = jar.get(ACCESS_COOKIE)?.value;

  // idle timeout
  const seen = Number(jar.get(SEEN_COOKIE)?.value ?? "0");
  if (Number.isFinite(seen) && seen > 0 && Date.now() / 1000 - seen > IDLE_SECONDS) {
    await clearSessionCookies();
    return null;
  }

  if (!at) {
    // Access token absent/expired: restore from the refresh token when the
    // context allows persisting the result (route handlers / server actions).
    const refreshed = await tryRefresh();
    return refreshed ? adminRowFor(refreshed.userId) : null;
  }

  // verify JWT with Supabase (validates signature + expiry)
  const { data, error } = await anonClient().auth.getUser(at);
  if (error || !data?.user) {
    // token may be expired: try refresh (no-op in render contexts — see tryRefresh)
    const refreshed = await tryRefresh();
    if (!refreshed) return null;
    return adminRowFor(refreshed.userId);
  }
  return adminRowFor(data.user.id);
}

async function tryRefresh(): Promise<{ userId: string; access: string; refresh: string } | null> {
  const jar = await cookies();
  const rt = jar.get(REFRESH_COOKIE)?.value;
  if (!rt) return null;
  // Refresh tokens ROTATE on use — never refresh when the new tokens cannot be
  // persisted (page render), or the old token would be burned for nothing.
  if (!jarWritable(jar, SEEN_OPTS)) return null;
  const { data, error } = await anonClient().auth.refreshSession({ refresh_token: rt });
  if (error || !data?.session) return null;
  await setSessionCookies(data.session.access_token, data.session.refresh_token, IDLE_SECONDS);
  return { userId: data.session.user.id, access: data.session.access_token, refresh: data.session.refresh_token };
}

async function adminRowFor(userId: string): Promise<AdminRow | null> {
  const row = (await qOrNull(
    db().from("admins").select("id, email, disabled_at, last_login_at").eq("id", userId).maybeSingle(),
  )) as AdminRow | null;
  if (!row || row.disabled_at !== null) return null;
  // Roll the idle timer forward on every successful check (route/action contexts;
  // renders keep the old stamp — the session-ping route covers pure-browsing).
  const jar = await cookies();
  const seen = Number(jar.get(SEEN_COOKIE)?.value ?? "0");
  if (!jarWritable(jar, SEEN_OPTS)) return row;
  if (Date.now() / 1000 - seen > ROLL_EVERY) {
    jar.set(SEEN_COOKIE, String(Math.floor(Date.now() / 1000)), SEEN_OPTS);
  }
  return row;
}

/** Password sign-in. Tokens are stored HttpOnly; a per-IP + per-email throttle spans the DB. */
export async function adminLogin(
  email: string,
  password: string,
  iph: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const e = email.trim().toLowerCase();
  const { rateLimitAllow } = await import("./rate-limit");
  const allowed =
    (await rateLimitAllow(`adminlogin:ip:${iph}`, 15, 900)) &&
    (await rateLimitAllow(`adminlogin:em:${crypto.createHash("sha256").update(e).digest("hex").slice(0, 32)}`, 6, 900));
  if (!allowed) return { ok: false, error: "Too many attempts. Please wait a bit and try again." };

  const { data, error } = await anonClient().auth.signInWithPassword({ email: e, password });
  if (error || !data?.session) {
    const { insertAuditLog } = await import("./audit");
    await insertAuditLog("public", null, "admin.login_fail", null, e.slice(0, 3));
    return { ok: false, error: "Sign-in failed. Check your details and try again." };
  }
  const admin = (await qOrNull(
    db().from("admins").select("id, email, disabled_at").eq("id", data.session.user.id).maybeSingle(),
  )) as Pick<AdminRow, "id" | "email" | "disabled_at"> | null;
  if (!admin || admin.disabled_at !== null) {
    return { ok: false, error: "Sign-in failed. Check your details and try again." };
  }
  await setSessionCookies(data.session.access_token, data.session.refresh_token, IDLE_SECONDS);
  await db().from("admins").update({ last_login_at: new Date().toISOString() }).eq("id", admin.id);
  const { insertAuditLog } = await import("./audit");
  await insertAuditLog("admin", admin.id, "admin.login");
  return { ok: true };
}

export async function adminLogout(): Promise<void> {
  await clearSessionCookies();
}

/** High-impact actions require the password again, verified with Supabase Auth. */
export async function adminReauth(password: string, admin: AdminRow): Promise<boolean> {
  const { rateLimitAllow } = await import("./rate-limit");
  if (!(await rateLimitAllow(`adminreauth:${admin.id}`, 8, 900))) return false;
  const { error } = await anonClient().auth.signInWithPassword({ email: admin.email, password });
  return !error;
}
