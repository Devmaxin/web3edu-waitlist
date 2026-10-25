import "server-only";
import { headers } from "next/headers";

/**
 * Client IP extraction. On Vercel the edge sets x-forwarded-for (leftmost hop);
 * we take the first entry and validate shape. No trust of arbitrary spoofable headers.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  const xff = h.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim() ?? "";
    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(first) || first.includes(":")) return first;
  }
  return "0.0.0.0";
}
