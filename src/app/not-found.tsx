import type { Metadata } from "next";
import Link from "next/link";

// Dynamic on purpose: the CSP nonce comes from middleware per request. A statically
// prerendered page would embed scripts without the nonce, the browser would block
// them, and the failed hydration would blank the page (repro'd on /privacy).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Page not found · Web3Edu waitlist",
};

export default function NotFound() {
  return (
    <div className="app" id="join">
      <div className="app-head">
        <Link className="brand" href="/" aria-label="Web3Edu home">
          <img src="/assets/img/logo-mark-96.png" width={34} height={34} alt="" />
          <span>Web3Edu</span>
        </Link>
      </div>
      <main id="main" className="narrow">
        <h1>Page not found</h1>
        <p>That page doesn’t exist. Head back to the waitlist.</p>
        <p className="row">
          <Link className="btn" href="/">Go home</Link>
        </p>
      </main>
    </div>
  );
}
