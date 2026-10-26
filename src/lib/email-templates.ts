/**
 * Email templates rendered at SEND time from live state (balance, active rules, pass
 * version). A faithful port of app/Services/EmailTemplates.php with the same copy and
 * structure. Reward amounts appear ONLY when the matching rule is active.
 */
import "server-only";
import { ENV } from "./env";
import { b64u, derive } from "./crypto";
import { activePoints, balance, referralPoints, EVENT_REFERRAL } from "./ledger";
import { passTokens } from "./pass";
import { db } from "./db";
import type { MemberRow } from "./pass";
import type { OutboundMessage } from "./resend-client";
import { validSiteUrl } from "./campaign-view";

export { validSiteUrl }; // re-export for existing importers (tests, admin actions)

export type EmailKind = "signup_confirmation" | "pass_resend" | "launch_announcement" | "claim_link";

const INK = "#0d0b14";
const VIOLET = "#6b2ff0";
const MUTED = "#6b667a";

function e(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function unsubSig(waitlistId: string): string {
  return b64u(derive("unsub", waitlistId));
}

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "");
}

function u(path: string): string {
  return `${siteUrl()}${path}`;
}

type Template = { subject: string; html: string; text: string; headers?: Record<string, string> };

/** Renders one job. Returns null when there is nothing to send (e.g. missing campaign). */
export async function renderEmail(job: { kind: string; campaign_id: number | null }, member: MemberRow): Promise<Template | null> {
  const mid = member.id;
  const name = (member.display_name ?? "").trim();
  const hi = name !== "" ? `Hi ${name},` : "Hi,";
  const bal = await balance(mid);
  const refPts = await activePoints(EVENT_REFERRAL);
  const pt = await passTokens(mid);
  const viewUrl = pt.viewUrl;
  const refUrl = u(`/?ref=${member.referral_code}`);

  if (job.kind === "signup_confirmation" || job.kind === "pass_resend") {
    const subject = job.kind === "pass_resend" ? "Your Web3Edu pass link" : "You’re on the Web3Edu early-access list";
    const lines = [
      hi,
      job.kind === "pass_resend"
        ? "Here are your Waitlist details again."
        : "You’re in. Thanks for joining the Web3Edu early-access list before launch.",
    ];
    const facts: Array<[string, string]> = [["Waitlist ID", member.waitlist_id]];
    if (bal > 0) facts.push(["Points so far", String(bal)]);
    const lines2 = [
      refPts !== null
        ? `Share your personal link. Each eligible friend who joins through it earns you ${refPts} points.`
        : "Share your personal link with friends who want to learn Web3.",
      "What happens next: your pass stays locked until launch. We’ll email you when Web3Edu opens. When you create your Web3Edu account, use this same email address so it can be matched to your waitlist entry.",
    ];
    return compose(subject, "You’re on the list", lines, facts, lines2, "View your pass", viewUrl, null, [["Your referral link", refUrl]], false, member);
  }

  if (job.kind === "launch_announcement") {
    if (job.campaign_id == null) return null;
    const { data: camp, error } = await db().from("campaigns").select("*").eq("id", job.campaign_id).maybeSingle();
    if (error || !camp) return null;
    const c = camp as { subject: string; preheader: string | null; intro_text: string };
    const facts: Array<[string, string]> = [["Waitlist ID", member.waitlist_id]];
    if (bal > 0) facts.push(["Points today", String(bal)]);
    const refEarned = await referralPoints(mid);
    if (refEarned > 0) facts.push(["…of which from referrals", String(refEarned)]);
    const lines = [hi];
    if (c.intro_text.trim() === "" || c.intro_text.includes("{{ LAUNCH_INTRO }}")) {
      // Sensible default body for the launch announcement when the draft ships bare.
      lines.push(
        "You joined our waitlist because you wanted to be part of what we’re building. Now Web3Edu is live, and we’re excited to welcome you.",
      );
      lines.push("Your personal waitlist pass is below. Keep it for your records, and use the link below to explore Web3Edu.");
    } else {
      for (const p of c.intro_text.trim().split(/\r?\n\r?\n+/)) {
        if (p.trim() !== "") lines.push(p.trim());
      }
    }
    const reg = await registerUrl();
    const lines2 = [
      `To continue, create your Web3Edu account using this same email address (${member.email}). That is how your account is matched to your waitlist entry; there is nothing to claim.`,
    ];
    // The emailed <img> must be a real image: /qr/<token> serves a PNG per member.
    // pt.qrUrl (the /q HTML page) is what the QR itself encodes, and it obeys the launch lock.
    const qr = pt.qrImgUrl;
    return compose(
      c.subject,
      "You’re in. Web3Edu is live.",
      lines,
      facts,
      lines2,
      reg !== "" ? "Explore Web3Edu" : "Open your pass",
      reg !== "" ? reg : viewUrl,
      qr,
      reg !== "" ? [["View your waitlist pass", viewUrl]] : [],
      true,
      member,
      c.preheader ?? "",
    );
  }
  return null;
}

