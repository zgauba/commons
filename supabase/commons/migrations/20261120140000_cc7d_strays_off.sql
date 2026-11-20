-- TARGET PROJECT: JubailCommons (qrpxfssdeeuzmsmlbtbu) — NEVER SignalPost.
-- CC-7d Strays off in Pets (docs/plans/CC-community-cats.md "CC-7 plan"; Zee approved + pre-authorised apply + merge for
-- all of CC-7, 2026-11-20). Applied AFTER CC-7c (the app without any stray screen) is live. Replaced functions start
-- from the live bodies (pg_get_functiondef, 2026-11-20 — the photo policies from 20261120100000_cc7a_cat_reports) +
-- lines marked "CC-7d".
--
-- 1. Archive every active Pets stray (live: 9 test strays on e2e — test data, never converted; the real cats come
--    from the CC-6 import). Through jc_pet_retire(id, 'organizer'): the usual soft archive (photo kept 30 days, then the
--    nightly purge). A stray can never be restored (jc_pet_restorable: owned pets only).
-- 2. The stray-only RPCs go: jc_admin_stray_save, jc_admin_pet_care_add, jc_admin_pet_care_set (the Pets stray editor,
--    quick log, care record) and jc_admin_stray_reports_list / jc_admin_stray_report_close (Organizer Tools' Reported
--    strays — the queue is jc_cat_reports_list / jc_cat_report_close since CC-7a). No internal caller (checked).
-- 3. jc_pets_list: owned pets only; the 'strays' / 'community' filters are refused (BAD_FILTER). jc_admin_pets_list
--    (Organizer Tools → Pets): owned pets only — the archived strays' territory pins and care notes stay out of Pets
--    (security review L1).
-- 4. Photo rules: report photos follow Cats only (the Pets admins' transition branch goes); a stray's photo can no
--    longer be written.
-- 5. jc_snapshot_run: the pets row loses 'strays' (always 0 from here; App Health never read it).
-- Kept on purpose: jc_pet_care_log rows and stray pet sightings (existing retention; the archived strays' rows are
-- unreadable — every reader needs an active pet), jc_pets kind 'stray' in the CHECK (archived rows), stray branches
-- inside read functions that can no longer match an active pet (jc_pet_card, jc_pet_get, jc_pet_sighting_add,
-- jc_pets_retention). Rollback: re-create the dropped functions from 20261114200000 / 20261115100000 /
-- 20261115120000 / 20261116100000 / 20261116140000 / 20261116180000 (and the grants listed there), the replaced ones
-- from their previous migrations; strays restorable by SQL (status, archived_* back) within 30 days.

-- ---------- 1. archive the strays ----------
do $m$
declare r record; n int := 0;
begin
  for r in select id from public.jc_pets where kind = 'stray' and status = 'active' order by id loop
    perform public.jc_pet_retire(r.id, 'organizer'); n := n + 1;
  end loop;
  raise notice 'CC-7d: % strays archived', n;
end
$m$;

-- ---------- 2. the stray-only RPCs ----------
drop function public.jc_admin_stray_save(uuid, jsonb);
drop function public.jc_admin_pet_care_add(uuid, text, text);
drop function public.jc_admin_pet_care_set(uuid, text, text, date, text);
drop function public.jc_admin_stray_reports_list(text);
drop function public.jc_admin_stray_report_close(uuid, text, uuid);

-- ---------- 3. owned pets only ----------
create or replace function public.jc_pets_list(p_filter text)
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_user uuid; v_comm text; v_home uuid; v_filter text := coalesce(p_filter, 'all');
        v_lat double precision; v_lng double precision; v_cos double precision;
begin
  select o_user, o_community, o_home into v_user, v_comm, v_home from jc_me();
  perform jc_module_on(v_comm, 'pets');
  if v_filter not in ('all', 'owned', 'wanderers', 'missing') then raise exception 'BAD_FILTER'; end if;   -- CC-7d
  select h.lat, h.lng into v_lat, v_lng from jc_homes h where h.id = v_home;                        -- R5b-2b-0
  v_cos := cos(radians(coalesce(v_lat, 0)));
  return coalesce((
    select jsonb_agg(x.card order by x.missing desc, x.dist nulls last, x.name, x.id)
      from (select p.id, p.name, p.missing, c.card,
                   case when v_lat is not null then                                                 -- R5b-2b-0
                     power(h.lat - v_lat, 2) + power((h.lng - v_lng) * v_cos, 2) end as dist        -- CC-7d: the home
              from jc_pets p
              left join jc_homes h on h.id = p.home_id
              cross join lateral (select jc_pet_card(p.id, v_home) as card) c
             where p.community_id = v_comm and p.status = 'active' and p.kind = 'owned'             -- CC-7d
               and (v_filter in ('all', 'owned')
                    or (v_filter = 'wanderers' and p.wanderer)
                    or (v_filter = 'missing' and p.missing))) x), '[]'::jsonb);
end;
$function$;

create or replace function public.jc_pet_restorable(p jc_pets)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select p.status = 'archived' and p.archived_how in ('organizer', 'household')
     and p.archived_at > now() - interval '30 days'
     and p.kind = 'owned'                                                              -- CC-7d: strays never come back
     and exists (select 1 from jc_home_members m where m.home_id = p.home_id)
     and not exists (select 1 from jc_home_members m where m.home_id = p.home_id and m.joined_at > p.archived_at);
$function$;

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
      from jc_pets p where p.community_id = v_comm and p.kind = 'owned'), '[]'::jsonb);              -- CC-7d
