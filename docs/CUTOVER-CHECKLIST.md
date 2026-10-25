# Production cutover checklist

Nothing below is done by the migration or the app itself. Do not touch DNS or send real campaigns without explicit approval.

## A · Accounts & infrastructure

- [ ] Supabase **production** project created (separate from staging).
- [ ] Migrations applied to production (SQL editor or CLI — `docs/SETUP.md`).
- [ ] First production admin created in Supabase Auth + `admins` row inserted; first sign-in works.
- [ ] GitHub repo exists and the code is pushed (private).
- [ ] Vercel project linked; **all** env vars set for Production (and Preview).
- [ ] Resend account with a **verified sending domain**; API + webhook secrets stored as env vars.

## B · Configuration switches (deliberately OFF after seeding)

- [ ] `launch_public` stays **OFF** until everything below is verified (`/admin/launch`).
- [ ] `signups_open` stays **OFF** until go-live.
- [ ] `main_register_url` set only when the main platform registration page is final.

## C · Verification on the production URL (before DNS switch if the domain changes)

- [ ] `/health` → ok on Vercel.
- [ ] Signup via `/join` with a throwaway address: welcome page, W3E- ID shown, "email queued".
- [ ] The pass email arrives (or stays pending until a runner drains it — press "Process 5 due jobs now" in /admin/emails).
- [ ] Resend webhook configured with the production URL → accepted becomes delivered on the Emails page.
- [ ] `/q/<token>` from the welcome/pass email → locked page while launch is OFF; admin `?preview=1` opens it (admin session required).
- [ ] Referral: second signup through the first member's `?ref=` link → counted referral + ledger award visible in /admin/members.
- [ ] Rewards configured in /admin/rewards (values + active flags) — points copy reacts to this state everywhere.
- [ ] /admin/diagnostics → every check OK.
- [ ] Duplicate signup (same email) → same neutral "already in use" flow, no member data leaked; a pass-resend email arrives.
- [ ] Campaign test send to your own address (≤10/h) — verify `[TEST]` subject, personal links, unsub footer.

## D · Go live

- [ ] Approve DNS content changes (only with user sign-off):
  - Vercel: add custom domain → follow Vercel's DNS instructions (A/ALIAS + CNAME for `www` if used).
  - Update `NEXT_PUBLIC_SITE_URL` to the final domain **before** enabling launch (site URL drives every email/QR/share link).
- [ ] Enable `ENABLE PUBLIC LAUNCH` (phrase + password) — QR/pass pages unlock for everyone.
- [ ] Enable `OPEN SIGNUPS`.
- [ ] Optional but recommended: schedule the cron for `/api/cron/email` (external scheduler or Vercel Cron) so the queue drains even when traffic is low.
- [ ] Send the launch campaign following the `SEND <count>` queue flow; watch the Emails/campaign status counts and the audit log.

## E · After launch

- [ ] Watch /admin/emails for failed complaints; failed jobs can be re-queued from both the Emails page (transactional) and the campaign page (campaign mail).
- [ ] Review held referrals daily-ish in /admin/referrals (approve with reauth or leave).
- [ ] Audit log review after the first campaign.

## Rollback

- `DISABLE PUBLIC LAUNCH` + `CLOSE SIGNUPS` (both in /admin/launch, both take effect immediately; QR pages lock again instantly). Vercel instant rollback reverts code if ever needed.
