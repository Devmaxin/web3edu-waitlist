/**
 * Resend HTTP client. Mirrors Mailer::resendSend() — no SDK, direct REST with
 * Idempotency-Key so a crash between "accepted" and "recorded" can't double-send.
 */
import "server-only";
import { ENV } from "./env";

export type OutboundMessage = {
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

export type SendResult = { ok: boolean; id?: string; error: string; permanent: boolean };

function keyConfigured(): boolean {
  return ENV.resendApiKey !== "" && !ENV.resendApiKey.includes("PLACEHOLDER");
}

export async function resendSend(
  to: string,
  msg: OutboundMessage,
  idemKey: string,
  tag: string,
): Promise<SendResult> {
  if (!keyConfigured()) {
    return { ok: false, error: "resend not configured", permanent: false };
  }
  const from = `${ENV.mailFromName} <${ENV.mailFromAddress}>`;
  const payload: Record<string, unknown> = {
    from,
    to: [to],
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
    tags: [{ name: "kind", value: tag.replaceAll(/[^A-Za-z0-9_-]/g, "_").slice(0, 40) }],
  };
  const reply = ENV.mailReplyTo;
  if (reply) payload.reply_to = reply;
  if (msg.headers && Object.keys(msg.headers).length > 0) payload.headers = msg.headers;

  let res: Response;
  try {
    res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ENV.resendApiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idemKey.slice(0, 250),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    return { ok: false, error: `network: ${e instanceof Error ? e.message : "error"}`, permanent: false };
  }

  let j: { id?: string; message?: string; name?: string } | null = null;
  try {
    j = (await res.json()) as { id?: string; message?: string; name?: string };
  } catch {
    /* non-JSON body */
  }
  if (res.ok && j && typeof j.id === "string" && j.id !== "") {
    return { ok: true, id: j.id, error: "", permanent: false };
  }
  const msgText = j?.message ?? j?.name ?? "error";
  // 429 / 5xx / 409 (idempotent request in flight) are retryable; other 4xx are not.
  const retryable = res.status === 429 || res.status >= 500 || res.status === 409;
  return {
    ok: false,
    error: `http ${res.status}: ${msgText.slice(0, 150)}`,
    permanent: !retryable,
  };
}
