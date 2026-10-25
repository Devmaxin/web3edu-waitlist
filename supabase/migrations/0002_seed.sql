-- ============================================================================
-- Web3Edu Waitlist: seed defaults (migration 0002)
-- ON CONFLICT DO NOTHING keeps re-runs from overwriting owner-configured values.
-- IMPORTANT: every reward starts INACTIVE with NO value. Nothing is promised until
-- the owner configures it. These are WAITLIST points; Web3Edu XP is configured
-- separately in the main platform's admin. Launch flags start SAFE (off/locked).
-- ============================================================================
insert into public.reward_rules (event_type, label, points, is_active) values
  ('waitlist_signup',  'Joining the waitlist',                          null, false),
  ('referral_signup',  'Successful referral (awarded to the referrer)', null, false)
on conflict (event_type) do nothing;

insert into public.settings (k, v) values
  ('launch_public',     '0'),  -- QR/pass unlocked for everyone
  ('main_register_url', ''),   -- optional https URL of the main-site registration page, shown after launch
  ('signups_open',      '0')   -- start CLOSED; an admin opens signups after verification
on conflict (k) do nothing;
