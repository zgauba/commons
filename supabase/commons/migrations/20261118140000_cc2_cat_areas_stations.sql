-- TARGET PROJECT: JubailCommons (qrpxfssdeeuzmsmlbtbu) — NEVER SignalPost.
-- CC-2 Cats areas + feeding stations (docs/plans/CC-community-cats.md, approved Zee 2026-11-17; ROADMAP "Community Cats").
-- 1. Areas: made by Cats coordinators (not config, not villages). Renamed, archived (never deleted); an area with
--    active stations can't be archived (AREA_IN_USE). Active names unique per community (NAME_TAKEN).
-- 2. Feeding stations: Commons-issued Station ID per community (S-001 …, max + 1 under a per-community lock; stations
--    are never deleted, so a number is never reused), area, pin (required), landmark, access notes, private-location
--    flag, archived. Moving the pin keeps the old spot (+ its landmark and since-date) in jc_cat_station_moves.
-- 3. Lead + regular feeders + backups per station: only people who CURRENTLY hold a Cats role (coordinator 'cats' or
--    volunteer 'cats_vol') in this community; one lead at most. A removed volunteer's rows stay but every read drops
--    them: a row counts only while its person holds a role granted BEFORE the assignment, so someone removed and
--    invited again does not silently reappear (security L4). The station's next save replaces the set.
--    A new station must say whether it is private (no default that fails open — security M1).
-- 4. Two RPC families, never one filtered in the browser (plan premortem #6):
--      residents  jc_cat_places()    PUBLIC stations only, and only the areas that have one: no private station at
--                                    all, no Station ID (gaps in the numbers would hint at private ones — security
--                                    L2 / database M2), no access notes, no people, no history.
--      programme  jc_cat_programme() coordinators, volunteers and community admins: everything, incl. private pins
--                                    (volunteers feed there). Names only — never contacts; a person without a display
--                                    name is shown by masked email to coordinators only; user ids to coordinators only.
--                                    The latest 10 earlier spots per station.
--    Writes (coordinators + community admins): jc_cat_area_save, jc_cat_station_save. Logged without content
--    (station / area id + which fields), so a private location never lands in the admin log.
-- 5. Kill switch: the module flag off → MODULE_OFF from every Cats RPC (reads and writes).
-- 6. Cats switched ON for the test community 'e2e' (plan CC-1 carry-over); Jubail stays off.
-- +4 authenticated fns: jc_cat_places, jc_cat_programme, jc_cat_area_save, jc_cat_station_save.
-- +1 internal (no grants): jc_cat_reader.
-- Rollback: update jc_communities set modules = modules - 'cats' where id = 'e2e'; drop the 5 functions (incl. the
-- internal jc_cat_reader); drop tables
-- jc_cat_station_people, jc_cat_station_moves, jc_cat_stations, jc_cat_areas (in that order). Pre-launch: test data only.

-- ---------- 1. schema ----------
create table public.jc_cat_areas (
  id           uuid primary key default gen_random_uuid(),
  community_id text not null references public.jc_communities(id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 40),
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null
);
create unique index jc_cat_areas_name_uq on public.jc_cat_areas (community_id, lower(name)) where archived_at is null;

create table public.jc_cat_stations (
  id           uuid primary key default gen_random_uuid(),
  community_id text not null references public.jc_communities(id) on delete cascade,
  num          int not null check (num between 1 and 9999),
  area_id      uuid not null references public.jc_cat_areas(id),
  lat          double precision not null check (lat between -90 and 90),
  lng          double precision not null check (lng between -180 and 180),
  landmark     text check (landmark is null or char_length(landmark) between 1 and 120),
  access_notes text check (access_notes is null or char_length(access_notes) between 1 and 400),
  private      boolean not null default false,
  located_at   timestamptz not null default now(),     -- since when the pin is where it is
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  created_by   uuid references auth.users(id) on delete set null,
  updated_at   timestamptz not null default now(),
  updated_by   uuid references auth.users(id) on delete set null,
  unique (community_id, num)
);
create index jc_cat_stations_area_idx on public.jc_cat_stations (area_id);

-- earlier spots of a station (one row per move)
create table public.jc_cat_station_moves (
  id         uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.jc_cat_stations(id) on delete cascade,
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  landmark   text,
  from_at    timestamptz not null,
  until_at   timestamptz not null default now(),
  moved_by   uuid references auth.users(id) on delete set null
);
create index jc_cat_station_moves_station_idx on public.jc_cat_station_moves (station_id, until_at desc);

create table public.jc_cat_station_people (
  station_id uuid not null references public.jc_cat_stations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('lead', 'feeder', 'backup')),
  assigned_at timestamptz not null default clock_timestamp(),
  primary key (station_id, user_id)
);
create unique index jc_cat_station_people_one_lead on public.jc_cat_station_people (station_id) where role = 'lead';
create index jc_cat_station_people_user_idx on public.jc_cat_station_people (user_id);

