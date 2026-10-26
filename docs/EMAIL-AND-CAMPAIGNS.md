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

## Launch Campaign panel (Emails admin)

`/admin/emails` has a **Launch Campaign** section operating on the newest campaign (or `?c=<id>`): status label (Draft / Ready / Sending / Completed / Paused / Cancelled), eligible / successfully sent / failed / pending / suppressed counts, and queued / sending-started / completed timestamps — persisted in `campaigns.started_at` and `campaigns.completed_at` (migration 0004; before it is applied the panel simply omits the times).

Panel flow, top to bottom:

1. **Destination** — the email's "Explore Web3Edu" button target, stored in the existing `main_register_url` setting (same setting as Launch controls; never auto-replaced). Editing requires password reauth and `https://` validation (`validSiteUrl`).
2. **Preview** — the sandboxed iframe of the real rendered email (first member's sample data).
3. **Test email** — up to 10/hour/admin, `[TEST]`-prefixed, no outbox row.
4. **Queue** — phrase `SEND <count>` + password reauth (count re-checked live). `queue_campaign` now also enforces the launch flag inside the RPC: launch OFF → `-2` ("Blocked: turn public launch ON first").
5. **Send & monitor** — Start / Pause / Cancel remaining / Retry failed, plus the in-page BatchRunner while `sending`.

### Launch email specifics

- Subject `Web3Edu is officially live!`, heading "You're in. Web3Edu is live.", CTA "Explore Web3Edu" (destination URL), secondary link "View your waitlist pass", per-member QR + waitlist ID. Blank `intro_text` falls back to the suggested body copy.
- The QR `<img>` uses the **PNG** endpoint `/qr/<qr-token>` (`qrImgUrl`); the QR itself encodes the member's `/q/<token>` pass landing page. `/qr` obeys the launch lock: pre-launch every token (valid or not) gets an identical 404, except an admin session can still fetch a PNG for the preview/test flow.
- `new?launch=1` on the campaign form prefills a launch draft (`/admin/campaigns/new?launch=1` or the panel's "Create launch draft (prefilled)" button).

### Duplicate prevention & retries

- `email_jobs` carries a **unique index on `(campaign_id, member_id)`** (migration 0004) — one campaign can never hold two rows for one member.
- Idempotency-Key = `campaign:<id>:member:<id>`; Resend dedupes on it for 24 h, so a retry after a timed-out request cannot produce a double send.
- "Retry failed" re-queues **only** rows with status `failed`; `accepted`/`delivered` rows are never resent.

## Manual pass resend

`/admin/members/<id>` → "Resend pass email" queues a `pass_resend` job deduplicated per 15-minute window (`pass_resend:<id>:<quarter>`). "Rotate pass" invalidates old QR/pass URLs immediately.
