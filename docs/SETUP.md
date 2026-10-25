# Setup

Everything below is written so a fresh operator can go from zero to a deployed preview. No real credentials are stored anywhere in this repository.

## 1 · Supabase project

1. Create a project at [supabase.com](https://supabase.com) (a **staging** one first; production later).
2. Open **Project Settings → API** and note:
   - Project URL → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY` (used server-side only, for admin password sign-in)
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (⚠ full DB access — server-only)

## 2 · Apply the migrations

Pick one path:

**Path A — SQL editor (no CLI needed):**
1. Open the Supabase dashboard → **SQL Editor** → New query.
2. Paste the full contents of `supabase/migrations/0001_init.sql` and run it.
3. Then paste `supabase/migrations/0002_seed.sql` and run it.

**Path B — Supabase CLI:**

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Both files are idempotent (`create or replace`, checks) but only `0002_seed` upserts seed data — running them once per project is enough.

**Verify:** Table Editor shows 11 tables (members, passes, referrals, points_ledger, reward_rules, email_jobs, campaigns, settings, audit_log, rate_limits, admins). No policies grant anon/authenticated any access — that is intentional (service-role only).

## 3 · Bootstrap the first admin

1. In Supabase → **Authentication → Users → Add user**, create the admin account with email + password (this lives in `auth.users`). Confirm the email (or disable confirmation for this step).
2. Copy the user's **UUID** from the users table.
3. SQL editor (⚠ server returns the UUID, not email — replace it below):

```sql
insert into public.admins (id) values ('PASTE-AUTH-USER-UUID');

-- making sure the user is confirmed:
-- update auth.users set email_confirmed_at = now() where id = 'PASTE-AUTH-USER-UUID';
```

Sign in at `/admin/login` with that email + password. Additional admins: repeat for a new auth user.

## 4 · App crypto key

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

That value goes into `APP_KEY`. It derives pass/QR tokens and signs referral, unsubscribe and time-trap values. Keep it safe: rotating it invalidates every outstanding pass link and referral cookie.

## 5 · Resend

1. Create an account at [resend.com](https://resend.com), add + verify your sending domain (DMARC/DKIM via DNS — see the cutover checklist before touching DNS).
2. Create an API key → `RESEND_API_KEY`.
3. Create a webhook (endpoint `https://<your-domain>/api/webhooks/resend`, events: `email.delivered`, `email.bounced`, `email.complained`, `email.delivery_delayed`) → copy the signing secret into `RESEND_WEBHOOK_SECRET` (starts with `whsec_`).

## 6 · Environment variables

Copy `.env.example` → `.env.local` locally, and set the same keys in Vercel → Settings → Environment Variables. Every placeholder must be replaced; the app logs loudly and refuses to look "fine" when a key is missing. Optional keys: `MAIL_REPLY_TO`, `SUPPORT_EMAIL`, `PRIVACY_EMAIL`.

## 7 · Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # production build
npm run test       # unit tests (52)
npm run test:integration   # DB-gated suite; runs only when staging vars are present
```

## 8 · Vercel deployment

1. Push the repo to GitHub (private).
2. Vercel → Add New Project → import the repo. Framework auto-detects Next.js.
3. Set the environment variables (all of them) for **Preview** and **Production**.
4. First deploy gives you the **preview URL** — use it for review before any custom domain/DNS change.
5. Add the cron schedule (or use an external pinger) for `POST /api/cron/email` with `Authorization: Bearer $CRON_SECRET` — see `docs/EMAIL-AND-CAMPAIGNS.md`. This is optional: public pages self-nudge the queue and the admin Emails/Campaigns pages can drain it manually.

## 9 · Smoke test (staging)

1. `/health` returns ok.
2. Sign up on `/join` with a test address → welcome page, W3E- ID, pending email job in `/admin/emails`.
3. With `launch_public` still OFF, open a `/q/<token>` link → locked page (identical to a garbage token).
4. `/admin/launch` → preview a QR with `?preview_member=<id>` → admin preview works while public state stays locked.
5. `/admin/diagnostics` → all checks OK when env vars are set.
