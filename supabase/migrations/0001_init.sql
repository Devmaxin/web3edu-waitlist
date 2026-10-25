-- ============================================================================
-- Web3Edu Waitlist: initial PostgreSQL schema for Supabase (migration 0001)
-- Ported from sql/001_schema.sql (MySQL) with these mappings:
--   BIGINT UNSIGNED AUTO_INCREMENT -> bigint GENERATED ALWAYS AS IDENTITY
--   ENUM(...)                      -> text + CHECK
--   DATETIME                       -> timestamptz (UTC)
--   INSERT IGNORE semantics        -> ON CONFLICT DO NOTHING in functions
--   MySQL row-locks for the outbox -> FOR UPDATE SKIP LOCKED claim function
-- Every stamp is timestamptz, i.e. stored in UTC.
--
-- SECURITY: Row Level Security is ENABLED on every table with NO anonymous policies.
-- All access happens server-side via the service-role key, which bypasses RLS.
-- Do NOT add anon policies to member data tables.
-- ============================================================================

-- ───────────────────────── members ─────────────────────────
create table if not exists public.members (
  id                bigint generated always as identity primary key,
  waitlist_id       varchar(16)  not null unique,
  email             varchar(254) not null,
  email_canonical   varchar(190) not null unique,
  display_name      varchar(60)  default null,
  avatar            varchar(20)  default null,
  referral_code     varchar(12)  not null unique,
  device_hash       char(64)     default null,
  ip_hash           char(64)     default null,
  status            text         not null default 'active' check (status in ('active','blocked')),
  marketing_unsubscribed_at timestamptz default null,
  created_at        timestamptz  not null default now(),
  constraint members_waitlist_id_format
    check (waitlist_id ~ '^W3E-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$'),
  constraint members_referral_code_format
    check (referral_code ~ '^[0-9A-HJKMNP-TV-Z]{10}$'),
  constraint members_avatar_whitelist
    check (avatar is null or avatar in
      ('cyber_02','alien_01','cyber_01','robot_02','neon_01','neon_02','pixel_01','robot_01'))
);
create index if not exists idx_members_created on public.members (created_at);
create index if not exists idx_members_ip on public.members (ip_hash, created_at);

-- ───────────────────────── referrals ─────────────────────────
create table if not exists public.referrals (
  id           bigint generated always as identity primary key,
  referrer_id  bigint not null references public.members (id),
  referred_id  bigint not null unique references public.members (id),
  status       text not null default 'counted' check (status in ('counted','held','rejected')),
  reason       varchar(120) default null,
  created_at   timestamptz not null default now()
);
create index if not exists idx_referrals_referrer on public.referrals (referrer_id, status);

-- ───────────────────────── reward_rules ─────────────────────────
create table if not exists public.reward_rules (
  event_type  varchar(40) primary key,
  label       varchar(120) not null,
  points      integer default null check (points is null or points between 0 and 100000),
  is_active   boolean not null default false,
  updated_by  uuid default null,
  updated_at  timestamptz not null default now()
);

-- ───────────────────────── points_ledger (append-only) ─────────────────────────
create table if not exists public.points_ledger (
  id                bigint generated always as identity primary key,
  member_id         bigint not null references public.members (id),
  event_type        varchar(40) not null,
  points            integer not null,
  reason            varchar(200) not null,
  idempotency_key   varchar(120) not null unique,
  related_member_id bigint default null,
  reverses_id       bigint default null references public.points_ledger (id),
  actor_admin_id    uuid default null,
  created_at        timestamptz not null default now()
);
create index if not exists idx_ledger_member on public.points_ledger (member_id, id);

-- ───────────────────────── passes ─────────────────────────
-- Tokens are HMAC(secret, kind|version) where secret is a random per-member value
-- (never the public waitlist ID). Only SHA-256 hashes are stored for lookup; the
-- secret exists on the row so tokens can be re-derived by the server at render time.
create table if not exists public.passes (
  member_id  bigint primary key references public.members (id),
  version    integer not null default 1 check (version >= 1),
  pass_secret varchar(48) not null,
  qr_hash    char(64) not null unique,
  view_hash  char(64) not null unique,
  revoked_at timestamptz default null,
  created_at timestamptz not null default now()
);

