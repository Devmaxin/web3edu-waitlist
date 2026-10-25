import Link from "next/link";
import { requireAdmin } from "@/lib/admin-page";
import type { AdminRow } from "@/lib/admin-auth";
import { BodyAdmin } from "@/app/admin/body-admin";
import { SessionPing } from "@/app/admin/session-ping";
import { signOut } from "@/app/admin/actions";
import "./admin.css";

const NAV: Array<[string, string]> = [
  ["/admin", "Dashboard"],
  ["/admin/members", "Members"],
  ["/admin/referrals", "Referrals"],
  ["/admin/rewards", "Rewards"],
  ["/admin/launch", "Launch"],
  ["/admin/campaigns", "Campaigns"],
  ["/admin/emails", "Emails"],
  ["/admin/audit", "Audit"],
  ["/admin/diagnostics", "Diagnostics"],
];

/** Authenticated admin chrome. Server component; redirects to login when no session. */
export async function AdminShell({
  title,
  active,
  admin,
  flash,
  children,
}: {
  title: string;
  active: string;
  admin?: AdminRow;
  flash?: { m: string; ok: boolean } | null;
  children: React.ReactNode;
}) {
  const me = admin ?? (await requireAdmin());
  return (
    <>
      <BodyAdmin />
      <SessionPing />
      <div className="adm">
        <nav className="adm-nav" aria-label="Admin">
          {NAV.map(([href, label]) => {
            const on = (href === "/admin" && active === "/admin") || (href !== "/admin" && active.startsWith(href));
            return (
              <Link key={href} href={href} className={on ? "on" : ""}>{label}</Link>
            );
          })}
          <form action={signOut}>
            <button className="b g" type="submit">Sign out</button>
          </form>
          <span className="small" title={me.email}>{me.email}</span>
        </nav>
        <main className="adm-main" id="main">
          {flash && <div className={`flash ${flash.ok ? "ok" : "bad"}`} role="status">{flash.m}</div>}
          <h1>{title}</h1>
          {children}
        </main>
      </div>
    </>
  );
}

/** Flash messages travel via redirect query params (stateless, serverless-safe). */
export function flashUrl(path: string, msg: string, ok = true): string {
  const p = new URLSearchParams({ m: msg, ok: ok ? "1" : "0" });
  return `${path}?_f=${encodeURIComponent(p.toString())}`;
}

export function readFlash(sp: { _f?: string } | undefined): { m: string; ok: boolean } | null {
  const raw = sp?._f;
  if (!raw) return null;
  const p = new URLSearchParams(decodeURIComponent(raw));
  const m = p.get("m");
  if (!m) return null;
  return { m, ok: p.get("ok") === "1" };
}
