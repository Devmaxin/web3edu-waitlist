/**
 * Points ledger reads (append-only; awards happen inside the join/award SQL functions).
 * Mirrors parts of app/Services/Ledger.php.
 */
import "server-only";
import { db, q } from "./db";

export const EVENT_SIGNUP = "waitlist_signup";
export const EVENT_REFERRAL = "referral_signup";

export type RewardRule = {
  event_type: string;
  label: string;
  points: number | null;
  is_active: boolean;
};

export async function rule(event: string): Promise<RewardRule | null> {
  return qOrNull(
    db().from("reward_rules").select("*").eq("event_type", event).maybeSingle(),
  ) as Promise<RewardRule | null>;
}

function qOrNull<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>) {
  return p.then((r) => (r.error ? null : r.data));
}

/** Active configured value, or null when inactive/unset. */
export async function activePoints(event: string): Promise<number | null> {
  const r = await rule(event);
  return r && r.is_active && (r.points ?? 0) > 0 ? r.points : null;
}

/** True when at least one rule is active with a value; drives public reward wording. */
export async function anyRewardActive(): Promise<boolean> {
  const { data, error } = await db()
    .from("reward_rules")
    .select("event_type")
    .eq("is_active", true)
    .gt("points", 0)
    .limit(1);
  if (error) return false;
  return (data?.length ?? 0) > 0;
}

export async function balance(memberId: number): Promise<number> {
  try {
    const { data, error } = await db()
      .from("points_ledger")
      .select("points")
      .eq("member_id", memberId);
    if (error) throw new Error(error.message);
    return (data ?? []).reduce((s, r) => s + Number((r as { points: number }).points), 0);
  } catch {
    return 0;
  }
}

/** Points earned specifically from referrals (launch email breakdown). */
export async function referralPoints(memberId: number): Promise<number> {
  try {
    const { data, error } = await db()
      .from("points_ledger")
      .select("points")
      .eq("member_id", memberId)
      .eq("event_type", EVENT_REFERRAL);
    if (error) throw new Error(error.message);
    return (data ?? []).reduce((s, r) => s + Number((r as { points: number }).points), 0);
  } catch {
    return 0;
  }
}

/** Explicit audited manual correction (signed delta, reason mandatory). */
export async function adjust(
  memberId: number,
  delta: number,
  reason: string,
  adminId: string,
): Promise<void> {
  const trimmed = reason.trim();
  if (delta === 0 || trimmed === "") throw new Error("delta and reason required");
  const { error } = await db().from("points_ledger").insert({
    member_id: memberId,
    event_type: "adjustment",
    points: delta,
    reason: trimmed.slice(0, 200),
    idempotency_key: `adj:${crypto.randomUUID()}`,
    actor_admin_id: adminId,
  });
  if (error) throw new Error(`adjust: ${error.message}`);
  const { insertAuditLog } = await import("./audit");
  await insertAuditLog("admin", adminId, "ledger.adjust", `member:${memberId}`, `delta=${delta}`);
}

/** Reverse one ledger row exactly once (idempotency key rev:<id>). */
export async function reverse(
  ledgerId: number,
  reason: string,
  adminId: string,
): Promise<boolean> {
  const row = (await qOrNull(
    db().from("points_ledger").select("*").eq("id", ledgerId).maybeSingle(),
  )) as { id: number; member_id: number; points: number; event_type: string } | null;
  if (!row || row.points <= 0 || row.event_type === "reversal") return false;
  const { error } = await db().from("points_ledger").insert({
    member_id: row.member_id,
    event_type: "reversal",
    points: -row.points,
    reason: `Reversal: ${reason}`.slice(0, 200),
    idempotency_key: `rev:${ledgerId}`,
    reverses_id: ledgerId,
    actor_admin_id: adminId,
  });
  if (error) {
    if ((error as { code?: string }).code === "23505") return false; // already reversed
    throw new Error(`reverse: ${error.message}`);
  }
  const { insertAuditLog } = await import("./audit");
  await insertAuditLog("admin", adminId, "ledger.reverse", `ledger:${ledgerId}`);
  return true;
}
