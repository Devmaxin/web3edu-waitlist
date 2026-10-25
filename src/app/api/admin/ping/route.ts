/**
 * Session keep-alive probe, called by the admin UI (on page load + every few
 * minutes). Route handlers MAY set cookies, so this is where the idle timer
 * rolls and an expired access token is restored from the refresh token —
 * neither is possible in a page render.
 */
import { pingAdmin } from "@/lib/admin-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const admin = await pingAdmin();
  if (!admin) {
    return Response.json({ ok: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({ ok: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
