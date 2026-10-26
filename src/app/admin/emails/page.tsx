import type { Metadata } from "next";
import { db, qOrNull } from "@/lib/db";
import { AdminShell, readFlash } from "@/app/admin/shell";
import { campaignAction, emailsAction } from "@/app/admin/actions";
import { registerUrl } from "@/lib/email-templates";
import { launchPublic } from "@/lib/settings";
import { BatchRunner } from "@/app/admin/campaigns/batch-runner";
import { bucketOf, statusLabel } from "@/lib/campaign-view";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const JOBS_STATUSES = ["pending", "sending", "accepted", "delivered", "delayed", "bounced", "complained", "failed", "suppressed"] as const;

type CampaignRow = {
  id: number;
  name: string;
  status: string;
  min_points: number | null;
  created_at: string;
  queued_at: string | null;
  started_at: string | null;
  completed_at: string | null;
};

const CAM_COLS = "id, name, status, min_points, created_at, queued_at, started_at, completed_at";

export default async function AdminEmails({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const flash = readFlash(sp);
  const filter = JOBS_STATUSES.includes((sp.status ?? "") as (typeof JOBS_STATUSES)[number]) ? (sp.status as string) : "";

  /* ── Launch Campaign panel data ────────────────────────────────────────── */
  const [dest, launchReady] = await Promise.all([registerUrl(), launchPublic()]);
  const chosen = Number(sp.c ?? 0);
  const camp =
    chosen > 0
      ? ((await qOrNull(db().from("campaigns").select(CAM_COLS).eq("id", chosen).maybeSingle())) as CampaignRow | null)
      : ((await qOrNull(db().from("campaigns").select(CAM_COLS).order("id", { ascending: false }).limit(1).maybeSingle())) as CampaignRow | null);

  let eligible = 0;
  const buckets: Record<string, number> = { sent: 0, failed: 0, pending: 0, suppressed: 0 };
  if (camp) {
    let q = db()
      .from("members_admin_summary")
      .select("id", { count: "exact" })
      .eq("status", "active")
      .filter("marketing_unsubscribed_at", "is", null)
      .limit(0);
    if (camp.min_points !== null) q = q.gte("points_ledger_sum", camp.min_points);
    const { count } = await q;
    eligible = count ?? 0;

    const { data: rows, error } = await db()
      .from("email_jobs")
      .select("status")
      .eq("campaign_id", camp.id)
      .limit(10000);
    if (error) console.error(`[w3e] campaign bucket counts: ${error.message}`);
    for (const r of (rows ?? []) as Array<{ status: string }>) {
      const b = bucketOf(r.status);
      if (b) buckets[b]++;
    }
  }

  /* ── Existing job list ─────────────────────────────────────────────────── */
  let rowsQuery = db()
    .from("email_jobs")
    .select("id, kind, status, attempts, last_error, created_at, campaign_id, member_id")
    .order("id", { ascending: false })
    .limit(100);
  if (filter !== "") rowsQuery = rowsQuery.eq("status", filter);
  const jobs = (await qOrNull(rowsQuery)) as
    | Array<{
        id: number;
        kind: string;
        status: string;
        attempts: number;
        last_error: string | null;
        created_at: string;
        campaign_id: number | null;
        member_id: number;
      }>
    | null;

  // Resolve waitlist IDs in one extra query (PostgREST embedding names vary per FK).
  const ids = [...new Set((jobs ?? []).map((j) => j.member_id))];
  const widMap = new Map<number, string>();
  if (ids.length > 0) {
    const ms = (await qOrNull(db().from("members").select("id, waitlist_id").in("id", ids))) as
      | Array<{ id: number; waitlist_id: string }>
      | null;
    for (const m of ms ?? []) widMap.set(m.id, m.waitlist_id);
  }

  const counts = await Promise.all(
    JOBS_STATUSES.map(async (s) => {
      const { count } = await db().from("email_jobs").select("id", { count: "exact" }).eq("status", s).limit(0);
      return [s, count ?? 0] as const;
    }),
  );

  return (
    <AdminShell title="Email jobs" active="/admin/emails" flash={flash}>
      <LaunchCampaignPanel camp={camp} buckets={buckets} eligible={eligible} dest={dest} launchReady={launchReady} />

      <div className="box">
        <a className={`pill ${filter === "" ? "ok" : ""}`} href="/admin/emails">all</a>{" "}
        {counts.map(([s, n]) => (
          <a key={s} className={`pill ${filter === s ? "ok" : ""}`} href={`/admin/emails?status=${s}`}>{s}: {n}</a>
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
            {(jobs ?? []).map((j) => (
              <tr key={j.id}>
                <td>{j.id}</td>
                <td>{widMap.get(j.member_id) ?? "?"}</td>
                <td>{j.kind}{j.campaign_id !== null ? <span className="small"> (C{j.campaign_id})</span> : null}</td>
                <td><span className={`pill ${j.status === "delivered" || j.status === "accepted" ? "ok" : j.status === "failed" || j.status === "complained" ? "bad" : "warn"}`}>{j.status}</span></td>
                <td>{j.attempts}</td>
                <td className="wrap">{j.last_error ?? <span className="small">—</span>}</td>
                <td>{j.created_at.replace("T", " ").slice(0, 19)}</td>
              </tr>
            ))}
            {(jobs ?? []).length === 0 && <tr><td colSpan={7} className="small">No email jobs {filter !== "" ? `with status “${filter}”` : "yet"}.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="small">“accepted” = Resend took the message. “delivered” appears only after Resend’s webhook confirms it. Without the webhook configured, accepted jobs stay “accepted”. Campaign jobs also show their campaign (C#).</p>
    </AdminShell>
  );
}

/* ── Launch Campaign panel ──────────────────────────────────────────────────── */

function fmt(d: string | null): string {
  return d ? d.replace("T", " ").slice(0, 19) + " UTC" : "—";
}

function LaunchCampaignPanel({
  camp,
  buckets,
  eligible,
  dest,
  launchReady,
}: {
  camp: CampaignRow | null;
  buckets: Record<string, number>;
  eligible: number;
  dest: string;
  launchReady: boolean;
}) {
  return (
    <section id="launch-campaign">
      <h2>Launch Campaign</h2>

      {!camp && (
        <div className="box">
          <p className="small">
            No campaign exists yet. <b>1.</b> Create the launch draft below, <b>2.</b> configure &amp; confirm the
            destination URL, <b>3.</b> preview, <b>4.</b> send yourself a test, then <b>5.</b> queue &amp; send.
          </p>
          <a className="b" href="/admin/campaigns/new?launch=1">Create launch draft (prefilled)</a>
        </div>
      )}

      {camp && (
        <>
          <div className="box">
            <span className={`pill ${statusLabel(camp.status).cls}`}>{statusLabel(camp.status).label}</span>{" "}
            <b>{camp.name}</b> <span className="small">(C{camp.id} · <a href={`/admin/campaigns/${camp.id}`}>full campaign page</a>)</span>
            <table>
              <tbody>
                <tr><th>Eligible recipients</th><td align="right">{eligible}</td></tr>
                <tr><th>Successfully sent</th><td align="right">{buckets.sent}</td></tr>
                <tr><th>Failed attempts</th><td align="right">{buckets.failed}</td></tr>
                <tr><th>Pending recipients</th><td align="right">{buckets.pending}</td></tr>
                <tr><th>Suppressed</th><td align="right">{buckets.suppressed}</td></tr>
                <tr><th>Created</th><td align="right">{fmt(camp.created_at)}</td></tr>
                <tr><th>Queued</th><td align="right">{fmt(camp.queued_at)}</td></tr>
                <tr><th>Sending started</th><td align="right">{fmt(camp.started_at)}</td></tr>
                <tr><th>Completed</th><td align="right">{fmt(camp.completed_at)}</td></tr>
              </tbody>
            </table>
            <p className="small">
              Eligibility: active members subscribed to campaign emails{camp.min_points !== null ? ` with ≥ ${camp.min_points} points` : ""}.
              Successful sends are never re-sent (unique per member per campaign). Retries touch only pending/failed rows.
            </p>
          </div>

          <div className="box">
            <b>1 · Destination</b>
            <p className="small">The email’s “Explore Web3Edu” button links here. Members’ QR codes and pass links are separate and always point to their own pass page.</p>
            <p>
              Current destination:{" "}
              {dest === "" ? <span className="pill bad">not configured</span> : <span className="pill ok">{dest}</span>}
            </p>
            <form action={emailsAction} className="row">
              <input type="hidden" name="action" value="save_dest" />
              <input name="main_register_url" type="url" defaultValue={dest === "" ? "https://" : dest} placeholder="https://app.web3edu.name.ng/register" required />
              <input type="password" name="password" placeholder="your password" required autoComplete="current-password" />
              <button className="b" type="submit">Save destination</button>
            </form>
          </div>

          <div className="box">
            <b>2 · Preview</b>
            <iframe className="pv" sandbox="" src={`/admin/campaigns/${camp.id}/preview`} title="Launch email preview" />
            <p className="small">Preview uses the first member on the list as sample data — real sends are personalized per recipient (name, points, own QR).</p>
          </div>

          <div className="box">
            <b>3 · Test email</b>
            <form action={campaignAction} className="row">
              <input type="hidden" name="id" value={camp.id} />
              <input type="hidden" name="action" value="test" />
              <input name="to" type="email" placeholder="your own address" required />
              <button className="b g" type="submit">Send test</button>
            </form>
            <p className="small">Max 10 tests per hour. The test uses sample (first-member) data and creates no outbox row.</p>
          </div>

          {!launchReady && camp.status !== "draft" && (
            <div className="warn-box">Public launch is OFF, so the pass links inside queued emails would be locked. Sending remains paused until launch is turned ON.</div>
          )}
          {!launchReady && camp.status === "draft" && (
            <div className="warn-box">
              Queueing requires public launch ON (<a href="/admin/launch">Launch controls</a>) — otherwise recipients would get locked pass links.
            </div>
          )}

          {camp.status === "draft" && launchReady && (
            <div className="box">
              <b>4 · Queue recipients</b>
              <p className="small">Queuing creates the outbox rows (one per eligible member). Nothing is sent until you press Start sending.</p>
              <form action={campaignAction}>
                <input type="hidden" name="id" value={camp.id} />
                <input type="hidden" name="action" value="queue" />
                <div className="row">
                  <input name="confirm" placeholder={`Type exactly: SEND ${eligible}`} required autoComplete="off" />
                  <input type="password" name="password" placeholder="your password" required autoComplete="current-password" />
                  <button className="b d" type="submit">Queue {eligible} recipients</button>
                </div>
              </form>
            </div>
          )}

          {["queued", "sending", "paused", "done"].includes(camp.status) && (
            <div className="box">
              <b>5 · Send &amp; monitor</b>
              <form action={campaignAction} className="row">
                <input type="hidden" name="id" value={camp.id} />
                {["queued", "paused"].includes(camp.status) && (
                  <button className="b g" name="action" value="start" type="submit">Start sending</button>
                )}
                {camp.status === "sending" && (
                  <button className="b" name="action" value="pause" type="submit">Pause</button>
                )}
                {camp.status !== "done" && camp.status !== "cancelled" && (
                  <button className="b d" name="action" value="cancel" type="submit">Cancel remaining</button>
                )}
                {buckets.failed > 0 && (
                  <button className="b g" name="action" value="retry_failed" type="submit">Retry {buckets.failed} failed</button>
                )}
              </form>
              {camp.status === "sending" && <BatchRunner campaignId={camp.id} />}
              {camp.status === "queued" && <p className="small">Press <i>Start sending</i>, then run batches here (or via the cron worker). Progress is saved per email; you can pause and resume any time.</p>}
              {buckets.failed > 0 && <p className="small">Retries only re-queue rows whose send did not succeed. A retry after a timed-out request cannot double-send: Resend deduplicates on the job’s idempotency key for 24 h.</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
