import type { Metadata } from "next";
import Link from "next/link";
import { campaignSave } from "@/app/admin/actions";
import { AdminShell, readFlash } from "@/app/admin/shell";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminCampaignNew({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const flash = readFlash(await searchParams);
  return (
    <AdminShell title="New campaign" active="/admin/campaigns" flash={flash}>
      <form action={campaignSave} className="box">
        <input type="hidden" name="id" value={0} />
        <label>Internal name</label><input name="name" required maxLength={120} />
        <label>Subject</label><input name="subject" required maxLength={150} />
        <label>Preheader (inbox preview text, optional)</label><input name="preheader" maxLength={200} />
        <label>Announcement text (plain text; blank line = new paragraph). Balance, QR, pass link and the “register with the same email” instructions are added automatically per member.</label>
        <textarea name="intro_text" required maxLength={4000} />
        <label>Only members with at least this many points (optional)</label>
        <input name="min_points" type="number" min={0} />
        <p><button className="b" type="submit">Save draft</button> <Link className="b g" href="/admin/campaigns">Cancel</Link></p>
      </form>
    </AdminShell>
  );
}
