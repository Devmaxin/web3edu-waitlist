# Email queue & campaigns

## Outbox model

`email_jobs` rows (the "outbox") have nine states:

```
pending → sending → accepted → delivered
                 ↘ delayed (webhook)   bounced (webhook)   complained (webhook)
        failed (permanent error or attempts ≥ 5), suppressed (member blocked/unsubscribed/other)
```

- **`accepted`** = Resend took the request. Only the Resend **webhook** moves a job to `delivered`.
- **`complained`** auto-sets `marketing_unsubscribed_at` on the member (campaign emails stop; transactional pass emails continue — they are service mail, not marketing).
- Retry policy: `attempts < 5`, backoff `min(60, 2^attempts)` minutes. Idempotency-Key = the job's `idempotency_key`, so a resend never double-sends (24h provider-side dedupe).

## Claiming work (no double-sends ever)

`claim_email_jobs` uses `FOR UPDATE SKIP LOCKED` with a 3-minute lease, so any number of runners can overlap safely.

| Runner | Trigger | Batch |
|---|---|---|
| Post-signup runner | Next.js `after()` after a signup | 3 jobs |
| Public-page nudge | `POST /api/tick` from `/assets/js/tick.js` (same-origin + `X-W3E-Tick` header, 20/10min per IP, 40/min global) | 3 jobs |
| External cron | `POST /api/cron/email` with `Authorization: Bearer $CRON_SECRET` | 10 jobs |
| Admin — Emails page | "Process 5 due jobs now" button | 5 jobs |
| Admin — Campaign page | "Run batches in this page" in-page runner | 5 jobs × N batches |

Cron is optional; at minimum set `CRON_SECRET` so the endpoint is not fully inert.

## Campaign lifecycle

`draft → queued → sending → paused / done / cancelled` (admin: `/admin/campaigns`)

1. **Draft** — create/edit (only drafts are editable). Intro text is plain text; blank lines become paragraphs. Per-member data (balance, QR, pass register-URL wording, unsub footer) is rendered at send time — never edit copy to include someone's personal data.
2. **Review** — a sandboxed iframe (`/admin/campaigns/<id>/preview`, admin session required) renders the real email with the first member's data.
3. **Test send** — up to **10/hour/admin**, subject prefixed `[TEST]`, uses the first member's data, creates no job and awards nothing.
4. **Queue** — requires all of: campaign still `draft`, **public launch ON** (otherwise the pass links in the email would lock), ≥1 eligible recipient (active + subscribed + ≥ `min_points`), the exact phrase `SEND <count>`, and password reauth. Queuing inserts one outbox row per recipient with unique key `campaign:<id>:member:<id>` and flips status to `queued` — pressing the button twice inserts nothing twice. The count, phrase and reauth are re-checked server-side against the live count at submit time.
5. **Send** — "Start sending" flips to `sending`. Then either run batches in the page (resumable; closing the tab just pauses, and the runner idles 10s while everything waits on a retry backoff) or let cron/tick drain the queue. Campaign mail only ever sends while the status is `sending`.
6. **Pause / Cancel / Retry failed** — cancel suppresses still-pending jobs; retry_failed re-queues failed ones (and flips `done` back to `paused` so it can finish).

The campaign detail page shows per-state counts; the Emails page filters by status with per-status counts. Campaign rows carry a `(C#)` marker on the Emails page.

## Manual pass resend

`/admin/members/<id>` → "Resend pass email" queues a `pass_resend` job deduplicated per 15-minute window (`pass_resend:<id>:<quarter>`). "Rotate pass" invalidates old QR/pass URLs immediately.
