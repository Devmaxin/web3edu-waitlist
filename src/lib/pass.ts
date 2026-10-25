/**
 * Pass + QR tokens: HMAC of a per-member random secret (stored on the pass row) over
 * `kind|version`. Only SHA-256 hashes are stored for lookup; the raw tokens are never
 * stored. Mirrors the security model of app/Services/PassService.php.
 */
import crypto from "node:crypto";
import { sha256, b64u } from "./crypto";
import { db, qOrNull } from "./db";

type PassRow = { member_id: number; version: number; pass_secret: string; revoked_at: string | null };

export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

async function passRow(memberId: number): Promise<PassRow | null> {
  return qOrNull(
    db().from("passes").select("member_id, version, pass_secret, revoked_at").eq("member_id", memberId).maybeSingle(),
  ) as Promise<PassRow | null>;
}

function hmacToken(secret: string, kind: "qr" | "view", version: number): string {
  const key = Buffer.from(secret, "base64");
  return b64u(crypto.createHmac("sha256", key).update(`${kind}|${version}`).digest());
}

export function urlFor(pathKind: "p" | "q" | "qr", token: string): string {
  const base = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
  if (pathKind === "qr") return `${base}/qr/${token}`;
  return `${base}/${pathKind}/${token}`;
}

export type PassTokens = { version: number; qrToken: string; viewToken: string; qrUrl: string; viewUrl: string };

/** Re-derive both tokens for one member (fails clearly if the pass row is missing). */
export async function passTokens(memberId: number): Promise<PassTokens> {
  const row = await passRow(memberId);
  if (!row) throw new Error(`pass missing for member ${memberId}`);
  const qt = hmacToken(row.pass_secret, "qr", row.version);
  const vt = hmacToken(row.pass_secret, "view", row.version);
  return { version: row.version, qrToken: qt, viewToken: vt, qrUrl: urlFor("q", qt), viewUrl: urlFor("p", vt) };
}

export async function passVersion(memberId: number): Promise<number> {
  const row = await passRow(memberId);
  return row?.version ?? 1;
}

export type MemberRow = {
  id: number;
  waitlist_id: string;
  email: string;
  email_canonical: string;
  display_name: string | null;
  avatar: string | null;
  referral_code: string;
  device_hash: string | null;
  ip_hash: string | null;
  status: string;
  marketing_unsubscribed_at: string | null;
  created_at: string;
};

async function memberByHash(column: "qr_hash" | "view_hash", token: string): Promise<MemberRow | null> {
  if (!TOKEN_RE.test(token)) return null;
  const pass = (await qOrNull(
    db()
      .from("passes")
      .select("member_id, version, revoked_at")
      .eq(column, sha256(token))
      .maybeSingle(),
  )) as Pick<PassRow, "member_id" | "version" | "revoked_at"> | null;
  if (!pass || pass.revoked_at !== null) return null;
  const member = (await qOrNull(
    db().from("members").select("*").eq("id", pass.member_id).eq("status", "active").maybeSingle(),
  )) as MemberRow | null;
  return member;
}

/** Member row by pass view token if valid + pass not revoked + member active. */
export async function memberByView(token: string): Promise<MemberRow | null> {
  return memberByHash("view_hash", token);
}

/** Member row by QR token if valid + pass not revoked + member active. */
export async function memberByQr(token: string): Promise<MemberRow | null> {
  return memberByHash("qr_hash", token);
}

/** Pre-compute hashes for a new pass (called with the random secret before the insert). */
export function passHashes(secret: string, version = 1): { passSecret: string; qrHash: string; viewHash: string } {
  return {
    passSecret: secret,
    qrHash: sha256(hmacToken(secret, "qr", version)),
    viewHash: sha256(hmacToken(secret, "view", version)),
  };
}

/** Issue a new pass version (used on create + admin rotate; invalidates old links). */
export async function issuePass(memberId: number, version: number, secret: string): Promise<void> {
  const h = passHashes(secret, version);
  const { error } = await db().from("passes").upsert({
    member_id: memberId,
    version,
    pass_secret: h.passSecret,
    qr_hash: h.qrHash,
    view_hash: h.viewHash,
    revoked_at: null,
  });
  if (error) throw new Error(`issuePass: ${error.message}`);
}

export async function createPass(memberId: number, secret: string): Promise<void> {
  await issuePass(memberId, 1, secret);
}

/** Invalidate old links/QR and issue new ones (e.g. after a leak report). */
export async function rotatePass(memberId: number, adminLabel: string): Promise<void> {
  const row = await passRow(memberId);
  const v = (row?.version ?? 1) + 1;
  await issuePass(memberId, v, crypto.randomBytes(32).toString("base64"));
  const { insertAuditLog } = await import("./audit");
  await insertAuditLog("admin", adminLabel, "pass.rotate", `member:${memberId}`);
}
