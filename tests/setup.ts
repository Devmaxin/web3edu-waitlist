/**
 * Test setup: deterministic placeholders for secrets the app validates loudly.
 * These are REAL but throwaway values used only in tests — never production secrets.
 */
if (!process.env.APP_KEY) {
  // 32 random bytes, base64 (a fixed test vector — fine for tests only).
  process.env.APP_KEY = Buffer.from("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef").toString(
    "base64",
  );
}

if (!process.env.RESEND_WEBHOOK_SECRET) {
  // whsec_-prefixed base64, decodable, matches .env.example's shape.
  process.env.RESEND_WEBHOOK_SECRET = `whsec_5b654975726f6b6574656e7431333337${Buffer.from(
    "test-webhook-secret",
  ).toString("base64")}`;
}
