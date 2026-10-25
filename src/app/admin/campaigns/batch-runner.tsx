"use client";

/**
 * Campaign batch runner. Calls the bounded server action processBatch(5) in a loop
 * from the browser, exactly like the old admin.js "run batches in this page" button:
 * batches are small and resumable, closing the tab just pauses progress. Nothing is
 * sent while the campaign is paused, and each Resend call carries the job's
 * idempotency key, so a repeat run can never double-send.
 */
import { useRef, useState } from "react";
import { processBatch } from "@/app/admin/actions";

export function BatchRunner({ campaignId }: { campaignId: number }) {
  const [running, setRunning] = useState(false);
  const [out, setOut] = useState<string>(
    "Keep this tab open while sending. Batches are small (5 emails) and resumable; closing the tab just pauses progress. An external pinger can also drain the queue (see docs/CAMPAIGNS.md).",
  );
  const stopRef = useRef(false);

  function sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function run() {
    if (running) return;
    stopRef.current = false;
    setRunning(true);
    let sent = 0, retry = 0, failed = 0, suppressed = 0;
    try {
      for (;;) {
        if (stopRef.current) { setOut(`Paused by you. Progress: ${sent} sent, ${retry} to retry, ${failed} failed, ${suppressed} suppressed. Resumable any time.`); break; }
        const r = await processBatch(campaignId);
        if (!r.ok) { setOut("Session expired — sign in again and resume."); break; }
        sent += r.sent ?? 0; retry += r.retry ?? 0; failed += r.failed ?? 0; suppressed += r.suppressed ?? 0;
        if (r.status === "done") {
          setOut(`Done. ${sent} accepted, ${retry} left to retry, ${failed} failed, ${suppressed} suppressed.`);
          break;
        }
        if (r.paused || r.status !== "sending") {
          setOut(`Sending paused on the server (status: ${r.status ?? "?"}). Progress: ${sent} sent, ${retry} to retry, ${failed} failed.`);
          break;
        }
        // Nothing claimable (e.g. everything is waiting on a retry backoff) → idle poll
        // like the legacy admin.js, instead of hammering the server.
        const idle = (r.claimed ?? 0) === 0;
        setOut(
          `Sending… ${r.remaining ?? 0} recipient(s) left in this run. ${sent} accepted, ${retry} to retry, ${failed} failed, ${suppressed} suppressed.` +
            (idle ? " Waiting for retry delays…" : ""),
        );
        if (idle) await sleep(10_000);
        else await sleep(1_200);
      }
    } catch {
      setOut("The batch loop hit an error and stopped. Its progress is saved; just run it again.");
    } finally {
      setRunning(false);
      stopRef.current = false;
    }
  }

  return (
    <div id="batch">
      <p>
        <button className="b" id="run-batches" type="button" onClick={run} disabled={running}>
          {running ? "Sending… (press Stop below)" : "Run batches in this page"}
        </button>{" "}
        {running && (
          <button className="b g" type="button" onClick={() => { stopRef.current = true; }}>
            Stop after this batch
          </button>
        )}
      </p>
      <p className="small" id="batch-out">{out}</p>
    </div>
  );
}