alter table public.jc_cat_areas enable row level security;
alter table public.jc_cat_stations enable row level security;
alter table public.jc_cat_station_moves enable row level security;
alter table public.jc_cat_station_people enable row level security;
revoke all on table public.jc_cat_areas, public.jc_cat_stations, public.jc_cat_station_moves, public.jc_cat_station_people
  from public, anon, authenticated;

-- ---------- 2. internal helper (no grants) ----------
-- the caller's community when they're in the programme (coordinator, volunteer or community admin) and Cats is on
create function public.jc_cat_reader() returns text
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_comm text;
begin
  select o_community into v_comm from jc_me();
  perform jc_module_on(v_comm, 'cats');
  if not (jc_admin_has('cats') or jc_admin_has('cats_vol')) then raise exception 'NOT_ADMIN'; end if;
  return v_comm;
end;
$$;

-- ---------- 3. residents ----------
-- areas + public stations. Never: a private station (not even its number), access notes, people, history.
create function public.jc_cat_places() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_comm text;
begin
  select o_community into v_comm from jc_me();
  perform jc_module_on(v_comm, 'cats');
  return jsonb_build_object(
    'areas', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'name', a.name) order by lower(a.name), a.id)
        from jc_cat_areas a
       where a.community_id = v_comm and a.archived_at is null
         and exists (select 1 from jc_cat_stations s
                      where s.area_id = a.id and s.archived_at is null and not s.private)), '[]'::jsonb),
    'stations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'area_id', s.area_id,
               'landmark', s.landmark, 'lat', s.lat, 'lng', s.lng) order by s.num)
        from jc_cat_stations s
       where s.community_id = v_comm and s.archived_at is null and not s.private), '[]'::jsonb));
end;
$$;

