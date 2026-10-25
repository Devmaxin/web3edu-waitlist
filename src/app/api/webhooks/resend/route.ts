import { NextResponse } from "next/server";
import { verifyWebhook, applyWebhookEvent } from "@/lib/mailer";

export const dynamic = "force-dynamic";

/** Resend delivery webhook (Svix-signed). Port of /webhooks/resend. */
export async function POST(req: Request) {
  const body = await req.text();
  if (body.length > 262144) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const ok = verifyWebhook(body, {
    svixId: req.headers.get("svix-id") ?? undefined,
    svixTimestamp: req.headers.get("svix-timestamp") ?? undefined,
    svixSignature: req.headers.get("svix-signature") ?? undefined,
  });
  if (!ok) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const ev = JSON.parse(body) as { type?: string; data?: { email_id?: string } };
    await applyWebhookEvent(ev);
  } catch {
    // signature passed but payload isn't ours: acknowledge without side effects
  }
  return NextResponse.json({ ok: true });
}
