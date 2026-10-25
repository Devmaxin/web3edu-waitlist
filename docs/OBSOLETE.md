# Obsolete: what the old PHP app needed that this port intentionally drops

The old source (`C:\Users\maxin\Downloads\Web3edu Waitlist\…`) stays untouched as reference. Once the migration is fully signed off, the following legacy pieces are safe to archive/delete. Nothing in this repo depends on them.

| Old piece | Why obsolete here |
|---|---|
| PHP app (`app/`, `public/`, `config/`, `docs/`, `sql/`, `tests/`) | Replaced by the Next.js app in `web3edu-waitlist/`. |
| InfinityFree hosting + `config/config.php` with MySQL credentials | Supabase env vars; credentials no longer stored in files, and `config.php` must never be copied/committed. |
| `cron-job.org` pinger for `welcome/tick` | The queue now runs opportunistically (`after()` runner + `/api/tick` same-origin nudge + bounded admin pages), with an optional Vercel Cron to `/api/cron/email`. |
| Claim-based main-platform integration | Already removed in the old code; not recreated. Members match accounts by using the same email at registration. |
| `public/assets/js/admin.js` (legacy batch runner) | Replaced by `src/app/admin/campaigns/batch-runner.tsx`; deleted from the new repo's assets. |
| The join-flow block inside `public/assets/js/site.js` | The join wizard is now React (`src/components/join-flow.tsx`); the vanilla duplicate was stripped so nothing double-binds. Everything else in site.js is kept verbatim. |
| `/welcome/tick` endpoint | Renamed to `/api/tick` and hardened (custom header + same-origin check). |
| PHP Crypto-derived tokens `HMAC(id|version)` | Replaced by per-member random secrets + `HMAC(secret, purpose|version)` so derivation fits inside the signup SQL function; old tokens are never reused. |
| MyPdo / Db static wrappers, temp tables | supabase-js service client; the transactional work moved into `join_waitlist`. |
| Session-based CSRF tokens | Server Actions are origin-checked by the Next.js runtime; admin pages additionally require reauth on sensitive actions. |

## Kept as copies

- All shipped assets (css/js/img/avatars) copied into `web3edu-waitlist/public/assets/`.
- `tick.js` updated to `/api/tick`; `boot.js` unchanged.
- `robots.txt` regenerated for the public site.
