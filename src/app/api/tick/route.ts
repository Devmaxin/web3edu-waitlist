import { NextResponse } from "next/server";
import { processEmailJobs } from "@/lib/mailer";
import { rateLimitAllow } from "@/lib/rate-limit";
import { ipHash } from "@/lib/crypto";
import { clientIp } from "@/lib/ip";

export const dynamic = "force-dynamic";

/**
 * Opportunistic outbox runner, fired by a tiny same-origin fetch from public pages
 * (no pinger needed). Port of Web::tick(): bounded (3 jobs), rate limited, and it
 * requires the custom header + same-origin fetch metadata so a cross-site form post
 * can't trigger it.
 */
export async function POST(req: Request) {
  if (req.headers.get("x-w3e-tick") !== "1") {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const site = req.headers.get("sec-fetch-site") ?? "";
  if (!["same-origin", "none"].includes(site)) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const iph = ipHash(await clientIp());
  if (!(await rateLimitAllow(`tick:ip:${iph}`, 20, 600)) || !(await rateLimitAllow("tick:all", 40, 60))) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }
  const r = await processEmailJobs(3);
  return NextResponse.json({ ok: true, sent: r.sent });
}
