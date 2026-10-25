/**
 * Key/value settings (mirrors app/Services/Settings.php). Per-request memoised:
 * serverless invocations are short-lived, so a module cache is safe and cheap.
 */
import "server-only";
import { db } from "./db";

const cache = new Map<string, string>();

export async function getSetting(k: string, d = ""): Promise<string> {
  if (cache.has(k)) return cache.get(k) as string;
  try {
    const { data, error } = await db().from("settings").select("v").eq("k", k).maybeSingle();
    if (error) throw new Error(error.message);
    const v = (data as { v: string } | null)?.v ?? d;
    cache.set(k, v);
    return v;
  } catch {
    return d; // page still renders on DB hiccups, without the flag
  }
}

export async function setSetting(k: string, v: string): Promise<void> {
  const { error } = await db()
    .from("settings")
    .upsert({ k, v, updated_at: new Date().toISOString() });
  if (error) throw new Error(`settings: ${error.message}`);
  cache.set(k, v);
}

export async function flagOn(k: string): Promise<boolean> {
  return (await getSetting(k, "0")) === "1";
}

/** Public launch is a server-side switch: it unlocks the QR/pass pages. */
export async function launchPublic(): Promise<boolean> {
  return flagOn("launch_public");
}

export async function signupsOpen(): Promise<boolean> {
  return flagOn("signups_open");
}
