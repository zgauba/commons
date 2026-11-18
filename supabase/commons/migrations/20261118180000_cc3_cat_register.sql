-- TARGET PROJECT: JubailCommons (qrpxfssdeeuzmsmlbtbu) — NEVER SignalPost.
-- CC-3 Cats register (docs/plans/CC-community-cats.md, approved Zee 2026-11-17; ROADMAP "Community Cats" Phase 1).
-- Builds on CC-1 (20261118100000) + CC-2 (20261118140000), both live. Replaced bodies start from the live bodies
-- (pg_get_functiondef, 2026-11-18) + lines marked "CC-3".
--
-- 1. jc_cats: a permanent Cat ID per community (C-001 …, max + 1 under a per-community lock; cats are never deleted,
--    so a number is never reused, merges included), the programme's old ID (searchable), name, sex, life stage, coat +
--    markings, usual area + station, provisional / confirmed, story (shown to residents), status + date + source,
--    ear tip (present / absent / unclear + side) kept apart from confirmed sterilisation (+ source), TNVR stage
--    (+ date + place). A new cat needs a name or a coat description (something to recognise it by).
-- 2. jc_cat_status_log: every status change, dated, with its source — the cat's status history.
-- 3. Merge keeps history: the merged cat becomes a pointer (merged_into) and keeps every field, photo and status
--    entry; reads of the surviving cat gather its own rows + those of the cats merged into it. Cats already merged
--    into the merged one are re-pointed (pointers stay one level deep) and recorded, so an undo puts them back.
--    jc_cat_merges is the record (who, when, which, undone when). One merge / undo at a time per community.
-- 4. Photos (up to 4 per cat, its own): the existing private bucket 'pet-photos' + the existing ledger jc_pet_photos
--    (+ cat_id; exactly one of pet_id / report_id / cat_id). Path <community>/c/<cat id>/<random>.<ext>. The T4 sweep
--    reads only the ledger, so a removed photo is purged unchanged; jc_pets_retention never touches cat rows (it joins
--    on pet_id / report_id only). Read: any member of the cat's community while Cats is on (photos are in the resident
--    view); a pending one: its uploader. Write: the coordinator who began it, within 15 minutes, while Cats is on.
--    Per-account cap: the existing 20 uploads / day across all pet + cat photos.
-- 5. Two RPC families, never one filtered in the browser (plan premortem #6):
--      residents  jc_cats_public()   cats not merged: code, name, sex, life stage, coat, area name, provisional flag,
--                                    story, status (no date / source), ear tip (no side), sterilised (no source),
--                                    photos. Never: old ID, station, TNVR, dates, sources, history, merges.
--      programme  jc_cat_register()  coordinators, volunteers, community admins: everything + the last 10 status
--                                    entries + which records were merged into a cat (merged_from: volunteers too);
--                                    coordinators also get the merged records themselves (to undo). No user ids, no
--                                    emails.
--    Writes (coordinators + community admins): jc_cat_save, jc_cat_merge, jc_cat_unmerge, jc_cat_photo_begin /
--    _commit / _remove. Logged without content (cat id + which fields).
-- 6. Snapshots gain module 'cats' (CC-1 carry-over): enabled, cats, confirmed, stations.
-- 7. Kill switch: the module flag off → MODULE_OFF from every Cats RPC; photo reads + writes stop too.
-- +8 authenticated fns: jc_cats_public, jc_cat_register, jc_cat_save, jc_cat_merge, jc_cat_unmerge,
--   jc_cat_photo_begin, jc_cat_photo_commit, jc_cat_photo_remove. +1 internal (no grants): jc_cat_json.
-- Replaced (signatures unchanged): jc_private.pet_photo_can_read / _can_write, jc_snapshot_run.
-- Rollback (pre-launch, test data only), in this order: (1) restore the 3 bodies from 20261116140000_stray_report_photos
--   / 20261118100000_cc1_cats_foundation; (2) delete from jc_snapshots where module = 'cats', restore
--   jc_snapshots_module_check without 'cats'; (3) drop the 9 functions; (4) retire + let the sweep purge cat photos,
--   then delete from jc_pet_photos where cat_id is not null; (5) restore jc_pet_photos_owner as
--   ((pet_id is null) <> (report_id is null)), drop constraint jc_pet_photos_cat_fk, drop column cat_id;
--   (6) drop tables jc_cat_merges, jc_cat_status_log, jc_cats.

-- ---------- 1. schema ----------
create table public.jc_cats (
  id                uuid primary key default gen_random_uuid(),
  community_id      text not null references public.jc_communities(id) on delete cascade,
  num               int not null check (num between 1 and 9999),
  old_id            text check (old_id is null or char_length(old_id) between 1 and 40),
  name              text check (name is null or char_length(name) between 1 and 40),
  sex               text not null default 'unknown' check (sex in ('female', 'male', 'unknown')),
  life_stage        text not null default 'unknown' check (life_stage in ('kitten', 'adult', 'senior', 'unknown')),
  coat              text check (coat is null or char_length(coat) between 1 and 120),
  area_id           uuid references public.jc_cat_areas(id),
  station_id        uuid references public.jc_cat_stations(id),
  confirmed         boolean not null default false,
  story             text check (story is null or char_length(story) between 1 and 1000),
  status            text not null default 'community'
                    check (status in ('community', 'clinic', 'foster', 'adopted', 'transferred', 'missing', 'deceased', 'unknown')),
  status_on         date,
  status_source     text check (status_source is null or char_length(status_source) between 1 and 120),
  ear_tip           text not null default 'unclear' check (ear_tip in ('present', 'absent', 'unclear')),
  ear_side          text check (ear_side in ('left', 'right')),
  sterilised        text not null default 'unknown' check (sterilised in ('yes', 'no', 'unknown')),
  sterilised_source text check (sterilised_source is null or char_length(sterilised_source) between 1 and 120),
  tnvr              text not null default 'none' check (tnvr in ('none', 'needed', 'booked', 'captured', 'clinic', 'returned')),
  tnvr_on           date,
  tnvr_place        text check (tnvr_place is null or char_length(tnvr_place) between 1 and 120),
  merged_into       uuid references public.jc_cats(id),
  merged_at         timestamptz,
  created_at        timestamptz not null default now(),
  created_by        uuid references auth.users(id) on delete set null,
  updated_at        timestamptz not null default now(),
  updated_by        uuid references auth.users(id) on delete set null,
  unique (community_id, num),
  unique (id, community_id),                                          -- target of the photo ledger's FK
  check (ear_side is null or ear_tip = 'present'),
  check ((merged_into is null) = (merged_at is null)),
  check (merged_into is distinct from id),
  check (name is not null or coat is not null)
);
create index jc_cats_merged_into_idx on public.jc_cats (merged_into) where merged_into is not null;
create index jc_cats_area_idx on public.jc_cats (area_id) where area_id is not null;
create index jc_cats_station_idx on public.jc_cats (station_id) where station_id is not null;

create table public.jc_cat_status_log (
  id         uuid primary key default gen_random_uuid(),
  cat_id     uuid not null references public.jc_cats(id) on delete cascade,
  status     text not null,
  status_on  date,
  source     text,
  logged_at  timestamptz not null default clock_timestamp(),
  logged_by  uuid references auth.users(id) on delete set null
);
create index jc_cat_status_log_cat_idx on public.jc_cat_status_log (cat_id, logged_at desc);

create table public.jc_cat_merges (
  id         uuid primary key default gen_random_uuid(),
  community_id text not null references public.jc_communities(id) on delete cascade,
  from_id    uuid not null references public.jc_cats(id),
  into_id    uuid not null references public.jc_cats(id),
  moved      uuid[] not null default '{}',                    -- cats that pointed at from_id, re-pointed to into_id
  merged_at  timestamptz not null default clock_timestamp(),   -- ordered within one transaction too (unmerge picks the latest)
  merged_by  uuid references auth.users(id) on delete set null,
  undone_at  timestamptz,
  undone_by  uuid references auth.users(id) on delete set null,
  check (from_id <> into_id)
);
create index jc_cat_merges_from_idx on public.jc_cat_merges (from_id, merged_at desc);
create index jc_cat_merges_into_idx on public.jc_cat_merges (into_id);
create index jc_cat_merges_community_idx on public.jc_cat_merges (community_id);

alter table public.jc_cats enable row level security;
alter table public.jc_cat_status_log enable row level security;
alter table public.jc_cat_merges enable row level security;
revoke all on table public.jc_cats, public.jc_cat_status_log, public.jc_cat_merges from public, anon, authenticated;

-- photos: the ledger gets a third owner
alter table public.jc_pet_photos add column cat_id uuid;
alter table public.jc_pet_photos drop constraint jc_pet_photos_owner;
alter table public.jc_pet_photos
  add constraint jc_pet_photos_owner check (num_nonnulls(pet_id, report_id, cat_id) = 1),
  add constraint jc_pet_photos_cat_fk foreign key (cat_id, community_id) references public.jc_cats(id, community_id);
create index jc_pet_photos_cat on public.jc_pet_photos (cat_id, created_at) where cat_id is not null;

-- snapshots: a 'cats' row per community
alter table public.jc_snapshots drop constraint jc_snapshots_module_check;
alter table public.jc_snapshots add constraint jc_snapshots_module_check
  check (module = any (array['homes', 'accounts', 'events', 'bookings', 'pets', 'cats', 'traffic']));

-- ---------- 2. storage rules (bodies only; signatures + grants unchanged) ----------
create or replace function jc_private.pet_photo_can_write(p_name text) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.jc_pets p
      join public.jc_communities c on c.id = p.community_id
     where p.pending_photo_path = p_name and p.pending_photo_by = auth.uid()
       and p.pending_photo_at > now() - interval '15 minutes' and p.status = 'active'
       and coalesce((c.modules -> 'pets' ->> 'enabled')::boolean, false)
       and ((p.kind = 'owned' and exists (select 1 from public.jc_home_members m
                                           where m.user_id = auth.uid() and m.home_id = p.home_id))
            or (p.kind = 'stray' and public.jc_admin_has('pets'))))
  -- PHOTOS: the reporter's own pending upload on their own open report
  or exists (
    select 1 from public.jc_stray_reports r
      join public.jc_communities c on c.id = r.community_id
     where r.pending_photo_path = p_name and r.pending_photo_by = auth.uid() and r.reporter = auth.uid()
       and r.pending_photo_at > now() - interval '15 minutes' and r.state = 'open'
       and coalesce((c.modules -> 'pets' ->> 'enabled')::boolean, false))
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
$$;

