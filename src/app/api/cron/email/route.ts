import { NextResponse } from "next/server";
import { processEmailJobs } from "@/lib/mailer";
import { ENV } from "@/lib/env";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Vercel: leave headroom inside the function limit

/**
 * Resumable scheduled email worker for Vercel Cron (e.g. every minute).
 * Header auth only — secrets in URLs end up in logs. Bounded work per invocation;
 * overlapping invocations are safe (FOR UPDATE SKIP LOCKED row leases in the DB).
 */
export async function POST(req: Request) {
  const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const want = ENV.cronSecret;
  if (
    want === "" ||
    want.includes("PLACEHOLDER") ||
    given === "" ||
    !safeEqual(want, given)
  ) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const r = await processEmailJobs(10);
  return NextResponse.json({ ok: true, ...r });
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
