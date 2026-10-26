import type { Metadata } from "next";
import Link from "next/link";
import { campaignSave } from "@/app/admin/actions";
import { AdminShell, readFlash } from "@/app/admin/shell";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Prefilled launch draft (the Emails admin "Create launch draft" deep-link). */
const LAUNCH_PREFILL = {
  name: "Launch announcement",
  subject: "Web3Edu is officially live!",
  preheader: "Web3Edu is live — your waitlist pass is inside",
  intro_text:
    "You joined our waitlist because you wanted to be part of what we’re building. Now Web3Edu is live, and we’re excited to welcome you.\n\nYour personal waitlist pass is below. Keep it for your records, and use the link below to explore Web3Edu.",
};

export default async function AdminCampaignNew({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const flash = readFlash(sp);
  const pre = sp.launch === "1" ? LAUNCH_PREFILL : null;
  return (
    <AdminShell title="New campaign" active="/admin/campaigns" flash={flash}>
      {pre && (
        <div className="box">
          <p className="small">Prefilled for the launch announcement. Adjust freely — every send adds each recipient’s own balance, QR and pass link automatically.</p>
        </div>
      )}
      <form action={campaignSave} className="box">
        <input type="hidden" name="id" value={0} />
        <label>Internal name</label><input name="name" required maxLength={120} defaultValue={pre?.name} />
        <label>Subject</label><input name="subject" required maxLength={150} defaultValue={pre?.subject} />
        <label>Preheader (inbox preview text, optional)</label><input name="preheader" maxLength={200} defaultValue={pre?.preheader} />
        <label>Announcement text (plain text; blank line = new paragraph). Balance, QR, pass link and the “register with the same email” instructions are added automatically per member.</label>
        <textarea name="intro_text" required maxLength={4000} defaultValue={pre?.intro_text} />
        <label>Only members with at least this many points (optional)</label>
        <input name="min_points" type="number" min={0} />
        <p><button className="b" type="submit">Save draft</button> <Link className="b g" href="/admin/campaigns">Cancel</Link></p>
      </form>
    </AdminShell>
  );
}
