/**
 * Signup domain logic: canonicalisation + validation with the EXACT public copy
 * (the old Signup.php messages must never drift — they face users).
 */
import { describe, expect, it } from "vitest";
import { avatarIsValid, AVATARS } from "@/lib/avatar";
import {
  canonicalEmail,
  referralCodeRegex,
  validateSignup,
  validReferralCode,
  waitlistIdRegex,
} from "@/lib/signup";

describe("canonicalEmail", () => {
  it("lowercases and trims", () => {
    expect(canonicalEmail("  A@B.COM ")).toBe("a@b.com");
  });

  it("collapses gmail dots and +tag", () => {
    expect(canonicalEmail("First.Last+tag@gmail.com")).toBe("firstlast@gmail.com");
  });

  it("folds googlemail.com", () => {
    expect(canonicalEmail("Jane.Doe+x@googlemail.com")).toBe("janedoe@gmail.com");
  });

  it("keeps dots and +tag for non-gmail domains", () => {
    expect(canonicalEmail("first.last+x@example.com")).toBe("first.last+x@example.com");
  });

  it("leaves emails without @ unchanged", () => {
    expect(canonicalEmail("not-an-email")).toBe("not-an-email");
  });

  it("does not sign spoofed separators", () => {
    // Only the local part before the LAST @ is treated as gmail; the rest keeps its dots.
    expect(canonicalEmail("a@gmail.com@gmail.com")).toBe("a@gmailcom@gmail.com");
  });
});

describe("validateSignup", () => {
  it("accepts a clean signup (empty name allowed)", () => {
    const [err, clean] = validateSignup({ email: " A@b.com ", name: "", avatar: "robot_01" });
    expect(err).toEqual({});
    expect(clean).toEqual({ email: "A@b.com", name: "", avatar: "robot_01" });
  });

  it("requires a valid email with the exact copy", () => {
    for (const e of ["", "nope", "a@b", "a b@c.com", "a@b..com", `${"x".repeat(196)}@example.com`]) {
      const [err] = validateSignup({ email: e, name: "", avatar: "" });
      expect(err.email).toBe("Enter a valid email address (up to 190 characters).");
    }
  });

  it("allows a 190-character email (boundary)", () => {
    const local = "x".repeat(178);
    expect(`${local}@example.com`).toHaveLength(190);
    const [err] = validateSignup({ email: `${local}@example.com`, name: "", avatar: "" });
    expect(err.email).toBeUndefined();
  });

  it("rejects names over 40 code points", () => {
    const [err] = validateSignup({ email: "a@b.com", name: "x".repeat(41), avatar: "" });
    expect(err.name).toBe("Use up to 40 letters, without links or symbols.");
  });

  it("rejects links and symbols in names with the exact copy", () => {
    for (const n of ["<b>x</b>", "http://x.com", "see www.example.com", "im\u0000bad"]) {
      const [err] = validateSignup({ email: "a@b.com", name: n, avatar: "" });
      expect(err.name).toBe("Use up to 40 letters, without links or symbols.");
    }
  });

  it("collapses whitespace but keeps accented characters", () => {
    const [err, clean] = validateSignup({ email: "a@b.com", name: "  Ana\u00a0María   Lu\u0301... hmm ", avatar: "" });
    expect(err.name).toBeUndefined();
    expect(clean.name.length).toBeLessThanOrEqual(40);
  });

  it("rejects non-whitelisted avatars with the exact copy", () => {
    const [err] = validateSignup({ email: "a@b.com", name: "", avatar: "../../etc/passwd" });
    expect(err.avatar).toBe("Choose one of the avatars shown.");
  });

  it("accepts every shipped avatar key", () => {
    for (const a of Object.keys(AVATARS)) {
      const [err] = validateSignup({ email: "a@b.com", name: "", avatar: a });
      expect(err).toEqual({});
    }
  });

  it("boolean/number inputs are coerced, never crash", () => {
    expect(() => validateSignup({ email: true })).not.toThrow();
    expect(() => validateSignup({ email: undefined, name: undefined, avatar: undefined })).not.toThrow();
  });
});

describe("format validators", () => {
  it("waitlist id shape", () => {
    const m = waitlistIdRegex();
    expect(m.test("W3E-ABCD-1234")).toBe(true);
    expect(m.test("W3E-ABCDE-123")).toBe(false);
    expect(m.test("W3E-ABCD-I234")).toBe(false); // ambiguous letters excluded (Crockford)
  });

  it("referral code shape + validation", () => {
    expect(referralCodeRegex().test("AB12CD34EF")).toBe(true);
    expect(referralCodeRegex().test("AB12CD34E")).toBe(false);
    expect(validReferralCode(" ab12cd34ef ")).toBe("AB12CD34EF");
    expect(validReferralCode("short")).toBe(null);
    expect(validReferralCode("<script>x")).toBe(null);
  });

  it("all avatar keys map to existing shipped files (8 SVGs)", () => {
    expect(Object.keys(AVATARS)).toHaveLength(8);
    for (const a of Object.keys(AVATARS)) expect(avatarIsValid(a)).toBe(true);
  });
});
