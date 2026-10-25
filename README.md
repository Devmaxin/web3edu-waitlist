# Web3Edu Waitlist (Next.js + Supabase)

A faithful port of the original PHP/MySQL waitlist app to **Next.js (App Router, TypeScript) + Supabase Postgres + Resend + Vercel**. All features, copy, design and the manual reward workflow are preserved; the automatic claim-based platform integration was already decommissioned in the old code and is intentionally **not** re-created here.

## Stack

| Concern | Choice |
|---|---|
| App | Next.js 15 App Router, React 19, TypeScript (strict) |
| DB | Supabase Postgres (service-role client, server-side only; RLS deny-all on every table) |
| Admin auth | Supabase Auth passwords + HttpOnly session cookies, membership gated by an `admins` table, reauth for sensitive actions |
| Email | Resend REST (no SDK), Idempotency-Key per job, Svix-signed webhooks |
| QR | [`qrcode`](https://www.npmjs.com/package/qrcode) (SVG / PNG / bitmap) |
| Hosting | Vercel (preview + production) |
| Tests | Vitest (52 unit tests + DB-gated integration suite) |

## What it does

- **Stepped signup** (email → name → avatar) with whitelisted SVG avatars, `W3E-XXXX-XXXX` waitlist IDs, rate limits, honeypot + signed time-trap bot checks.
- **One-transaction signup**: everything (member, pass, ledger award, referral attribution, outbox row) happens inside the `join_waitlist` Postgres function — no half-signed-up members on failure.
- **Referrals**: signed 30-day `?ref=` cookie (captured in middleware), same-device/self-referral rejection, repeat-IP/velocity holds for human review in the admin, IP alone never auto-rejects.
- **Points ledger**: append-only, unique idempotency keys; rewards are configured manually per event (`waitlist_signup`, `referral_signup`) and are inactive by default. Backfill tool included.
- **Member pass**: QR + pass pages locked behind a launch flag. Tokens are HMAC-derived (hashes only stored); when launch is OFF the QR landing returns an identical response for valid and invalid tokens (no enumeration), with an admin-only `?preview=1` escape hatch.
- **Emails**: transactional signup confirmation, pass resend (15-min-deduped), campaign announcements. Outbox jobs have 9 states; only the Resend webhook moves a job to `delivered`; complaints auto-unsubscribe.
- **Campaigns**: draft → queued (`SEND <count>` phrase + reauth + launch-ON gating) → sending (small resumable batches, in-page runner) → paused/done/cancelled, with test sends (≤10/h) and a sandboxed email preview.
- **Admin**: dashboard, members (+ adjust/reverse/rotate/block/resend), referrals review, rewards, launch controls, campaigns, emails, audit log, diagnostics.

## Repository layout

```
src/app/*            public pages (landing, join, welcome, pass, QR, unsubscribe, privacy, health)
src/app/admin/*      admin dashboard (server components + server actions)
src/app/api/*        api/tick (opportunistic queue nudge), api/cron/email (drain), api/webhooks/resend
src/components/*     pass card, join wizard (client), icons
src/lib/*            crypto, signup, mailer, ledger, pass, settings, rate limit, …
src/middleware.ts    ?ref capture, CSP + nonce, security headers
supabase/migrations/ 0001_init.sql (schema, RLS, RPCs), 0002_seed.sql (settings + + reward rules, all switches OFF)
tests/               unit tests (+ DB-gated integration tests)
docs/                setup, email/campaigns, cutover checklist, obsolete list
```

## Quick start (local development)

1. **Create a Supabase project** (or use a dedicated staging one).
2. **Apply the migrations** — see `docs/SETUP.md` for both the SQL-editor path and the Supabase CLI path.
3. **Bootstrap the first admin** — one SQL insert; exact commands in `docs/SETUP.md`.
4. **Copy `.env.example` → `.env.local`** and fill in placeholders (nothing in the repo is a real value, ever).
5. `npm install && npm run dev` — open http://localhost:3000 and http://localhost:3000/admin/login.

> Seeding starts deliberately safe: `launch_public = 0` and `signups_open = 0`. Flag both ON from /admin/launch (confirmation phrase + password) when going live.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server |
| `npm run build` | Production build (typechecked) |
| `npm run lint` | `tsc --noEmit` type check |
| `npm run test` | Vitest unit suite |
| `npm run test:integration` | DB-gated integration suite (skipped without staging env vars) |

## Documentation

- `docs/SETUP.md` — Supabase, migrations, admin bootstrap, Vercel, Resend, cron.
- `docs/EMAIL-AND-CAMPAIGNS.md` — outbox states, queue processing paths, campaign lifecycle.
- `docs/CUTOVER-CHECKLIST.md` — the go-live checklist and DNS notes.
- `docs/OBSOLETE.md` — what the old PHP app contained and why none of it is used here.

## Security posture (summary)

- RLS enabled and deny-all (policies only for the service role) on **every** table; the Supabase service key never leaves the server.
- Tokens are derived with purpose-separated double-HMAC from `APP_KEY`; the DB stores **hashes only**.
- Cookies are HttpOnly + SameSite=Lax; admin sessions idle out; high-impact actions require password reauth and confirmation phrases.
- CSP with per-request nonce (middleware), sandboxed iframe for campaign previews, strict security-header set.
- Rate limits in Postgres: 8/h/IP, 1500/h global, 5/h/email signups; 20/10min per-IP tick; campaign tests 10/h/admin.
- The audit log never stores tokens, passwords or secrets.
