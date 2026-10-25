/**
 * Resend (Svix) webhook signature verification: hand-computed vectors, no mocks —
 * the same svix-style signing scheme (id.timestamp.body over a base64 key).
 */
import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { verifyWebhook } from "@/lib/mailer";

const BODY = JSON.stringify({ type: "email.delivered", data: { email_id: "e-123" } });

/** Build a valid Svix-style header set from a test secret. */
function signedHeaders(secretB64: string, body: string, ts: number, id = "msg_test") {
  const sig = createHmac("sha256", Buffer.from(secretB64, "base64")).update(`${id}.${ts}.${body}`).digest("base64");
  return {
    svixId: id,
    svixTimestamp: String(ts),
    svixSignature: `v1,${sig}`,
  };
}

const TEST_SECRET = `whsec_${Buffer.from("0123456789abcdef0123456789abcdef").toString("base64")}`;
const now = Math.floor(Date.now() / 1000);

describe("verifyWebhook", () => {
  const orig = process.env.RESEND_WEBHOOK_SECRET;

  it("accepts a correctly signed event", () => {
    process.env.RESEND_WEBHOOK_SECRET = TEST_SECRET;
    const headers = signedHeaders(TEST_SECRET.slice(6), BODY, now);
    expect(verifyWebhook(BODY, headers, now)).toBe(true);
  });

  it("accepts the v1,multi-space format with a valid first entry", () => {
    process.env.RESEND_WEBHOOK_SECRET = TEST_SECRET;
    const headers = signedHeaders(TEST_SECRET.slice(6), BODY, now);
    headers.svixSignature += ` v1,${"A".repeat(43)}`;
    expect(verifyWebhook(BODY, headers, now)).toBe(true);
  });

  it("rejects a tampered body", () => {
    process.env.RESEND_WEBHOOK_SECRET = TEST_SECRET;
    const headers = signedHeaders(TEST_SECRET.slice(6), BODY, now);
    const other = BODY.replace("delivered", "bounced");
    expect(verifyWebhook(other, headers, now)).toBe(false);
  });

  it("rejects stale timestamps (> 5 min)", () => {
    process.env.RESEND_WEBHOOK_SECRET = TEST_SECRET;
    const headers = signedHeaders(TEST_SECRET.slice(6), BODY, now - 301);
    expect(verifyWebhook(BODY, headers, now)).toBe(false);
  });

  it("rejects a wrong key", () => {
    process.env.RESEND_WEBHOOK_SECRET = TEST_SECRET;
    const other = `whsec_${Buffer.from("another-key-0123456789abcdef00").toString("base64")}`;
    const headers = signedHeaders(other.slice(6), BODY, now);
    expect(verifyWebhook(BODY, headers, now)).toBe(false);
  });

  it("rejects without a configured secret", () => {
    process.env.RESEND_WEBHOOK_SECRET = "";
    const headers = signedHeaders(TEST_SECRET.slice(6), BODY, now);
    expect(verifyWebhook(BODY, headers, now)).toBe(false);
    process.env.RESEND_WEBHOOK_SECRET = "whsec_PLACEHOLDER";
    expect(verifyWebhook(BODY, headers, now)).toBe(false);
  });

  it("rejects missing or malformed headers", () => {
    process.env.RESEND_WEBHOOK_SECRET = TEST_SECRET;
    expect(verifyWebhook(BODY, { svixId: "x", svixTimestamp: "abc", svixSignature: "v1,x" }, now)).toBe(false);
    expect(verifyWebhook(BODY, {}, now)).toBe(false);
    const headers = signedHeaders(TEST_SECRET.slice(6), BODY, now);
    headers.svixSignature = `v1,${"A".repeat(43)}`; // right shape, wrong signature
    expect(verifyWebhook(BODY, headers, now)).toBe(false);
  });

  it("the leeway window itself is accepted", () => {
    process.env.RESEND_WEBHOOK_SECRET = TEST_SECRET;
    const headers = signedHeaders(TEST_SECRET.slice(6), BODY, now - 299);
    expect(verifyWebhook(BODY, headers, now)).toBe(true);
  });

  if (orig) process.env.RESEND_WEBHOOK_SECRET = orig;
});
