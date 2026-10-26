-- 0004: launch campaign hardening.
--   1) campaigns.started_at / completed_at: persisted times for the Launch Campaign
--      status panel (started_at = first transition into 'sending'; completed_at = the
--      final 'done' transition). Backfill is a no-op: this database has no campaigns yet.
--   2) queue_campaign now enforces the public-launch flag INSIDE the RPC (defense in
--      depth: the admin action also checks it). Returns -2 when launch is off.
--   3) unique index: one campaign can never hold two job rows for the same member.

alter table public.campaigns
  add column if not exists started_at   timestamptz default null,
  add column if not exists completed_at timestamptz default null;

create unique index if not exists uq_email_jobs_campaign_member
  on public.email_jobs (campaign_id, member_id)
  where campaign_id is not null;

-- Redefinition with the launch gate. Identical to 0001 otherwise.
create or replace function public.queue_campaign(p_campaign_id bigint)
returns bigint language plpgsql volatile as $$
declare c public.campaigns%rowtype; n bigint; launch_on boolean;
begin
  select * into c from public.campaigns where id = p_campaign_id;
  if not found then return -1; end if;
  if c.status <> 'draft' then return -1; end if;

  -- Pass/QR pages must be unlocked before any launch email may be queued,
  -- otherwise recipients would receive links that point to a locked page.
  launch_on := coalesce((select v from public.settings where k = 'launch_public'), '0') = '1';
  if not launch_on then return -2; end if;

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