-- ---------- 4. programme (coordinators, volunteers, community admins) ----------
create function public.jc_cat_programme() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_comm text; v_coord boolean;
begin
  v_comm := jc_cat_reader();
  v_coord := jc_admin_has('cats');                       -- coordinator or community admin
  return jsonb_build_object(
    'can_edit', v_coord,
    'areas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id, 'name', a.name, 'archived', a.archived_at is not null,
               'stations', (select count(*) from jc_cat_stations s where s.area_id = a.id and s.archived_at is null))
             order by a.archived_at is not null, lower(a.name), a.id)
        from jc_cat_areas a
       where a.community_id = v_comm and (v_coord or a.archived_at is null)), '[]'::jsonb),
    'stations', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'code', 'S-' || lpad(s.num::text, 3, '0'), 'area_id', s.area_id,
               'lat', s.lat, 'lng', s.lng, 'landmark', s.landmark, 'access_notes', s.access_notes,
               'private', s.private, 'located_at', s.located_at, 'archived', s.archived_at is not null,
               'people', coalesce((
                 select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                          'user_id', case when v_coord then p.user_id end, 'role', p.role,
                          'name', coalesce(a.display_name, case when v_coord then jc_mask_email(u.email) end)))
                        order by array_position(array['lead', 'feeder', 'backup'], p.role), lower(a.display_name), p.user_id)
                   from jc_cat_station_people p
                   join jc_accounts a on a.user_id = p.user_id
                   join auth.users u on u.id = p.user_id
                  where p.station_id = s.id
                    and exists (select 1 from jc_module_admins ma
                                 where ma.user_id = p.user_id and ma.community_id = v_comm
                                   and ma.scope in ('cats', 'cats_vol') and ma.granted_at <= p.assigned_at)), '[]'::jsonb),
               'moves', coalesce((
                 select jsonb_agg(jsonb_build_object('lat', m.lat, 'lng', m.lng, 'landmark', m.landmark,
                                                     'from', m.from_at, 'until', m.until_at)
                                  order by m.until_at desc, m.id)
                   from (select * from jc_cat_station_moves m0 where m0.station_id = s.id
                          order by m0.until_at desc, m0.id limit 10) m), '[]'::jsonb))
             order by s.num)
        from jc_cat_stations s
       where s.community_id = v_comm and (v_coord or s.archived_at is null)), '[]'::jsonb),
    -- the people picker (coordinators only): everyone holding a Cats role here
    'people', case when v_coord then coalesce((
      select jsonb_agg(jsonb_build_object(
               'user_id', x.user_id, 'scope', x.scope,
               'name', coalesce(a.display_name, jc_mask_email(u.email)))
             order by lower(coalesce(a.display_name, u.email)), x.user_id)
        from (select ma.user_id, min(ma.scope) as scope                     -- 'cats' < 'cats_vol'
                from jc_module_admins ma
               where ma.community_id = v_comm and ma.scope in ('cats', 'cats_vol')
               group by ma.user_id) x
        join jc_accounts a on a.user_id = x.user_id
        join auth.users u on u.id = x.user_id), '[]'::jsonb) else '[]'::jsonb end);
end;
$$;