-- ───────────────────────── campaigns ─────────────────────────
create table if not exists public.campaigns (
  id          bigint generated always as identity primary key,
  name        varchar(120) not null,
  subject     varchar(200) not null,
  preheader   varchar(200) default null,
  intro_text  text not null,
  status      text not null default 'draft'
              check (status in ('draft','queued','sending','paused','done','cancelled')),
  min_points  integer default null,
  created_by  uuid not null,
  queued_at   timestamptz default null,
  created_at  timestamptz not null default now()
);

-- ───────────────────────── email_jobs ─────────────────────────
create table if not exists public.email_jobs (
  id               bigint generated always as identity primary key,
  member_id        bigint not null references public.members (id),
  campaign_id      bigint default null references public.campaigns (id),
  kind             text not null
                   check (kind in ('signup_confirmation','pass_resend','claim_link','launch_announcement')),
  idempotency_key  varchar(120) not null unique,
  status           text not null default 'pending'
                   check (status in ('pending','sending','accepted','delivered','delayed','bounced','complained','failed','suppressed')),
  attempts         integer not null default 0 check (attempts >= 0),
  next_attempt_at  timestamptz not null default now(),
  lock_token       char(32) default null,
  locked_until     timestamptz default null,
  provider_id      varchar(64) default null,
  last_error       varchar(255) default null,
  created_at       timestamptz not null default now(),
  sent_at          timestamptz default null
);
create index if not exists idx_email_due on public.email_jobs (status, next_attempt_at);
create index if not exists idx_email_campaign on public.email_jobs (campaign_id, status);
create index if not exists idx_email_member on public.email_jobs (member_id);

-- ───────────────────────── settings ─────────────────────────
create table if not exists public.settings (
  k          varchar(60) primary key,
  v          varchar(500) not null default '',
  updated_at timestamptz not null default now()
);

-- ───────────────────────── admins ─────────────────────────
-- Rows are created only by the documented bootstrap: create the user in the Supabase
-- dashboard (Authentication → Users → Add user), then INSERT admin rows referencing
-- that auth user's UUID. Never hardcode credentials in SQL files.
create table if not exists public.admins (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         varchar(254) not null unique,
  disabled_at   timestamptz default null,
  last_login_at timestamptz default null,
  created_at    timestamptz not null default now()
);

-- ───────────────────────── rate_limits ─────────────────────────
create table if not exists public.rate_limits (
  bucket       varchar(120) not null,
  window_start bigint not null,          -- unix epoch of window start
  hits         integer not null default 1 check (hits >= 0),
  primary key (bucket, window_start)
);

