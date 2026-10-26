/**
 * Unit tests for the Launch Campaign view helpers (src/lib/campaign-view.ts).
 * Pure functions — no DB, no env.
 */
import { describe, expect, it } from "vitest";
import { bucketOf, statusLabel, validSiteUrl } from "@/lib/campaign-view";

describe("statusLabel", () => {
  it("maps every campaign status to its panel label", () => {
    expect(statusLabel("draft")).toEqual({ label: "Draft", cls: "" });
    expect(statusLabel("queued")).toEqual({ label: "Ready", cls: "warn" });
    expect(statusLabel("sending")).toEqual({ label: "Sending", cls: "warn" });
    expect(statusLabel("done")).toEqual({ label: "Completed", cls: "ok" });
    expect(statusLabel("paused")).toEqual({ label: "Paused — needs attention", cls: "bad" });
    expect(statusLabel("cancelled")).toEqual({ label: "Cancelled", cls: "bad" });
  });

  it("falls back to Draft for unknown statuses", () => {
    expect(statusLabel("bogus")).toEqual({ label: "Draft", cls: "" });
    expect(statusLabel("")).toEqual({ label: "Draft", cls: "" });
  });
});

describe("bucketOf", () => {
  it("counts accepted + delivered as sent", () => {
    expect(bucketOf("accepted")).toBe("sent");
    expect(bucketOf("delivered")).toBe("sent");
  });

  it("counts failed/bounced/complained as failed", () => {
    expect(bucketOf("failed")).toBe("failed");
    expect(bucketOf("bounced")).toBe("failed");
    expect(bucketOf("complained")).toBe("failed");
  });

  it("counts pending/sending/delayed as pending", () => {
    expect(bucketOf("pending")).toBe("pending");
    expect(bucketOf("sending")).toBe("pending");
    expect(bucketOf("delayed")).toBe("pending");
  });

  it("counts suppressed as suppressed", () => {
    expect(bucketOf("suppressed")).toBe("suppressed");
  });

  it("returns null for unknown statuses", () => {
    expect(bucketOf("whatever")).toBeNull();
    expect(bucketOf("")).toBeNull();
  });
});

describe("validSiteUrl", () => {
  it("accepts normal https URLs", () => {
    expect(validSiteUrl("https://web3edu.name.ng")).toBe(true);
    expect(validSiteUrl("https://app.web3edu.name.ng/register?ref=x")).toBe(true);
    expect(validSiteUrl("https://sub.domain-2.example.org/a_b~c")).toBe(true);
  });

  it("rejects non-https schemes", () => {
    expect(validSiteUrl("http://web3edu.name.ng")).toBe(false);
    expect(validSiteUrl("javascript:alert(1)")).toBe(false);
    expect(validSiteUrl("data:text/html,hi")).toBe(false);
    expect(validSiteUrl("ftp://x.example")).toBe(false);
  });

  it("rejects empty and malformed values", () => {
    expect(validSiteUrl("")).toBe(false);
    expect(validSiteUrl("https://")).toBe(false);
    expect(validSiteUrl("https://exa mple.com")).toBe(false);
    expect(validSiteUrl("https://exa<mple.com")).toBe(false);
    expect(validSiteUrl('https://example.com"a"')).toBe(false);
  });

  it("is the same validator used by both admin URL actions", () => {
    // save_url allows empty (unset), save_dest does not — both share this check.
    expect(validSiteUrl("https://web3edu.name.ng/register")).toBe(true);
    expect(validSiteUrl("not a url")).toBe(false);
  });
});
