/**
 * Fixed-window rate limiting in Postgres (atomic upsert via RPC), like app/Lib/RateLimit.php.
 * Fails open on DB error so a throttle outage never becomes a signup outage.
 */
import "server-only";
import { db } from "./db";

export async function rateLimitAllow(
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const { data, error } = await db().rpc("rate_limit_allow", {
      p_bucket: bucket.slice(0, 120),
      p_limit: limit,
      p_window_secs: windowSeconds,
    });
    if (error) throw new Error(error.message);
    maybeCleanup(windowSeconds);
    return data === true;
  } catch (e) {
    console.error("[w3e] ratelimit:", e instanceof Error ? e.message : e);
    return true;
  }
}

export async function rateLimitCount(bucket: string, windowSeconds: number): Promise<number> {
  try {
    const windowStart = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
    const { data, error } = await db()
      .from("rate_limits")
      .select("hits")
      .eq("bucket", bucket.slice(0, 120))
      .eq("window_start", windowStart)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as { hits: number } | null)?.hits ?? 0;
  } catch {
    return 0;
  }
}

/** 1% chance per allow() to purge stale windows (matches the old build's behaviour). */
function maybeCleanup(windowSeconds: number): void {
  if (Math.floor(Math.random() * 100) !== 0) return;
  const cutoff = Math.floor(Date.now() / 1000) - 172800;
  db()
    .from("rate_limits")
    .delete()
    .lt("window_start", cutoff)
    .then(({ error }) => {
      if (error) console.error("[w3e] ratelimit cleanup:", error.message);
    });
}
