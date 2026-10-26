/**
 * Launch-campaign integration tests (DB-gated, migration-0004-gated).
 *
 * They touch the STAGING database: randomly generated members + a dedicated test
 * campaign, all removed afterwards. Nothing is ever sent (Resend is not consulted);
 * the `launch_public` setting is flipped only inside the tests and restored.
 * The whole block is skipped when migration 0004 has not been applied yet
 * (campaigns.started_at missing) or when (staging) env vars are absent.
 */
import { afterAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { passTokens } from "@/lib/pass";
import { renderEmail } from "@/lib/email-templates";

const RUN =
  (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").includes(".supabase.co") &&
  /^\S+$/.test(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "") &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("PLACEHOLDER") &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY?.includes("PLACEHOLDER");

const PREFIX = "w3e-lc-";
const hex64 = (s: string) => createHash("sha256").update(s).digest("hex");

type JoinResult = { status: string; member_id?: number };
async function joinWaitlist(email: string): Promise<JoinResult> {
  const r = await db().rpc("join_waitlist", {
    p_email: email,
    p_email_canonical: email.toLowerCase(),
    p_display_name: "Launch test member",
    p_avatar: null,
    p_referral_code: null,
    p_ip_hash: hex64("w3e-lc-ip"),
    p_device_hash: hex64(`w3e-lc-dev:${email}`),
    p_pass_secret: hex64(`w3e-lc-pass:${email}`).slice(0, 43),
    p_qr_hash: hex64(`w3e-lc-qr:${email}`),
    p_view_hash: hex64(`w3e-lc-view:${email}`),
  });
  if (r.error) throw new Error(`join_waitlist: ${r.error.message}`);
  return r.data as JoinResult;
}

const memberIds: number[] = [];
const campaignIds: number[] = [];
let originalLaunch: string | null = null;

async function cleanup(): Promise<void> {
  if (campaignIds.length > 0) {
    await db().from("email_jobs").delete().in("campaign_id", campaignIds);
    await db().from("campaigns").delete().in("id", campaignIds);
  }
  if (memberIds.length > 0) {
    const ids = [...memberIds];
    await db().from("email_jobs").delete().in("member_id", ids);
    await db().from("points_ledger").delete().in("member_id", ids);
    await db().from("passes").delete().in("member_id", ids);
    await db().from("referrals").delete().or(`referred_id.in.(${ids.join(",")}),referrer_id.in.(${ids.join(",")})`);
    await db().from("members").delete().in("id", ids);
  }
  if (originalLaunch !== null) {
    await db().from("settings").upsert({ k: "launch_public", v: originalLaunch, updated_at: new Date().toISOString() });
  }
}
afterAll(cleanup);

// Migration 0004 gate, evaluated once before the suite registers.
const { has0004 } = await (async () => {
  const r = await db().from("campaigns").select("started_at").limit(1);
  return { has0004: r.error === null };
})();

const SKIP = !RUN || !has0004;

const stamp = () => Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);

async function newCampaign(): Promise<number> {
  const { data, error } = await db()
    .from("campaigns")
    .insert({
      name: `it:launch:${stamp()}`,
      subject: "Web3Edu is officially live!",
      preheader: null,
      intro_text: "",
      status: "draft",
      created_by: "00000000-0000-4000-8000-000000000000", // int-tests only, no admin row needed
    })
    .select("id")
    .single();
  if (error) throw new Error(`campaigns.insert: ${error.message}`);
  const id = (data as { id: number }).id;
  campaignIds.push(id);
  return id;
}

describe.skipIf(SKIP)("launch campaign (staging DB, 0004 applied)", () => {
  it("queue_campaign: launch flag enforced inside the RPC, eligibility + idempotency", async () => {
    // remember the launch flag, restore it in afterAll
    const cur = (await db().from("settings").select("v").eq("k", "launch_public").maybeSingle()).data as { v: string } | null;
    originalLaunch = cur?.v ?? "0";

    const cid = await newCampaign();
    const e1 = `${PREFIX}elig1${stamp()}@integration.invalid`;
    const e2 = `${PREFIX}elig2${stamp()}@integration.invalid`;
    const m1 = await joinWaitlist(e1);
    const m2 = await joinWaitlist(e2);
    memberIds.push(m1.member_id as number, m2.member_id as number);
    // m2 unsubscribed from marketing → not eligible
    await db().from("members").update({ marketing_unsubscribed_at: new Date().toISOString() }).eq("id", m2.member_id as number);

    // launch OFF → -2, no rows created, campaign stays draft
    await db().from("settings").upsert({ k: "launch_public", v: "0", updated_at: new Date().toISOString() });
    const off = await db().rpc("queue_campaign", { p_campaign_id: cid });
    expect(off.data).toBe(-2);
    const { count: jobsOff } = await db().from("email_jobs").select("id", { count: "exact" }).eq("campaign_id", cid).limit(0);
    expect(jobsOff).toBe(0);
    expect(((await db().from("campaigns").select("status").eq("id", cid).maybeSingle()).data as { status: string }).status).toBe("draft");

    // launch ON → exactly 1 eligible row; unsubscribed member excluded
    await db().from("settings").upsert({ k: "launch_public", v: "1", updated_at: new Date().toISOString() });
    const on = await db().rpc("queue_campaign", { p_campaign_id: cid });
    expect(on.data).toBe(1);
    const rows = (await db().from("email_jobs").select("member_id, kind, idempotency_key").eq("campaign_id", cid)).data;
    expect(rows).toEqual([
      expect.objectContaining({
        member_id: m1.member_id,
        kind: "launch_announcement",
        idempotency_key: `campaign:${cid}:member:${m1.member_id}`,
      }),
    ]);
    // campaign flipped to queued
    expect(((await db().from("campaigns").select("status, queued_at").eq("id", cid).maybeSingle()).data as { status: string }).status).toBe("queued");

    // re-queue → -1 (already queued), still exactly one row per member
    expect((await db().rpc("queue_campaign", { p_campaign_id: cid })).data).toBe(-1);
  }, 30_000);

  it("one row per member per campaign: the unique index blocks duplicates", async () => {
    // create a queued campaign + one job, then attempt the duplicate insert
    await db().from("settings").upsert({ k: "launch_public", v: "1", updated_at: new Date().toISOString() });
    if (originalLaunch === null) originalLaunch = "0";

    const cid = await newCampaign();
    const email = `${PREFIX}uniq${stamp()}@integration.invalid`;
    const m = await joinWaitlist(email);
    memberIds.push(m.member_id as number);
    const q = await db().rpc("queue_campaign", { p_campaign_id: cid });
    expect(q.data).toBe(1);
    const row = (await db().from("email_jobs").select("id").eq("campaign_id", cid).maybeSingle()).data as { id: number };
    expect(row).not.toBeNull();

    const dup = await db()
      .from("email_jobs")
      .insert({
        member_id: m.member_id as number,
        campaign_id: cid,
        kind: "launch_announcement",
        idempotency_key: `campaign:${cid}:member:${m.member_id}`,
      });
    expect(dup.error?.code).toBe("23505"); // unique violation
  }, 30_000);

  it("claim_email_jobs only claims while the campaign is 'sending' (lease blocks overlap)", async () => {
    await db().from("settings").upsert({ k: "launch_public", v: "1", updated_at: new Date().toISOString() });
    if (originalLaunch === null) originalLaunch = "0";

    const cid = await newCampaign();
    const email = `${PREFIX}claim${stamp()}@integration.invalid`;
    const m = await joinWaitlist(email);
    memberIds.push(m.member_id as number);
    expect((await db().rpc("queue_campaign", { p_campaign_id: cid })).data).toBe(1);

    // queued (≠ sending) → nothing claimable, even though the job is pending
    const gated = await db().rpc("claim_email_jobs", { p_worker: "it-lc", p_limit: 10, p_campaign_id: cid });
    expect((gated.data as unknown[]).length).toBe(0);

    // while 'sending' → one claim works
    await db().from("campaigns").update({ status: "sending" }).eq("id", cid);
    const c1 = await db().rpc("claim_email_jobs", { p_worker: "it-lc", p_limit: 10, p_campaign_id: cid });
    expect((c1.data as unknown[]).length).toBe(1);

    // claimed row is leased: a concurrent worker gets nothing
    const c2 = await db().rpc("claim_email_jobs", { p_worker: "it-lc-worker2", p_limit: 10, p_campaign_id: cid });
    expect((c2.data as unknown[]).length).toBe(0);
  }, 30_000);

  it("renderEmail: per-member QR + pass URLs, launch copy, no cross-member tokens", async () => {
    await db().from("settings").upsert({ k: "launch_public", v: "1", updated_at: new Date().toISOString() });
    if (originalLaunch === null) originalLaunch = "0";

    const cid = await newCampaign();
    const e1 = `${PREFIX}pers1${stamp()}@integration.invalid`;
    const e2 = `${PREFIX}pers2${stamp()}@integration.invalid`;
    const m1 = await joinWaitlist(e1);
    const m2 = await joinWaitlist(e2);
    memberIds.push(m1.member_id as number, m2.member_id as number);

    const rows = (await db().from("members").select("*").in("id", [m1.member_id as number, m2.member_id as number])).data as
      | Array<Record<string, unknown>>
      | null;
    expect(rows?.length).toBe(2);

    const msgs = [];
    const tokens: Array<{ qr: string; view: string }> = [];
    for (const row of rows ?? []) {
      const msg = await renderEmail({ kind: "launch_announcement", campaign_id: cid } as never, row as never);
      expect(msg).not.toBeNull();
      msgs.push(msg);
      // member's own HMAC tokens appear as /qr/<t> and /p/<t>; extract from a fresh derivation
      tokens.push(
        await (async () => {
          const pt = await passTokens(row.id as number);
          return { qr: pt.qrToken, view: pt.viewToken };
        })(),
      );
    }

    for (const [i, msg] of msgs.entries()) {
      expect(msg!.subject).toBe("Web3Edu is officially live!");
      expect(msg!.html).toContain("You’re in. Web3Edu is live.");
      // own pass page AND own PNG QR endpoint — each member sees only her own tokens
      expect(msg!.html).toContain(`/p/${tokens[i].view}`);
      expect(msg!.html).toContain(`/qr/${tokens[i].qr}`);
      // NOT the other member's tokens
      expect(msg!.html).not.toContain(`/p/${tokens[1 - i].view}`);
      expect(msg!.html).not.toContain(`/qr/${tokens[1 - i].qr}`);
      // the <img> must point to the PNG endpoint, never at the /q HTML page
      expect(msg!.html).not.toMatch(/src="[^"']*\/q\//);
    }
  }, 60_000);
});
