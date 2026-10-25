import type { Metadata } from "next";
import { headers } from "next/headers";
import { ENV, envFlags } from "@/lib/env";
import { clientIp } from "@/lib/ip";
import { db, qOrNull } from "@/lib/db";
import { AdminShell, readFlash } from "@/app/admin/shell";
import { derivedToken } from "@/lib/crypto";

export const metadata: Metadata = { robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

type Check = [name: string, ok: boolean, note: string];

export default async function AdminDiagnostics({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const flash = readFlash(await searchParams);

  const nodeOk = Number(process.versions.node.split(".")[0]) >= 20;
  const appKeyOk = (() => {
    try {
      derivedToken("diag", 0, 0);
      return true;
    } catch {
      return false;
    }
  })();
  const webhookOk = process.env.RESEND_WEBHOOK_SECRET?.startsWith("whsec_") === true && !envFlags.missing("RESEND_WEBHOOK_SECRET");
  const dbOk = (await qOrNull(db().from("settings").select("k").limit(1))) !== null;
  const h = await headers();
  const requestHttps = (h.get("x-forwarded-proto") ?? "").split(",")[0].trim() === "https";

  const checks: Check[] = [
    ["Node.js >= 20", nodeOk, process.versions.node],
    ["HTTPS site URL set (NEXT_PUBLIC_SITE_URL)", ENV.siteUrl !== "", ENV.siteUrl || "(unset — set NEXT_PUBLIC_SITE_URL so pass/email links use the right domain)"],
    ["Supabase URL set", !envFlags.missing("NEXT_PUBLIC_SUPABASE_URL"), ENV.supabaseUrl === "" ? "(unset)" : "configured"],
    ["Supabase service key set (server only)", !envFlags.missing("SUPABASE_SERVICE_ROLE_KEY"), "server-side only; never exposed to the browser"],
    ["Supabase reachable", dbOk, dbOk ? "settings table read succeeded" : "could not read the settings table — check the service key and project URL"],
    ["APP_KEY valid (32+ base64 bytes)", appKeyOk, appKeyOk ? "configured" : "set APP_KEY: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""],
    ["Resend API key set", !envFlags.missing("RESEND_API_KEY"), "required to send any email"],
    ["Resend webhook secret set (whsec_…)", webhookOk, "required to move accepted → delivered and to unsubscribe complainers"],
    ["CRON_SECRET set", !envFlags.missing("CRON_SECRET"), "required for POST /api/cron/email (optional if an admin page is used to drain the queue)"],
    ["Request is HTTPS", requestHttps, requestHttps ? "yes" : "this dashboard request was not over https"],
  ];

  const xff = h.get("x-forwarded-for") ?? "";
  const detected = await clientIp();

  return (
    <AdminShell title="Diagnostics" active="/admin/diagnostics" flash={flash}>
      <div className="box">
        <table>
          <thead><tr><th>Check</th><th>Result</th><th>Note</th></tr></thead>
          <tbody>
            {checks.map(([n, ok, note]) => (
              <tr key={n}>
                <td>{n}</td>
                <td><span className={`pill ${ok ? "ok" : "bad"}`}>{ok ? "OK" : "FIX"}</span></td>
                <td className="wrap">{note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>Client IP detection</h2>
      <div className="box">
        Detected: <b>{detected}</b> · X-Forwarded-For: <b>{xff || "(none)"}</b>
        <p className="small">
          On Vercel the platform always sets X-Forwarded-For for real visitor requests, so rate limiting works as
          intended. If this page shows 0.0.0.0 every time, requests are arriving without the header (e.g. a proxy you
          configured yourself) and all visitors would share one rate-limit bucket.
        </p>
      </div>
    </AdminShell>
  );
}
