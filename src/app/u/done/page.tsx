// Dynamic on purpose: the CSP nonce comes from middleware per request; a statically
// prerendered page would embed non-nonce scripts that browsers block (blank page).
export const dynamic = "force-dynamic";

export default function UnsubDone() {
  return (
    <main id="main" className="lockcard">
      <h1>You’re unsubscribed</h1>
      <p>You won’t get campaign emails from the Web3Edu waitlist any more.</p>
      <p><a href="/">Back to Web3Edu</a></p>
    </main>
  );
}
