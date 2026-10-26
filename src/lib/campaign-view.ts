/**
 * Pure helpers shared by the admin campaign/emails UI (and unit tests).
 * No DB, no server-only imports — safe to import from tests.
 */

/** Human-facing Launch Campaign status label + pill class. */
export function statusLabel(status: string): { label: string; cls: string } {
  switch (status) {
    case "queued": return { label: "Ready", cls: "warn" };
    case "sending": return { label: "Sending", cls: "warn" };
    case "done": return { label: "Completed", cls: "ok" };
    case "paused": return { label: "Paused — needs attention", cls: "bad" };
    case "cancelled": return { label: "Cancelled", cls: "bad" };
    default: return { label: "Draft", cls: "" };
  }
}

/** Roll-up buckets shown in the Launch Campaign panel (email_jobs.status → count bucket). */
export function bucketOf(status: string): "sent" | "failed" | "pending" | "suppressed" | null {
  if (status === "accepted" || status === "delivered") return "sent";
  if (status === "failed" || status === "bounced" || status === "complained") return "failed";
  if (status === "pending" || status === "sending" || status === "delayed") return "pending";
  if (status === "suppressed") return "suppressed";
  return null;
}

/** A validated https URL for the main Web3Edu site (a destination link only). */
export function validSiteUrl(s: string): boolean {
  return /^https:\/\/[A-Za-z0-9.-]+([^\s"<>]*)$/.test(s);
}
