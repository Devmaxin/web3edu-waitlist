"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentAdmin, adminLogin, adminLogout, adminReauth, type AdminRow } from "@/lib/admin-auth";
import { db, qOrNull } from "@/lib/db";
import { clientIp } from "@/lib/ip";
import { ipHash } from "@/lib/crypto";
import { setSetting, launchPublic } from "@/lib/settings";
import { adjust, reverse } from "@/lib/ledger";
import { rotatePass, type MemberRow } from "@/lib/pass";
import { enqueueJob, processEmailJobs } from "@/lib/mailer";
import { renderEmail } from "@/lib/email-templates";
import { resendSend } from "@/lib/resend-client";
import { randomHex } from "@/lib/crypto";
import { rateLimitAllow } from "@/lib/rate-limit";
import { insertAuditLog } from "@/lib/audit";
import { flashUrl } from "@/app/admin/shell";
import { validSiteUrl } from "@/lib/campaign-view";

/* ── session ─────────────────────────────────────────────────────────────── */

export async function signOut(): Promise<void> {
  let email: string | null = null;
  try {
    const a: AdminRow | null = await currentAdmin();
    email = a ? a.id : null;
  } catch { /* already signed out */ }
  await adminLogout();
  void email; // email not retained in logs
  redirect("/admin/login");
}

export async function doLogin(_prev: LoginState, fd: FormData): Promise<LoginState> {
  const r = await adminLogin(String(fd.get("email") ?? ""), String(fd.get("password") ?? ""), ipHash(await clientIp()));
  if (r.ok) redirect("/admin");
  return { err: r.error };
}

export type LoginState = { err?: string };

/* ── member actions (password reauth on every mutation) ───────────────────── */

export async function memberAction(fd: FormData): Promise<void> {
  const admin = await require();
  const home = `/admin/members/${String(fd.get("id") ?? 0)}`;
  if (!(await reauth(admin, fd))) redirect(flashUrl(home, "Password confirmation failed.", false));

  const act = String(fd.get("action") ?? "");
  const id = Number(fd.get("id") ?? 0);
  if (!Number.isSafeInteger(id) || id <= 0) redirect(home);

  switch (act) {
    case "adjust": {
      const delta = Number(fd.get("delta") ?? 0);
      const reason = String(fd.get("reason") ?? "").trim();
      if (delta === 0 || Math.abs(delta) > 100000 || reason === "") {
        redirect(flashUrl(home, "Enter a non-zero amount and a reason.", false));
      }
      try {
        await adjust(id, delta, reason, admin.id);
        redirect(flashUrl(home, "Adjustment recorded in the ledger."));
      } catch (e) {
        redirect(flashUrl(home, `Could not adjust: ${(e as Error).message}`, false));
      }
      break;
    }
    case "reverse": {
      const ledgerId = Number(fd.get("ledger_id") ?? 0);
      const reason = String(fd.get("reason") ?? "").trim() || "admin";
      const ok = await reverse(ledgerId, reason, admin.id);
      redirect(flashUrl(home, ok ? "Reversal recorded." : "Could not reverse (already reversed or not eligible).", ok));
      break;
    }
    case "rotate_pass": {
      await rotatePass(id, admin.id);
      redirect(flashUrl(home, "Pass re-issued. Old QR and pass links no longer work."));
      break;
    }
    case "resend_pass": {
      await enqueueJob(id, "pass_resend", `pass_resend:${id}:${Math.floor(Date.now() / 1000)}`);
      await insertAuditLog("admin", admin.id, "email.resend_pass", `member:${id}`);
      redirect(flashUrl(home, "Pass email queued."));
      break;
    }
    case "block":
    case "unblock": {
      await db().from("members").update({ status: act === "block" ? "blocked" : "active" }).eq("id", id);
      await insertAuditLog("admin", admin.id, `member.${act}`, `member:${id}`);
      redirect(flashUrl(home, `Member ${act === "block" ? "blocked" : "unblocked"}.`));
      break;
    }
    default:
      redirect(home);
  }
}

