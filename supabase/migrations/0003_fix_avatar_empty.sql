-- 0003: normalize empty avatar to NULL inside join_waitlist (defense in depth; the app
-- already passes NULL, but the RPC should not rely on that). Idempotent re-definition.
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
      -- collision on waitlist_id / referral_code / email (race) â€” retry with new randoms
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

  -- â”€â”€ referral attribution â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
