/** Honeypot + signed time trap: same policy as the old build (3s min, 2h max). */
import { describe, expect, it } from "vitest";
import { MAX_FILL_SECONDS, MIN_FILL_SECONDS, botCheck, makeTimeTrap, trapAge } from "@/lib/bot-trap";
import crypto from "node:crypto";

function signAsNow(secondsAgo: number): string {
  // Real HMAC with the same APP_KEY the test setup provides — verifies the signature path.
  const payload = String(Math.floor(Date.now() / 1000) - secondsAgo);
  const key = Buffer.from(process.env.APP_KEY ?? "", "base64");
  const k = crypto.createHmac("sha256", key).update("w3e/trap").digest();
  const sig = crypto.createHmac("sha256", k).update(payload).digest().toString("base64");
  return `${payload}.${sig.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")}`;
}

describe("botCheck", () => {
  it("passes a human-ish submission", () => {
    expect(botCheck("", signAsNow(42))).toEqual({ ok: true, reason: null });
  });

  it("flags the honeypot as honeypot_or_stale", () => {
    expect(botCheck("example.com", signAsNow(42))).toEqual({ ok: false, reason: "honeypot_or_stale" });
  });

  it("flags missing/garbage traps as bad_trap", () => {
    expect(botCheck("", undefined)).toEqual({ ok: false, reason: "bad_trap" });
    expect(botCheck("", "1.2.3")).toEqual({ ok: false, reason: "bad_trap" });
    expect(botCheck("", "12.not-a-signature!!")).toEqual({ ok: false, reason: "bad_trap" });
  });

  it("flags too-fast submissions as too_fast", () => {
    expect(botCheck("", signAsNow(0))).toEqual({ ok: false, reason: "too_fast" });
    expect(botCheck("", signAsNow(MIN_FILL_SECONDS - 1))).toEqual({ ok: false, reason: "too_fast" });
  });

  it("accepts exactly-at-minimum age and flags stale past 2h", () => {
    expect(botCheck("", signAsNow(MIN_FILL_SECONDS)).ok).toBe(true);
    expect(botCheck("", signAsNow(60))).toEqual({ ok: true, reason: null });
    expect(botCheck("", signAsNow(MAX_FILL_SECONDS + 1))).toEqual({ ok: false, reason: "honeypot_or_stale" });
  });

  it("trapAge measures positive age and rejects tampered values", () => {
    const t = makeTimeTrap();
    expect(trapAge(t)).toBeLessThan(MIN_FILL_SECONDS); // fresh = 0
    expect(trapAge(`${t}x`)).toBe(-1);
    expect(trapAge("")).toBe(-1);
  });

  it("cross-purpose signatures are rejected (ref cookie as trap)", () => {
    const refSigned = signAsLockedRef();
    expect(trapAge(refSigned)).toBe(-1);
  });
});

function signAsLockedRef(): string {
  const payload = `${"ABCD1234EF"}|${Math.floor(Date.now() / 1000) + 30 * 86400}`;
  const key = Buffer.from(process.env.APP_KEY ?? "", "base64");
  const k = crypto.createHmac("sha256", key).update("w3e/ref").digest();
  const sig = crypto.createHmac("sha256", k).update(payload).digest().toString("base64");
  return `${payload}.${sig.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")}`;
}
