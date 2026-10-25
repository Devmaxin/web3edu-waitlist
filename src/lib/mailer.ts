/**
 * Outbox processing. Mirrors app/Services/Mailer.php:
 *  - enqueue() is called inside the signup transaction (join_waitlist RPC), so a Resend
 *    outage can never roll back a signup; pass_resend enqueues happen here (ID keys).
 *  - process() claims a bounded batch with FOR UPDATE SKIP LOCKED (claim_email_jobs RPC),
 *    so overlapping workers (cron, after()-runner, admin batch) never double-send a row.
 *  - Resend Idempotency-Key = the job idempotency key (24h provider-side dedupe).
 *  - "accepted" means Resend took the request; only the webhook moves it to "delivered".
 */
import "server-only";
import crypto from "node:crypto";
import { db, qOrNull } from "./db";
import { randomHex } from "./crypto";
import { renderEmail } from "./email-templates";
import { resendSend } from "./resend-client";
import type { MemberRow } from "./pass";
import { ENV } from "./env";

export const MAX_ATTEMPTS = 5;

export type EmailJobRow = {
  id: number;
  member_id: number;
  campaign_id: number | null;
  kind: string;
  idempotency_key: string;
  status: string;
  attempts: number;
  next_attempt_at: string | null;
  lock_token: string | null;
  locked_until: string | null;
  provider_id: string | null;
  last_error: string | null;
  created_at: string;
  sent_at: string | null;
};

/** Enqueue a pass_resend / transactional job (never campaign mail from here). */
export async function enqueueJob(memberId: number, kind: string, idemKey: string): Promise<boolean> {
  const { error } = await db()
    .from("email_jobs")
    .insert({ member_id: memberId, kind, idempotency_key: idemKey, status: "pending" });
  if (error) {
    if ((error as { code?: string }).code === "23505") return false;
    throw new Error(`enqueue: ${error.message}`);
  }
  return true;
}

async function jobById(id: number): Promise<EmailJobRow | null> {
  return qOrNull(db().from("email_jobs").select("*").eq("id", id).maybeSingle()) as Promise<EmailJobRow | null>;
}

async function memberById(id: number): Promise<MemberRow | null> {
  return qOrNull(db().from("members").select("*").eq("id", id).maybeSingle()) as Promise<MemberRow | null>;
}

function emailConfigured(): boolean {
  return ENV.resendApiKey !== "" && !ENV.resendApiKey.includes("PLACEHOLDER");
}

/**
 * Claim and send up to `limit` due jobs. Bounded work per call.
 * Campaign mail is only ever sent while its campaign is in 'sending' (the claim RPC gates this;
 * queued, paused and cancelled campaigns are inert for every runner).
 * @returns counts: sent/retry/failed/suppressed/claimed
 */
export async function processEmailJobs(limit: number, campaignId?: number): Promise<{ sent: number; retry: number; failed: number; suppressed: number; claimed: number }> {
  const lim = Math.max(1, Math.min(limit, 25));
  const res = { sent: 0, retry: 0, failed: 0, suppressed: 0, claimed: 0 };
  if (!emailConfigured()) return res; // nothing to do; jobs stay pending for later

  const worker = randomHex(16);
  const args: Record<string, unknown> = { p_worker: worker, p_limit: lim };
  if (campaignId !== undefined) args.p_campaign_id = campaignId;
  const { data, error } = await db().rpc("claim_email_jobs", args);
  if (error) {
    console.error("[w3e] mailer claim:", error.message);
    return res;
  }
  const jobs = (data ?? []) as EmailJobRow[];
  res.claimed = jobs.length;
  if (res.claimed === 0) {
    await reclaimStuckRows();
    return res;
  }
  for (const job of jobs) {
    const outcome = await sendJob(job);
    res[outcome]++;
  }
  return res;
}

/** Rows that exhausted attempts while stuck in 'sending' must not stay invisible. */
async function reclaimStuckRows(): Promise<void> {
  await db()
    .from("email_jobs")
    .update({ status: "failed", last_error: "max attempts reached", lock_token: null })
    .eq("status", "sending")
    .lt("locked_until", new Date().toISOString())
    .gte("attempts", MAX_ATTEMPTS);
}

async function setJob(id: number, patch: Record<string, unknown>, lockToken?: string): Promise<void> {
  let upd = db().from("email_jobs").update(patch).eq("id", id);
  if (lockToken) upd = upd.eq("lock_token", lockToken);
  const { error } = await upd;
  if (error) console.error("[w3e] mailer update:", error.message);
}

