/** The dark early-access pass card. A faithful port of app/Views/_passcard.php. */
import { Icon } from "@/components/icons";
import { AVATARS } from "@/lib/avatar";
import type { MemberRow } from "@/lib/pass";

export function PassCard({
  m,
  points,
  showPoints,
  locked,
  qrSvg,
  qrBits,
  avatar,
}: {
  m: MemberRow;
  points: number;
  showPoints: boolean;
  locked: boolean;
  qrSvg: string;
  qrBits: string;
  avatar: string | null;
}) {
  const who = m.display_name && m.display_name.trim() !== "" ? m.display_name : "Early member";
  const wid = m.waitlist_id;
  return (
    <div
      className="pass"
      id="pass-card"
      data-wid={wid}
      data-name={who}
      data-points={points}
      data-showpoints={showPoints ? "1" : "0"}
      data-locked={locked ? "1" : "0"}
      data-avatar={avatar ? `/assets/avatars/${avatar}.svg` : ""}
      data-qr={qrBits}
    >
      <div className="pass-top">
        <div className="pass-brand">
          <img src="/assets/img/logo-mark-96.png" width={34} height={34} alt="" />
          Web3Edu
        </div>
        <span className="pass-tag">Early access</span>
      </div>
      <div className="pass-id">Waitlist ID</div>
      <div className="pass-id-val">
        <span className="idtxt" role="text" aria-label={`Waitlist ID ${wid}`}>
          {wid}
        </span>
        <button className="idcopy" type="button" data-copy-text={wid} aria-label="Copy Waitlist ID">
          <Icon name="copy" />
        </button>
      </div>
      <div className="pass-member">
        <div className={`pass-avatar ${avatar ? "" : "is-mark"}`}>
          <img
            src={avatar ? `/assets/avatars/${avatar}.svg` : "/assets/img/logo-mark-96.png"}
            width={52}
            height={52}
            alt={avatar ? `Your avatar: ${AVATARS[avatar]}` : "Web3Edu cube"}
          />
        </div>
        <div className="pass-who">
          <small>Member</small>
          <b>{who}</b>
        </div>
        {showPoints && (
          <div className="pass-pts">
            <small>Points</small>
            <b>{points}</b>
          </div>
        )}
      </div>
      <div className={`pass-qr ${locked ? "is-locked" : ""}`} dangerouslySetInnerHTML={{ __html: qrSvg }} />
      <div className="pass-status">
        <span className="lockico"><Icon name="lock" /></span>
        <span>{locked ? "Locked until launch" : "Launch is open"}</span>
      </div>
      <p className="pass-note">
        {showPoints
          ? "Your pass is your early-access reference when Web3Edu opens. It isn’t a financial asset."
          : "Your Web3Edu early-access pass. It isn’t a financial asset."}
      </p>
    </div>
  );
}