/* ── held referrals ──────────────────────────────────────────────────────── */

export async function approveReferral(fd: FormData): Promise<void> {
  const admin = await require();
  if (!(await reauth(admin, fd))) redirect(flashUrl("/admin/referrals", "Password confirmation failed.", false));
  const rid = Number(fd.get("referral_id") ?? 0);
  const { error } = await db().rpc("approve_held_referral", { p_referral_id: rid });
  const ok = !error;
  if (error) console.error(`[w3e] approve referral: ${error.message}`);
  await insertAuditLog("admin", admin.id, "referral.approve", `referral:${rid}`);
  redirect(flashUrl("/admin/referrals", ok ? "Referral approved and awarded (if the rule is active)." : "Nothing to approve.", ok));
}

/* ── rewards ─────────────────────────────────────────────────────────────── */

export async function saveRewards(fd: FormData): Promise<void> {
  const admin = await require();
  if (!(await reauth(admin, fd))) redirect(flashUrl("/admin/rewards", "Password confirmation failed.", false));

  const act = String(fd.get("action") ?? "save");

  if (act === "backfill") {
    const ev = String(fd.get("event") ?? "");
    if (!["waitlist_signup", "referral_signup"].includes(ev) || String(fd.get("confirm") ?? "").trim() !== "BACKFILL") {
      redirect(flashUrl("/admin/rewards", "Type BACKFILL to confirm.", false));
    }
    const { data, error } = await db().rpc("backfill_rewards", { p_event: ev, p_limit: 500 });
    if (error) {
      redirect(flashUrl("/admin/rewards", `Backfill failed: ${error.message}`, false));
    }
    const n = Number(data ?? 0);
    await insertAuditLog("admin", admin.id, "rewards.backfill", ev, `awards=${n}`);
    redirect(flashUrl("/admin/rewards", `Backfill created ${n} award(s). Repeat until it reports 0.`));
  }

  // default: save rules
  const rules = (await qOrNull(db().from("reward_rules").select("event_type").order("event_type"))) as Array<{ event_type: string }> | null;
  const errors: string[] = [];
  for (const r of rules ?? []) {
    const ev = r.event_type;
    const raw = String(fd.get(`points_${ev}`) ?? "").trim();
    const active = String(fd.get(`active_${ev}`) ?? "") === "on";
    let pts: number | null;
    if (raw === "") pts = null;
    else if (/^\d+$/.test(raw)) pts = Number(raw);
    else pts = -1;
    if (pts !== null && (pts < 0 || pts > 100000)) {
      errors.push(`${ev}: enter a whole number up to 100000.`);
      continue;
    }
    if ((pts === null || pts < 1) && active) {
      errors.push(`${ev}: set a value before activating.`);
      continue;
    }
    await setRule(ev, pts, active, admin.id);
  }
  redirect(flashUrl("/admin/rewards", errors.length > 0 ? errors.join(" ") : "Reward settings saved. Existing ledger entries are not changed.", errors.length === 0));
}

async function setRule(ev: string, pts: number | null, active: boolean, adminId: string): Promise<void> {
  await db()
    .from("reward_rules")
    .update({ points: pts, is_active: active, updated_by: adminId, updated_at: new Date().toISOString() })
    .eq("event_type", ev);
  await insertAuditLog("admin", adminId, "rewards.rule", ev, `points=${JSON.stringify(pts)} active=${String(active)}`);
}

/* ── launch controls ─────────────────────────────────────────────────────── */

const PHRASES: Record<string, string> = {
  enable_launch: "ENABLE PUBLIC LAUNCH",
  disable_launch: "DISABLE PUBLIC LAUNCH",
  save_url: "SAVE SIGNUP URL",
  signups_open: "OPEN SIGNUPS",
  signups_close: "CLOSE SIGNUPS",
};

