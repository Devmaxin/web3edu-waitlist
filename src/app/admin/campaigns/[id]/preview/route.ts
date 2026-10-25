/**
 * Sandboxed HTML preview of the real campaign email for the first member on the list.
 * Own CSP (the edge middleware skips this path): email HTML needs inline styles.
 * Mirrors AdminCampaigns::preview().
 */
import { currentAdminFlag } from "@/lib/admin-page";
import { db, qOrNull } from "@/lib/db";
import { renderEmail } from "@/lib/email-templates";
import type { MemberRow } from "@/lib/pass";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!(await currentAdminFlag())) {
    return new Response("Not found", { status: 404 });
  }
  const id = Number((await ctx.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return new Response("Not found", { status: 404 });
  }
  const camp = (await qOrNull(db().from("campaigns").select("id").eq("id", id).maybeSingle())) as { id: number } | null;
  const member = (await qOrNull(
    db().from("members").select("*").order("id", { ascending: true }).limit(1).maybeSingle(),
  )) as MemberRow | null;
  if (!camp || !member) {
    return new Response("Add a member and a campaign first", { status: 404 });
  }
  const msg = await renderEmail({ kind: "launch_announcement", campaign_id: id }, member);
  if (!msg) {
    return new Response("Could not render the campaign email", { status: 500 });
  }
  return new Response(msg.html, {
    status: 200,
    headers: {
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; sandbox",
      "X-Frame-Options": "SAMEORIGIN",
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
