import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { launchPublic, signupsOpen, getSetting } from "@/lib/settings";
import { db } from "@/lib/db";
import { passTokens } from "@/lib/pass";
import { AdminShell, readFlash } from "@/app/admin/shell";
import { launchAction } from "@/app/admin/actions";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function AdminLaunch({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const flash = readFlash(sp);
  const launch = await launchPublic();
  const open = await signupsOpen();
  const url = await getSetting("main_register_url", "");
  const mid = Number(sp.preview_member ?? 0);
  let preview: string | null = null;
  if (mid > 0) {
    const { data } = await db().from("passes").select("member_id, version").eq("member_id", mid).maybeSingle();
    if (data) {
      const pt = await passTokens(mid);
      preview = `/q/${pt.qrToken}?preview=1`;
    } else {
      redirect("/admin/launch");
    }
  }

  return (
    <AdminShell title="Launch controls" active="/admin/launch" flash={flash}>
      <div className="box">
        <p>Public launch: <span className={`pill ${launch ? "ok" : ""}`}>{launch ? "ON" : "OFF"}</span> · Signups: <span className={`pill ${open ? "ok" : ""}`}>{open ? "OPEN" : "CLOSED"}</span></p>
        <p className="small">Public launch unlocks the QR landing page for everyone. Both switches start OFF/CLOSED on a fresh install.</p>
      </div>

      {[
        ["enable_launch", "ENABLE PUBLIC LAUNCH", launch ? "Restart public launch (no-op: already on)" : "Turn public launch ON"],
        ["disable_launch", "DISABLE PUBLIC LAUNCH", "Turn public launch OFF (QR pages lock again)"],
        ["signups_open", "OPEN SIGNUPS", open ? "Open signups (no-op: already open)" : "Open signups"],
        ["signups_close", "CLOSE SIGNUPS", "Close signups"],
      ].map((cfg, i) => (
        <form action={launchAction} className="box" key={i}>
          <input type="hidden" name="action" value={cfg[0]} />
          <div className="row">
            <div style={{ flex: 2 }}>
              <label>{cfg[2]}</label>
            </div>
            <div>
              <label>Type “{cfg[1]}”</label>
              <input type="text" name="confirm" required />
            </div>
            <div>
              <label>Admin password</label>
              <input type="password" name="password" autoComplete="current-password" required />
            </div>
            <div>
              <label>&nbsp;</label>
              <button className="b" type="submit">Do it</button>
            </div>
          </div>
        </form>
      ))}

      <h2>Sign-up URL shown after launch</h2>
      <form action={launchAction} className="box">
        <input type="hidden" name="action" value="save_url" />
        <div className="row">
          <div style={{ flex: 3 }}>
            <label>Optional https URL of the main Web3Edu registration page</label>
            <input type="url" name="main_register_url" defaultValue={url} placeholder="https://…" />
          </div>
          <div>
            <label>Type “{PHRASE_SAVE}”</label>
            <input type="text" name="confirm" required />
          </div>
          <div>
            <label>Admin password</label>
            <input type="password" name="password" autoComplete="current-password" required />
          </div>
          <div>
            <label>&nbsp;</label>
            <button className="b" type="submit">Save</button>
          </div>
        </div>
        <p className="small">Shown as a button on the unlocked QR landing page and in launch emails. Empty = members just use their pass link.</p>
      </form>

      <h2>QR preview</h2>
      <form method="get" className="box">
        <div className="row">
          <div>
            <label>Member #</label>
            <input type="number" name="preview_member" min={1} defaultValue={mid || undefined} required />
          </div>
          <div>
            <label>&nbsp;</label>
            <button className="b" type="submit">Preview QR</button>
          </div>
        </div>
      </form>
      {preview && (
        <div className="box">
          <p className="small">Admin preview for member #{mid} <span className="pill warn">launch still locked for everyone else</span></p>
          <p><a href={preview} target="_blank" rel="noopener">Open QR landing page</a></p>
        </div>
      )}
    </AdminShell>
  );
}

const PHRASE_SAVE = "SAVE SIGNUP URL";
