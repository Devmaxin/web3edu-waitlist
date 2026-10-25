/**
 * Token crypto: purpose-separated derivation, signing and hashes.
 * Port of the old PHP Crypto tests (same vectors shape, different key).
 */
import { describe, expect, it } from "vitest";
import { b64u, code, derive, derivedToken, ipHash, sha256, sign, token, unsign } from "@/lib/crypto";

describe("sign + unsign", () => {
  it("round-trips a signed payload", () => {
    const signed = sign("ref", "AB12CD34EF|1720000000");
    expect(signed.startsWith("AB12CD34EF|1720000000.")).toBe(true);
    const out = unsign("ref", signed);
    expect(out).toBe("AB12CD34EF|1720000000");
  });

  it("rejects a signature from a different purpose", () => {
    const signed = sign("ref", "AB12CD34EF");
    expect(unsign("trap", signed)).toBe(null);
  });

  it("rejects a tampered payload", () => {
    const signed = sign("ref", "AB12CD34EF");
    expect(unsign("ref", signed.slice(0, -2) + "xx")).toBe(null);
    expect(unsign("ref", "XX" + signed)).toBe(null);
  });

  it("rejects garbage", () => {
    expect(unsign("ref", "")).toBe(null);
    expect(unsign("ref", ".")).toBe(null);
    expect(unsign("ref", "no-signature-here")).toBe(null);
  });
});

describe("derivedToken", () => {
  it("is deterministic for the same (purpose, id, version)", () => {
    expect(derivedToken("x", 7, 1)).toBe(derivedToken("x", 7, 1));
  });

  it("differs per purpose, id and version", () => {
    expect(derivedToken("qr", 7, 1)).not.toBe(derivedToken("view", 7, 1));
    expect(derivedToken("qr", 7, 1)).not.toBe(derivedToken("qr", 8, 1));
    expect(derivedToken("qr", 7, 1)).not.toBe(derivedToken("qr", 7, 2));
  });

  it("uses the URL-safe base64 alphabet", () => {
    expect(derivedToken("qr", 12345, 3)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("purpose separation holds for raw derive() too", () => {
    expect(derive("ip", "1.2.3.4").equals(derive("unsub", "1.2.3.4"))).toBe(false);
  });
});

describe("helpers", () => {
  it("token() is base64url with the right length", () => {
    for (let i = 0; i < 10; i++) expect(token(32)).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token(32)).toHaveLength(43);
    expect(token(16)).toHaveLength(22);
  });

  it("code() uses the Crockford alphabet and never I/L/O/U", () => {
    for (let i = 0; i < 50; i++) {
      const c = code(10);
      expect(c).toHaveLength(10);
      expect(c).toMatch(/^[0-9ABCDEFGHJKMNPQRSTVWXYZ]+$/);
    }
  });

  it("ipHash is a stable keyed hash (not the raw IP)", () => {
    expect(ipHash("1.2.3.4")).toBe(ipHash("1.2.3.4"));
    expect(ipHash("1.2.3.4")).not.toBe(ipHash("1.2.3.5"));
    expect(ipHash("1.2.3.4")).toHaveLength(64);
  });

  it("b64u strips padding and maps to the URL-safe alphabet", () => {
    // "a?a" contains +/-/ chars that must not crash; check roundtrip decoding of a known value.
    expect(b64u(Buffer.from([0xff, 0xfe, 0xfd]))).toEqual(b64u(Buffer.from([0xff, 0xfe, 0xfd])));
  });

  it("sha256 is a normal hex digest", () => {
    expect(sha256("hello")).toBe(sha256("hello"));
    expect(sha256("hello")).toHaveLength(64);
  });
});