async function finish(id: number, outcome: "failed" | "suppressed", err: string): Promise<"failed" | "suppressed"> {
  await setJob(id, { status: outcome, last_error: err.slice(0, 255), lock_token: null });
  return outcome;
}

/** @returns "sent" | "retry" | "failed" | "suppressed" */
export async function sendJob(job: EmailJobRow): Promise<"sent" | "retry" | "failed" | "suppressed"> {
  const id = job.id;
  const member = await memberById(job.member_id);
  if (!member || member.status !== "active") {
    return finish(id, "suppressed", "member inactive");
  }
  const isCampaign = job.kind === "launch_announcement";
  if (isCampaign && member.marketing_unsubscribed_at) {
    return finish(id, "suppressed", "unsubscribed");
  }
  let msg: Awaited<ReturnType<typeof renderEmail>>;
  try {
    msg = await renderEmail(job, member);
  } catch (e) {
    console.error(`[w3e] render failed job ${id}:`, e instanceof Error ? e.message : e);
    return finish(id, "failed", "render error");
  }
  if (!msg) return finish(id, "suppressed", "nothing to send");

  const r = await resendSend(member.email, msg, job.idempotency_key, job.kind);

  if (r.ok) {
    await setJob(
      id,
      {
        status: "accepted",
        provider_id: r.id ?? null,
        sent_at: new Date().toISOString(),
        last_error: null,
        lock_token: null,
      },
      job.lock_token ?? undefined,
    );
    return "sent";
  }
  if (r.permanent || job.attempts >= MAX_ATTEMPTS) {
    return finish(id, "failed", r.error);
  }
  const delayMin = Math.min(60, 2 ** job.attempts);
  await setJob(id, {
    status: "pending",
    next_attempt_at: new Date(Date.now() + delayMin * 60_000).toISOString(),
    last_error: r.error.slice(0, 255),
    lock_token: null,
  });
  return "retry";
}

/* ── Resend webhook (Svix) ──────────────────────────────────────────────────── */

type WebhookEvent = { type?: string; data?: { email_id?: string } };

/** Svix-style signature check used by Resend. `now` is injectable for tests. */
export function verifyWebhook(
  body: string,
  headers: { svixId?: string; svixTimestamp?: string; svixSignature?: string },
  now = Math.floor(Date.now() / 1000),
): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET ?? "";
  if (!secret.startsWith("whsec_") || secret.includes("PLACEHOLDER")) return false;
  const { svixId: id, svixTimestamp: ts, svixSignature: sig } = headers;
  if (!id || !ts || !sig || !/^\d+$/.test(ts) || Math.abs(now - Number(ts)) > 300) return false;
  let key: Buffer;
  try {
    key = Buffer.from(secret.slice(6), "base64");
  } catch {
    return false;
  }
  if (key.length === 0) return false;
  const expected = crypto.createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
  for (const part of sig.split(" ")) {
    const bits = part.split(",", 2);
    if (bits.length === 2 && bits[0] === "v1" && safeEqualBase64(expected, bits[1])) return true;
  }
  return false;
}

function safeEqualBase64(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

const RANK: Record<string, number> = {
  pending: 0, sending: 1, accepted: 2, delayed: 3, delivered: 4, bounced: 5, complained: 6,
};

export async function applyWebhookEvent(ev: WebhookEvent): Promise<void> {
  const map: Record<string, string> = {
    "email.delivered": "delivered",
    "email.bounced": "bounced",
    "email.complained": "complained",
    "email.delivery_delayed": "delayed",
  };
  const type = ev.type ?? "";
  const pid = ev.data?.email_id ?? "";
  const next = map[type];
  if (!next || pid === "") return;
  const job = (await qOrNull(
    db().from("email_jobs").select("id, member_id, status").eq("provider_id", pid).maybeSingle(),
  )) as { id: number; member_id: number; status: string } | null;
  if (!job) return;
  if ((RANK[job.status] ?? 0) < RANK[next]) {
    await db().from("email_jobs").update({ status: next }).eq("id", job.id);
  }
  if (next === "complained") {
    await db()
      .from("members")
      .update({ marketing_unsubscribed_at: new Date().toISOString() })
      .eq("id", job.member_id)
      .filter("marketing_unsubscribed_at", "is", null);
  }
  const { insertAuditLog } = await import("./audit");
  await insertAuditLog("system", null, `email.${next}`, `job:${job.id}`);
}

export { jobById };
