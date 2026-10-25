/**
 * Bot protection inputs: honeypot ("website" field) + signed minimum/maximum fill time
 * (site renders the form with a signed timestamp; submission verifies it), like the
 * PHP Crypto::sign('trap', time()).
 */
import { sign, unsign } from "./crypto";

export const MIN_FILL_SECONDS = 3;
export const MAX_FILL_SECONDS = 7200;

/** Time trap value embedded in the rendered form. */
export function makeTimeTrap(): string {
  return sign("trap", String(Math.floor(Date.now() / 1000)));
}

/** Parse+verify a trap value: returns its age in seconds (>=0 valid) or -1 if invalid. */
export function trapAge(trap: string | undefined | null): number {
  if (!trap) return -1;
  const tsRaw = unsign("trap", trap);
  if (tsRaw === null) return -1;
  const ts = Number(tsRaw);
  if (!Number.isFinite(ts) || ts < 0) return -1;
  return Math.floor(Date.now() / 1000) - ts;
}

export type BotCheck = { ok: boolean; reason: "bad_trap" | "too_fast" | "honeypot_or_stale" | null };

/** Returns ok=false when the submission looks automated. */
export function botCheck(honeypotValue: unknown, trap: string | undefined | null): BotCheck {
  const age = trapAge(trap);
  if (age < 0) return { ok: false, reason: "bad_trap" };
  if (String(honeypotValue ?? "") !== "" || age < MIN_FILL_SECONDS || age > MAX_FILL_SECONDS) {
    return { ok: false, reason: age < MIN_FILL_SECONDS ? "too_fast" : "honeypot_or_stale" };
  }
  return { ok: true, reason: null };
}
