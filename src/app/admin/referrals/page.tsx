import type { Metadata } from "next";
import { db } from "@/lib/db";
import { AdminShell, readFlash } from "@/app/admin/shell";
import { approveReferral } from "@/app/admin/actions";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Row = { id: number; status: string; reason: string | null; created_at: string; referrer: string; referred: string };

export default async function AdminReferrals({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const flash = readFlash(sp);
  const { data, error } = await db()
    .from("referrals")
    .select("id, status, reason, created_at, referrer:members!referrals_referrer_id_fkey(waitlist_id), referred:members!referrals_referred_id_fkey(waitlist_id)")
    .neq("status", "counted")
    .order("id", { ascending: false })
    .limit(100);
  if (error) console.error(`[w3e] referrals: ${error.message}`);
  // fallback: two-step resolution (PostgREST view naming can differ)
  const rows: Row[] = [];
  for (const raw of ((data ?? []) as Array<Record<string, unknown>>)) {
    const referrer = (Array.isArray(raw.referrer) ? raw.referrer[0] : raw.referrer) as { waitlist_id: string } | undefined;
    const referredMembers = (Array.isArray(raw.referred) ? raw.referred[0] : raw.referred) as { waitlist_id: string } | undefined;
    rows.push({
      id: Number(raw.id),
      status: String(raw.status),
      reason: (raw.reason as string | null) ?? null,
      created_at: String(raw.created_at),
      referrer: referrer?.waitlist_id ?? "?",
      referred: referredMembers?.waitlist_id ?? "?",
    });
  }

  return (
    <AdminShell title="Held & rejected referrals" active="/admin/referrals" flash={flash}>
      <div className="box">
        <table>
          <thead><tr><th>#</th><th>Referrer</th><th>Referred</th><th>Status</th><th>Reason</th><th>When (UTC)</th><th></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>{r.referrer}</td>
                <td>{r.referred}</td>
                <td><span className={`pill ${r.status === "held" ? "warn" : "bad"}`}>{r.status}</span></td>
                <td className="wrap">{r.reason ?? <span className="small">—</span>}</td>
                <td>{r.created_at.replace("T", " ").slice(0, 19)}</td>
                <td>
                  {r.status === "held" && (
                    <form action={approveReferral} className="row" style={{ gap: 4 }}>
                      <input type="hidden" name="referral_id" value={r.id} />
                      <input type="password" name="password" placeholder="password" autoComplete="current-password" required style={{ width: 120 }} />
                      <button className="b" type="submit">Approve</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {(rows ?? []).length === 0 && <tr><td colSpan={7} className="small">Nothing held or rejected.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="small">Approving a held referral records it as counted and awards the referrer once (if the referral rule is active). The unique attribution key protects against double awards. IP alone never auto-rejects — shared mobile IPs are common.</p>
    </AdminShell>
  );
}
