import { anyRewardActive, activePoints, EVENT_REFERRAL } from "@/lib/ledger";
import { Icon } from "@/components/icons";

export const metadata = {
  title: "Web3Edu: learn Web3, find what’s next",
  description:
    "Join the Web3Edu early-access list. Learn Web3, discover opportunities and get in before the public launch.",
};

// Always dynamic: reads launch/reward state and captures the referral cookie in middleware.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function Landing({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  await searchParams; // consumed by middleware (?ref capture + strip)
  let rewards = false;
  let refActive: number | null = null;
  try {
    rewards = await anyRewardActive();
    refActive = await activePoints(EVENT_REFERRAL);
  } catch {
    // page still renders, with no reward wording
  }

  return (
    <>
      <header className="nav" id="nav">
        <div className="wrap">
          <a className="brand" href="/" aria-label="Web3Edu home">
            <img src="/assets/img/logo-mark-96.png" width={34} height={34} alt="" />
            <span>Web3Edu</span>
          </a>
          <a className="btn btn-primary btn-sm" href="/join">Join</a>
        </div>
      </header>

      <main id="main">
        <section className="hero">
          <div className="wrap hero-grid">
            <div>
              <span className="chip"><i />Early-access list is open</span>
              <h1 className="hero-title" aria-label="Learn Web3. Find what’s next.">
                <span className="line" aria-hidden="true"><span className="line-in">Learn Web3.<span className="tag"><Icon name="book" /></span></span></span>
                <span className="line soft" aria-hidden="true"><span className="line-in">Find what’s</span></span>
                <span className="line soft" aria-hidden="true"><span className="line-in">next.<span className="tag"><Icon name="up" /></span></span></span>
              </h1>
              <p className="lead">Web3Edu is being built as one place to learn Web3 and discover the opportunities around it. Join the early list before the public launch.</p>
              <div className="cta-row">
                <a className="btn btn-primary" href="/join">Join the waitlist<Icon name="arrow" className="arrow" /></a>
                <a className="btn btn-ghost" href="#why">See why we’re building it</a>
              </div>
              <ul className="trust">
                <li><Icon name="check" />Free to join</li>
                <li><Icon name="check" />Just your email</li>
                <li><Icon name="check" />No password</li>
              </ul>
            </div>

            <div className="stage" id="hero-stage">
              <span className="fchip fc1"><Icon name="book" />Learn</span>
              <span className="fchip fc2"><Icon name="compass" />Discover</span>
              <span className="fchip fc3"><Icon name="up" />Grow</span>
              <div className="pass sample" role="img" aria-label="Sample early-access pass, locked until launch">
                <div className="pass-top">
                  <div className="pass-brand"><img src="/assets/img/logo-mark-96.png" width={34} height={34} alt="" />Web3Edu</div>
                  <span className="pass-tag">Early access</span>
                </div>
                <div className="pass-id">Waitlist ID</div>
                <div className="pass-id-val">W3E-••••-••••</div>
                <div className="pass-member">
                  <div className="pass-avatar"><img src="/assets/avatars/cyber_02.svg" width={52} height={52} alt="" /></div>
                  <div className="pass-who"><small>Member</small><b>Early member</b></div>
                </div>
                <div className="pass-status" id="sample-status"><span className="lockico"><Icon name="lock" /></span><span>Locked until launch</span></div>
                <p className="pass-note">Every member gets a personal pass like this. This one is a sample.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="block" id="why">
          <div className="wrap">
            <div className="panel reveal scatter-wrap" id="problem">
              <span className="eyebrow">The problem</span>
              <h2>Web3 learning is scattered.<br /><span className="soft">So is everything around it.</span></h2>
              <p className="lead">Tutorials live on one site, opportunities on another feed, and the useful answers are buried in group chats. Newcomers spend more time hunting than learning.</p>
              <div className="scatter" role="img" aria-label="Illustration: scattered resources such as tutorials, videos, opportunities and newsletters settle into three groups: Learn, Discover and Grow.">
                <span className="row-label rl1" aria-hidden="true">Learn</span>
                <span className="row-label rl2" aria-hidden="true">Discover</span>
                <span className="row-label rl3" aria-hidden="true">Grow</span>
                <span className="chp c1" aria-hidden="true"><i />Tutorial</span>
                <span className="chp c2" aria-hidden="true"><i />Video</span>
                <span className="chp c3 k2" aria-hidden="true"><i />Opportunity</span>
                <span className="chp c4 k2" aria-hidden="true"><i />Newsletter</span>
                <span className="chp c5 k3" aria-hidden="true"><i />Guide</span>
                <span className="chp c6 k3" aria-hidden="true"><i />Community</span>
              </div>
              <p className="scap" aria-live="polite"><span className="ca">Resources, threads and opportunities live in different places.</span><span className="cb">Web3Edu aims to bring them together in one place.</span></p>
            </div>
          </div>
        </section>

        <section className="block" id="vision">
          <div className="wrap">
            <div className="reveal">
              <span className="eyebrow">The idea</span>
              <h2>One place to learn<br /><span className="soft">and discover.</span></h2>
              <p className="lead">Web3Edu is meant to bring learning and discovery together, so you can go from curious to capable without juggling ten tabs.</p>
              <p className="note"><span className="tag-planned">Planned experience · illustrative</span> Details may change before launch.</p>
            </div>
            <div className="feats">
              <article className="feat f-learn reveal">
                <div className="feat-vis" aria-hidden="true">
                  <div className="path">
                    <div className="lrow done"><span className="dot"><Icon name="check" /></span><span className="ln" /></div>
                    <div className="lrow done"><span className="dot"><Icon name="check" /></span><span className="ln s" /></div>
                    <div className="lrow now"><span className="dot" /><span className="ln" /></div>
                    <div className="lrow"><span className="dot" /><span className="ln s" /></div>
                  </div>
                </div>
                <div className="feat-body"><span className="num">01 · LEARN</span><h3>Start from the basics.</h3><p>Guided lessons that start from the basics and build step by step.</p></div>
              </article>
              <article className="feat f-discover reveal s1">
                <div className="feat-vis" aria-hidden="true">
                  <div className="radar"><i className="wave" /><i /><i /><i /><b /><span className="pin p1" /><span className="pin p2" /><span className="pin p3" /></div>
                </div>
                <div className="feat-body"><span className="num">02 · DISCOVER</span><h3>See what’s out there.</h3><p>Opportunities and resources in one place.</p></div>
              </article>
              <article className="feat f-grow reveal s2">
                <div className="feat-vis" aria-hidden="true">
                  <div className="bars"><span /><span /><span /><span /></div><span className="flag"><Icon name="flag" /></span>
                </div>
                <div className="feat-body"><span className="num">03 · GROW</span><h3>Know where you’re heading.</h3><p>A clearer path toward the skills you want.</p></div>
              </article>
            </div>
          </div>
        </section>

        <section className="block" id="early">
          <div className="wrap">
            <div className="panel">
              <div className="reveal">
                <span className="eyebrow">Early access</span>
                <h2>Join now. Get in early.</h2>
                <p className="lead">
                  {rewards
                    ? "Members of the early list get a personal pass and a link to share. Early-access points reward people who join and help others find Web3Edu."
                    : "Members of the early list get a personal pass, a link to share, and an email the moment Web3Edu opens."}
                </p>
              </div>
              <ol className="tl">
                <li><span className="n">1</span><div className="tx"><h3>Join</h3><p>Add your email, pick an avatar. You get a Waitlist ID and your personal pass straight away.</p></div></li>
                <li><span className="n">2</span><div className="tx"><h3>Share</h3><p>{refActive !== null ? "Invite friends with your own link. Eligible referrals can earn you points." : "Invite friends with your own link. We record who joined through it."}</p></div></li>
                {rewards ? (
                  <li><span className="n">3</span><div className="tx"><h3>Register at launch</h3><p>When Web3Edu opens, create your account with the same email you joined with. Any early-access rewards are added to your account when you register.</p></div></li>
                ) : (
                  <li><span className="n">3</span><div className="tx"><h3>Hear first</h3><p>When Web3Edu opens, you’ll get an email before the public announcement.</p></div></li>
                )}
              </ol>
              {rewards && <p className="note">Points are early-access rewards inside Web3Edu. They are not money, a token or a guaranteed entitlement.</p>}
            </div>
          </div>
        </section>

        <section className="block" id="faq">
          <div className="wrap">
            <div className="reveal"><span className="eyebrow">Questions</span><h2>Quick answers.</h2></div>
            <div className="faq">
              <div className="fq open">
                <h3><button className="fq-q" type="button" id="fq1" aria-expanded="true" aria-controls="fa1"><span>Is it free to join?</span><i className="pm" aria-hidden="true" /></button></h3>
                <div className="fq-a" id="fa1" role="region" aria-labelledby="fq1"><div><p>Yes. Joining the waitlist costs nothing.</p></div></div>
              </div>
              <div className="fq">
                <h3><button className="fq-q" type="button" id="fq2" aria-expanded="false" aria-controls="fa2"><span>Do I need to verify my email to join?</span><i className="pm" aria-hidden="true" /></button></h3>
                <div className="fq-a" id="fa2" role="region" aria-labelledby="fq2"><div><p>No. You’re on the list as soon as you submit. When launch comes, register on Web3Edu with the same email address so your account can be matched to your waitlist entry.</p></div></div>
              </div>
              <div className="fq">
                <h3><button className="fq-q" type="button" id="fq3" aria-expanded="false" aria-controls="fa3"><span>What do I get?</span><i className="pm" aria-hidden="true" /></button></h3>
                <div className="fq-a" id="fa3" role="region" aria-labelledby="fq3"><div><p>A Waitlist ID, a personal early-access pass, your own referral link, and an email when Web3Edu opens. Nothing more is promised at this stage.</p></div></div>
              </div>
              <div className="fq">
                <h3><button className="fq-q" type="button" id="fq4" aria-expanded="false" aria-controls="fa4"><span>How do referrals work?</span><i className="pm" aria-hidden="true" /></button></h3>
                <div className="fq-a" id="fa4" role="region" aria-labelledby="fq4"><div><p>{refActive !== null ? "Share your personal link. When someone joins through it, the referral is recorded for you and may earn you points." : "Share your personal link. Referrals are recorded, but no referral rewards have been announced."}</p></div></div>
              </div>
              <div className="fq">
                <h3><button className="fq-q" type="button" id="fq5" aria-expanded="false" aria-controls="fa5"><span>When is the launch?</span><i className="pm" aria-hidden="true" /></button></h3>
                <div className="fq-a" id="fa5" role="region" aria-labelledby="fq5"><div><p>We haven’t announced a date. Everyone on the list will be emailed first.</p></div></div>
              </div>
              <div className="fq">
                <h3><button className="fq-q" type="button" id="fq6" aria-expanded="false" aria-controls="fa6"><span>What do you do with my email?</span><i className="pm" aria-hidden="true" /></button></h3>
                <div className="fq-a" id="fa6" role="region" aria-labelledby="fq6"><div><p>We use it to run the waitlist and email you about the launch. <a href="/privacy">Read the privacy notice</a>.</p></div></div>
              </div>
            </div>
          </div>
        </section>

        <section className="block">
          <div className="wrap">
            <div className="closer">
              <img className="mark" src="/assets/img/logo-mark.png" width={76} height={76} alt="" />
              <h2><span className="w">Be</span> <span className="w">early.</span><br /><span className="w">Learn</span> <span className="w">Web3</span> <span className="w">with</span> <span className="w">us.</span></h2>
              <a className="btn btn-primary" href="/join">Join the waitlist<Icon name="arrow" className="arrow" /></a>
            </div>
          </div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <span>© {new Date().getFullYear()} Web3Edu</span>
          <FooterLinks />
        </div>
      </footer>
      <script src="/assets/js/tick.js" defer />
    </>
  );
}

function FooterLinks() {
  const s = process.env.SUPPORT_EMAIL ?? "";
  return (
    <span>
      <a href="/privacy">Privacy</a>
      {s !== "" && !s.includes("PLACEHOLDER") && (
        <> · <a href={`mailto:${s}`}>{s}</a></>
      )}
    </span>
  );
}
