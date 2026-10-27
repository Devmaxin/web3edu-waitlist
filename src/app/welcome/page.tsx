import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db, qOrNull } from "@/lib/db";
import { memberSessionGet } from "@/lib/member-session";
import { balance, anyRewardActive, activePoints, EVENT_REFERRAL } from "@/lib/ledger";
import { passTokens } from "@/lib/pass";
import { avatarOf } from "@/lib/avatar";
import { launchPublic } from "@/lib/settings";
import { qrBits, qrSvg } from "@/lib/qr";
import { PassCard } from "@/components/pass-card";
import { FollowPopup } from "@/components/follow-popup";
import type { MemberRow } from "@/lib/pass";

export const metadata: Metadata = {
  title: "You’re in",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function Welcome() {
  const jar = await cookies();
  const id = memberSessionGet(jar);
  if (!id) redirect("/join");
  const m = (await qOrNull(db().from("members").select("*").eq("id", id).eq("status", "active").maybeSingle())) as MemberRow | null;
  if (!m) redirect("/join");

  const mid = m.id;
  const pt = await passTokens(mid);
  const qrSvgMarkup = await qrSvg(pt.qrUrl);
  const bal = await balance(mid);
  const rewardsOn = await anyRewardActive();
  const refPts = await activePoints(EVENT_REFERRAL);
  const locked = !(await launchPublic());
  const showPoints = rewardsOn || bal > 0;
  const avatar = avatarOf(m);
  const refUrl = `${(process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/+$/, "")}/?ref=${m.referral_code}`;

  return (
    <>
      <div className="app" id="welcome">
        <div className="app-head">
          <Link className="brand" href="/" aria-label="Web3Edu home">
            <img src="/assets/img/logo-mark-96.png" width={34} height={34} alt="" />
            <span>Web3Edu</span>
          </Link>
        </div>
        <main id="main" className="app-main">
          <div className="center">
            <svg className="okring" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
              <circle cx="32" cy="32" r="28" />
              <path d="M20 33l8 8 17-18" />
            </svg>
          </div>
          <h1 className="welcome-h">You’re in!</h1>
          <p className="welcome-p">Welcome to the Web3Edu early list{m.display_name ? `, ${m.display_name}` : ""}. We’ve emailed you a confirmation. If it’s not there in a few minutes, check spam.</p>

          <div className="deal">
            <PassCard
              m={m}
              points={bal}
              showPoints={showPoints}
              locked={locked}
              qrSvg={qrSvgMarkup}
              qrBits={qrBits(pt.qrUrl)}
              avatar={avatar}
            />
          </div>

          <div className="stack">
            <div className="copyrow rise d4">
              <input className="input" id="ref-link" type="text" readOnly value={refUrl} aria-label="Your referral link" />
              <button className="btn btn-primary" type="button" data-copy="#ref-link">Copy</button>
            </div>
            <button className="btn btn-ghost btn-block rise d5" type="button" id="share-ref" data-share-url={refUrl} hidden>
              Share your link
            </button>
            <Link className="btn btn-dark btn-block rise d6" href={`/p/${pt.viewToken}`}>View &amp; save your pass</Link>
          </div>

          <div className="info rise d7">
            <h3>How referrals work</h3>
            <p>Share your personal link. When a friend joins through it, the referral is recorded for you.</p>
            <p>{refPts !== null ? `Each eligible referral earns you ${refPts} points.` : "No referral rewards have been announced yet."}</p>
          </div>
          <div className="info rise d7">
            <h3>Stay in the loop</h3>
            <p>
              For updates and more information, join the official Web3Edu{" "}
              <a href="https://whatsapp.com/channel/0029Vb9kqh79WtC6VCv2qB3Q" target="_blank" rel="noopener noreferrer">WhatsApp channel</a>{" "}
              or follow us on{" "}
              <a href="https://x.com/web3eduofficial" target="_blank" rel="noopener noreferrer">X (Twitter)</a>.
            </p>
          </div>
          <div className="info rise d7">
            <h3>What happens next</h3>
            <p>Your pass stays locked until launch. We’ll email you when Web3Edu opens. When you create your Web3Edu account, use this same email address so it can be matched to your waitlist entry.</p>
          </div>
        </main>
      </div>
      <FollowPopup />
      <script src="/assets/js/tick.js" defer />
    </>
  );
}
