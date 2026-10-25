/**
 * QR generation via the battle-tested `qrcode` package (pure JS, no native deps).
 * One URL -> one deterministic QR. The pass card needs the raw module bitmap for the
 * client-side "save as image" export; the /qr/<token> PNG route uses toBuffer.
 */
import "server-only";
import QRCode from "qrcode";

/** Bit rows flattened to "0"/"1" string (used by the pass image export). */
export function qrBits(url: string): string {
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const out: string[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) out.push(qr.modules.get(x, y) ? "1" : "0");
  }
  return out.join("");
}

export async function qrSvg(url: string): Promise<string> {
  // qrcode's toString is CSP-safe: attributes only, no inline styles.
  return QRCode.toString(url, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 0,
  });
}

export async function qrPngBuffer(url: string): Promise<Buffer> {
  return QRCode.toBuffer(url, {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 4,
    scale: 6,
    color: { dark: "#0b0b10", light: "#ffffff" },
  });
}
