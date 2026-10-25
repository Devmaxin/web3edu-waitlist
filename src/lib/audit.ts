/**
 * Audit log writes. meta NEVER contains tokens, passwords or secrets.
 * Mirrors app/Services/Audit.php.
 */
import "server-only";
import { db } from "./db";

export type ActorType = "admin" | "system" | "public";

export async function insertAuditLog(
  actorType: ActorType,
  actorId: string | null,
  action: string,
  target: string | null = null,
  meta: string | null = null,
): Promise<void> {
  try {
    const { error } = await db().from("audit_log").insert({
      actor_type: actorType,
      actor_id: actorId,
      action: action.slice(0, 60),
      target: target?.slice(0, 80) ?? null,
      meta: meta?.slice(0, 1000) ?? null,
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    // Logging must never break the request path.
    console.error("[w3e] audit:", e instanceof Error ? e.message : e);
  }
}
