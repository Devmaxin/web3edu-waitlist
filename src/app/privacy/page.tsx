import type { Metadata } from "next";
import { ENV } from "@/lib/env";

export const metadata: Metadata = {
  title: "Privacy notice · Web3Edu waitlist",
};

export const dynamic = "force-static";

export default function Privacy() {
  const pe = ENV.privacyEmail;
  const hasPe = pe !== "" && !pe.includes("PLACEHOLDER");
  return (
    <>
      <div className="app-head">
        <a className="brand" href="/">
          <img src="/assets/img/logo-mark-96.png" width={34} height={34} alt="" />
          <span>Web3Edu</span>
        </a>
      </div>
      <main id="main" className="legal">
        <h1>Privacy notice</h1>
        <p>This explains what the Web3Edu waitlist stores and why. It is a plain-language summary and not legal advice.</p>
        <h2>What we collect</h2>
        <ul>
          <li><b>Email address</b> (required) and an optional <b>first name</b>, to run the waitlist and email you.</li>
          <li><b>A Waitlist ID, referral code and pass</b> generated for you.</li>
          <li><b>Referral records</b>: if you join through someone’s link, we record that link’s owner as your referrer. Your referrer is not shown your details.</li>
          <li><b>Points records</b>, only if the owner turns rewards on: an append-only ledger of what was earned, when and why.</li>
          <li><b>Abuse-prevention data</b>: a keyed hash of your IP address and a random device cookie. We use these only to spot repeated or automated signups. They are not used to identify you.</li>
          <li><b>Email delivery status</b> (accepted, delivered, bounced) from our email provider, Resend.</li>
        </ul>
        <h2>What we don’t do</h2>
        <p>We don’t sell your data, run advertising trackers or analytics scripts on this site, or share your email with other lists.</p>
        <h2>Emails</h2>
        <p>You’ll get a confirmation when you join, and a launch announcement. Campaign emails include an unsubscribe link. If you ask us to re-send your pass link, that message is sent regardless because you asked for it.</p>
        <h2>Cookies</h2>
        <p>We use only essential cookies: a sign-in cookie for members, a signed cookie remembering a friend’s referral link (30 days), and a random device cookie (1 year) used for abuse prevention.</p>
        <h2>Waitlist and the main platform</h2>
        <p>This site does not connect to the main Web3Edu platform. After launch, any early-access rewards are recorded by a Web3Edu administrator against the email address you joined with, and are added to your account when you register on the main platform with that same email address. Nothing is sent automatically between the two sites.</p>
        <h2>Providers</h2>
        <p>Email is sent through Resend. The site is hosted on Vercel with data in Supabase.</p>
        <h2>Your choices</h2>
        <p>
          You can unsubscribe from campaign emails at any time.
          {hasPe
            ? (
              <>
                {" "}To ask us to access or delete your waitlist data, write to{" "}
                <a href={`mailto:${pe}`}>{pe}</a>.
              </>
            )
            : null}
        </p>
      </main>
    </>
  );
}
