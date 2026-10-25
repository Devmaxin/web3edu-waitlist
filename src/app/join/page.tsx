import { signupsOpen } from "@/lib/settings";
import { cookies } from "next/headers";
import { referrerCodeFromCookie } from "@/lib/signup";
import { makeTimeTrap } from "@/lib/bot-trap";
import { metadata } from "./metadata";
import JoinFlow from "@/components/join-flow";
import Link from "next/link";

export { metadata };

export const dynamic = "force-dynamic";

export default async function JoinPage() {
  const jar = await cookies();
  const invited = referrerCodeFromCookie(jar) !== null;
  // The device cookie is issued by middleware (server components can't set cookies).
  const open = await signupsOpen();
  const trap = makeTimeTrap();

  return (
    <div className="app join-app" id="join">
      <div className="app-head">
        <Link className="brand" href="/" aria-label="Web3Edu home">
          <img src="/assets/img/logo-mark-96.png" width={34} height={34} alt="" />
          <span>Web3Edu</span>
        </Link>
        <Link className="btn btn-ghost btn-sm" href="/">Back</Link>
      </div>
      <main id="main" className="app-main">
        {!open ? (
          <div className="lockcard">
            <h1>Signups are paused</h1>
            <p>The early list is temporarily closed. Please check back soon.</p>
          </div>
        ) : (
          <JoinFlow trap={trap} invited={invited} avPick="" />
        )}
      </main>
    </div>
  );
}
