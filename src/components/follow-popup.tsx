"use client";

/**
 * Mini popup on the welcome page: WhatsApp channel + X links, 3 s after entry.
 * Slides in once per browser (dismissal remembered in localStorage), closes on
 * the ✕ button or on visiting either link — never rendered before the timer.
 */
import { useEffect, useState } from "react";
import { Icon } from "@/components/icons";

const DISMISSED = "w3e-follow-popup";
const WHATSAPP = "https://whatsapp.com/channel/0029Vb9kqh79WtC6VCv2qB3Q";
const X = "https://x.com/web3eduofficial";

export function FollowPopup() {
  const [open, setOpen] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISSED) === "1";
    } catch {
      // private mode: storage unavailable — just show the popup this visit
    }
    if (dismissed) return;
    const t = setTimeout(() => setOpen(true), 3000);
    return () => clearTimeout(t);
  }, []);

  function close() {
    try {
      localStorage.setItem(DISMISSED, "1");
    } catch {
      // ignore
    }
    setOpen(false);
    setGone(true);
  }

  if (gone || !open) return null;
  return (
    <aside className="follow-pop" role="region" aria-label="Stay in the loop">
      <button className="fp-x" type="button" onClick={close} aria-label="Close">
        ✕
      </button>
      <h3>Stay in the loop</h3>
      <p>Join the official Web3Edu channels for updates until launch.</p>
      <div className="fp-links">
        <a className="social" href={WHATSAPP} target="_blank" rel="noopener noreferrer" onClick={close}>
          <Icon name="whatsapp" />WhatsApp channel
        </a>
        <a className="social" href={X} target="_blank" rel="noopener noreferrer" onClick={close}>
          <Icon name="x" />Follow on X
        </a>
      </div>
    </aside>
  );
}