export async function launchAction(fd: FormData): Promise<void> {
  const admin = await require();
  const act = String(fd.get("action") ?? "");
  if (!Object.hasOwn(PHRASES, act)) redirect("/admin/launch");
  if (String(fd.get("confirm") ?? "").trim() !== PHRASES[act] || !(await reauth(admin, fd))) {
    redirect(flashUrl("/admin/launch", "Confirmation phrase or password was wrong. Nothing changed.", false));
  }
  switch (act) {
    case "enable_launch":
      await setSetting("launch_public", "1");
      break;
    case "disable_launch":
      await setSetting("launch_public", "0");
      break;
    case "signups_open":
      await setSetting("signups_open", "1");
      break;
    case "signups_close":
      await setSetting("signups_open", "0");
      break;
    case "save_url": {
      const u = String(fd.get("main_register_url") ?? "").trim();
      if (u !== "" && !validSiteUrl(u)) {
        redirect(flashUrl("/admin/launch", "URL must start with https:// and contain no spaces.", false));
      }
      await setSetting("main_register_url", u);
      break;
    }
  }
  await insertAuditLog("admin", admin.id, `launch.${act}`);
  redirect(flashUrl("/admin/launch", `Done: ${act.replaceAll("_", " ")}.`));
}

/* ── emails ──────────────────────────────────────────────────────────────── */

export async function emailsAction(fd: FormData): Promise<void> {
  const admin = await require();
  const act = String(fd.get("action") ?? "");
  if (act === "save_dest") {
    if (!(await reauth(admin, fd))) redirect(flashUrl("/admin/emails", "Password confirmation failed. URL unchanged.", false));
    const u = String(fd.get("main_register_url") ?? "").trim();
    if (!validSiteUrl(u)) {
      redirect(flashUrl("/admin/emails", "URL must start with https:// and contain no spaces.", false));
    }
    const { setSetting } = await import("@/lib/settings");
    await setSetting("main_register_url", u);
    await insertAuditLog("admin", admin.id, "email.save_dest", null, u.slice(0, 100));
    redirect(flashUrl("/admin/emails", "Main website destination saved."));
  } else if (act === "retry_failed") {
    const { data, error } = await db()
      .from("email_jobs")
      .update({ status: "pending", attempts: 0, next_attempt_at: new Date().toISOString(), last_error: null })
      .eq("status", "failed")
      .filter("campaign_id", "is", null)
      .select("id");
    const n = (data ?? []).length;
    if (error) console.error(`[w3e] retry_failed: ${error.message}`);
    await insertAuditLog("admin", admin.id, "email.retry_failed", null, `n=${n}`);
    redirect(flashUrl("/admin/emails", `${n} transactional email(s) re-queued.`));
  } else if (act === "process") {
    const r = await processEmailJobs(5);
    redirect(
      flashUrl(
        "/admin/emails",
        `Processed: ${r.sent} accepted, ${r.retry} to retry, ${r.failed} failed, ${r.suppressed} suppressed.`,
      ),
    );
  } else {
    redirect("/admin/emails");
  }
}

/* ── campaigns ───────────────────────────────────────────────────────────── */

export async function campaignSave(fd: FormData): Promise<void> {
  const admin = await require();
  const id = Number(fd.get("id") ?? 0);
  const name = String(fd.get("name") ?? "").trim();
  const subject = String(fd.get("subject") ?? "").trim();
  const preheader = String(fd.get("preheader") ?? "").trim();
  const intro = String(fd.get("intro_text") ?? "").trim();
  const minRaw = String(fd.get("min_points") ?? "").trim();
  const minPoints = minRaw === "" ? null : Math.max(0, Number(minRaw));

  if (name === "" || subject === "" || [...intro].length < 10 || subject.length > 150 || [...intro].length > 4000) {
    redirect(flashUrl(id > 0 ? `/admin/campaigns/${id}/edit` : "/admin/campaigns/new", "Name, subject (max 150) and an intro of 10–4000 characters are required.", false));
  }

  if (id > 0) {
    await db().from("campaigns").update({ name, subject, preheader: preheader || null, intro_text: intro, min_points: minPoints }).eq("id", id).eq("status", "draft");
    redirect(`/admin/campaigns/${id}`);
  } else {
    const { data, error } = await db()
      .from("campaigns")
      .insert({ name, subject, preheader: preheader || null, intro_text: intro, min_points: minPoints, created_by: admin.id })
      .select("id")
      .single();
    if (error || !data) {
      redirect(flashUrl("/admin/campaigns/new", `Could not create campaign: ${error?.message ?? "error"}`, false));
    }
    const nid = (data as { id: number }).id;
    await insertAuditLog("admin", admin.id, "campaign.create", `campaign:${nid}`);
    redirect(`/admin/campaigns/${nid}`);
  }
}