create or replace function jc_private.pet_photo_can_read(p_name text) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.jc_pets p
      join public.jc_accounts a on a.user_id = auth.uid() and a.community_id = p.community_id
      join public.jc_communities c on c.id = p.community_id
     where p.status = 'active'
       and coalesce((c.modules -> 'pets' ->> 'enabled')::boolean, false)
       and (p.photo_path = p_name
            or (p.pending_photo_path = p_name and p.pending_photo_by = auth.uid())))
  -- PHOTOS: a report's photo — its reporter or this community's Pets admins; a pending one — its uploader
  or exists (
    select 1 from public.jc_stray_reports r
      join public.jc_accounts a on a.user_id = auth.uid() and a.community_id = r.community_id
      join public.jc_communities c on c.id = r.community_id
     where coalesce((c.modules -> 'pets' ->> 'enabled')::boolean, false)
       -- organizers: only while the reporter is still a member (security 1b M2). Community isolation of the admin
       -- branch rests on the join above: jc_accounts.user_id is the PK (one community per account) and grants are
       -- tied to that account — jc_admin_has has no community check of its own (security 1b L1).
       and ((r.photo_path = p_name
             and (r.reporter = auth.uid()
                  or (public.jc_admin_has('pets')
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
$$;

-- ---------- 3. the cat JSON (internal, no grants) ----------
-- p_full false = the resident view (whitelist below); true = the programme view. A merged cat's own photos and
-- status entries count for the cat it was merged into.
create function public.jc_cat_json(k public.jc_cats, p_full boolean) returns jsonb
language sql stable security definer set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', k.id, 'code', 'C-' || lpad(k.num::text, 3, '0'), 'name', k.name, 'sex', k.sex, 'life_stage', k.life_stage,
    'coat', k.coat, 'confirmed', k.confirmed, 'story', k.story, 'status', k.status, 'ear_tip', k.ear_tip,
    'sterilised', k.sterilised,
    'area', (select a.name from jc_cat_areas a where a.id = k.area_id),
    'photos', coalesce((select jsonb_agg(ph.path order by ph.created_at, ph.path) from jc_pet_photos ph
                         -- db / security review M2: = any(array) keeps jc_pet_photos_cat usable (an OR + subquery can't)
                         where ph.state = 'current'
                           and ph.cat_id = any (array(select k.id union all select m.id from jc_cats m where m.merged_into = k.id))),
                       '[]'::jsonb))
  || case when p_full then jsonb_build_object(
       'old_id', k.old_id, 'area_id', k.area_id, 'station_id', k.station_id,
       'status_on', k.status_on, 'status_source', k.status_source, 'ear_side', k.ear_side,
       'sterilised_source', k.sterilised_source, 'tnvr', k.tnvr, 'tnvr_on', k.tnvr_on, 'tnvr_place', k.tnvr_place,
       'created_at', k.created_at, 'updated_at', k.updated_at,
       'own_photos', coalesce((select jsonb_agg(ph.path order by ph.created_at, ph.path) from jc_pet_photos ph
                                where ph.state = 'current' and ph.cat_id = k.id), '[]'::jsonb),
       'merged_into', (select jsonb_build_object('id', t.id, 'code', 'C-' || lpad(t.num::text, 3, '0'), 'name', t.name)
                         from jc_cats t where t.id = k.merged_into),
       'merged_at', k.merged_at,
       'merged_from', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'code', 'C-' || lpad(m.num::text, 3, '0'),
                                                                    'name', m.name, 'old_id', m.old_id)
                                                 order by m.num)
                                  from jc_cats m where m.merged_into = k.id), '[]'::jsonb),
       'status_log', coalesce((select jsonb_agg(jsonb_build_object('status', l.status, 'on', l.status_on,
                                                                   'source', l.source, 'at', l.logged_at,
                                                                   'code', 'C-' || lpad(c2.num::text, 3, '0'))
                                                order by l.logged_at desc, l.id)
                                 from (select l0.* from jc_cat_status_log l0
                                        where l0.cat_id = any (array(select k.id union all select m.id from jc_cats m where m.merged_into = k.id))
                                        order by l0.logged_at desc, l0.id limit 10) l
                                 join jc_cats c2 on c2.id = l.cat_id), '[]'::jsonb))
     else '{}'::jsonb end;
$$;

-- ---------- 4. residents ----------
create function public.jc_cats_public() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_comm text;
begin
  select o_community into v_comm from jc_me();
  perform jc_module_on(v_comm, 'cats');
  return jsonb_build_object('cats', coalesce((
    select jsonb_agg(jc_cat_json(k, false) order by k.num)
      from jc_cats k where k.community_id = v_comm and k.merged_into is null), '[]'::jsonb));
end;
$$;

-- ---------- 5. programme (coordinators, volunteers, community admins) ----------
create function public.jc_cat_register() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_comm text; v_coord boolean;
begin
  v_comm := jc_cat_reader();
  v_coord := jc_admin_has('cats');
  return jsonb_build_object(
    'can_edit', v_coord,
    'cats', coalesce((
      select jsonb_agg(jc_cat_json(k, true) order by k.merged_into is not null, k.num)
        from jc_cats k where k.community_id = v_comm and (v_coord or k.merged_into is null)), '[]'::jsonb));
end;
$$;

-- ---------- 6. coordinator writes ----------
-- p_cat null = a new cat. p_fields keys (each optional on edit; a new cat needs name or coat):
--   name, old_id, coat, story, status_source, sterilised_source, tnvr_place (string | null), sex, life_stage, status,
--   ear_tip, sterilised, tnvr (one of the listed values), ear_side ('left' | 'right' | null; only with ear_tip present),
--   status_on, tnvr_on ('YYYY-MM-DD' | null, not in the future), area_id, station_id (uuid | null), confirmed (bool).
--   A status, status date or status source change adds a status entry. A station must be active and, when an area is
--   set, in that area.
create function public.jc_cat_save(p_cat uuid, p_fields jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_comm text; v_id uuid := p_cat; k public.jc_cats%rowtype; v_num int; v_n int; i int;
        v_area uuid; v_station uuid; v_son date; v_ton date; v_key text;
        v_text text[] := array['name', 'old_id', 'coat', 'story', 'status_source', 'sterilised_source', 'tnvr_place'];
        v_lim  int[]  := array[40, 40, 120, 1000, 120, 120, 120];
begin
  v_comm := jc_assert_admin('cats');
  perform jc_module_on(v_comm, 'cats');
  if jsonb_typeof(p_fields) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(case when jsonb_typeof(p_fields) = 'object' then p_fields else '{}' end) x
                 where x not in ('name', 'old_id', 'coat', 'story', 'status_source', 'sterilised_source', 'tnvr_place',
                                 'sex', 'life_stage', 'status', 'ear_tip', 'ear_side', 'sterilised', 'tnvr',
                                 'status_on', 'tnvr_on', 'area_id', 'station_id', 'confirmed'))
     or (p_fields ? 'sex' and coalesce(p_fields ->> 'sex', '') not in ('female', 'male', 'unknown'))
     or (p_fields ? 'life_stage' and coalesce(p_fields ->> 'life_stage', '') not in ('kitten', 'adult', 'senior', 'unknown'))
     or (p_fields ? 'status' and coalesce(p_fields ->> 'status', '') not in
          ('community', 'clinic', 'foster', 'adopted', 'transferred', 'missing', 'deceased', 'unknown'))
     or (p_fields ? 'ear_tip' and coalesce(p_fields ->> 'ear_tip', '') not in ('present', 'absent', 'unclear'))
     or (p_fields ? 'sterilised' and coalesce(p_fields ->> 'sterilised', '') not in ('yes', 'no', 'unknown'))
     or (p_fields ? 'tnvr' and coalesce(p_fields ->> 'tnvr', '') not in ('none', 'needed', 'booked', 'captured', 'clinic', 'returned'))
     or (p_fields ? 'ear_side' and jsonb_typeof(p_fields -> 'ear_side') <> 'null' and coalesce(p_fields ->> 'ear_side', '') not in ('left', 'right'))
     or (p_fields ? 'confirmed' and jsonb_typeof(p_fields -> 'confirmed') <> 'boolean')
     or exists (select 1 from unnest(array['status_on', 'tnvr_on', 'area_id', 'station_id']) f
                 where p_fields ? f and jsonb_typeof(p_fields -> f) not in ('string', 'null'))
     -- dates strictly YYYY-MM-DD (Postgres would also take 'yesterday', 'epoch' …)
     or exists (select 1 from unnest(array['status_on', 'tnvr_on']) f
                 where jsonb_typeof(p_fields -> f) = 'string' and (p_fields ->> f) !~ '^\d{4}-\d{2}-\d{2}$') then
    raise exception 'BAD_FIELDS';
  end if;
  for i in 1 .. array_length(v_text, 1) loop
    v_key := v_text[i];
    if p_fields ? v_key and (jsonb_typeof(p_fields -> v_key) not in ('string', 'null')
                             or char_length(p_fields ->> v_key) > v_lim[i] * 4
                             or char_length(case when v_key = 'story' then jc_clean_text(p_fields ->> v_key)
                                                 else jc_clean_line(p_fields ->> v_key) end) > v_lim[i]) then
      raise exception 'BAD_FIELDS';
    end if;
  end loop;
  begin
    if p_fields ? 'status_on' then v_son := (p_fields ->> 'status_on')::date; end if;
    if p_fields ? 'tnvr_on' then v_ton := (p_fields ->> 'tnvr_on')::date; end if;
    if p_fields ? 'area_id' then v_area := (p_fields ->> 'area_id')::uuid; end if;
    if p_fields ? 'station_id' then v_station := (p_fields ->> 'station_id')::uuid; end if;
  exception when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
    raise exception 'BAD_FIELDS';
  end;
  if v_son not between date '2000-01-01' and current_date + 1 or v_ton not between date '2000-01-01' and current_date + 1 then
    raise exception 'BAD_FIELDS'; end if;
  if v_id is null then
    perform pg_advisory_xact_lock(hashtext('jc_cat_num'), hashtext(v_comm));
    select count(*) filter (where merged_into is null), coalesce(max(num), 0) + 1 into v_n, v_num
      from jc_cats where community_id = v_comm;
    if v_n >= 2000 or v_num > 9999 then raise exception 'TOO_MANY'; end if;
    begin
      insert into jc_cats (community_id, num, name, coat, created_by, updated_by)
      values (v_comm, v_num, jc_clean_line(p_fields ->> 'name'), jc_clean_line(p_fields ->> 'coat'), auth.uid(), auth.uid())
      returning * into k;
    exception when check_violation or not_null_violation then raise exception 'BAD_FIELDS';
    end;
    v_id := k.id;
  else
    select * into k from jc_cats where id = v_id and community_id = v_comm for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if k.merged_into is not null then raise exception 'MERGED'; end if;
  end if;
  -- a new / changed area or station must be active (shared lock, so it can't be archived meanwhile — db L2); an
  -- unchanged one is fine even if archived since (the editor sends the whole form back)
  if v_area is not null and v_area is distinct from k.area_id then
    perform 1 from jc_cat_areas where id = v_area and community_id = v_comm and archived_at is null for share;
    if not found then raise exception 'BAD_AREA'; end if;
  end if;
  if v_station is not null and v_station is distinct from k.station_id then
    perform 1 from jc_cat_stations where id = v_station and community_id = v_comm and archived_at is null for share;
    if not found then raise exception 'BAD_STATION'; end if;
  end if;

  begin
    update jc_cats set
      name              = case when p_fields ? 'name' then jc_clean_line(p_fields ->> 'name') else name end,
      old_id            = case when p_fields ? 'old_id' then jc_clean_line(p_fields ->> 'old_id') else old_id end,
      coat              = case when p_fields ? 'coat' then jc_clean_line(p_fields ->> 'coat') else coat end,
      story             = case when p_fields ? 'story' then jc_clean_text(p_fields ->> 'story') else story end,
      sex               = coalesce(p_fields ->> 'sex', sex),
      life_stage        = coalesce(p_fields ->> 'life_stage', life_stage),
      status            = coalesce(p_fields ->> 'status', status),
      status_on         = case when p_fields ? 'status_on' then v_son else status_on end,
      status_source     = case when p_fields ? 'status_source' then jc_clean_line(p_fields ->> 'status_source') else status_source end,
      ear_tip           = coalesce(p_fields ->> 'ear_tip', ear_tip),
      -- a side sent with no ear tip is refused (the table CHECK → BAD_FIELDS); a tip changed away drops the old side
      ear_side          = case when p_fields ? 'ear_side' then p_fields ->> 'ear_side'
                               when coalesce(p_fields ->> 'ear_tip', ear_tip) <> 'present' then null else ear_side end,
      sterilised        = coalesce(p_fields ->> 'sterilised', sterilised),
      sterilised_source = case when p_fields ? 'sterilised_source' then jc_clean_line(p_fields ->> 'sterilised_source') else sterilised_source end,
      tnvr              = coalesce(p_fields ->> 'tnvr', tnvr),
      tnvr_on           = case when p_fields ? 'tnvr_on' then v_ton else tnvr_on end,
      tnvr_place        = case when p_fields ? 'tnvr_place' then jc_clean_line(p_fields ->> 'tnvr_place') else tnvr_place end,
      -- no area given but a station: the station's area (db L2: a cat with a station always has an area)
      area_id           = case when p_fields ? 'area_id' and v_area is not null then v_area
                               when (p_fields ? 'area_id' or area_id is null) and v_station is not null
                                 then (select s.area_id from jc_cat_stations s where s.id = v_station)
                               when p_fields ? 'area_id' then null else area_id end,
      station_id        = case when p_fields ? 'station_id' then v_station else station_id end,
      confirmed         = coalesce((p_fields ->> 'confirmed')::boolean, confirmed),
      updated_at        = now(), updated_by = auth.uid()
     where id = v_id;
  exception when check_violation or not_null_violation then raise exception 'BAD_FIELDS';
  end;
  -- the usual station must sit in the usual area — checked when either changes (a station later moved to another
  -- area by CC-2 doesn't block unrelated edits of its cats)
  if exists (select 1 from jc_cats c join jc_cat_stations s on s.id = c.station_id
              where c.id = v_id and s.area_id <> c.area_id
                and (c.area_id is distinct from k.area_id or c.station_id is distinct from k.station_id)) then
    raise exception 'BAD_STATION';
  end if;

  -- the status history: the first entry on create, then one per change of status / date / source
  if p_cat is null or (p_fields ? 'status' and p_fields ->> 'status' <> k.status)
     or (p_fields ? 'status_on' and v_son is distinct from k.status_on)
     or (p_fields ? 'status_source' and jc_clean_line(p_fields ->> 'status_source') is distinct from k.status_source) then
    insert into jc_cat_status_log (cat_id, status, status_on, source, logged_by)
    select id, status, status_on, status_source, auth.uid() from jc_cats where id = v_id;
  end if;

  perform jc_admin_log_add(v_comm, 'cat_save', jsonb_build_object(
    'cat_id', v_id, 'new', p_cat is null, 'fields', (select jsonb_agg(x order by x) from jsonb_object_keys(p_fields) x)));
  return jc_cat_register();
end;
$$;

-- p_from becomes a pointer to p_into (both active cats of this community). Its photos and status entries then show on
-- p_into; cats already merged into p_from are re-pointed to p_into (recorded, so an undo puts them back).
create function public.jc_cat_merge(p_from uuid, p_into uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_comm text; v_moved uuid[];
begin
  v_comm := jc_assert_admin('cats');
  perform jc_module_on(v_comm, 'cats');
  if p_from is null or p_into is null or p_from = p_into then raise exception 'BAD_FIELDS'; end if;
  perform pg_advisory_xact_lock(hashtext('jc_cat_merge'), hashtext(v_comm));
  perform 1 from jc_cats where id in (p_from, p_into) and community_id = v_comm order by id for update;
  if (select count(*) from jc_cats where id in (p_from, p_into) and community_id = v_comm) <> 2 then
    raise exception 'NOT_FOUND'; end if;
  if exists (select 1 from jc_cats where id in (p_from, p_into) and merged_into is not null) then
    raise exception 'MERGED'; end if;
  select coalesce(array_agg(id order by id), '{}') into v_moved from jc_cats where merged_into = p_from;
  update jc_cats set merged_into = p_into where merged_into = p_from;
  update jc_cats set merged_into = p_into, merged_at = now(), updated_at = now(), updated_by = auth.uid() where id = p_from;
  insert into jc_cat_merges (community_id, from_id, into_id, moved, merged_by)
  values (v_comm, p_from, p_into, v_moved, auth.uid());
  perform jc_admin_log_add(v_comm, 'cat_merge', jsonb_build_object('from', p_from, 'into', p_into, 'moved', cardinality(v_moved)));
  return jc_cat_register();
end;
$$;

-- undo the latest merge of p_cat: it becomes a cat of its own again, and the cats it had absorbed come back to it
create function public.jc_cat_unmerge(p_cat uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_comm text; k public.jc_cats%rowtype; m public.jc_cat_merges%rowtype;
begin
  v_comm := jc_assert_admin('cats');
  perform jc_module_on(v_comm, 'cats');
  perform pg_advisory_xact_lock(hashtext('jc_cat_merge'), hashtext(v_comm));
  select * into k from jc_cats where id = p_cat and community_id = v_comm for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if k.merged_into is null then raise exception 'NOT_MERGED'; end if;
  select * into m from jc_cat_merges where from_id = p_cat and undone_at is null order by merged_at desc, id limit 1;
  if not found then raise exception 'NOT_MERGED'; end if;
  -- the absorbed cats followed this one's pointer (re-pointed by later merges too): bring back those still with it
  -- db review M1: only those whose own pointer still comes from this merge (not unmerged + merged again since)
  update jc_cats c set merged_into = p_cat
   where c.id = any (m.moved) and c.merged_into = k.merged_into
     and not exists (select 1 from jc_cat_merges x where x.from_id = c.id and x.undone_at is null and x.merged_at > m.merged_at);
  update jc_cats set merged_into = null, merged_at = null, updated_at = now(), updated_by = auth.uid() where id = p_cat;
  update jc_cat_merges set undone_at = now(), undone_by = auth.uid() where id = m.id;
  perform jc_admin_log_add(v_comm, 'cat_unmerge', jsonb_build_object('cat_id', p_cat, 'from', k.merged_into));
  return jc_cat_register();
end;
$$;

-- photos: step 1 — a fresh path to upload to (within 15 minutes). A cat holds up to 4 of its own photos.
create function public.jc_cat_photo_begin(p_cat uuid, p_ext text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_comm text; k public.jc_cats%rowtype; v_path text;
begin
  v_comm := jc_assert_admin('cats');
  perform jc_module_on(v_comm, 'cats');
  if coalesce(p_ext, '') not in ('jpg', 'png', 'webp') then raise exception 'BAD_FIELDS'; end if;
  select * into k from jc_cats where id = p_cat and community_id = v_comm for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if k.merged_into is not null then raise exception 'MERGED'; end if;
  if (select count(*) from jc_pet_photos where cat_id = k.id and state = 'current') >= 4 then
    raise exception 'TOO_MANY_PHOTOS'; end if;
  if (select count(*) from jc_pet_photos where created_by = auth.uid() and created_at > now() - interval '1 day') >= 20 then
    raise exception 'TOO_MANY_UPLOADS'; end if;
  -- an earlier unfinished upload of mine for this cat is abandoned (the sweep purges it)
  update jc_pet_photos set state = 'retired', retired_at = now()
   where cat_id = k.id and state = 'pending' and created_by = auth.uid();
  v_path := v_comm || '/c/' || k.id || '/' || encode(extensions.gen_random_bytes(12), 'hex') || '.' || p_ext;
  insert into jc_pet_photos (path, community_id, cat_id, created_by) values (v_path, v_comm, k.id, auth.uid());
  return jsonb_build_object('bucket', 'pet-photos', 'path', v_path, 'expires_in_seconds', 900);
end;
$$;

-- step 3 — the uploaded object becomes one of the cat's photos
create function public.jc_cat_photo_commit(p_cat uuid, p_path text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_comm text; k public.jc_cats%rowtype; ph public.jc_pet_photos%rowtype;
begin
  v_comm := jc_assert_admin('cats');
  perform jc_module_on(v_comm, 'cats');
  select * into k from jc_cats where id = p_cat and community_id = v_comm for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if k.merged_into is not null then raise exception 'MERGED'; end if;
  select * into ph from jc_pet_photos where path = p_path and cat_id = k.id and state = 'pending' and created_by = auth.uid();
  if not found then raise exception 'NO_PENDING_PHOTO'; end if;
  if ph.created_at <= now() - interval '15 minutes' then raise exception 'PHOTO_EXPIRED'; end if;
  if (select count(*) from jc_pet_photos where cat_id = k.id and state = 'current') >= 4 then
    raise exception 'TOO_MANY_PHOTOS'; end if;
  if not exists (select 1 from storage.objects o
                  where o.bucket_id = 'pet-photos' and o.name = ph.path
                    and (o.metadata ->> 'size') is not null
                    and o.metadata ->> 'mimetype' in ('image/jpeg', 'image/png', 'image/webp')) then
    raise exception 'PHOTO_MISSING';
  end if;
  update jc_pet_photos set state = 'current' where path = ph.path;
  perform jc_admin_log_add(v_comm, 'cat_photo', jsonb_build_object('cat_id', k.id, 'added', true));
  return jc_cat_register();
end;
$$;

-- a coordinator removes one current photo (a merged cat's photo too, from the cat it was merged into)
create function public.jc_cat_photo_remove(p_path text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_comm text; v_cat uuid;
begin
  v_comm := jc_assert_admin('cats');
  perform jc_module_on(v_comm, 'cats');
  select ph.cat_id into v_cat from jc_pet_photos ph join jc_cats k on k.id = ph.cat_id
   where ph.path = p_path and ph.state = 'current' and k.community_id = v_comm
   for update of ph;
  if not found then raise exception 'NOT_FOUND'; end if;
  update jc_pet_photos set state = 'retired', retired_at = now() where path = p_path;
  perform jc_admin_log_add(v_comm, 'cat_photo', jsonb_build_object('cat_id', v_cat, 'removed', true));
  return jc_cat_register();
end;
$$;

-- ---------- 7. snapshots: + cats (live body + CC-3) ----------
create or replace function public.jc_snapshot_run(p_at timestamptz default now()) returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
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
         'strays', count(*) filter (where p.kind = 'stray'),
         'missing', count(*) filter (where p.missing))
         from jc_pets p where p.community_id = c.id and p.status = 'active')),
    -- CC-3: the cat programme (merged cats are pointers, not cats)
    (c.id, 'cats', v_bucket, (
       select jsonb_build_object(
         'enabled', (c.modules -> 'cats' ->> 'enabled') is not distinct from 'true',
         'cats', count(*),
         'confirmed', count(*) filter (where k.confirmed),
         'stations', (select count(*) from jc_cat_stations s where s.community_id = c.id and s.archived_at is null))
         from jc_cats k where k.community_id = c.id and k.merged_into is null)),
    (c.id, 'traffic', v_bucket, jsonb_build_object(
       'hour', v_bucket - interval '1 hour',
       'pages', coalesce((select jsonb_object_agg(page, count) from jc_hits
                           where community_id = c.id and hour = v_bucket - interval '1 hour'), '{}'::jsonb)))
    on conflict (community_id, module, bucket)
      do update set metrics = excluded.metrics, taken_at = now();
    n := n + 7;                                                                          -- CC-3: 6 → 7
  end loop;
  return n;
end;
$$;

-- ---------- 8. grants ----------
revoke execute on function public.jc_cat_json(public.jc_cats, boolean) from public, anon, authenticated;
revoke execute on function
  public.jc_cats_public(), public.jc_cat_register(), public.jc_cat_save(uuid, jsonb), public.jc_cat_merge(uuid, uuid),
  public.jc_cat_unmerge(uuid), public.jc_cat_photo_begin(uuid, text), public.jc_cat_photo_commit(uuid, text),
  public.jc_cat_photo_remove(text)
from public, anon;
grant execute on function
  public.jc_cats_public(), public.jc_cat_register(), public.jc_cat_save(uuid, jsonb), public.jc_cat_merge(uuid, uuid),
  public.jc_cat_unmerge(uuid), public.jc_cat_photo_begin(uuid, text), public.jc_cat_photo_commit(uuid, text),
  public.jc_cat_photo_remove(text)
to authenticated;
