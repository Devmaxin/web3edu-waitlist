import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db, qOrNull } from "@/lib/db";
import { launchPublic } from "@/lib/settings";
import { campaignAction, eligibleCount } from "@/app/admin/actions";
import { AdminShell, readFlash } from "@/app/admin/shell";
import { BatchRunner } from "@/app/admin/campaigns/batch-runner";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const ALL_STATUSES = ["pending", "sending", "accepted", "delivered", "delayed", "bounced", "complained", "failed", "suppressed"];

type Campaign = {
  id: number;
  name: string;
  subject: string;
  preheader: string | null;
  intro_text: string;
  min_points: number | null;
  status: string;
  created_at: string;
};

export default async function AdminCampaign({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const flash = readFlash(sp);
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) notFound();
  const c = (await qOrNull(db().from("campaigns").select("*").eq("id", id).maybeSingle())) as Campaign | null;
  if (!c) notFound();

  const [eligible, ready] = await Promise.all([eligibleCount(c.min_points), launchPublic()]);

  const stats = await Promise.all(
    ALL_STATUSES.map(async (s) => {
      const { count } = await db().from("email_jobs").select("id", { count: "exact" }).eq("campaign_id", id).eq("status", s).limit(0);
      return [s, count ?? 0] as const;
    }),
  );
  const by = new Map(stats);

  return (
    <AdminShell title={`${c.name} — ${c.status}`} active="/admin/campaigns" flash={flash}>
      <div className="box">
        <b>Subject:</b> {c.subject}
        {c.preheader ? <span className="small"> · preheader: {c.preheader}</span> : null}
        <br />
        <b>Eligible recipients now:</b> {eligible} (active, subscribed
        {c.min_points !== null ? `, ≥ ${c.min_points} points` : ""})
        {c.status === "draft" && (
          <p><Link className="b g" href={`/admin/campaigns/${c.id}/edit`}>Edit draft</Link></p>
        )}
      </div>
      <p className="small">Created {c.created_at.replace("T", " ").slice(0, 19)} UTC. Each recipient’s own live balance and pass link are added at send time — never edit copy to include personal data.</p>

      <h2>1 · Review</h2>
      <iframe className="pv" sandbox="" src={`/admin/campaigns/${c.id}/preview`} title="Email preview" />
      <p className="small">Preview uses the first member on the list as sample data. Real sends use each member’s own live balance.</p>

      <h2>2 · Send a test</h2>
      <form action={campaignAction} className="box row">
        <input type="hidden" name="id" value={c.id} />
        <input type="hidden" name="action" value="test" />
        <input name="to" type="email" placeholder="your own address" required />
        <button className="b g" type="submit">Send test</button>
      </form>

      {c.status === "draft" ? (
        <>
          <h2>3 · Queue recipients</h2>
          {!ready && (
            <div className="warn-box">
              Blocked: turn <b>public launch</b> ON first (<Link href="/admin/launch">Launch controls</Link>); otherwise
              the pass links in the email would still be locked.
            </div>
          )}
          <form action={campaignAction} className="box">
            <input type="hidden" name="id" value={c.id} />
            <input type="hidden" name="action" value="queue" />
            <p className="small">Queuing only creates outbox rows. Nothing is sent until you press Start sending. A second queue attempt inserts nothing (unique key per campaign+member). The exact phrase is checked again with the live recipient count.</p>
            <div className="row">
              <input name="confirm" placeholder={`Type exactly: SEND ${eligible}`} required autoComplete="off" />
              <input type="password" name="password" placeholder="your password" required autoComplete="current-password" />
              <button className="b d" type="submit">Queue {eligible} recipients</button>
            </div>
          </form>
        </>
      ) : (
        <>
          <h2>Status</h2>
          <div className="box">
            <table>
              <thead>
                <tr>{ALL_STATUSES.map((s) => <th key={s}>{s}</th>)}</tr>
              </thead>
              <tbody>
                <tr>{ALL_STATUSES.map((s) => <td key={s}>{by.get(s) ?? 0}</td>)}</tr>
              </tbody>
            </table>
            <p className="small">“accepted” = Resend took the message. “delivered” appears only after Resend’s webhook confirms it. Without the webhook configured, it stays “accepted”.</p>
          </div>
          <h2>Send</h2>
          <div className="box">
            <form action={campaignAction} className="row">
              <input type="hidden" name="id" value={c.id} />
              {["queued", "paused"].includes(c.status) && (
                <button className="b" name="action" value="start" type="submit">Start sending</button>
              )}
              {c.status === "sending" && (
                <button className="b g" name="action" value="pause" type="submit">Pause</button>
              )}
              {!["done", "cancelled"].includes(c.status) && (
                <button className="b d" name="action" value="cancel" type="submit">Cancel remaining</button>
              )}
              {(by.get("failed") ?? 0) > 0 && (
                <button className="b g" name="action" value="retry_failed" type="submit">Retry {by.get("failed")} failed</button>
              )}
            </form>
            {c.status === "sending" && <BatchRunner campaignId={c.id} />}
          </div>
        </>
      )}
    </AdminShell>
  );
}
