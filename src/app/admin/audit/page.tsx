import type { Metadata } from "next";
import { db, qOrNull } from "@/lib/db";
import { AdminShell, readFlash } from "@/app/admin/shell";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Row = {
  id: number;
  created_at: string;
  actor_type: string;
  actor_id: string | null;
  action: string;
  target: string | null;
  meta: string | null;
};

export default async function AdminAudit({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const flash = readFlash(await searchParams);
  const rows = (await qOrNull(
    db().from("audit_log").select("*").order("id", { ascending: false }).limit(200),
  )) as Row[] | null;

  return (
    <AdminShell title="Audit log" active="/admin/audit" flash={flash}>
      <p className="small">Latest 200 events. Never contains tokens, passwords or secrets.</p>
      <div className="box">
        <table>
          <thead><tr><th>When (UTC)</th><th>Actor</th><th>Action</th><th>Target</th><th>Detail</th></tr></thead>
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.id}>
                <td>{r.created_at.replace("T", " ").slice(0, 19)}</td>
                <td>{r.actor_type}{r.actor_id ? `:${r.actor_id.slice(0, 8)}…` : ""}</td>
                <td>{r.action}</td>
                <td className="wrap">{r.target ?? <span className="small">—</span>}</td>
                <td className="wrap">{r.meta ?? <span className="small">—</span>}</td>
              </tr>
            ))}
            {(rows ?? []).length === 0 && <tr><td colSpan={5} className="small">No audit events yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