const CAM_ACTIONS: Record<string, string> = { start: "sending", pause: "paused", cancel: "cancelled" };

/** Eligible campaign recipients: active, subscribed to campaign mail, optional min balance. */
export async function eligibleCount(minPoints: number | null): Promise<number> {
  let query = db()
    .from("members_admin_summary")
    .select("id", { count: "exact" })
    .eq("status", "active")
    .filter("marketing_unsubscribed_at", "is", null)
    .limit(0);
  if (minPoints !== null) query = query.gte("points_ledger_sum", minPoints);
  const { count, error } = await query;
  if (error) console.error(`[w3e] eligible count: ${error.message}`);
  return count ?? 0;
}

export async function campaignAction(fd: FormData): Promise<void> {
  const admin = await require();
  const id = Number(fd.get("id") ?? 0);
  const act = String(fd.get("action") ?? "");
  const home = `/admin/campaigns/${id}`;

  const c = (await qOrNull(db().from("campaigns").select("id, status, min_points").eq("id", id).maybeSingle())) as {
    id: number;
    status: string;
    min_points: number | null;
  } | null;
  if (!c) redirect("/admin/campaigns");

  if (act === "test") {
    const to = String(fd.get("to") ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(to) || to.length > 190) {
      redirect(flashUrl(home, "Enter a valid recipient address for the test.", false));
    }
    if (!(await rateLimitAllow(`campaigntest:${admin.id}`, 10, 3600))) {
      redirect(flashUrl(home, "Test limit reached (max 10 tests per hour).", false));
    }
    const m = (await qOrNull(
      db().from("members").select("*").order("id", { ascending: true }).limit(1).maybeSingle(),
    )) as MemberRow | null;
    if (!m) redirect(flashUrl(home, "Add at least one waitlist member first (sign up with a test address).", false));
    const msg = await renderEmail({ kind: "launch_announcement", campaign_id: id }, m);
    if (!msg) redirect(flashUrl(home, "Could not render this campaign; check its details.", false));
    const r = await resendSend(to, { ...msg, subject: `[TEST] ${msg.subject}` }, `test:${id}:${randomHex(6)}`, "test");
    await insertAuditLog("admin", admin.id, "campaign.test", `campaign:${id}`, r.ok ? "accepted" : r.error.slice(0, 60));
    redirect(
      flashUrl(
        home,
        r.ok
          ? "Test accepted by Resend. It uses the first member’s data; no job or reward is created."
          : `Test failed: ${r.error}`,
        r.ok,
      ),
    );
  }

  if (act === "queue") {
    if (c.status !== "draft") redirect(flashUrl(home, "This campaign was already queued.", false));
    if (!(await launchPublic())) redirect(flashUrl(home, "Turn public launch ON first; otherwise the pass links in the email would still be locked.", false));
    const count = await eligibleCount(c.min_points);
    if (count === 0) redirect(flashUrl(home, "No eligible recipients.", false));
    if (String(fd.get("confirm") ?? "").trim().toUpperCase() !== `SEND ${count}` || !(await reauth(admin, fd))) {
      redirect(flashUrl(home, `Type exactly “SEND ${count}” and your password. Nothing was queued.`, false));
    }
    const { data, error } = await db().rpc("queue_campaign", { p_campaign_id: id });
    if (error) {
      redirect(flashUrl(home, `Queue failed: ${error.message}`, false));
    }
    const n = Number(data ?? -1);
    if (n === -2) redirect(flashUrl(home, "Blocked: turn public launch ON first.", false));
    if (n < 0) redirect(flashUrl(home, "This campaign was already queued.", false));
    await insertAuditLog("admin", admin.id, "campaign.queue", `campaign:${id}`, `recipients=${n}`);
    redirect(flashUrl(home, `Queued ${n} recipient(s). Nothing is sent until you press Start sending below.`));
  }

  if (Object.hasOwn(CAM_ACTIONS, act)) {
    if (act === "start" && !["queued", "paused", "sending"].includes(c.status)) {
      redirect(flashUrl(home, "Queue the campaign first.", false));
    }
    if (act === "cancel") {
      await db()
        .from("email_jobs")
        .update({ status: "suppressed", last_error: "campaign cancelled" })
        .eq("campaign_id", id)
        .eq("status", "pending");
    }
    await db().from("campaigns").update(CAM_ACTIONS[act] === "sending" ? { status: "sending", started_at: new Date().toISOString() } : { status: CAM_ACTIONS[act] }).eq("id", id);
    await insertAuditLog("admin", admin.id, `campaign.${act}`, `campaign:${id}`);
    redirect(flashUrl(home, `Done: ${act}.`));
  }

  if (act === "retry_failed") {
    const { data } = await db()
      .from("email_jobs")
      .update({ status: "pending", attempts: 0, next_attempt_at: new Date().toISOString(), last_error: null })
      .eq("campaign_id", id)
      .eq("status", "failed")
      .select("id");
    const n = (data ?? []).length;
    if (n > 0 && c.status === "done") {
      await db().from("campaigns").update({ status: "paused" }).eq("id", id);
    }
    await insertAuditLog("admin", admin.id, "campaign.retry_failed", `campaign:${id}`, `n=${n}`);
    redirect(flashUrl(home, `${n} failed job(s) re-queued. Resend’s idempotency key prevents a duplicate if the first attempt actually went through.`));
  }

  redirect(home);
}

