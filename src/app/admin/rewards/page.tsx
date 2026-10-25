import type { Metadata } from "next";
import { db } from "@/lib/db";
import { AdminShell, readFlash } from "@/app/admin/shell";
import { saveRewards } from "@/app/admin/actions";
import type { RewardRule } from "@/lib/ledger";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminRewards({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const flash = readFlash(sp);
  const { data, error } = await db().from("reward_rules").select("*").order("event_type");
  const rules = (data ?? []) as RewardRule[];

  return (
    <AdminShell title="Rewards" active="/admin/rewards" flash={flash}>
      <p className="small">Waitlist points only. Web3Edu XP is configured in the main platform’s admin; there is no automatic link between the two systems.</p>
      <form action={saveRewards} className="box">
        <table>
          <thead><tr><th>Event</th><th>Points</th><th>Active</th></tr></thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.event_type}>
                <td>{r.label}<br /><span className="small">{r.event_type}</span></td>
                <td>
                  <input type="number" name={`points_${r.event_type}`} min={0} max={100000} defaultValue={r.points ?? ""} placeholder="not set" />
                </td>
                <td>
                  <label style={{ margin: 0 }}>
                    <input type="checkbox" name={`active_${r.event_type}`} defaultChecked={r.is_active} style={{ width: "auto", maxWidth: "none" }} /> active
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ marginTop: 10 }}>
          <div>
            <label>Admin password</label>
            <input type="password" name="password" autoComplete="current-password" required />
          </div>
          <div>
            <label>&nbsp;</label>
            <button className="b" type="submit" name="action" value="save">Save</button>
          </div>
        </div>
        <p className="small">Activating a rule requires a value. Changing these settings does not alter existing ledger rows.</p>
      </form>

      <h2>Backfill</h2>
      <form action={saveRewards} className="box">
        <input type="hidden" name="action" value="backfill" />
        <p className="small">Deliberate post-activation step: pay members who joined while a rule was inactive. Uses the CURRENT rule value. Safe to repeat.</p>
        <div className="row">
          <div>
            <label>Event</label>
            <select name="event">
              <option value="waitlist_signup">waitlist_signup</option>
              <option value="referral_signup">referral_signup</option>
            </select>
          </div>
          <div>
            <label>Type BACKFILL to confirm</label>
            <input type="text" name="confirm" required />
          </div>
          <div>
            <label>Admin password</label>
            <input type="password" name="password" autoComplete="current-password" required />
          </div>
          <div>
            <label>&nbsp;</label>
            <button className="b" type="submit">Run backfill</button>
          </div>
        </div>
      </form>
    </AdminShell>
  );
}
