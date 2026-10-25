/** Shared simple error pages (port of app/Views/error.php). */
import Link from "next/link";
import { Icon } from "@/components/icons";

export function ErrorPage({ title, msg }: { title: string; msg?: string }) {
  return (
    <main id="main" className="lockcard">
      <div className="lock-ico" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v5M12 16.5v.01" />
        </svg>
      </div>
      <h1>{title}</h1>
      {msg ? <p>{msg}</p> : null}
      <p><Link href="/">Back to Web3Edu</Link></p>
    </main>
  );
}

export function PassNotFound() {
  return (
    <main id="main" className="lockcard">
      <div className="lock-ico" aria-hidden="true">
        <Icon name="lock" />
      </div>
      <h1>Pass not found</h1>
      <p>This pass link isn’t valid. Use the link from your latest Web3Edu email.</p>
      <p><Link href="/">Back to Web3Edu</Link></p>
    </main>
  );
}
