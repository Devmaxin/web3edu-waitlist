import type { Metadata } from "next";
import Link from "next/link";
import { db, qOrNull } from "@/lib/db";
import { AdminShell, readFlash } from "@/app/admin/shell";
import { memberAction } from "@/app/admin/actions";
import { balance } from "@/lib/ledger";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Tx = {
  id: number; event_type: string; points: number; reason: string; created_at: string; reverses_id: number | null;
};

export default async function AdminMemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { id: idStr } = await params;
  const sp = await searchParams;
  const flash = readFlash(sp);
  const id = Number(idStr);
  if (!Number.isSafeInteger(id) || id <= 0) notFound2();

  const m = (await qOrNull(db().from("members").select("*").eq("id", id).maybeSingle())) as {
    id: number; waitlist_id: string; email: string; email_canonical: string; display_name: string | null; avatar: string | null;
    referral_code: string; status: string; created_at: string; marketing_unsubscribed_at: string | null;
  } | null;
  if (!m) notFound2();

  const pts = await balance(id);
  const ledger = (await qOrNull(db().from("points_ledger").select("*").eq("member_id", id).order("id", { ascending: false }).limit(100))) as Tx[] | null;
  const referredBy = (await qOrNull(
    db().from("referrals").select("status, reason, members!referrals_referred_id_fkey(waitlist_id)").eq("referred_id", id).maybeSingle(),
  )) as { status: string; reason: string | null; members: { waitlist_id: string } } | null;
  const referred = (await qOrNull(
    db().from("referrals").select("status, reason, created_at, members!referrals_referrer_id_fkey(waitlist_id)").eq("referrer_id", id).order("id", { ascending: false }).limit(50),
  )) as Array<{ status: string; reason: string | null; created_at: string; members: { waitlist_id: string } }> | null;
  const pass = (await qOrNull(db().from("passes").select("version, revoked_at, created_at").eq("member_id", id).maybeSingle())) as
    | { version: number; revoked_at: string | null; created_at: string }
    | null;
  const counted = (await db().from("referrals").select("id", { count: "exact", head: true }).eq("referrer_id", id).eq("status", "counted")).count ?? 0;
  const mails = (await qOrNull(
    db().from("email_jobs").select("id, kind, status, attempts, last_error, created_at").eq("member_id", id).order("id", { ascending: false }).limit(20),
  )) as Array<{ id: number; kind: string; status: string; attempts: number; last_error: string | null; created_at: string }> | null;

  return (
    <AdminShell title={`Member ${m.waitlist_id}`} active="/admin/members" flash={flash}>      <div className="box">
        <table>
          <tbody>
            <tr><th>Email</th><td>{m.email} <span className="small">(canonical: {m.email_canonical})</span></td></tr>
            <tr><th>Display name</th><td>{m.display_name ?? <span className="small">—</span>}</td></tr>
            <tr><th>Avatar</th><td>{m.avatar ?? <span className="small">cube</span>}</td></tr>
            <tr><th>Referral code</th><td>{m.referral_code}</td></tr>
            <tr><th>Status</th><td><span className={`pill ${m.status === "active" ? "ok" : "bad"}`}>{m.status}</span></td></tr>
            <tr><th>Points</th><td><b>{pts}</b></td></tr>
            <tr><th>Counted referrals</th><td>{counted}</td></tr>
            <tr><th>Joined (UTC)</th><td>{m.created_at.replace("T", " ").slice(0, 19)}</td></tr>
            <tr><th>Pass</th><td>{pass ? `v${pass.version}${pass.revoked_at ? " (revoked)" : ""}` : <span className="small">—</span>}</td></tr>
            <tr><th>Referred by</th><td>{referredBy ? `${referredBy.members.waitlist_id} (${referredBy.status}${referredBy.reason ? `: ${referredBy.reason}` : ""})` : <span className="small">—</span>}</td></tr>
          </tbody>
        </table>
      </div>

      <form action={memberAction} className="box">
        <input type="hidden" name="id" value={m.id} />
        <div className="row">
          <div>
            <label>Admin password (confirm any action)</label>
            <input type="password" name="password" autoComplete="current-password" required />
          </div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="b" type="submit" name="action" value="resend_pass">Queue pass email</button>
          {m.status === "active" ? (
            <button className="b d" type="submit" name="action" value="block">Block member</button>
          ) : (
            <button className="b g" type="submit" name="action" value="unblock">Unblock member</button>
          )}
          <button className="b g" type="submit" name="action" value="rotate_pass">Rotate pass/QR</button>
        </div>
      </form>

      <h2>Manual adjustment</h2>
      <form action={memberAction} className="box">
        <input type="hidden" name="id" value={m.id} />
        <input type="hidden" name="action" value="adjust" />
        <div className="row">
          <div>
            <label>Points delta (e.g. 5 or −5)</label>
            <input type="number" name="delta" step={1} min={-100000} max={100000} required />
          </div>
          <div>
            <label>Reason (required)</label>
            <input type="text" name="reason" maxLength={200} required />
          </div>
        </div>
        <div className="row">
          <div>
            <label>Admin password</label>
            <input type="password" name="password" autoComplete="current-password" required />
          </div>
          <div>
            <label>&nbsp;</label>
            <button className="b" type="submit">Record adjustment</button>
          </div>
        </div>
        <p className="small">The ledger is append-only: to fix a mistake add an opposite adjustment, or reverse a specific row below.</p>
      </form>

      <h2>Ledger (latest 100)</h2>
      <div className="box">
        <table>
          <thead><tr><th>#</th><th>Event</th><th>Points</th><th>Reason</th><th>When (UTC)</th><th></th></tr></thead>
          <tbody>
            {(ledger ?? []).map((l) => (
              <tr key={l.id}>
                <td>{l.id}</td>
                <td>{l.event_type}</td>
                <td><b>{l.points > 0 ? `+${l.points}` : l.points}</b></td>
                <td className="wrap">{l.reason}</td>
                <td>{l.created_at.replace("T", " ").slice(0, 19)}</td>
                <td>
                  {l.points > 0 && l.event_type !== "reversal" && (
                    <form action={memberAction} className="row" style={{ gap: 4 }}>
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="action" value="reverse" />
                      <input type="hidden" name="ledger_id" value={l.id} />
                      <input type="password" name="password" placeholder="password" autoComplete="current-password" required style={{ width: 120 }} />
                      <button className="b g" type="submit">Reverse</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
            {(ledger ?? []).length === 0 && <tr><td colSpan={6} className="small">No ledger rows.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2>Referred members (latest 50)</h2>
      <div className="box">
        <table>
          <thead><tr><th>Member</th><th>Status</th><th>Reason</th><th>When (UTC)</th></tr></thead>
          <tbody>
            {(referred ?? []).map((r, i) => (
              <tr key={i}>
                <td>{r.members.waitlist_id}</td>
                <td><span className={`pill ${r.status === "counted" ? "ok" : r.status === "held" ? "warn" : "bad"}`}>{r.status}</span></td>
                <td className="wrap">{r.reason ?? <span className="small">—</span>}</td>
                <td>{r.created_at.replace("T", " ").slice(0, 19)}</td>
              </tr>
            ))}
            {(referred ?? []).length === 0 && <tr><td colSpan={4} className="small">No referrals recorded.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2>Email jobs (latest 20)</h2>
      <div className="box">
        <table>
          <thead><tr><th>#</th><th>Kind</th><th>Status</th><th>Attempts</th><th>Last error</th><th>When (UTC)</th></tr></thead>
          <tbody>
            {(mails ?? []).map((j) => (
              <tr key={j.id}>
                <td>{j.id}</td>
                <td>{j.kind}</td>
                <td><span className="pill">{j.status}</span></td>
                <td>{j.attempts}</td>
                <td className="wrap">{j.last_error ?? <span className="small">—</span>}</td>
                <td>{j.created_at.replace("T", " ").slice(0, 19)}</td>
              </tr>
            ))}
            {(mails ?? []).length === 0 && <tr><td colSpan={6} className="small">No emails yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <p><Link href="/admin/members">‹ All members</Link></p>
    </AdminShell>
  );
}

import { notFound } from "next/navigation";
function notFound2(): never {
  notFound();
}
