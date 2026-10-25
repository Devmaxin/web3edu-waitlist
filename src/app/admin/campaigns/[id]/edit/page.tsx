import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, qOrNull } from "@/lib/db";
import { campaignSave } from "@/app/admin/actions";
import { AdminShell, readFlash } from "@/app/admin/shell";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Campaign = {
  id: number;
  name: string;
  subject: string;
  preheader: string | null;
  intro_text: string;
  min_points: number | null;
  status: string;
};

export default async function AdminCampaignEdit({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const flash = await Promise.all([params, searchParams]).then(([, sp]) => readFlash(sp));
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const c = (await qOrNull(db().from("campaigns").select("*").eq("id", id).maybeSingle())) as Campaign | null;
  if (!c || c.status !== "draft") notFound(); // only drafts can be edited

  return (
    <AdminShell title="Edit draft campaign" active="/admin/campaigns" flash={flash}>
      <form action={campaignSave} className="box">
        <input type="hidden" name="id" value={c.id} />
        <label>Internal name</label><input name="name" required maxLength={120} defaultValue={c.name} />
        <label>Subject</label><input name="subject" required maxLength={150} defaultValue={c.subject} />
        <label>Preheader (inbox preview text, optional)</label><input name="preheader" maxLength={200} defaultValue={c.preheader ?? ""} />
        <label>Announcement text (plain text; blank line = new paragraph). Balance, QR, pass link and the “register with the same email” instructions are added automatically per member.</label>
        <textarea name="intro_text" required maxLength={4000} defaultValue={c.intro_text} />
        <label>Only members with at least this many points (optional)</label>
        <input name="min_points" type="number" min={0} defaultValue={c.min_points ?? ""} />
        <p><button className="b" type="submit">Save draft</button> <Link className="b g" href={`/admin/campaigns/${c.id}`}>Cancel</Link></p>
      </form>
    </AdminShell>
  );
}