end;
$function$;

-- ---------- 4. photo rules ----------
create or replace function jc_private.pet_photo_can_read(p_name text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1 from public.jc_pets p
      join public.jc_accounts a on a.user_id = auth.uid() and a.community_id = p.community_id
      join public.jc_communities c on c.id = p.community_id
     where p.status = 'active'
       and coalesce((c.modules -> 'pets' ->> 'enabled')::boolean, false)
       and (p.photo_path = p_name
            or (p.pending_photo_path = p_name and p.pending_photo_by = auth.uid())))
  -- PHOTOS: a report's photo — its reporter or this community's queue holders; a pending one — its uploader
  -- CC-7d: Cats only — the reporter + Cats coordinators / community admins while Cats is on (Pets admins' transition
  -- branch from CC-7a removed with Organizer Tools' Reported strays)
  or exists (
    select 1 from public.jc_stray_reports r
      join public.jc_accounts a on a.user_id = auth.uid() and a.community_id = r.community_id
      join public.jc_communities c on c.id = r.community_id
     where coalesce((c.modules -> 'cats' ->> 'enabled')::boolean, false)
       -- organizers: only while the reporter is still a member (security 1b M2). Community isolation of the admin
       -- branch rests on the join above: jc_accounts.user_id is the PK (one community per account) and grants are
       -- tied to that account — jc_admin_has has no community check of its own (security 1b L1).
       and ((r.photo_path = p_name
             and (r.reporter = auth.uid()
                  or (public.jc_admin_has('cats')
                      and exists (select 1 from public.jc_accounts ra
                                   where ra.user_id = r.reporter and ra.community_id = r.community_id))))
            or (r.pending_photo_path = p_name and r.pending_photo_by = auth.uid())))
  -- CC-3: a cat's current photo — any member of its community while Cats is on (photos are in the resident view);
  -- a pending one — its uploader only
  or exists (
    select 1 from public.jc_pet_photos ph
      join public.jc_cats k on k.id = ph.cat_id
      join public.jc_accounts a on a.user_id = auth.uid() and a.community_id = k.community_id
      join public.jc_communities c on c.id = k.community_id
     where ph.path = p_name
       and coalesce((c.modules -> 'cats' ->> 'enabled')::boolean, false)
       and (ph.state = 'current' or (ph.state = 'pending' and ph.created_by = auth.uid())));
$function$;

create or replace function jc_private.pet_photo_can_write(p_name text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1 from public.jc_pets p
      join public.jc_communities c on c.id = p.community_id
     where p.pending_photo_path = p_name and p.pending_photo_by = auth.uid()
       and p.pending_photo_at > now() - interval '15 minutes' and p.status = 'active'
       and coalesce((c.modules -> 'pets' ->> 'enabled')::boolean, false)
       and p.kind = 'owned'                                                       -- CC-7d: strays left Pets
       and exists (select 1 from public.jc_home_members m where m.user_id = auth.uid() and m.home_id = p.home_id))
  -- PHOTOS: the reporter's own pending upload on their own open report (CC-7a: while Cats is on)
  or exists (
    select 1 from public.jc_stray_reports r
      join public.jc_communities c on c.id = r.community_id
     where r.pending_photo_path = p_name and r.pending_photo_by = auth.uid() and r.reporter = auth.uid()
       and r.pending_photo_at > now() - interval '15 minutes' and r.state = 'open'
       and coalesce((c.modules -> 'cats' ->> 'enabled')::boolean, false))
  -- CC-3: a cat photo — the coordinator who began it, within 15 minutes, on a cat of their own community, Cats on
  or exists (
    select 1 from public.jc_pet_photos ph
      join public.jc_cats k on k.id = ph.cat_id
      join public.jc_accounts a on a.user_id = auth.uid() and a.community_id = k.community_id
      join public.jc_communities c on c.id = k.community_id
     where ph.path = p_name and ph.state = 'pending' and ph.created_by = auth.uid()
       and ph.created_at > now() - interval '15 minutes' and k.merged_into is null
       and coalesce((c.modules -> 'cats' ->> 'enabled')::boolean, false)
       and public.jc_admin_has('cats'));
$function$;

-- ---------- 5. snapshot: no 'strays' ----------
create or replace function public.jc_snapshot_run(p_at timestamp with time zone DEFAULT now())
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare c record; v_bucket timestamptz := date_trunc('hour', p_at); n int := 0;
begin
  for c in select id, modules from jc_communities loop
    insert into jc_snapshots as s (community_id, module, bucket, metrics)
    values
    (c.id, 'homes', v_bucket, (
       select jsonb_build_object(
         'total', count(*),
         'occupied', count(*) filter (where exists (select 1 from jc_home_members m where m.home_id = h.id)),
         'pinned', count(*) filter (where h.lat is not null),
         'by_village', coalesce((select jsonb_object_agg(village_key, k) from
                (select village_key, count(*) k from jc_homes where community_id = c.id group by village_key) v), '{}'::jsonb))
         from jc_homes h where h.community_id = c.id)),
    (c.id, 'accounts', v_bucket, (
       select jsonb_build_object(
         'total', count(*),
         'joined_24h', count(*) filter (where a.joined_at > p_at - interval '24 hours'),
         'admins', (select count(distinct x.user_id) from (                                -- R4a-2: + module admins
                      select g.user_id from jc_admin_grants g
                       where g.community_id = c.id and g.last_used_at > p_at - interval '60 days'
                      union all
                      select ma.user_id from jc_module_admins ma
                       where ma.community_id = c.id and ma.scope <> 'cats_vol') x))   -- CC-1: volunteers aren't admins
         from jc_accounts a where a.community_id = c.id)),
    (c.id, 'events', v_bucket, jsonb_build_object(
       'enabled', (c.modules -> 'events' ->> 'enabled') is not distinct from 'true',
       'live_events', (select count(*) from jc_events e where e.community_id = c.id and e.status = 'live'),
       'entries_in', (select count(*) from jc_event_entries en join jc_events e on e.id = en.event_id
                       where en.community_id = c.id and e.status = 'live'
                         and en.status = 'in' and en.archived_at is null))),
    (c.id, 'bookings', v_bucket, jsonb_build_object(
       'enabled', (c.modules -> 'bookings' ->> 'enabled') is not distinct from 'true',
       'upcoming', (select count(*) from jc_bookings b where b.community_id = c.id
                     and b.status = 'booked' and b.starts_at > p_at),
       'next_24h', (select count(*) from jc_bookings b where b.community_id = c.id
                     and b.status = 'booked' and b.starts_at > p_at and b.starts_at <= p_at + interval '24 hours'),
       'created_24h', (select count(*) from jc_bookings b where b.community_id = c.id
                        and b.created_at > p_at - interval '24 hours'))),
    (c.id, 'pets', v_bucket, (
       select jsonb_build_object(
         'enabled', (c.modules -> 'pets' ->> 'enabled') is not distinct from 'true',
         'owned', count(*) filter (where p.kind = 'owned'),
         'missing', count(*) filter (where p.missing))
         from jc_pets p where p.community_id = c.id and p.status = 'active')),
    -- CC-3: the cat programme (merged cats are pointers, not cats)
    (c.id, 'cats', v_bucket, (
       select jsonb_build_object(
         'enabled', (c.modules -> 'cats' ->> 'enabled') is not distinct from 'true',
         'cats', count(*),
         'confirmed', count(*) filter (where k.confirmed),
         'stations', (select count(*) from jc_cat_stations s where s.community_id = c.id and s.archived_at is null),
         -- CC-4: the last 7 days (hidden entries left out)
         'visits_7d', (select count(*) from jc_cat_visits v where v.community_id = c.id and v.hidden_at is null
                         and v.logged_at > p_at - interval '7 days'),
         'problems_7d', (select count(*) from jc_cat_visits v where v.community_id = c.id and v.hidden_at is null
                           and v.problem is not null and v.logged_at > p_at - interval '7 days'),
         'sightings_7d', (select count(*) from jc_cat_sightings g where g.community_id = c.id and g.hidden_at is null
                            and g.logged_at > p_at - interval '7 days'))
         from jc_cats k where k.community_id = c.id and k.merged_into is null)),
    (c.id, 'traffic', v_bucket, jsonb_build_object(
       'hour', v_bucket - interval '1 hour',
       'pages', coalesce((select jsonb_object_agg(page, count) from jc_hits
                           where community_id = c.id and hour = v_bucket - interval '1 hour'), '{}'::jsonb)))
    on conflict (community_id, module, bucket)
      do update set metrics = excluded.metrics, taken_at = now();
    n := n + 7;
  end loop;
  return n;
end;
$function$;
