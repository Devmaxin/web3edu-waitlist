import type { Metadata } from "next";
import Link from "next/link";
import { memberByQr } from "@/lib/pass";
import { launchPublic } from "@/lib/settings";
import { registerUrl } from "@/lib/email-templates";
import { currentAdminFlag } from "@/lib/admin-page";

export const metadata: Metadata = {
  title: "Locked until launch",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function QrLanding({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Admin preview: valid token + admin session + ?preview shows the open state pre-launch.
  const preview = await (async () => {
    if (await launchPublic()) return false;
    const admin = await currentAdminFlag();
    return admin && (await memberByQr(token)) !== null;
  })();

  if (!launchPublic() && !preview) {
    // Identical response for valid and invalid tokens: no lookup, no leak.
    return (
      <main id="main" className="lockcard">
        <div className="lock-ico" aria-hidden="true"><LockSvg /></div>
        <h1>Locked until launch</h1>
        <p>Web3Edu hasn’t opened yet. Keep your pass safe. We’ll email you when it’s time.</p>
        <p><Link href="/">About Web3Edu</Link></p>
      </main>
    );
  }

  const m = await memberByQr(token);
  if (!m) {
    return (
      <main id="main" className="lockcard">
        <div className="lock-ico" aria-hidden="true"><LockSvg /></div>
        <h1>Pass not recognised</h1>
        <p>This QR code isn’t valid. Use the pass from your latest Web3Edu email.</p>
        <p><Link href="/">About Web3Edu</Link></p>
      </main>
    );
  }

  const register = await registerUrl();
  return (
    <main id="main" className="lockcard">
      <div className="lock-ico" aria-hidden="true"><OpenSvg /></div>
      {preview && <p className="tag-planned">Admin preview · launch is still locked for everyone else</p>}
      <h1>Web3Edu early access</h1>
      {!preview ? (
        <>
          <p>
            Web3Edu is open. Create your Web3Edu account using the <b>same email address</b> you joined the waitlist
            with, so your account can be matched to your waitlist entry. There is nothing to claim here.
          </p>
          {register !== "" && (
            <a className="btn btn-primary btn-block" href={register} rel="noopener">Create your Web3Edu account</a>
          )}
        </>
      ) : (
        <>
          <p>
            This is what a valid pass shows once launch is public: instructions to register on Web3Edu with the same
            email{register !== "" ? ", and a sign-up button" : " (set the sign-up URL on the Launch page to add a button)"}.
          </p>
          {register !== "" && (
            <button className="btn btn-primary btn-block" type="button" disabled>Create your Web3Edu account</button>
          )}
        </>
      )}
    </main>
  );
}

function LockSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function OpenSvg() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 7.5-2" />
    </svg>
  );
}
