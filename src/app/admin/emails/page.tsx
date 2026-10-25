import type { Metadata } from "next";
import { db, qOrNull } from "@/lib/db";
import { AdminShell, readFlash } from "@/app/admin/shell";
import { emailsAction } from "@/app/admin/actions";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const STATUSES = [
  "pending",
  "sending",
  "accepted",
  "delivered",
  "delayed",
  "bounced",
  "complained",
  "failed",
  "suppressed",
] as const;

type Row = {
  id: number;
  kind: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  campaign_id: number | null;
  wid: string;
};

export default async function AdminEmails({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const flash = readFlash(sp);
  const status = STATUSES.includes((sp.status ?? "") as (typeof STATUSES)[number]) ? sp.status! : "";

  let rowsQuery = db()
    .from("email_jobs")
    .select("id, kind, status, attempts, last_error, created_at, campaign_id, member_id")
    .order("id", { ascending: false })
    .limit(100);
  if (status !== "") rowsQuery = rowsQuery.eq("status", status);
  const jobs = (await qOrNull(rowsQuery)) as Array<{
    id: number;
    kind: string;
    status: string;
    attempts: number;
    last_error: string | null;
    created_at: string;
    campaign_id: number | null;
    member_id: number;
  }> | null;

  // Resolve waitlist IDs in one extra query (PostgREST embedding names vary per FK).
  const ids = [...new Set((jobs ?? []).map((j) => j.member_id))];
  const widMap = new Map<number, string>();
  if (ids.length > 0) {
    const ms = (await qOrNull(db().from("members").select("id, waitlist_id").in("id", ids))) as
      | Array<{ id: number; waitlist_id: string }>
      | null;
    for (const m of ms ?? []) widMap.set(m.id, m.waitlist_id);
  }
  const rows: Row[] = (jobs ?? []).map((j) => ({
    id: j.id,
    kind: j.kind,
    status: j.status,
    attempts: j.attempts,
    last_error: j.last_error,
    created_at: j.created_at,
    campaign_id: j.campaign_id,
    wid: widMap.get(j.member_id) ?? "?",
  }));

  const counts = await Promise.all(
    STATUSES.map(async (s) => {
      const { count } = await db().from("email_jobs").select("id", { count: "exact" }).eq("status", s).limit(0);
      return [s, count ?? 0] as const;
    }),
  );

  return (
    <AdminShell title="Email jobs" active="/admin/emails" flash={flash}>
      <div className="box">
        <a className={`pill ${status === "" ? "ok" : ""}`} href="/admin/emails">all</a>{" "}
        {counts.map(([s, n]) => (
          <a key={s} className={`pill ${status === s ? "ok" : ""}`} href={`/admin/emails?status=${s}`}>{s}: {n}</a>
        ))}
      </div>
      <div className="box row">
        <form action={emailsAction}>
          <input type="hidden" name="action" value="process" />
          <button className="b g" type="submit">Process 5 due jobs now</button>
        </form>
        <form action={emailsAction}>
          <input type="hidden" name="action" value="retry_failed" />
          <button className="b g" type="submit">Re-queue failed transactional emails</button>
        </form>
      </div>
      <div className="box">
        <table>
          <thead><tr><th>#</th><th>Member</th><th>Kind</th><th>Status</th><th>Tries</th><th>Error</th><th>Created (UTC)</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>{r.wid}</td>
                <td>{r.kind}{r.campaign_id !== null ? <span className="small"> (C{r.campaign_id})</span> : null}</td>
                <td><span className={`pill ${r.status === "delivered" || r.status === "accepted" ? "ok" : r.status === "failed" || r.status === "complained" ? "bad" : "warn"}`}>{r.status}</span></td>
                <td>{r.attempts}</td>
                <td className="wrap">{r.last_error ?? <span className="small">—</span>}</td>
                <td>{r.created_at.replace("T", " ").slice(0, 19)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="small">No email jobs {status !== "" ? `with status “${status}”` : "yet"}.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="small">“accepted” = Resend took the message. “delivered” appears only after Resend’s webhook confirms it. Without the webhook configured, accepted jobs stay “accepted”. Campaign jobs also show their campaign (C#).</p>
    </AdminShell>
  );
}
