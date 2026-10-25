import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { memberSessionGet } from "@/lib/member-session";

export const metadata: Metadata = {
  title: "You’re already on the list",
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";

/** Shown after a submit that matched an existing registration (state never leaks). */
export default async function JoinExists() {
  const jar = await cookies();
  // If the visitor actually has a member session, nothing to do here.
  if (memberSessionGet(jar) !== null) redirect("/welcome");

  return (
    <div className="app join-app">
      <div className="app-head">
        <Link className="brand" href="/" aria-label="Web3Edu home">
          <img src="/assets/img/logo-mark-96.png" width={34} height={34} alt="" />
          <span>Web3Edu</span>
        </Link>
      </div>
      <main id="main" className="app-main center">
        <div className="avstage">
          <div className="avcore">
            <img className="avmark" src="/assets/img/logo-mark.png" width={112} height={112} alt="Web3Edu" />
          </div>
        </div>
        <h1 className="q">You’re already on the list.</h1>
        <p className="q-sub">That email is already registered, so nothing was added twice. We’ve sent your pass link to that inbox. It can take a minute to arrive.</p>
        <Link className="btn btn-ghost btn-block" href="/">Back to Web3Edu</Link>
      </main>
    </div>
  );
}
