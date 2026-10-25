import type { Metadata } from "next";
import Link from "next/link";
import { memberByView, passTokens, type MemberRow } from "@/lib/pass";
import { launchPublic } from "@/lib/settings";
import { balance, anyRewardActive } from "@/lib/ledger";
import { avatarOf } from "@/lib/avatar";
import { qrBits, qrSvg } from "@/lib/qr";
import { PassCard } from "@/components/pass-card";
import { PassNotFound } from "@/components/http-helpers";

export const metadata: Metadata = {
  title: "Your Web3Edu pass",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function PassPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const m: MemberRow | null = await memberByView(token);
  if (!m) return <PassNotFound />;

  const mid = m.id;
  const locked = !(await launchPublic());
  const bal = await balance(mid);
  const showPoints = (await anyRewardActive()) || bal > 0;
  const avatar = avatarOf(m);
  const refUrl = `${(process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "")}/?ref=${m.referral_code}`;
  const pt = await passTokens(mid);
  const qrUrl = pt.qrUrl;
  const qrSvgMarkup = await qrSvg(qrUrl);

  return (
    <>
      <div className="app">
        <div className="app-head">
          <Link className="brand" href="/" aria-label="Web3Edu home">
            <img src="/assets/img/logo-mark-96.png" width={34} height={34} alt="" />
            <span>Web3Edu</span>
          </Link>
        </div>
        <main id="main" className="app-main">
          <h1 className="welcome-h">Your pass</h1>
          <p className="welcome-p">{locked ? "It’s locked until launch. Keep this page link private." : "Launch is open. Continue below, or scan the QR code."}</p>
          <div className="deal">
            <PassCard m={m} points={bal} showPoints={showPoints} locked={locked} qrSvg={qrSvgMarkup} qrBits={qrBits(qrUrl)} avatar={avatar} />
          </div>
          <div className="stack">
            {!locked && <Link className="btn btn-primary btn-block rise d4" href={`/q/${pt.qrToken}`}>Continue to Web3Edu</Link>}
            <button className={`btn btn-${locked ? "primary" : "ghost"} btn-block rise d4`} type="button" id="save-pass">
              Save pass as image
            </button>
            <button className="btn btn-ghost btn-block rise d5" type="button" id="share-pass" hidden>
              Share pass image
            </button>
            <div className="copyrow rise d6">
              <input className="input" id="ref-link" type="text" readOnly value={refUrl} aria-label="Your referral link" />
              <button className="btn btn-ghost" type="button" data-copy="#ref-link">Copy</button>
            </div>
          </div>
          <div className="info rise d7">
            <h3>Keep it to yourself</h3>
            <p>Anyone with this page link can see your Waitlist ID{showPoints ? " and points" : ""}. Your waitlist entry is matched by the email address you register with on Web3Edu, not by this link.</p>
          </div>
        </main>
      </div>
      <script src="/assets/js/tick.js" defer />
    </>
  );
}
