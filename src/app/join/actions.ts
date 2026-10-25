"use server";

import { cookies } from "next/headers";
import { db } from "@/lib/db";
import {
  canonicalEmail,
  validateSignup,
  referrerCodeFromCookie,
  deviceTokenCookie,
  deviceHash,
  type SignupErrors,
} from "@/lib/signup";
import { botCheck } from "@/lib/bot-trap";
import { rateLimitAllow } from "@/lib/rate-limit";
import { clientIp } from "@/lib/ip";
import { ipHash } from "@/lib/crypto";
import { passHashes } from "@/lib/pass";
import { token } from "@/lib/crypto";
import { memberSessionSet } from "@/lib/member-session";
import { signupsOpen } from "@/lib/settings";
import { redirect } from "next/navigation";

export type JoinState = {
  errors: SignupErrors;
  old: { email: string; name: string; avatar: string };
  /** Forces the form back to a step server-side (e.g. bot checks → step 1). */
  resetStep?: number;
  generic?: string;
};

const GENERIC = "We couldn’t complete that. Please try again in a moment.";

export async function submitJoin(_prev: JoinState, formData: FormData): Promise<JoinState> {
  const jar = await cookies();
  const devToken = deviceTokenCookie(jar);
  const iph = ipHash(await clientIp());

  if (!(await signupsOpen())) {
    redirect("/join");
  }

  // Bot checks: honeypot + minimum/maximum fill time (signed timestamp, can't be forged).
  const bot = botCheck(formData.get("website"), String(formData.get("_t") ?? ""));
  if (!bot.ok) {
    console.error(`[w3e] signup.bot_suspect ${bot.reason ?? ""}`);
    return {
      errors: { form: GENERIC },
      old: {
        email: String(formData.get("email") ?? ""),
        name: String(formData.get("name") ?? ""),
        avatar: "",
      },
      resetStep: 1,
    };
  }

  if (!(await rateLimitAllow(`signup:ip:${iph}`, 8, 3600)) || !(await rateLimitAllow("signup:all", 1500, 3600))) {
    return { errors: { form: "Too many attempts from this connection. Please wait a while and try again." }, old: oldValues(formData), resetStep: 1 };
  }

  const [errors, clean] = validateSignup({
    email: formData.get("email"),
    name: formData.get("name"),
    avatar: formData.get("avatar"),
  });
  if (Object.keys(errors).length > 0) {
    return { errors, old: clean };
  }

  const canon = canonicalEmail(clean.email);
  if (!(await rateLimitAllow(`signup:email:${canon}`, 5, 3600))) {
    return { errors: { form: GENERIC }, old: clean };
  }

  const refCode = referrerCodeFromCookie(jar);
  const secret = token(32);
  const hashes = passHashes(secret, 1);

  const { data, error } = await db().rpc("join_waitlist", {
    p_email: clean.email,
    p_email_canonical: canon,
    p_display_name: clean.name,
    p_avatar: clean.avatar !== "" ? clean.avatar : null,
    p_referral_code: refCode,
    p_ip_hash: iph,
    p_device_hash: deviceHash(devToken),
    p_pass_secret: hashes.passSecret,
    p_qr_hash: hashes.qrHash,
    p_view_hash: hashes.viewHash,
  });
  if (error) {
    console.error(`[w3e] join_waitlist: ${error.message}`);
    return { errors: { form: GENERIC }, old: clean };
  }
  const res = data as { status: string; member_id?: number };

  if (res.status === "exists") {
    // Never reveal the existing member's ID/points. Re-send the pass link to that inbox instead.
    const m = (await db().from("members").select("id").eq("email_canonical", canon).maybeSingle()).data as { id: number } | null;
    if (m) {
      const quarter = Math.floor(Date.now() / 900_000);
      await db().rpc("enqueue_email_job", {
        p_member_id: m.id,
        p_kind: "pass_resend",
        p_idem: `pass_resend:${m.id}:${quarter}`,
      });
    }
    redirect("/join/exists");
  }

  if (res.status === "created" && res.member_id) {
    memberSessionSet(jar, res.member_id);
    // Opportunistic outbox drain after the browser gets its response (bounded, resumable).
    const { after } = await import("next/server");
    const { processEmailJobs } = await import("@/lib/mailer");
    after(async () => {
      try {
        await processEmailJobs(3);
      } catch (e) {
        console.error("[w3e] after-signup mailer:", e instanceof Error ? e.message : e);
      }
    });
    redirect("/welcome");
  }

  console.error("[w3e] join failure");
  return { errors: { form: GENERIC }, old: clean };
}

function oldValues(fd: FormData) {
  return {
    email: String(fd.get("email") ?? ""),
    name: String(fd.get("name") ?? ""),
    avatar: String(fd.get("avatar") ?? ""),
  };
}
