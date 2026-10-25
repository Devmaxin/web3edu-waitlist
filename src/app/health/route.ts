export const dynamic = "force-dynamic";

export async function GET() {
  return new Response("ok", {
    headers: {
      "Content-Type": "text/plain",
      "Cache-Control": "no-store",
    },
  });
}