/** Validated https URL where members create their Web3Edu account (admin-set). */
export async function registerUrl(): Promise<string> {
  const { getSetting } = await import("./settings");
  const s = await getSetting("main_register_url", "");
  return validSiteUrl(s.trim()) ? s.trim() : "";
}

type Fact = [string, string];

function compose(
  subject: string,
  headline: string,
  lines: string[],
  facts: Fact[],
  after: string[],
  cta: string,
  ctaUrl: string,
  qrImg: string | null,
  links: Fact[],
  promo: boolean,
  member: MemberRow,
  preheader = "",
): Template {
  const logo = e(u("/assets/img/logo-mark-96.png"));
  let h = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${e(subject)}</title></head>`;
  h += `<body style="margin:0;padding:0;background:#f3f2f6;">`;
  if (preheader !== "") {
    h += `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f3f2f6;">${e(preheader)}</div>`;
  }
  h += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f2f6;"><tr><td align="center" style="padding:24px 12px;">`;
  h += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:24px;border:1px solid #e6e3ee;">`;
  h += `<tr><td style="padding:28px 28px 0 28px;"><img src="${logo}" width="44" height="44" alt="Web3Edu" style="display:block;border-radius:12px;"></td></tr>`;
  h += `<tr><td style="padding:18px 28px 0 28px;font-family:Arial,Helvetica,sans-serif;color:${INK};"><h1 style="margin:0;font-size:28px;line-height:1.15;letter-spacing:-0.5px;">${e(headline)}</h1></td></tr>`;
  h += `<tr><td style="padding:14px 28px 0 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#2a2638;">`;
  for (const p of lines) h += `<p style="margin:0 0 12px 0;">${e(p)}</p>`;
  h += `</td></tr>`;
  if (facts.length > 0) {
    h += `<tr><td style="padding:6px 28px 0 28px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f4ff;border-radius:16px;">`;
    for (const f of facts) {
      h += `<tr><td style="padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${MUTED};">${e(f[0])}</td><td align="right" style="padding:12px 16px;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:bold;color:${INK};">${e(f[1])}</td></tr>`;
    }
    h += `</table></td></tr>`;
  }
  if (qrImg) {
    h += `<tr><td align="center" style="padding:20px 28px 0 28px;"><img src="${e(qrImg)}" width="168" height="168" alt="Your Web3Edu pass QR code" style="display:block;border:1px solid #e6e3ee;border-radius:12px;"></td></tr>`;
  }
  h += `<tr><td style="padding:16px 28px 0 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#2a2638;">`;
  for (const p of after) h += `<p style="margin:0 0 12px 0;">${e(p)}</p>`;
  h += `</td></tr>`;
  h += `<tr><td style="padding:8px 28px 0 28px;"><a href="${e(ctaUrl)}" style="display:inline-block;background:${VIOLET};color:#ffffff;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;text-decoration:none;padding:14px 26px;border-radius:999px;">${e(cta)}</a></td></tr>`;
  for (const l of links) {
    h += `<tr><td style="padding:18px 28px 0 28px;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:${MUTED};">${e(l[0])}<br><a href="${e(l[1])}" style="color:${VIOLET};word-break:break-all;">${e(l[1])}</a></td></tr>`;
  }
  const support = ENV.supportEmail;
  h += `<tr><td style="padding:24px 28px 28px 28px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:${MUTED};">`;
  const hasPoints = facts.some((f) => f[0].startsWith("Points"));
  h += `You’re receiving this because you joined the Web3Edu waitlist.${hasPoints ? " Points shown are your waitlist points; they are not a financial asset." : ""}`;
  const headers: Record<string, string> = {};
  if (promo) {
    const unsub = u(`/u/${member.waitlist_id}.${unsubSig(member.waitlist_id)}`);
    h += ` <a href="${e(unsub)}" style="color:${MUTED};">Unsubscribe from campaign emails</a>.`;
    headers["List-Unsubscribe"] = `<${unsub}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }
  if (support !== "" && !support.includes("PLACEHOLDER")) h += ` Questions? ${e(support)}.`;
  h += `</td></tr></table></td></tr></table></body></html>`;

  let t = headline + "\n\n" + lines.join("\n\n") + "\n\n";
  for (const f of facts) t += `${f[0]}: ${f[1]}\n`;
  if (facts.length > 0) t += "\n";
  if (qrImg) t += "Your QR code is in the HTML version of this email and on your pass page.\n\n";
  if (after.length > 0) t += after.join("\n\n") + "\n\n";
  t += `${cta}: ${ctaUrl}\n`;
  for (const l of links) t += `\n${l[0]}: ${l[1]}`;
  if (promo) t += `\n\nUnsubscribe from campaign emails: ${headers["List-Unsubscribe"] ?? ""}`;
  t = t.replaceAll("<", "").replaceAll(">", "") + "\n";

  return { subject, html: h, text: t, headers };
}