/** Client-loopable bounded batch (called by the campaign page runner). */
export async function processBatch(campaignId: number): Promise<{ ok: boolean; status?: string; remaining?: number | null; paused?: boolean; sent?: number; retry?: number; failed?: number; suppressed?: number; claimed?: number }> {
  const admin = await currentAdmin();
  if (!admin) return { ok: false };
  const c = (await qOrNull(db().from("campaigns").select("status, started_at").eq("id", campaignId).maybeSingle())) as { status: string; started_at: string | null } | null;
  if (!c) return { ok: false };
  if (c.status !== "sending") return { ok: true, status: c.status, remaining: null, paused: true };
  const r = await processEmailJobs(5, campaignId);
  const { count } = await db()
    .from("email_jobs")
    .select("id", { count: "exact" })
    .eq("campaign_id", campaignId)
    .in("status", ["pending", "sending"]);
  const left = count ?? 0;
  if (left === 0) {
    const now = new Date().toISOString();
    // Final transition. started_at keeps its real value when "Start" was pressed;
    // an external pinger (no Start press) gets started=completed=now.
    const patch: Record<string, unknown> = { status: "done", completed_at: now, started_at: c.started_at ?? now };
    await db().from("campaigns").update(patch).eq("id", campaignId).eq("status", "sending");
  }
  return { ok: true, status: left === 0 ? "done" : "sending", remaining: left, ...r };
}

/* ── helpers ─────────────────────────────────────────────────────────────── */

async function require(): Promise<AdminRow> {
  const a = await currentAdmin();
  if (!a) redirect("/admin/login");
  return a;
}

async function reauth(admin: AdminRow, fd: FormData): Promise<boolean> {
  const pw = String(fd.get("password") ?? "");
  return pw !== "" && (await adminReauth(pw, admin));
}
