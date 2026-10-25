/** QR determinism: one URL -> one QR, forever (pass + QR route depend on it). */
import { describe, expect, it } from "vitest";
import { qrBits, qrPngBuffer, qrSvg } from "@/lib/qr";

describe("qrBits", () => {
  it("is deterministic per URL", () => {
    const a = qrBits("https://app.example.com/qr/TOKEN_1");
    const b = qrBits("https://app.example.com/qr/TOKEN_1");
    expect(a).toBe(b);
  });

  it("differs per URL and is always an odd square bitmap (21/25/29…)", () => {
    const a = qrBits("https://app.example.com/qr/TOKEN_1");
    const b = qrBits("https://app.example.com/qr/TOKEN_2");
    expect(a).not.toBe(b);
    const n = Math.round(Math.sqrt(a.length));
    expect(n * n).toBe(a.length);
    expect(n % 2).toBe(1);
    expect(n).toBeGreaterThanOrEqual(21); // smallest QR version
  });

  it("contains only 0/1 and includes the finder patterns (dark corners)", () => {
    const bits = qrBits("x");
    expect(bits).toMatch(/^[01]+$/);
    expect(bits.slice(0, 7)).toBe("1111111"); // top-left finder top row
  });
});

describe("qrSvg", () => {
  it("renders an SVG without inline handlers (CSP-safe)", async () => {
    const svg = await qrSvg("https://app.example.com/qr/T");
    expect(svg).toContain("<svg");
    expect(svg).not.toContain("onclick");
    expect(svg).not.toContain("style=");
    expect(svg).not.toContain("<script");
  });

  it("is deterministic", async () => {
    expect(await qrSvg("y")).toBe(await qrSvg("y"));
  });
});

describe("qrPngBuffer", () => {
  it("produces a real PNG signature", async () => {
    const buf = await qrPngBuffer("https://app.example.com/qr/T");
    expect(buf.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(buf.length).toBeGreaterThan(500);
  });
});
