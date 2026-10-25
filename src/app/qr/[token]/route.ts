import { memberByQr, passTokens } from "@/lib/pass";
import { qrPngBuffer } from "@/lib/qr";

export const dynamic = "force-dynamic";

/** PNG QR image (used on the pass export and embedded as an <img> in launch emails). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
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