-- ---------- 5. coordinator writes ----------
-- p_area null = new area (p_name required). p_archived: null = unchanged, true = archive, false = restore.
create function public.jc_cat_area_save(p_area uuid, p_name text, p_archived boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_comm text; v_name text := jc_clean_line(p_name); v_id uuid := p_area; v_new boolean := p_area is null;
begin
  v_comm := jc_assert_admin('cats');
  perform jc_module_on(v_comm, 'cats');
  if char_length(p_name) > 200 or char_length(v_name) > 40 or (v_new and (v_name is null or p_archived)) then
    raise exception 'BAD_FIELDS';
  end if;
  begin
    if v_new then
      perform pg_advisory_xact_lock(hashtext('jc_cat_area'), hashtext(v_comm));
      if (select count(*) from jc_cat_areas where community_id = v_comm and archived_at is null) >= 50 then
        raise exception 'TOO_MANY'; end if;
      insert into jc_cat_areas (community_id, name, created_by) values (v_comm, v_name, auth.uid()) returning id into v_id;
    else
      perform 1 from jc_cat_areas where id = v_id and community_id = v_comm for update;
      if not found then raise exception 'NOT_FOUND'; end if;
      if p_archived and exists (select 1 from jc_cat_stations where area_id = v_id and archived_at is null) then
        raise exception 'AREA_IN_USE';
      end if;
      update jc_cat_areas set
        name = coalesce(v_name, name),
        archived_at = case when p_archived is null then archived_at when p_archived then coalesce(archived_at, now()) end
       where id = v_id;
    end if;
  exception when unique_violation then raise exception 'NAME_TAKEN';
            when check_violation or not_null_violation then raise exception 'BAD_FIELDS';
  end;
  perform jc_admin_log_add(v_comm, 'cat_area_save', jsonb_strip_nulls(jsonb_build_object(
    'area_id', v_id, 'new', v_new, 'renamed', (not v_new and v_name is not null), 'archived', p_archived)));
  return jc_cat_programme();
end;
$$;

-- p_station null = new station (area_id + lat/lng required). p_fields keys (each optional on edit):
--   area_id (uuid of an active area), lat + lng (numbers, together; a change keeps the old spot in the history),
--   landmark (string ≤ 120 | null), access_notes (string ≤ 400 | null), private (bool), archived (bool),
--   people ([{user_id, role: lead|feeder|backup}] ≤ 20, replaces the set; current Cats role holders only, one lead).
create function public.jc_cat_station_save(p_station uuid, p_fields jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_comm text; v_id uuid := p_station; s public.jc_cat_stations%rowtype; v_area uuid; v_num int;
        v_lat double precision; v_lng double precision; v_moved boolean := false; v_n int; v_d int; v_l int;
begin
  v_comm := jc_assert_admin('cats');
  perform jc_module_on(v_comm, 'cats');
  if jsonb_typeof(p_fields) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(case when jsonb_typeof(p_fields) = 'object' then p_fields else '{}' end) k
                 where k not in ('area_id', 'lat', 'lng', 'landmark', 'access_notes', 'private', 'archived', 'people'))
     or (p_fields ? 'lat') <> (p_fields ? 'lng')
     or (p_fields ? 'lat' and (jsonb_typeof(p_fields -> 'lat') <> 'number' or jsonb_typeof(p_fields -> 'lng') <> 'number'))
     or (p_fields ? 'area_id' and jsonb_typeof(p_fields -> 'area_id') <> 'string')
     or (p_fields ? 'landmark' and jsonb_typeof(p_fields -> 'landmark') not in ('string', 'null'))
     or (p_fields ? 'access_notes' and jsonb_typeof(p_fields -> 'access_notes') not in ('string', 'null'))
     or (p_fields ? 'private' and jsonb_typeof(p_fields -> 'private') <> 'boolean')
     or (p_fields ? 'archived' and jsonb_typeof(p_fields -> 'archived') <> 'boolean')
     or (p_fields ? 'people' and case when jsonb_typeof(p_fields -> 'people') = 'array'
                                      then jsonb_array_length(p_fields -> 'people') > 20 else true end)
     or char_length(p_fields ->> 'landmark') > 400 or char_length(p_fields ->> 'access_notes') > 2000
     or char_length(jc_clean_line(p_fields ->> 'landmark')) > 120
     or char_length(jc_clean_text(p_fields ->> 'access_notes')) > 400 then
    raise exception 'BAD_FIELDS';
  end if;

  begin
    if p_fields ? 'lat' then v_lat := (p_fields ->> 'lat')::double precision; v_lng := (p_fields ->> 'lng')::double precision; end if;
    if p_fields ? 'area_id' then v_area := (p_fields ->> 'area_id')::uuid; end if;
  exception when invalid_text_representation or numeric_value_out_of_range then raise exception 'BAD_FIELDS';
  end;
  if v_lat not between -90 and 90 or v_lng not between -180 and 180 then raise exception 'BAD_FIELDS'; end if;
  if v_area is not null then
    -- shared lock: an area can't be archived while a station is being put in it
    perform 1 from jc_cat_areas where id = v_area and community_id = v_comm and archived_at is null for share;
    if not found then raise exception 'BAD_AREA'; end if;
  end if;

  if p_fields ? 'people' then
    if exists (select 1 from jsonb_array_elements(p_fields -> 'people') e
                where jsonb_typeof(e) is distinct from 'object'
                   or exists (select 1 from jsonb_object_keys(case when jsonb_typeof(e) = 'object' then e else '{}' end) k
                               where k not in ('user_id', 'role'))
                   or jsonb_typeof(e -> 'user_id') is distinct from 'string'
                   or coalesce(e ->> 'role', '') not in ('lead', 'feeder', 'backup')) then
      raise exception 'BAD_FIELDS';
    end if;
    begin
      select count(*), count(distinct (e ->> 'user_id')::uuid), count(*) filter (where e ->> 'role' = 'lead')
        into v_n, v_d, v_l from jsonb_array_elements(p_fields -> 'people') e;
    exception when invalid_text_representation then raise exception 'BAD_FIELDS';
    end;
    if v_n <> v_d or v_l > 1 then raise exception 'BAD_FIELDS'; end if;
    if exists (select 1 from jsonb_array_elements(p_fields -> 'people') e
                where not exists (select 1 from jc_module_admins ma
                                   where ma.user_id = (e ->> 'user_id')::uuid and ma.community_id = v_comm
                                     and ma.scope in ('cats', 'cats_vol'))) then
      raise exception 'NOT_VOLUNTEER';
    end if;
  end if;

  if v_id is null then
    -- security M1: the private flag is a required choice on a new station (no fail-open default)
    if v_area is null or v_lat is null or not p_fields ? 'private' or (p_fields -> 'archived') = 'true'::jsonb then
      raise exception 'BAD_FIELDS'; end if;
    perform pg_advisory_xact_lock(hashtext('jc_cat_station_num'), hashtext(v_comm));
    select count(*) filter (where archived_at is null), coalesce(max(num), 0) + 1 into v_n, v_num
      from jc_cat_stations where community_id = v_comm;
    if v_n >= 200 then raise exception 'TOO_MANY'; end if;
    insert into jc_cat_stations (community_id, num, area_id, lat, lng, created_by, updated_by)
    values (v_comm, v_num, v_area, v_lat, v_lng, auth.uid(), auth.uid())
    returning id into v_id;
  else
    select * into s from jc_cat_stations where id = v_id and community_id = v_comm for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    -- database M1: the station's own area too, so a restore / edit can't race an area archive
    perform 1 from jc_cat_areas where id = s.area_id for share;
    if v_lat is not null and (v_lat <> s.lat or v_lng <> s.lng) then
      insert into jc_cat_station_moves (station_id, lat, lng, landmark, from_at, moved_by)
      values (s.id, s.lat, s.lng, s.landmark, s.located_at, auth.uid());
      v_moved := true;
    end if;
  end if;

  begin
    update jc_cat_stations set
      area_id      = coalesce(v_area, area_id),
      lat          = coalesce(v_lat, lat),
      lng          = coalesce(v_lng, lng),
      located_at   = case when v_moved then now() else located_at end,
      landmark     = case when p_fields ? 'landmark' then jc_clean_line(p_fields ->> 'landmark') else landmark end,
      access_notes = case when p_fields ? 'access_notes' then jc_clean_text(p_fields ->> 'access_notes') else access_notes end,
      private      = coalesce((p_fields ->> 'private')::boolean, private),
      archived_at  = case when not p_fields ? 'archived' then archived_at
                          when (p_fields ->> 'archived')::boolean then coalesce(archived_at, now()) end,
      updated_at   = now(), updated_by = auth.uid()
     where id = v_id;
  exception when check_violation or not_null_violation then raise exception 'BAD_FIELDS';
  end;
  -- a restored station can't sit in an archived area
  if exists (select 1 from jc_cat_stations st join jc_cat_areas a on a.id = st.area_id
              where st.id = v_id and st.archived_at is null and a.archived_at is not null) then
    raise exception 'BAD_AREA';
  end if;

  if p_fields ? 'people' then
    delete from jc_cat_station_people where station_id = v_id;
    insert into jc_cat_station_people (station_id, user_id, role)
    select v_id, (e ->> 'user_id')::uuid, e ->> 'role' from jsonb_array_elements(p_fields -> 'people') e;
  end if;

  -- never the content (a private spot must not land in the log): which station, which fields, moved or not
  perform jc_admin_log_add(v_comm, 'cat_station_save', jsonb_build_object(
    'station_id', v_id, 'new', p_station is null, 'moved', v_moved,
    'fields', (select jsonb_agg(k order by k) from jsonb_object_keys(p_fields) k)));
  return jc_cat_programme();
end;
$$;

-- ---------- 6. grants ----------
revoke execute on function public.jc_cat_reader() from public, anon, authenticated;
revoke execute on function
  public.jc_cat_places(), public.jc_cat_programme(),
  public.jc_cat_area_save(uuid, text, boolean), public.jc_cat_station_save(uuid, jsonb)
from public, anon;
grant execute on function
  public.jc_cat_places(), public.jc_cat_programme(),
  public.jc_cat_area_save(uuid, text, boolean), public.jc_cat_station_save(uuid, jsonb)
to authenticated;

-- ---------- 7. the test community gets Cats (plan CC-1 carry-over); Jubail stays off ----------
update public.jc_communities set modules = modules || '{"cats": {"enabled": true}}'::jsonb where id = 'e2e';
