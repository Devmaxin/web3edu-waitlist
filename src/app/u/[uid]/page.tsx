import type { Metadata } from "next";
import Link from "next/link";
import { unsubSig } from "@/lib/email-templates";
import { db } from "@/lib/db";
import { insertAuditLog } from "@/lib/audit";
import { waitlistIdRegex } from "@/lib/signup";

export const metadata: Metadata = {
  title: "Unsubscribe",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Segment: /[wid].[sig] */
async function parse(params: Promise<{ uid: string }>): Promise<{ wid: string } | null> {
  const { uid } = await params;
  // the route folder is a catch-all handled below via /[uid] -> uid = "W3E-XXXX-XXXX.<sig>"
  const dot = uid.indexOf(".");
  if (dot === -1) return null;
  const wid = uid.slice(0, dot);
  const sig = uid.slice(dot + 1);
  if (!waitlistIdRegex().test(wid)) return null;
  if (sig !== unsubSig(wid)) return null;
  return { wid };
}

export default async function Unsubscribe({ params }: { params: Promise<{ uid: string }> }) {
  const parsed = await parse(params);
  if (!parsed) {
    return (
      <main id="main" className="lockcard">
        <h1>Link not valid</h1>
        <p>Use the unsubscribe link from your latest Web3Edu email.</p>
        <p><Link href="/">Back to Web3Edu</Link></p>
      </main>
    );
  }
  return (
    <main id="main" className="lockcard">
      <h1>Unsubscribe?</h1>
      <p>You’ll stop receiving Web3Edu campaign emails. Essential messages about your own waitlist entry, like a pass link you request, will still be sent.</p>
      <form action={doUnsubscribe} className="stack">
        <input type="hidden" name="wid" value={parsed.wid} />
        <button className="btn btn-dark btn-block" type="submit">Unsubscribe</button>
        <Link className="btn btn-ghost btn-block" href="/">Keep me subscribed</Link>
      </form>
    </main>
  );
}

async function doUnsubscribe(formData: FormData) {
  "use server";
  const wid = String(formData.get("wid") ?? "");
  if (!waitlistIdRegex().test(wid)) return;
  await db()
    .from("members")
    .update({ marketing_unsubscribed_at: new Date().toISOString() })
    .eq("waitlist_id", wid)
    .filter("marketing_unsubscribed_at", "is", null);
  await insertAuditLog("public", null, "member.unsubscribe", wid);
  const { redirect } = await import("next/navigation");
  redirect("/u/done");
}
