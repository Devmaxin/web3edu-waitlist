import type { Metadata } from "next";
import Link from "next/link";
import { db, qOrNull } from "@/lib/db";
import { launchPublic } from "@/lib/settings";
import { AdminShell, readFlash } from "@/app/admin/shell";
import type { RewardRule } from "@/lib/ledger";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const flash = readFlash(sp);
  const launch = await launchPublic();

  const [members, today, referrals, held, points, mailPending, mailFailed, rules, recent] = await Promise.all([
    count("members"),
    db().from("members").select("id", { count: "exact", head: true }).gte("created_at", new Date().toISOString().slice(0, 10)),
    db().from("referrals").select("id", { count: "exact", head: true }).eq("status", "counted"),
    db().from("referrals").select("id", { count: "exact", head: true }).eq("status", "held"),
    totalPoints(),
    db().from("email_jobs").select("id", { count: "exact", head: true }).in("status", ["pending", "sending"]),
    db().from("email_jobs").select("id", { count: "exact", head: true }).eq("status", "failed"),
    qOrNull(db().from("reward_rules").select("*").order("event_type")) as Promise<RewardRule[] | null>,
    qOrNull(
      db()
        .from("members")
        .select("id, waitlist_id, email, created_at")
        .order("id", { ascending: false })
        .limit(8),
    ) as Promise<Array<{ id: number; waitlist_id: string; email: string; created_at: string }> | null>,
  ]);

  const stats: Array<[string, number]> = [
    ["Members", (members as number) ?? 0],
    ["Joined today", today?.count ?? 0],
    ["Counted referrals", referrals?.count ?? 0],
    ["Held referrals", held?.count ?? 0],
    ["Total points issued", points],
    ["Emails pending", mailPending?.count ?? 0],
    ["Emails failed", mailFailed?.count ?? 0],
  ];

  return (
    <AdminShell title="Dashboard" active="/admin" flash={flash}>
      {!launch && <div className="warn-box">Public launch is <b>OFF</b>. All QR codes show the locked page.</div>}
      <div className="grid">
        {stats.map(([label, v]) => (
          <div className="stat" key={label}><b>{v}</b><span>{label}</span></div>
        ))}
      </div>
      <h2>Launch state</h2>
      <div className="box">
        Public launch: <span className={`pill ${launch ? "ok" : ""}`}>{launch ? "ON" : "OFF"}</span> · <Link href="/admin/launch">Manage</Link>
      </div>
      <h2>Reward rules</h2>
      <div className="box">
        <table>
          <thead><tr><th>Event</th><th>Points</th><th>Active</th></tr></thead>
          <tbody>
            {(rules ?? []).map((r) => (
              <tr key={r.event_type}>
                <td>{r.label}</td>
                <td>{r.points == null ? <span className="small">not set</span> : r.points}</td>
                <td><span className={`pill ${r.is_active ? "ok" : ""}`}>{r.is_active ? "active" : "inactive"}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Recent members</h2>
      <div className="box">
        <table>
          <thead><tr><th>ID</th><th>Email</th><th>Joined (UTC)</th></tr></thead>
          <tbody>
            {(recent ?? []).map((r) => (
              <tr key={r.id}>
                <td><Link href={`/admin/members/${r.id}`}>{r.waitlist_id}</Link></td>
                <td>{r.email}</td>
                <td>{r.created_at.replace("T", " ").slice(0, 19)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}

async function count(table: "members"): Promise<number> {
  const { count } = await db().from(table).select("id", { count: "exact", head: true });
  return count ?? 0;
}

async function totalPoints(): Promise<number> {
  const { data, error } = await db().from("points_ledger").select("points");
  if (error) return 0;
  return (data as Array<{ points: number }>).reduce((s, r) => s + r.points, 0);
}
