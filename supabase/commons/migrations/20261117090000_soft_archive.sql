-- TARGET PROJECT: JubailCommons (qrpxfssdeeuzmsmlbtbu) — NEVER SignalPost.
-- Soft archive, PR 1 (DB). Plan docs/plans/soft-archive.md; Zee 2026-11-16: 30-day restore window, in-app alert,
-- restore = Pets organizers only, alert at >= 10 organizer archives+restores or >= 20 hides+unhides in 24 h, community
-- admins only. Reviews: docs/qa/soft-archive-db-review-2026-11-17.md.
--
-- jc_pets                 + archived_at, archived_how (organizer | household | vacated), archived_photo_path.
--                         CHECK jc_pets_archived_shape ties them to status (0 archived rows live 2026-11-16: no backfill).
-- jc_pet_retire(p, how)   replaces jc_pet_retire(p) (internal, 3 callers replaced here). Organizer / household archive
--                         keep the current photo for the window: its ledger row stays 'current', the path moves to
--                         archived_photo_path (the storage read rule needs status = 'active' + photo_path, so it stays
--                         unreadable). Pending photos and older rows retire at once. 'vacated' retires everything at once.
-- jc_pet_restorable(p)    one rule for the list and the restore: archived < 30 days ago, not vacated, and an owned pet's
--                         home still has members, none of whom joined after the archive (no pet lands on a new family).
-- jc_admin_pet_restore    Pets admin. Brings the photo back only if its ledger row is still 'current'. Missing alerts
--                         are not revived. RESTORE_EXPIRED when the rule says no. Logged (pet_restore).
-- jc_admin_sighting_unhide / jc_admin_pet_hidden_sightings   Pets admin; un-hide while the sighting exists (30 days).
-- jc_admin_pets_list      + archived_at, restorable_until on each row.
-- jc_home_vacated         + the home's pets already archived inside the window become 'vacated' (photos retired).
-- jc_pets_retention       + window end (retire the kept photo after 30 days); the db 1b M1 race line now retires only
--                         ledger rows that are NOT the kept photo; + moderation alert, last, in its own exception block.
-- jc_moderation_alert()   internal, called by the purge only (no cron of its own). One open 'moderation_spike' notice per community (explicit not-exists: the unique
--                         index can't dedupe a null home). Counts organizer acts in jc_admin_log over 24 h.
-- jc_admin_notices        kind CHECK + 'moderation_spike'.
-- All new client RPCs are VOLATILE (G20).
--
-- Rollback (pre-launch): delete moderation_spike notices; restore the kind CHECK; restore jc_pet_retire(uuid) and the
-- bodies of jc_admin_pet_archive / jc_pet_archive / jc_home_vacated / jc_pets_retention / jc_admin_pets_list from
-- 20261115120000_pets_care_v2 + 20261116140000_stray_report_photos (and earlier); drop the 5 new functions; retire
-- ledger rows of archived pets, then drop the CHECK and the 3 columns.

alter table public.jc_pets
  add column archived_at timestamptz,
  add column archived_how text check (archived_how in ('organizer', 'household', 'vacated')),
  add column archived_photo_path text;
alter table public.jc_pets add constraint jc_pets_archived_shape check (
  (status = 'active' and archived_at is null and archived_how is null and archived_photo_path is null)
  or (status = 'archived' and archived_at is not null and archived_how is not null
      and (archived_how <> 'vacated' or archived_photo_path is null)));

alter table public.jc_admin_notices drop constraint jc_admin_notices_kind_check;
alter table public.jc_admin_notices add constraint jc_admin_notices_kind_check check
  (kind = any (array['departure', 'over_cap', 'pin_flag', 'event_ended', 'autoclose_failed', 'moderation_spike']));

-- ---------- retire (internal) ----------
drop function public.jc_pet_retire(uuid);
create function public.jc_pet_retire(p_pet uuid, p_how text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_keep text;
begin
  if p_how not in ('organizer', 'household', 'vacated') then raise exception 'BAD_FIELDS'; end if;
  select photo_path into v_keep from jc_pets where id = p_pet and status = 'active' for no key update;
  if not found then return; end if;
  if p_how = 'vacated' then v_keep := null; end if;
  -- the kept photo stays 'current' (unreadable: the rule needs status = 'active'); everything else retires now
  update jc_pet_photos set state = 'retired', retired_at = now()
   where pet_id = p_pet and state <> 'retired' and path is distinct from v_keep;
  update jc_pets
     set status = 'archived', archived_at = now(), archived_how = p_how, archived_photo_path = v_keep,
         missing = false, missing_since = null, last_seen_note = null,
         photo_path = null, pending_photo_path = null, pending_photo_by = null, pending_photo_at = null,
         updated_at = now()
   where id = p_pet and status = 'active';
end;
$function$;
revoke all on function public.jc_pet_retire(uuid, text) from public, anon, authenticated;

-- ---------- the restore rule (internal) ----------
create function public.jc_pet_restorable(p public.jc_pets)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select p.status = 'archived' and p.archived_how in ('organizer', 'household')
     and p.archived_at > now() - interval '30 days'
     and (p.kind = 'stray'
          or (exists (select 1 from jc_home_members m where m.home_id = p.home_id)
              and not exists (select 1 from jc_home_members m where m.home_id = p.home_id
                                                                and m.joined_at > p.archived_at)));
$function$;
revoke all on function public.jc_pet_restorable(public.jc_pets) from public, anon, authenticated;

-- ---------- archive callers ----------
create or replace function public.jc_admin_pet_archive(p_pet uuid, p_reason text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
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
  perform jc_pet_retire(p_pet, 'organizer');                                                          -- SOFT ARCHIVE
  update jc_pets set updated_by = auth.uid() where id = p_pet;
  perform jc_admin_log_add(v_comm, 'pet_archive', jsonb_build_object('pet_id', p_pet, 'reason', v_reason));
  return jc_admin_pets_list();
end;
$function$;

create or replace function public.jc_pet_archive(p_pet uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_user uuid; v_comm text; v_home uuid; p public.jc_pets%rowtype;
begin
  select o_user, o_community, o_home into v_user, v_comm, v_home from jc_me();
  perform jc_module_on(v_comm, 'pets');
  p := jc_pet_manage(p_pet);
  if p.kind <> 'owned' then raise exception 'NOT_FOUND'; end if;
  perform jc_pet_retire(p.id, 'household');                                                           -- SOFT ARCHIVE
  update jc_pets set updated_by = v_user where id = p.id;
  perform jc_log(v_comm, null, null, 'pet_archive', jsonb_build_object('pet_id', p.id));
  return jsonb_build_object('pet_id', p.id, 'archived', true);
end;
$function$;

create or replace function public.jc_home_vacated(p_home uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  -- SOFT ARCHIVE: lock the home's pets first, so a restore racing this leave either lands before (and the pet is
  -- vacated below) or waits and then fails the membership rule (db review #2)
  perform 1 from jc_pets where home_id = p_home for no key update;
  -- a vacant home starts clean for the next family
  update jc_home_invites set expires_at = least(expires_at, now())
   where home_id = p_home and used_at is null;
  -- the house keeps WHICH events it joined (history, stats); the leaving family's
  -- answers and notes go with them
  update jc_event_entries set payload = '{}', note = null, org_note = null,
                              event_lat = null, event_lng = null  -- T5.2: the event-only pin too
   where home_id = p_home and (payload <> '{}' or note is not null or org_note is not null
                               or event_lat is not null);
  -- R2a (D1 + L1): an organizer's hide and a spot belong to the family that leaves — any status, so a
  -- family that withdrew while hidden can't hand the flag to the next one. Archived events keep history.
  -- R2b-1: so do "adjusted by an organizer" / "an organizer removed your sign-up".
  update jc_event_entries en set hidden = false, spot = null, org_adjusted_at = null, org_withdrawn_at = null
   where en.home_id = p_home and en.archived_at is null
     and (en.hidden or en.spot is not null or en.org_adjusted_at is not null or en.org_withdrawn_at is not null)
     and exists (select 1 from jc_events ev where ev.id = en.event_id and ev.status = 'live');
  -- and it stops appearing in live events
  update jc_event_entries en set status = 'withdrawn', updated_at = now()
   where en.home_id = p_home and en.status = 'in' and en.archived_at is null
     and exists (select 1 from jc_events ev where ev.id = en.event_id and ev.status = 'live');
  update jc_entry_reports r set cleared_at = now()
    from jc_event_entries en
   where r.entry_id = en.id and en.home_id = p_home and r.cleared_at is null;
  -- S3: future court bookings are released, and no booking keeps the family's name
  perform jc_bookings_cancel_range(null, p_home, now(), 'infinity', 'Household left');
  update jc_bookings set display_name = null where home_id = p_home and display_name is not null;
  -- S4: the family's pets leave with them
  perform jc_pet_retire(id, 'vacated') from jc_pets where home_id = p_home and status = 'active';   -- SOFT ARCHIVE
  -- SOFT ARCHIVE: pets they archived earlier can no longer come back; their kept photos go now
  update jc_pet_photos ph set state = 'retired', retired_at = now()
    from jc_pets p
   where ph.pet_id = p.id and p.home_id = p_home and p.status = 'archived' and ph.state <> 'retired';
  update jc_pets set archived_how = 'vacated', archived_photo_path = null
   where home_id = p_home and status = 'archived' and archived_how <> 'vacated';
end;
$function$;

-- ---------- restore + un-hide (Pets admins) ----------
create function public.jc_admin_pet_restore(p_pet uuid)
 returns jsonb
 language plpgsql
 volatile security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_comm text; p public.jc_pets%rowtype; v_photo text;
begin
  v_comm := jc_assert_admin('pets');
  select * into p from jc_pets where id = p_pet and community_id = v_comm for no key update;
  if p.id is null or p.status <> 'archived' then raise exception 'NOT_FOUND'; end if;
  if not jc_pet_restorable(p) then raise exception 'RESTORE_EXPIRED'; end if;
  -- the per-home cap holds on the way back too (db review #1)
  if p.kind = 'owned' and (select count(*) from jc_pets where home_id = p.home_id and status = 'active') >= 10 then
    raise exception 'TOO_MANY_PETS'; end if;
  -- the photo comes back only if nothing retired it meanwhile
  select path into v_photo from jc_pet_photos
   where path = p.archived_photo_path and pet_id = p.id and state = 'current';
  update jc_pets set status = 'active', archived_at = null, archived_how = null, archived_photo_path = null,
                     photo_path = v_photo, updated_at = now(), updated_by = auth.uid()
   where id = p.id;
  perform jc_admin_log_add(v_comm, 'pet_restore', jsonb_build_object('pet_id', p.id));
  return jc_admin_pets_list();
end;
$function$;

create function public.jc_admin_pet_hidden_sightings(p_pet uuid)
 returns jsonb
 language plpgsql
 volatile security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_comm text;
begin
  v_comm := jc_assert_admin('pets');
  if not exists (select 1 from jc_pets where id = p_pet and community_id = v_comm) then raise exception 'NOT_FOUND'; end if;
  -- who saw it is never returned (and is cleared at 24 h anyway)
  return coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'seen_at', s.seen_at, 'note', s.note,
                                                       'lat', s.lat, 'lng', s.lng) order by s.seen_at desc, s.id desc)
                     from jc_pet_sightings s where s.pet_id = p_pet and s.community_id = v_comm and s.hidden), '[]'::jsonb);
end;
$function$;

create function public.jc_admin_sighting_unhide(p_sighting bigint)
 returns jsonb
 language plpgsql
 volatile security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_comm text; v_pet uuid;
begin
  v_comm := jc_assert_admin('pets');
  update jc_pet_sightings set hidden = false
   where id = p_sighting and community_id = v_comm and hidden
  returning pet_id into v_pet;
  if v_pet is null then raise exception 'NOT_FOUND'; end if;
  perform jc_admin_log_add(v_comm, 'sighting_unhide', jsonb_build_object('sighting_id', p_sighting, 'pet_id', v_pet));
  return jsonb_build_object('sighting_id', p_sighting, 'hidden', false);
end;
$function$;

revoke all on function public.jc_admin_pet_restore(uuid) from public, anon;
revoke all on function public.jc_admin_pet_hidden_sightings(uuid) from public, anon;
revoke all on function public.jc_admin_sighting_unhide(bigint) from public, anon;
grant execute on function public.jc_admin_pet_restore(uuid) to authenticated;
grant execute on function public.jc_admin_pet_hidden_sightings(uuid) to authenticated;
grant execute on function public.jc_admin_sighting_unhide(bigint) to authenticated;

create or replace function public.jc_admin_pets_list()
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_comm text;
begin
  v_comm := jc_assert_admin('pets');
  return coalesce((
    select jsonb_agg(jc_pet_card(p.id, null) || jsonb_build_object(
             'status', p.status, 'created_at', p.created_at, 'updated_at', p.updated_at,
             'archived_at', p.archived_at,                                                                -- SOFT ARCHIVE
             'restorable_until', case when jc_pet_restorable(p) then p.archived_at + interval '30 days' end,
             'sightings_7d', (select count(*) from jc_pet_sightings s
                               where s.pet_id = p.id and s.seen_at > now() - interval '7 days'),
             'last_fed_at', (select max(c.created_at) from jc_pet_care_log c                              -- CARE V2
                              where c.pet_id = p.id and c.kind = 'fed'),
             'last_contact_at', greatest(                                                                  -- CARE V2
               (select max(s.seen_at) from jc_pet_sightings s where s.pet_id = p.id and not s.hidden),
               (select max(c.created_at) from jc_pet_care_log c where c.pet_id = p.id and c.kind in ('fed', 'vet'))))
           order by p.status, p.missing desc, p.name, p.id)
      from jc_pets p where p.community_id = v_comm), '[]'::jsonb);
end;
$function$;

-- ---------- nightly ----------
create function public.jc_moderation_alert()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare n int := 0; r record;
begin
  for r in
    select l.community_id,
           count(*) filter (where l.action = 'pet_archive') archives,
           count(*) filter (where l.action = 'pet_restore') restores,
           count(*) filter (where l.action = 'sighting_hide') hides,
           count(*) filter (where l.action = 'sighting_unhide') unhides
      from jc_admin_log l
     where l.at > now() - interval '24 hours'
       and l.action in ('pet_archive', 'pet_restore', 'sighting_hide', 'sighting_unhide')
     group by l.community_id
  loop
    continue when r.archives + r.restores < 10 and r.hides + r.unhides < 20;
    -- one open notice per community: a later night refreshes its counts instead of hiding them (security review #4)
    update jc_admin_notices set detail = jsonb_build_object('archives', r.archives, 'restores', r.restores,
                                                            'hides', r.hides, 'unhides', r.unhides), created_at = now()
     where community_id = r.community_id and kind = 'moderation_spike' and resolved_at is null;
    if not found then
      perform jc_notice(r.community_id, 'moderation_spike', null,
                        jsonb_build_object('archives', r.archives, 'restores', r.restores, 'hides', r.hides, 'unhides', r.unhides));
    end if;
    n := n + 1;
  end loop;
  return n;
end;
$function$;
revoke all on function public.jc_moderation_alert() from public, anon, authenticated;

create or replace function public.jc_pets_retention()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare n int; m int; v_log bigint;
begin
  update jc_pet_sightings set reporter = null
   where reporter is not null and seen_at < now() - interval '24 hours';
  with gone as (delete from jc_pet_sightings where seen_at < now() - interval '30 days' returning 1)
  select count(*) into n from gone;
  update jc_stray_reports r set contact = null
   where r.contact is not null
     and (r.reporter is null or not exists (select 1 from jc_accounts a
                                             where a.user_id = r.reporter and a.community_id = r.community_id));
  -- PHOTOS: a current photo of an archived pet is retired (closes the close-vs-archive race, db 1b M1; jc_pet_retire
  -- retires the ledger before it updates jc_pets, so a move landing in between would otherwise never be purged)
  -- SOFT ARCHIVE: except the kept photo inside the 30-day window; after it, that one goes too
  update jc_pet_photos ph set state = 'retired', retired_at = now()
    from jc_pets p
   where ph.pet_id = p.id and ph.state = 'current' and p.status = 'archived'
     and (ph.path is distinct from p.archived_photo_path or p.archived_at <= now() - interval '30 days');
  update jc_pets set archived_photo_path = null                                                       -- SOFT ARCHIVE
   where status = 'archived' and archived_photo_path is not null and archived_at <= now() - interval '30 days';
  -- PHOTOS: a reporter who left → their report photos are retired too (security 1b M2)
  update jc_pet_photos ph set state = 'retired', retired_at = now()
    from jc_stray_reports r
   where ph.report_id = r.id and ph.state in ('current', 'pending')
     and (r.reporter is null or not exists (select 1 from jc_accounts a
                                             where a.user_id = r.reporter and a.community_id = r.community_id));
  update jc_stray_reports r set photo_path = null, pending_photo_path = null, pending_photo_by = null, pending_photo_at = null
   where (r.photo_path is not null or r.pending_photo_path is not null)
     and (r.reporter is null or not exists (select 1 from jc_accounts a
                                             where a.user_id = r.reporter and a.community_id = r.community_id));
  -- PHOTOS: an expiring report's photos are retired first (the sweep deletes the objects)
  update jc_pet_photos ph set state = 'retired', retired_at = now()
    from jc_stray_reports r
   where ph.report_id = r.id and ph.state in ('current', 'pending')
     and r.state = 'open' and r.created_at < now() - interval '60 days';
  update jc_stray_reports set state = 'expired', closed_at = now(), contact = null,
         photo_path = null, pending_photo_path = null, pending_photo_by = null, pending_photo_at = null   -- PHOTOS
   where state = 'open' and created_at < now() - interval '60 days';
  -- PHOTOS: a report due for deletion goes only once all its photo rows are purged; those rows go first
  delete from jc_pet_photos ph using jc_stray_reports r
   where ph.report_id = r.id and r.closed_at < now() - interval '30 days'
     and not exists (select 1 from jc_pet_photos x where x.report_id = r.id and x.purged_at is null);
  with gone as (delete from jc_stray_reports r
                 where r.closed_at < now() - interval '30 days'
                   and not exists (select 1 from jc_pet_photos x where x.report_id = r.id)     -- PHOTOS
                returning 1)
  select count(*) into m from gone;
  n := n + m;
  insert into jc_maintenance_log (job, affected) values ('pets_purge', n) returning id into v_log;
  -- SOFT ARCHIVE: the alert runs last, in its own block, so a failure never undoes the purge above. A failure is
  -- written on this run's pets_purge row, which App Health already shows (no new job name).
  begin
    perform jc_moderation_alert();
  exception when others then
    update jc_maintenance_log set error = left('moderation_alert: ' || sqlerrm, 500) where id = v_log;
  end;
  return n;
end;
$function$;