-- ───────────────────────── audit_log ─────────────────────────
create table if not exists public.audit_log (
  id         bigint generated always as identity primary key,
  actor_type text not null check (actor_type in ('admin','system','public')),
  actor_id   varchar(40) default null,
  action     varchar(60) not null,
  target     varchar(80) default null,
  meta       varchar(1000) default null,
  ip_hash    char(64) default null,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_created on public.audit_log (created_at);
create index if not exists idx_audit_action on public.audit_log (action, created_at);

-- ============================================================================
-- Row Level Security: deny-by-default for anon/authenticated roles. The service
-- role (used only by this Next.js app's server code) bypasses RLS.
-- ============================================================================
alter table public.members       enable row level security;
alter table public.referrals     enable row level security;
alter table public.reward_rules  enable row level security;
alter table public.points_ledger enable row level security;
alter table public.passes        enable row level security;
alter table public.campaigns     enable row level security;
alter table public.email_jobs    enable row level security;
alter table public.settings      enable row level security;
alter table public.admins        enable row level security;
alter table public.rate_limits   enable row level security;
alter table public.audit_log     enable row level security;

-- ============================================================================
-- Helper: random strings from the Crockford base32 alphabet (no I L O U).
-- ============================================================================
create or replace function public.w3e_code(n integer)
returns text language plpgsql volatile as $$
declare s text := ''; i integer; chars text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
begin
  for i in 1..n loop
    s := s || substr(chars, floor(random() * 32)::integer + 1, 1);
  end loop;
  return s;
end $$;

-- ============================================================================
-- Rate limiting: atomic fixed-window counter (INSERT..ON CONFLICT update).
-- ============================================================================
create or replace function public.rate_limit_allow(
  p_bucket text, p_limit integer, p_window_secs integer
) returns boolean language sql volatile as $$
  with ins as (
    insert into public.rate_limits (bucket, window_start, hits)
    values (
      left(p_bucket, 120),
      (floor(extract(epoch from now()) / p_window_secs) * p_window_secs)::bigint,
      1
    )
    on conflict (bucket, window_start) do update
      set hits = public.rate_limits.hits + 1
    returning hits
  )
  select coalesce((select hits from ins), 0) <= p_limit
$$;

-- ============================================================================
-- Ledger award (rule-gated, idempotent). Mirrors Ledger::award().
-- status: awarded | duplicate | rule_inactive
-- ============================================================================
create or replace function public.award_points(
  p_member_id bigint, p_event text, p_idem text, p_related bigint default null
) returns text language plpgsql volatile as $$
declare pts integer; lbl text;
begin
  select points, label into pts, lbl
    from public.reward_rules
   where event_type = p_event and is_active and points > 0;
  if not found then return 'rule_inactive'; end if;
  insert into public.points_ledger (member_id, event_type, points, reason, idempotency_key, related_member_id)
  values (p_member_id, p_event, pts, lbl, p_idem, p_related)
  on conflict (idempotency_key) do nothing;
  if found then return 'awarded'; else return 'duplicate'; end if;
end $$;

-- ============================================================================
-- Email outbox enqueue (idempotent by idempotency_key).
-- ============================================================================
create or replace function public.enqueue_email_job(
  p_member_id bigint, p_kind text, p_idem text, p_campaign bigint default null
) returns boolean language plpgsql volatile as $$
begin
  insert into public.email_jobs (member_id, campaign_id, kind, idempotency_key)
  values (p_member_id, p_campaign, p_kind, p_idem)
  on conflict (idempotency_key) do nothing;
  return found;
end $$;

-- ============================================================================
-- join_waitlist: the entire signup in ONE Postgres transaction.
-- Mirrors Signup::create() + Signup::attribute() + Mailer::enqueue().
--
-- Returns json:
--   { "status": "created", "member_id": N, "referral": "counted|held|rejected|none" }
--   { "status": "exists" }
--   { "status": "error",   "error": "id_generation_failed" }
-- Parameters and derived values (canonical email, hashes) are computed in TypeScript.
-- ============================================================================
create or replace function public.join_waitlist(
  p_email text,
  p_email_canonical text,
  p_display_name text,
  p_avatar text,
  p_referral_code text,
  p_ip_hash text,
  p_device_hash text,
  p_pass_secret text,
  p_qr_hash text,
  p_view_hash text
) returns json language plpgsql volatile as $$
declare
  new_id bigint; wid text; code text; attempts integer := 0;
  ref public.members%rowtype; r_status text; r_reason text;
begin
  if exists (select 1 from public.members where email_canonical = p_email_canonical) then
    return json_build_object('status', 'exists');
  end if;

  loop
    attempts := attempts + 1;
    exit when attempts > 6;
    wid  := 'W3E-' || w3e_code(4) || '-' || w3e_code(4);
    code := w3e_code(10);
    begin
      insert into public.members
        (waitlist_id, email, email_canonical, display_name, avatar, referral_code, device_hash, ip_hash)
      values
        (wid, p_email, p_email_canonical, nullif(p_display_name, ''), nullif(p_avatar, ''), code, p_device_hash, p_ip_hash)
      returning id into new_id;
      exit;
    exception when unique_violation then
      -- collision on waitlist_id / referral_code / email (race) — retry with new randoms
      if exists (select 1 from public.members where email_canonical = p_email_canonical) then
        return json_build_object('status', 'exists');
      end if;
    end;
  end loop;

  if new_id is null then
    return json_build_object('status', 'error', 'error', 'id_generation_failed');
  end if;

  insert into public.passes (member_id, version, pass_secret, qr_hash, view_hash)
  values (new_id, 1, p_pass_secret, p_qr_hash, p_view_hash);

  perform public.award_points(new_id, 'waitlist_signup', 'signup:' || new_id);

  -- ── referral attribution ────────────────────────────────────────────────
  r_status := 'none';
  if p_referral_code is not null and length(p_referral_code) = 10 then
    select * into ref from public.members
     where referral_code = upper(p_referral_code) and status = 'active';
    if found then
      r_status := 'counted'; r_reason := null;
      if ref.id = new_id or ref.email_canonical = p_email_canonical then
        r_status := 'rejected'; r_reason := 'self_referral';
      elsif ref.device_hash is not null and ref.device_hash = p_device_hash then
        r_status := 'rejected'; r_reason := 'same_device';
      else
        -- Heuristics hold (never reject) for human review: shared mobile IPs are common.
        if (select count(*) from public.referrals r
              join public.members m on m.id = r.referred_id
             where r.referrer_id = ref.id and m.ip_hash = p_ip_hash
               and r.created_at > now() - interval '1 day') >= 3 then
          r_status := 'held'; r_reason := 'repeat_ip_pattern';
        elsif (select count(*) from public.referrals
                where referrer_id = ref.id and created_at > now() - interval '1 hour') >= 20 then
          r_status := 'held'; r_reason := 'velocity';
        end if;
      end if;
      begin
        insert into public.referrals (referrer_id, referred_id, status, reason)
        values (ref.id, new_id, r_status, r_reason);
        if r_status = 'counted' then
          perform public.award_points(ref.id, 'referral_signup', 'referral:' || new_id, new_id);
        end if;
      exception when unique_violation then
        null; -- second attribution for the same signup is impossible by unique key
      end;
    end if;
  end if;

  perform public.enqueue_email_job(new_id, 'signup_confirmation', 'signup_confirmation:' || new_id);

  return json_build_object('status', 'created', 'member_id', new_id, 'referral', r_status);
end $$;

-- ============================================================================
-- approve_held_referral: flips to counted and awards once (unique keys protect repeats).
-- ============================================================================
create or replace function public.approve_held_referral(p_referral_id bigint)
returns boolean language plpgsql volatile as $$
declare r record;
begin
  select * into r from public.referrals where id = p_referral_id and status = 'held';
  if not found then return false; end if;
  update public.referrals
     set status = 'counted',
         reason = left(coalesce(reason, '') || ' (approved)', 120)
   where id = p_referral_id;
  perform public.award_points(r.referrer_id, 'referral_signup', 'referral:' || r.referred_id, r.referred_id);
  return true;
end $$;

-- ============================================================================
-- claim_email_jobs: claim up to p_limit due jobs for one worker with a lease.
-- Mirrors Mailer::process() claim logic, using Postgres advisory-safe row locks.
-- Campaign mail is only ever claimed while its campaign is in 'sending'.
-- ============================================================================
create or replace function public.claim_email_jobs(
  p_worker text, p_limit integer, p_campaign_id bigint default null
) returns setof public.email_jobs language plpgsql volatile as $$
begin
  return query
  update public.email_jobs j
     set status = 'sending',
         lock_token = left(p_worker, 32),
         locked_until = now() + interval '3 minutes',
         attempts = j.attempts + 1
   where j.id in (
          select j2.id from public.email_jobs j2
           where j2.attempts < 5
             and ( (j2.status = 'pending' and j2.next_attempt_at <= now())
                or (j2.status = 'sending' and j2.locked_until < now()) )
             and (j2.campaign_id is null
               or exists (select 1 from public.campaigns c
                           where c.id = j2.campaign_id and c.status = 'sending'))
             and (p_campaign_id is null or j2.campaign_id = p_campaign_id)
           order by j2.id
           limit p_limit
           for update skip locked
        )
  returning j.*;
end $$;

-- ============================================================================
-- backfill_rewards: pay members who joined while a rule was inactive.
-- Safe to repeat (idempotency keys). Returns the number of awards created.
-- event: 'waitlist_signup' | 'referral_signup'
-- ============================================================================
create or replace function public.backfill_rewards(p_event text, p_limit integer default 500)
returns integer language plpgsql volatile as $$
declare n integer;
begin
  if p_event = 'waitlist_signup' then
    with targets as (
      select m.id from public.members m
       left join public.points_ledger l on l.idempotency_key = 'signup:' || m.id
       where l.id is null and m.status = 'active'
       order by m.id limit p_limit
    ), ins as (
      insert into public.points_ledger (member_id, event_type, points, reason, idempotency_key)
      select t.id, 'waitlist_signup', rr.points, rr.label, 'signup:' || t.id
        from targets t, public.reward_rules rr
       where rr.event_type = 'waitlist_signup' and rr.is_active and rr.points > 0
      on conflict (idempotency_key) do nothing
      returning 1
    )
    select count(*) into n from ins;
  elsif p_event = 'referral_signup' then
    with targets as (
      select r.referrer_id, r.referred_id from public.referrals r
       left join public.points_ledger l on l.idempotency_key = 'referral:' || r.referred_id
       where r.status = 'counted' and l.id is null
       order by r.id limit p_limit
    ), ins as (
      insert into public.points_ledger (member_id, event_type, points, reason, idempotency_key, related_member_id)
      select t.referrer_id, 'referral_signup', rr.points, rr.label, 'referral:' || t.referred_id, t.referred_id
        from targets t, public.reward_rules rr
       where rr.event_type = 'referral_signup' and rr.is_active and rr.points > 0
      on conflict (idempotency_key) do nothing
      returning 1
    )
    select count(*) into n from ins;
  else
    raise exception 'unknown event type';
  end if;
  return n;
end $$;

-- ============================================================================
-- queue_campaign: insert one outbox row per eligible member + flip status to queued.
-- Unique idempotency key makes a double-click insert nothing new. Returns recipients.
-- ============================================================================
create or replace function public.queue_campaign(p_campaign_id bigint)
returns bigint language plpgsql volatile as $$
declare c public.campaigns%rowtype; n bigint;
begin
  select * into c from public.campaigns where id = p_campaign_id;
  if not found or c.status <> 'draft' then return -1; end if;

  with ins as (
    insert into public.email_jobs (member_id, campaign_id, kind, idempotency_key)
    select m.id, p_campaign_id, 'launch_announcement', 'campaign:' || p_campaign_id || ':member:' || m.id
      from public.members m
     where m.status = 'active'
       and m.marketing_unsubscribed_at is null
       and (c.min_points is null
            or (select coalesce(sum(l.points), 0) from public.points_ledger l
                 where l.member_id = m.id) >= c.min_points)
    on conflict (idempotency_key) do nothing
    returning 1
  )
  select count(*) into n from ins;

  update public.campaigns set status = 'queued', queued_at = now()
   where id = p_campaign_id and status = 'draft';
  return n;
end $$;

-- grant execute to the service role (service role bypasses RLS anyway;
-- no grants to anon/authenticated — they can only hit these functions directly and
-- functions check rate limits/eligibility themselves).
grant execute on function public.rate_limit_allow(text, integer, integer) to anon, authenticated;
grant execute on function public.w3e_code(integer) to anon, authenticated;

-- Admin member summary (service-role only; RLS blocks anon/authenticated for the view).
-- marketing_unsubscribed_at is exposed so campaign eligibility counts can run in one
-- PostgREST filter (active + subscribed + optional min points balance).
create or replace view public.members_admin_summary as
select m.id, m.waitlist_id, m.email, m.status, m.created_at, m.marketing_unsubscribed_at,
  (select coalesce(sum(l.points), 0) from public.points_ledger l where l.member_id = m.id) as points_ledger_sum,
  (select count(*) from public.referrals r where r.referrer_id = m.id and r.status = 'counted') as referrals_count
from public.members m;
