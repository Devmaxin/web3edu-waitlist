import type { Metadata } from "next";
import Link from "next/link";
import { db, qOrNull } from "@/lib/db";
import { AdminShell, readFlash } from "@/app/admin/shell";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Campaign = { id: number; name: string; status: string; created_at: string };

export default async function AdminCampaigns({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const flash = readFlash(await searchParams);
  const campaigns = (await qOrNull(
    db().from("campaigns").select("id, name, status, created_at").order("id", { ascending: false }).limit(50),
  )) as Campaign[] | null;

  const total = new Map<number, number>();
  const done = new Map<number, number>();
  if (campaigns && campaigns.length > 0) {
    await Promise.all(
      campaigns.map(async (c) => {
        const [{ count: t }, { count: d }] = await Promise.all([
          db().from("email_jobs").select("id", { count: "exact" }).eq("campaign_id", c.id).limit(0),
          db()
            .from("email_jobs")
            .select("id", { count: "exact" })
            .eq("campaign_id", c.id)
            .in("status", ["accepted", "delivered"])
            .limit(0),
        ]);
        total.set(c.id, t ?? 0);
        done.set(c.id, d ?? 0);
      }),
    );
  }

  return (
    <AdminShell title="Campaigns" active="/admin/campaigns" flash={flash}>
      <p><Link className="b" href="/admin/campaigns/new">New campaign</Link></p>
      <div className="box">
        <table>
          <thead><tr><th>#</th><th>Name</th><th>Status</th><th>Jobs</th><th>Accepted/Delivered</th><th>Created (UTC)</th></tr></thead>
          <tbody>
            {(campaigns ?? []).map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td><Link href={`/admin/campaigns/${r.id}`}>{r.name}</Link></td>
                <td><span className={`pill ${r.status === "sending" ? "ok" : ""}`}>{r.status}</span></td>
                <td>{total.get(r.id) ?? 0}</td>
                <td>{done.get(r.id) ?? 0}</td>
                <td>{r.created_at.replace("T", " ").slice(0, 19)}</td>
              </tr>
            ))}
            {(campaigns ?? []).length === 0 && <tr><td colSpan={6} className="small">No campaigns yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
