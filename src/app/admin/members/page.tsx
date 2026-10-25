import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { AdminShell, readFlash } from "@/app/admin/shell";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const PER = 25;

export default async function AdminMembers({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const flash = readFlash(sp);
  const qStr = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  let query = db()
    .from("members_admin_summary")
    .select("id, waitlist_id, email, status, created_at, points_ledger_sum, referrals_count", { count: "exact" })
    .order("id", { ascending: false })
    .range((page - 1) * PER, page * PER - 1);

  if (qStr !== "") {
    const code = qStr.toUpperCase();
    query = query.or(`email.ilike.%${escapeLike(qStr)}%,waitlist_id.ilike.%${escapeLike(qStr)}%,referral_code.eq.${code}`);
  }

  const { data, error, count } = await query;
  if (error) console.error(`[w3e] members list: ${error.message}`);
  const rows = (data ?? []) as Array<{ id: number; waitlist_id: string; email: string; status: string; created_at: string; points_ledger_sum: number | null; referrals_count: number | null }>;

  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PER));

  return (
    <AdminShell title="Members" active="/admin/members" flash={flash}>
      <div className="box">
        <form method="get" className="row">
          <div>
            <label>&nbsp;</label>
            <input type="search" name="q" defaultValue={qStr} placeholder="Email, waitlist ID or referral code" />
          </div>
          <div>
            <label>&nbsp;</label>
            <button className="b" type="submit">Search</button>
          </div>
        </form>
      </div>
      <div className="box">
        <table>
          <thead><tr><th>ID</th><th>Email</th><th>Status</th><th>Points</th><th>Refs</th><th>Joined (UTC)</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/admin/members/${r.id}`}>{r.waitlist_id}</Link></td>
                <td>{r.email}</td>
                <td><span className={`pill ${r.status === "active" ? "ok" : "bad"}`}>{r.status}</span></td>
                <td>{r.points_ledger_sum ?? 0}</td>
                <td>{r.referrals_count ?? 0}</td>
                <td>{r.created_at.replace("T", " ").slice(0, 19)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="small">No members match.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="pager">
        <span className="small">Total: {total}</span>
        {page > 1 && <Link href={`/admin/members?q=${encodeURIComponent(qStr)}&page=${page - 1}`}>‹ Prev</Link>}
        <span className="small">Page {page} / {pages}</span>
        {page < pages && <Link href={`/admin/members?q=${encodeURIComponent(qStr)}&page=${page + 1}`}>Next ›</Link>}
      </div>
    </AdminShell>
  );
}

function escapeLike(s: string): string {
  return s.replaceAll("%", "\\%").replaceAll("_", "\\_");
}
