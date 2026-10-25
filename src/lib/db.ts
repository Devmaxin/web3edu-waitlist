/**
 * Supabase data access. One service-role client (server-only) for the waitlist DB and
 * one anon client for Supabase Auth password sign-in. Each serverless invocation gets
 * fresh clients; supabase-js is safe here (no global connection pool to leak).
 * The service key must NEVER be imported from client code — this module is server-only.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import "server-only";
import { ENV } from "./env";

let service: SupabaseClient | null = null;
let anon: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (!service) {
    service = createClient(ENV.supabaseUrl, ENV.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: "public" },
    });
  }
  return service;
}

/** Anon client used only for admin password sign-in / token refresh (server-side). */
export function anonClient(): SupabaseClient {
  if (!anon) {
    anon = createClient(ENV.supabaseUrl, ENV.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return anon;
}

/** Narrow Postgres error helper: unique violation? */
export function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "23505"
  );
}

/** Read rows, throwing on error (fail loud; callers degrade where they choose to). */
export async function q<T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new Error(`supabase: ${error.message}`);
  return data as T;
}

export async function qOrNull<T>(
  p: PromiseLike<{ data: T | null; error: { message: string } | null }>,
): Promise<T | null> {
  const { data, error } = await p;
  if (error) throw new Error(`supabase: ${error.message}`);
  return data;
}
