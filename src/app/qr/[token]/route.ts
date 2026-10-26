import { memberByQr, passTokens } from "@/lib/pass";
import { launchPublic } from "@/lib/settings";
import { currentAdminFlag } from "@/lib/admin-page";
import { qrPngBuffer } from "@/lib/qr";

export const dynamic = "force-dynamic";

/**
 * PNG QR image (used on the pass export and embedded as an <img> in launch emails).
 * Same launch lock as the /q pass page: while public launch is OFF (except an admin
 * previewing with ?preview), EVERY token gets an identical response — a decoder can't
 * even tell a valid token from an invalid one.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  // Pre-launch: admins may still fetch their own preview PNG (for the sandboxed
  // preview / test mail), everyone else gets the identical 404 for ANY token —
  // no valid/invalid oracle, matching the /q lock.
  if (!(await launchPublic())) {
    if (!(await currentAdminFlag())) {
      return new Response("Not found", { status: 404 });
    }
  }
  const m = await memberByQr(token);
  if (!m) {
    return new Response("Not found", { status: 404 });
  }
  const pt = await passTokens(m.id);
  const png = await qrPngBuffer(pt.qrUrl);
  return new Response(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=86400",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
