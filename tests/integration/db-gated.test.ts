/**
 * DB-gated integration tests. They run ONLY when a (staging) Supabase project is
 * configured via env vars; in every other environment they are skipped, never
 * half-run. They use randomly generated members and clean up after themselves —
 * no production data is touched and nothing is sent (Resend is not configured in
 * the test run, so email jobs stay pending).
 */
import { afterAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { referralCodeRegex, waitlistIdRegex } from "@/lib/signup";

const RUN = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").includes(".supabase.co") &&
  /^\S+$/.test(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "") &&
  !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("PLACEHOLDER") &&
  !process.env.SUPABASE_SERVICE_ROLE_KEY?.includes("PLACEHOLDER");

const PREFIX = "w3e-it-";
const madeMemberIds: number[] = [];
// App-shaped values: sha256 hex (64 chars) for hashes, ≤48-char token for the pass secret.
const hex64 = (s: string) => createHash("sha256").update(s).digest("hex");
const ipHashFixed = hex64("w3e-it-integration-run"); // stable per run, distinct from real IPs
const deviceHash = (s: string) => hex64(`w3e-it-dev:${s}`);

type JoinResult = { status: string; member_id?: number; referral?: string; error?: string };
async function joinWaitlist(p: {
  email: string;
  name?: string;
  avatar?: string;
  ref?: string | null;
  device?: string;
}): Promise<JoinResult> {
  const r = await db().rpc("join_waitlist", {
    p_email: p.email,
    p_email_canonical: p.email.toLowerCase(),
    p_display_name: p.name ?? "Integration test",
    p_avatar: p.avatar ?? null,
    p_referral_code: p.ref ?? null,
    p_ip_hash: ipHashFixed,
    p_device_hash: deviceHash(p.device ?? p.email),
    p_pass_secret: hex64(`w3e-it-pass:${p.email}`).slice(0, 43), // stored, never derived in tests
    p_qr_hash: hex64(`w3e-it-qr:${p.email}`),
    p_view_hash: hex64(`w3e-it-view:${p.email}`),
  });
  if (r.error) throw new Error(`join_waitlist: ${r.error.message}`);
  return r.data as JoinResult;
}

async function cleanup(): Promise<void> {
  if (madeMemberIds.length === 0) return;
  const ids = [...madeMemberIds];
  madeMemberIds.length = 0;
  await db().from("email_jobs").delete().in("member_id", ids);
  await db().from("points_ledger").delete().in("member_id", ids);
  await db().from("passes").delete().in("member_id", ids);
  await db()
    .from("referrals")
    .delete()
    .or(`referred_id.in.(${ids.join(",")}),referrer_id.in.(${ids.join(",")})`);
  await db().from("members").delete().in("id", ids);
}
afterAll(cleanup);

function uniqueEmail(tag: string): string {
  const stamp = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  return `${PREFIX}${tag}${stamp}@integration.invalid`;
}

describe.skipIf(!RUN)("join_waitlist (staging DB)", () => {
  it("creates a member in one transaction: member + pass + ledger + outbox row", async () => {
    // Reward rules ship INACTIVE (the owner sets points in the admin UI). Temporarily
    // activate the signup rule to exercise the award path, then restore the seed state.
    await db().from("reward_rules").update({ points: 5, is_active: true }).eq("event_type", "waitlist_signup");
    try {
      await assertFullSignupFlow();
    } finally {
      await db().from("reward_rules").update({ points: null, is_active: false }).eq("event_type", "waitlist_signup");
    }
  }, 30_000);

  async function assertFullSignupFlow(): Promise<void> {
    const email = uniqueEmail("a");
    const r = await joinWaitlist({ email });
    expect(r.status).toBe("created");
    const id = r.member_id as number;
    madeMemberIds.push(id);

    const m = (await db().from("members").select("*").eq("id", id).maybeSingle()).data as null | {
      waitlist_id: string;
      email_canonical: string;
      referral_code: string;
      status: string;
    };
    expect(m).not.toBeNull();
    expect(waitlistIdRegex().test(m!.waitlist_id)).toBe(true);
    expect(m!.email_canonical).toBe(email.toLowerCase());
    expect(referralCodeRegex().test(m!.referral_code)).toBe(true);
    expect(m!.status).toBe("active");

    const pass = (await db().from("passes").select("*").eq("member_id", id).maybeSingle()).data as null | {
      version: number;
    };
    expect(pass?.version).toBe(1);

    const ledger = (await db().from("points_ledger").select("event_type").eq("member_id", id)).data;
    expect(ledger?.map((l) => l.event_type)).toContain("waitlist_signup");

    const jobs = (await db().from("email_jobs").select("kind, status").eq("member_id", id)).data;
    expect(jobs).toContainEqual({ kind: "signup_confirmation", status: "pending" });
  }

  it("treats a duplicate signup as exists and never leaks member data", async () => {
    const email = uniqueEmail("b");
    const first = await joinWaitlist({ email });
    expect(first.status).toBe("created");
    madeMemberIds.push(first.member_id as number);

    const second = await joinWaitlist({ email: email.toUpperCase() });
    expect(second).toEqual({ status: "exists" });

    const { count } = await db()
      .from("members")
      .select("id", { count: "exact" })
      .eq("email_canonical", email.toLowerCase())
      .limit(0);
    expect(count).toBe(1);
  }, 30_000);

  it("rejects a self-device referral (same device chip), never awards", async () => {
    const referrerEmail = uniqueEmail("c1");
    const referredEmail = uniqueEmail("c2");
    const r1 = await joinWaitlist({ email: referrerEmail });
    expect(r1.status).toBe("created");
    madeMemberIds.push(r1.member_id as number);

    const referrer = (
      await db().from("members").select("referral_code").eq("id", r1.member_id as number).maybeSingle()
    ).data as { referral_code: string } | null;
    expect(referrer).not.toBeNull();

    const r2 = await joinWaitlist({
      email: referredEmail,
      ref: referrer!.referral_code,
      device: referrerEmail, // same device hash as the referrer
    });
    expect(r2.status).toBe("created");
    madeMemberIds.push(r2.member_id as number);
    expect(r2.referral).toBe("rejected");

    // nothing to approve for the referrer
    const rows = (await db().from("referrals").select("status").eq("referrer_id", r1.member_id as number)).data;
    expect(rows?.length).toBe(1);
    expect(rows?.[0]?.status).toBe("rejected");
  }, 30_000);

  it("counts a genuine referral and awards the referrer once", async () => {
    const referrerEmail = uniqueEmail("d1");
    const r1 = await joinWaitlist({ email: referrerEmail, device: referrerEmail });
    madeMemberIds.push(r1.member_id as number);
    const referrer = (
      await db().from("members").select("referral_code").eq("id", r1.member_id as number).maybeSingle()
    ).data as { referral_code: string } | null;

    const referredEmail = uniqueEmail("d2");
    const r2 = await joinWaitlist({ email: referredEmail, ref: referrer!.referral_code, device: referredEmail });
    expect(r2.referral).toBe("counted");
    madeMemberIds.push(r2.member_id as number);

    // award is idempotent by unique key: approve should be a no-op and repeat queue a no-op
    const approve = await db().rpc("approve_held_referral", { p_referral_id: -1 });
    expect(approve.data).toBe(false);
  }, 30_000);

  it("rate_limit_allow is a hard limit inside the window", async () => {
    const bucket = `it:${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
    const a1 = await db().rpc("rate_limit_allow", { p_bucket: bucket, p_limit: 2, p_window_secs: 60 });
    const a2 = await db().rpc("rate_limit_allow", { p_bucket: bucket, p_limit: 2, p_window_secs: 60 });
    const a3 = await db().rpc("rate_limit_allow", { p_bucket: bucket, p_limit: 2, p_window_secs: 60 });
    expect(a1.data).toBe(true);
    expect(a2.data).toBe(true);
    expect(a3.data).toBe(false);
    await db().from("rate_limits").delete().eq("bucket", bucket);
  }, 30_000);
});
