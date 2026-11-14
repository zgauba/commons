-- TARGET PROJECT: JubailCommons (qrpxfssdeeuzmsmlbtbu) — NEVER SignalPost.
-- R5d moderation rate limit (R5d-3b security review L2, Zee 2026-11-14): a pets or community admin can archive any
-- animal (households' pets included) and hide any sighting, with no restore. Two caps, both RATE_LIMITED:
--
--   per account    20 archives / hour, 20 hides / hour   (the T3 counter, jc_rate_take)
--   per community  60 archives / hour, 60 hides / hour   (counted from jc_admin_log: more accounts can't buy more —
--                                                          db + security reviews M2, 2026-11-14)
--
-- What this bounds: one misused account (20/h), and a leaked pets code spread over many accounts (60/h for the whole
-- community). It buys time; it doesn't restore. Nothing alerts on it yet (jc_admin_log has every action; a nightly
-- count is a follow-up). Not capped here: a community admin removing members (jc_admin_member_remove → the home is
-- vacated → its pets are retired) — heavier, visible, logged; a follow-up. Windows are fixed (as T3): 20 at minute 59
-- and 20 at minute 61 is possible.
--
-- Counts SUCCESSES only, by construction: every refusal here raises (REASON_REQUIRED, NOT_FOUND, NOT_ADMIN,
-- RATE_LIMITED), which rolls the per-account increment back with it. The per-account take sits after the admin and
-- argument checks (a non-admin or a bad reason never touches the counter) and before the pet row lock. A mirrored double
-- tap from the same account queues on jc_assert_admin's own grant-row update, then gets NOT_FOUND, as before (db review
-- M1: jc_rate_take's non-blocking lock is never reached concurrently by the same account here).
-- The community count reads jc_admin_log_recent (community_id, at desc). Two admins racing past it can exceed 60 by one
-- each: a soft ceiling, by design.
-- Signatures unchanged: existing grants carry over. Bodies = the live bodies (pg_get_functiondef, 2026-11-14) + the
-- marked lines.
--
-- Rollback, in this order:
--   1. re-run jc_admin_pet_archive and jc_admin_sighting_hide from 20261104000000_s4_pets.sql;
--   2. delete from jc_rate where bucket in ('pet_archive', 'sighting_hide');
--   3. alter table jc_rate drop constraint jc_rate_bucket_check, then add it back as
--      check (bucket in ('join', 'admin_unlock', 'feedback')).

-- ---------- 1. two new buckets ----------
alter table public.jc_rate drop constraint if exists jc_rate_bucket_check;
alter table public.jc_rate add constraint jc_rate_bucket_check
  check (bucket in ('join', 'admin_unlock', 'feedback', 'pet_archive', 'sighting_hide'));

-- ---------- 2. archive ----------
create or replace function public.jc_admin_pet_archive(p_pet uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_comm text; v_reason text;
begin
  v_comm := jc_assert_admin('pets');
  if char_length(p_reason) > 400 then raise exception 'REASON_REQUIRED'; end if;
  v_reason := jc_clean_line(p_reason);
  if v_reason is null or char_length(v_reason) not between 3 and 200 then raise exception 'REASON_REQUIRED'; end if;
  if (select count(*) from jc_admin_log where community_id = v_comm and action = 'pet_archive'           -- R5d rate limit
       and at > now() - interval '1 hour') >= 60 then raise exception 'RATE_LIMITED'; end if;
  perform jc_rate_take(auth.uid(), 'pet_archive', 20, interval '1 hour');                             -- R5d rate limit
  perform 1 from jc_pets where id = p_pet and community_id = v_comm and status = 'active' for no key update;
  if not found then raise exception 'NOT_FOUND'; end if;
  perform jc_pet_retire(p_pet);
  update jc_pets set updated_by = auth.uid() where id = p_pet;
  perform jc_admin_log_add(v_comm, 'pet_archive', jsonb_build_object('pet_id', p_pet, 'reason', v_reason));
  return jc_admin_pets_list();
end;
$$;

-- ---------- 3. hide a sighting ----------
create or replace function public.jc_admin_sighting_hide(p_sighting bigint) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_comm text; v_pet uuid;
begin
  v_comm := jc_assert_admin('pets');
  if (select count(*) from jc_admin_log where community_id = v_comm and action = 'sighting_hide'         -- R5d rate limit
       and at > now() - interval '1 hour') >= 60 then raise exception 'RATE_LIMITED'; end if;
  perform jc_rate_take(auth.uid(), 'sighting_hide', 20, interval '1 hour');                           -- R5d rate limit
  update jc_pet_sightings set hidden = true
   where id = p_sighting and community_id = v_comm and not hidden
  returning pet_id into v_pet;
  if v_pet is null then raise exception 'NOT_FOUND'; end if;
  perform jc_admin_log_add(v_comm, 'sighting_hide', jsonb_build_object('sighting_id', p_sighting, 'pet_id', v_pet));
  return jsonb_build_object('sighting_id', p_sighting, 'hidden', true);
end;
$$;
