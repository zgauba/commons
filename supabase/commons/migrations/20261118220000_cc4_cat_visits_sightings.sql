-- TARGET PROJECT: JubailCommons (qrpxfssdeeuzmsmlbtbu) — NEVER SignalPost.
-- CC-4 Cats visits + sightings (docs/plans/CC-community-cats.md "CC-4 plan"; Zee pre-authorised apply + merge for CC-4,
-- 2026-11-18). Builds on CC-1 … CC-3 (all live). jc_snapshot_run starts from the live body (CC-3) + lines marked "CC-4".
--
-- 1. jc_cat_visits: one feeding visit at a station (date, food / water / cleaned, headcount, unfamiliar cats, kittens,
--    "flag a problem" = problem text, note) + jc_cat_visit_cats (the cats the volunteer recognised). Kept forever.
-- 2. jc_cat_sightings: a dated sighting of a register cat OR of a cat not identified yet (then a description is
--    required); place = a station, or a pin, or just an area. Kept forever (no 30-day purge: jc_pets_retention only
--    touches jc_pet_sightings). A coordinator links an unidentified sighting to a cat later.
--    Both keep logged_name, a copy of the author's display name: a removed volunteer's entries keep their name
--    (plan decision 3). No emails, no user ids in any read.
-- 3. Who: logging = Cats coordinators, Cats volunteers and community admins (jc_cat_reader: cats OR cats_vol OR
--    community — CC-1 security L4). Hide / show again = coordinators, or the author within 24 h. Link = coordinators.
--    Residents get nothing new (jc_cats_public unchanged).
-- 4. Reads: jc_cat_activity(p_station, p_cat, p_kind, p_before, p_before_id) — newest first, 50 a page, keyset cursor
--    on (at, id) (db review M1: ties on "at" are common — backdated visits all sit at 12:00). A cat's history = the cat
--    + the records merged into it (merges re-point nothing, as with status history in CC-3). Hidden entries are
--    returned to coordinators and to their author (security M1 / db L5: an author un-hides only what they hid).
-- 5. Rate limit: new jc_rate bucket 'cat_log', 60 / hour per person across visits + sightings.
-- 6. Kill switch: the module flag off → MODULE_OFF from every new RPC.
-- 7. Snapshots: the 'cats' row gains visits_7d, sightings_7d, problems_7d.
-- +5 authenticated fns: jc_cat_visit_add, jc_cat_sighting_add, jc_cat_activity, jc_cat_log_hide, jc_cat_sighting_link.
-- +1 internal (no grants): jc_cat_log_json.
-- Replaced (signature unchanged): jc_snapshot_run. Widened: jc_rate_bucket_check (+ 'cat_log').
-- Rollback (pre-launch, test data only), in this order: (1) restore jc_snapshot_run from
--   20261118180000_cc3_cat_register; (2) drop the 6 functions; (3) delete from jc_rate where bucket = 'cat_log', restore
--   jc_rate_bucket_check without it; (4) drop tables jc_cat_visit_cats, jc_cat_visits, jc_cat_sightings.

-- ---------- 1. schema ----------
create table public.jc_cat_visits (
  id          uuid primary key default gen_random_uuid(),
  community_id text not null references public.jc_communities(id),
  station_id  uuid not null references public.jc_cat_stations(id),
  visited_on  date not null,
  food        boolean not null default false,
  water       boolean not null default false,
  cleaned     boolean not null default false,
  headcount   int check (headcount between 0 and 200),
  unfamiliar  int check (unfamiliar between 0 and 50),
  kittens     int check (kittens between 0 and 50),
  problem     text check (problem is null or char_length(problem) between 1 and 500),
  note        text check (note is null or char_length(note) between 1 and 500),
  logged_at   timestamptz not null default now(),
  logged_by   uuid references auth.users(id) on delete set null,
  logged_name text check (logged_name is null or char_length(logged_name) <= 80),
  hidden_at   timestamptz,
  hidden_by   uuid references auth.users(id) on delete set null
);
create index jc_cat_visits_comm_idx on public.jc_cat_visits (community_id, visited_on desc, logged_at desc);
create index jc_cat_visits_station_idx on public.jc_cat_visits (station_id, visited_on desc);

create table public.jc_cat_visit_cats (
  visit_id uuid not null references public.jc_cat_visits(id) on delete cascade,
  cat_id   uuid not null references public.jc_cats(id),
  primary key (visit_id, cat_id)
);
create index jc_cat_visit_cats_cat_idx on public.jc_cat_visit_cats (cat_id);

create table public.jc_cat_sightings (
  id          uuid primary key default gen_random_uuid(),
  community_id text not null references public.jc_communities(id),
  cat_id      uuid references public.jc_cats(id),
  description text check (description is null or char_length(description) between 1 and 200),
  seen_at     timestamptz not null,
  station_id  uuid references public.jc_cat_stations(id),
  area_id     uuid references public.jc_cat_areas(id),
  lat         double precision check (lat between -90 and 90),
  lng         double precision check (lng between -180 and 180),
  note        text check (note is null or char_length(note) between 1 and 500),
  logged_at   timestamptz not null default now(),
  logged_by   uuid references auth.users(id) on delete set null,
  logged_name text check (logged_name is null or char_length(logged_name) <= 80),
  linked_at   timestamptz,
  linked_by   uuid references auth.users(id) on delete set null,
  hidden_at   timestamptz,
  hidden_by   uuid references auth.users(id) on delete set null,
  check ((lat is null) = (lng is null)),
  check (cat_id is not null or description is not null),
  check (station_id is not null or lat is not null or area_id is not null)
);
create index jc_cat_sightings_comm_idx on public.jc_cat_sightings (community_id, seen_at desc);
create index jc_cat_sightings_cat_idx on public.jc_cat_sightings (cat_id, seen_at desc);
create index jc_cat_sightings_station_idx on public.jc_cat_sightings (station_id);

alter table public.jc_cat_visits enable row level security;
alter table public.jc_cat_visit_cats enable row level security;
alter table public.jc_cat_sightings enable row level security;
revoke all on table public.jc_cat_visits, public.jc_cat_visit_cats, public.jc_cat_sightings from public, anon, authenticated;

alter table public.jc_rate drop constraint jc_rate_bucket_check;
alter table public.jc_rate add constraint jc_rate_bucket_check
  check (bucket = any (array['join', 'admin_unlock', 'feedback', 'pet_archive', 'sighting_hide', 'pet_care_add', 'cat_log']));

-- ---------- 2. internal: one entry as JSON (no user ids, no emails) ----------
-- p_kind 'visit' | 'sighting'; p_coord: the reader is a coordinator; p_me: the reader's user id.
create function public.jc_cat_log_json(p_kind text, p_id uuid, p_coord boolean, p_me uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v public.jc_cat_visits%rowtype; s public.jc_cat_sightings%rowtype; v_tz text; r jsonb;
begin
  if p_kind = 'visit' then
    select * into v from jc_cat_visits where id = p_id;
    select coalesce(tz, 'Asia/Dubai') into v_tz from jc_communities where id = v.community_id;
    select jsonb_build_object(
      'kind', 'visit', 'id', v.id,
      'at', case when v.visited_on = (v.logged_at at time zone v_tz)::date then v.logged_at
                 else (v.visited_on + time '12:00') at time zone v_tz end,
      'visited_on', v.visited_on, 'logged_at', v.logged_at,
      'station', jsonb_build_object('id', st.id, 'code', 'S-' || lpad(st.num::text, 3, '0'), 'landmark', st.landmark,
                                    'area_id', st.area_id),
      'food', v.food, 'water', v.water, 'cleaned', v.cleaned,
      'headcount', v.headcount, 'unfamiliar', v.unfamiliar, 'kittens', v.kittens,
      'problem', v.problem, 'note', v.note, 'by', v.logged_name,
      'mine', v.logged_by is not distinct from p_me and p_me is not null,
      'hidden', v.hidden_at is not null,
      'can_hide', p_coord or (v.logged_by = p_me and v.logged_at > now() - interval '24 hours'
                              and (v.hidden_at is null or v.hidden_by = p_me)),
      'cats', coalesce((
        select jsonb_agg(jsonb_build_object('id', k.id, 'code', 'C-' || lpad(k.num::text, 3, '0'), 'name', k.name)
                         order by k.num)
          from (select distinct coalesce(k0.merged_into, k0.id) as cid
                  from jc_cat_visit_cats vc join jc_cats k0 on k0.id = vc.cat_id
                 where vc.visit_id = v.id) x
          join jc_cats k on k.id = x.cid), '[]'::jsonb))
      into r
      from jc_cat_stations st where st.id = v.station_id;
    return r;
  end if;
  select * into s from jc_cat_sightings where id = p_id;
  return jsonb_build_object(
    'kind', 'sighting', 'id', s.id, 'at', s.seen_at, 'seen_at', s.seen_at, 'logged_at', s.logged_at,
    'cat', (select jsonb_build_object('id', k.id, 'code', 'C-' || lpad(k.num::text, 3, '0'), 'name', k.name)
              from jc_cats k0 join jc_cats k on k.id = coalesce(k0.merged_into, k0.id) where k0.id = s.cat_id),
    'description', s.description,
    'station', (select jsonb_build_object('id', st.id, 'code', 'S-' || lpad(st.num::text, 3, '0'), 'landmark', st.landmark,
                                          'area_id', st.area_id)
                  from jc_cat_stations st where st.id = s.station_id),
    'area_id', s.area_id, 'lat', s.lat, 'lng', s.lng, 'note', s.note, 'by', s.logged_name,
    'linked', s.linked_at is not null,
    'mine', s.logged_by is not distinct from p_me and p_me is not null,
    'hidden', s.hidden_at is not null,
    'can_hide', p_coord or (s.logged_by = p_me and s.logged_at > now() - interval '24 hours'
                            and (s.hidden_at is null or s.hidden_by = p_me)));
end;
$$;

-- ---------- 3. log a feeding visit ----------
-- p_fields keys: visited_on ('YYYY-MM-DD', default today in the community's time zone; not future, ≤ 14 days back),
--   food / water / cleaned (bool), headcount (0–200), unfamiliar / kittens (0–50) (int | null), problem, note
--   (text | null, ≤ 500), cats (array of up to 60 cat ids of this community, not merged). Returns { visit }.
create function public.jc_cat_visit_add(p_station uuid, p_fields jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_comm text; v_tz text; v_today date; v_on date; v_id uuid; v_cats uuid[]; v_problem text; v_note text;
        v_int int[]; v_key text; i int;
begin
  v_comm := jc_cat_reader();
  if jsonb_typeof(p_fields) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(case when jsonb_typeof(p_fields) = 'object' then p_fields else '{}' end) x
                 where x not in ('visited_on', 'food', 'water', 'cleaned', 'headcount', 'unfamiliar', 'kittens',
                                 'problem', 'note', 'cats'))
     or exists (select 1 from unnest(array['food', 'water', 'cleaned']) b
                 where p_fields ? b and jsonb_typeof(p_fields -> b) <> 'boolean')
     or exists (select 1 from unnest(array['problem', 'note', 'visited_on']) t
                 where p_fields ? t and jsonb_typeof(p_fields -> t) not in ('string', 'null'))
     or exists (select 1 from unnest(array['headcount', 'unfamiliar', 'kittens']) t
                 where p_fields ? t and jsonb_typeof(p_fields -> t) not in ('number', 'null'))
     or (p_fields ? 'cats' and jsonb_typeof(p_fields -> 'cats') <> 'array')
     or (jsonb_typeof(p_fields -> 'cats') = 'array' and jsonb_array_length(p_fields -> 'cats') > 200)   -- security L3
     or char_length(p_fields ->> 'problem') > 2000 or char_length(p_fields ->> 'note') > 2000 then
    raise exception 'BAD_FIELDS';
  end if;
  foreach v_key in array array['headcount', 'unfamiliar', 'kittens'] loop
    if jsonb_typeof(p_fields -> v_key) = 'number'
       and ((p_fields ->> v_key)::numeric <> trunc((p_fields ->> v_key)::numeric)
            or (p_fields ->> v_key)::numeric not between 0 and case when v_key = 'headcount' then 200 else 50 end) then
      raise exception 'BAD_COUNT';
    end if;
  end loop;
  if not exists (select 1 from jc_cat_stations where id = p_station and community_id = v_comm and archived_at is null) then
    raise exception 'BAD_STATION';
  end if;
  select coalesce(tz, 'Asia/Dubai') into v_tz from jc_communities where id = v_comm;
  v_today := (now() at time zone v_tz)::date;
  if coalesce(p_fields ->> 'visited_on', '') = '' then v_on := v_today;
  elsif (p_fields ->> 'visited_on') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'BAD_DATE';
  else
    begin v_on := (p_fields ->> 'visited_on')::date; exception when others then raise exception 'BAD_DATE'; end;
  end if;
  if v_on > v_today or v_on < v_today - 14 then raise exception 'BAD_DATE'; end if;
  -- cats: distinct uuids of this community, not merged
  begin
    select coalesce(array_agg(distinct x::uuid), '{}') into v_cats from jsonb_array_elements_text(coalesce(p_fields -> 'cats', '[]')) x;
  exception when others then raise exception 'BAD_CAT';
  end;
  if cardinality(v_cats) > 60 then raise exception 'BAD_CAT'; end if;
  if (select count(*) from jc_cats where id = any (v_cats) and community_id = v_comm and merged_into is null) <> cardinality(v_cats) then
    raise exception 'BAD_CAT';
  end if;
  v_problem := jc_clean_text(p_fields ->> 'problem');
  v_note := jc_clean_text(p_fields ->> 'note');
  if char_length(v_problem) > 500 or char_length(v_note) > 500 then raise exception 'BAD_FIELDS'; end if;
  perform jc_rate_take(auth.uid(), 'cat_log', 60, interval '1 hour');
  insert into jc_cat_visits (community_id, station_id, visited_on, food, water, cleaned, headcount, unfamiliar, kittens,
                             problem, note, logged_by, logged_name)
  values (v_comm, p_station, v_on,
          coalesce((p_fields ->> 'food')::boolean, false), coalesce((p_fields ->> 'water')::boolean, false),
          coalesce((p_fields ->> 'cleaned')::boolean, false),
          (p_fields ->> 'headcount')::numeric::int, (p_fields ->> 'unfamiliar')::numeric::int, (p_fields ->> 'kittens')::numeric::int,  -- review L2: 5.0
          v_problem, v_note, auth.uid(),
          left((select display_name from jc_accounts where user_id = auth.uid()), 80))
  returning id into v_id;
  insert into jc_cat_visit_cats (visit_id, cat_id) select v_id, c from unnest(v_cats) c;
  return jsonb_build_object('visit', jc_cat_log_json('visit', v_id, jc_admin_has('cats'), auth.uid()));
end;
$$;

-- ---------- 4. log a sighting ----------
-- p_fields keys: cat_id (uuid of a register cat, not merged) OR description (≤ 200, required without a cat);
--   seen_at (ISO timestamp, default now; not in the future, ≤ 14 days back); place: station_id (active) or lat + lng
--   or area_id (active) — at least one (a station sets the area); note (≤ 500). Returns { sighting }.
create function public.jc_cat_sighting_add(p_fields jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_comm text; v_cat uuid; v_desc text; v_note text; v_at timestamptz; v_station uuid; v_area uuid;
        v_lat double precision; v_lng double precision; v_id uuid;
begin
  v_comm := jc_cat_reader();
  if jsonb_typeof(p_fields) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(case when jsonb_typeof(p_fields) = 'object' then p_fields else '{}' end) x
                 where x not in ('cat_id', 'description', 'seen_at', 'station_id', 'area_id', 'lat', 'lng', 'note'))
     or exists (select 1 from unnest(array['cat_id', 'description', 'seen_at', 'station_id', 'area_id', 'note']) t
                 where p_fields ? t and jsonb_typeof(p_fields -> t) not in ('string', 'null'))
     or (p_fields ? 'lat') <> (p_fields ? 'lng')
     or (p_fields ? 'lat' and jsonb_typeof(p_fields -> 'lat') <> 'null'
         and (jsonb_typeof(p_fields -> 'lat') <> 'number' or jsonb_typeof(p_fields -> 'lng') <> 'number'))
     or char_length(p_fields ->> 'description') > 1000 or char_length(p_fields ->> 'note') > 2000 then
    raise exception 'BAD_FIELDS';
  end if;
  begin
    v_cat := nullif(p_fields ->> 'cat_id', '')::uuid;
    v_station := nullif(p_fields ->> 'station_id', '')::uuid;
    v_area := nullif(p_fields ->> 'area_id', '')::uuid;
  exception when others then raise exception 'BAD_FIELDS';
  end;
  if v_cat is not null and not exists (select 1 from jc_cats where id = v_cat and community_id = v_comm and merged_into is null) then
    raise exception 'BAD_CAT';
  end if;
  v_desc := jc_clean_line(p_fields ->> 'description');
  v_note := jc_clean_text(p_fields ->> 'note');
  if char_length(v_desc) > 200 or char_length(v_note) > 500 then raise exception 'BAD_FIELDS'; end if;
  if v_cat is null and v_desc is null then raise exception 'NO_CAT'; end if;
  if coalesce(p_fields ->> 'seen_at', '') = '' then v_at := now();
  else
    begin v_at := (p_fields ->> 'seen_at')::timestamptz; exception when others then raise exception 'BAD_DATE'; end;
  end if;
  if v_at > now() + interval '5 minutes' or v_at < now() - interval '14 days' then raise exception 'BAD_DATE'; end if;
  if v_station is not null then
    select area_id into v_area from jc_cat_stations where id = v_station and community_id = v_comm and archived_at is null;
    if not found then raise exception 'BAD_STATION'; end if;
  elsif v_area is not null
        and not exists (select 1 from jc_cat_areas where id = v_area and community_id = v_comm and archived_at is null) then
    raise exception 'BAD_AREA';
  end if;
  if jsonb_typeof(p_fields -> 'lat') = 'number' then
    begin                                                                -- security L2: 1e400
      v_lat := (p_fields ->> 'lat')::double precision; v_lng := (p_fields ->> 'lng')::double precision;
    exception when others then raise exception 'BAD_FIELDS';
    end;
    if v_lat not between -90 and 90 or v_lng not between -180 and 180 then raise exception 'BAD_FIELDS'; end if;
  end if;
  if v_station is null and v_lat is null and v_area is null then raise exception 'NO_PLACE'; end if;
  perform jc_rate_take(auth.uid(), 'cat_log', 60, interval '1 hour');
  insert into jc_cat_sightings (community_id, cat_id, description, seen_at, station_id, area_id, lat, lng, note,
                                logged_by, logged_name)
  values (v_comm, v_cat, v_desc, v_at, v_station, v_area, v_lat, v_lng, v_note, auth.uid(),
          left((select display_name from jc_accounts where user_id = auth.uid()), 80))
  returning id into v_id;
  return jsonb_build_object('sighting', jc_cat_log_json('sighting', v_id, jc_admin_has('cats'), auth.uid()));
end;
$$;

-- ---------- 5. read: the programme's activity ----------
-- p_station: one station's visits + sightings; p_cat: one cat's sightings + the visits that recognised it (the cat +
-- the records merged into it); p_kind: null | 'visit' | 'sighting' | 'problem' (visits with a problem) |
-- 'unidentified' (sightings without a cat); p_before + p_before_id: the page cursor (the last item's "at" string,
-- sent back as received, and its id). 50 a page.
create function public.jc_cat_activity(p_station uuid, p_cat uuid, p_kind text, p_before timestamptz, p_before_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_comm text; v_coord boolean; v_me uuid := auth.uid(); v_tz text; v_cats uuid[]; v_items jsonb; v_n int;
begin
  v_comm := jc_cat_reader();
  v_coord := jc_admin_has('cats');
  if p_kind is not null and p_kind not in ('visit', 'sighting', 'problem', 'unidentified') then raise exception 'BAD_FIELDS'; end if;
  if p_station is not null and not exists (select 1 from jc_cat_stations where id = p_station and community_id = v_comm) then
    raise exception 'NOT_FOUND';
  end if;
  if p_cat is not null then
    if not exists (select 1 from jc_cats where id = p_cat and community_id = v_comm) then raise exception 'NOT_FOUND'; end if;
    select array_agg(id) into v_cats from jc_cats where community_id = v_comm and (id = p_cat or merged_into = p_cat);
  end if;
  select coalesce(tz, 'Asia/Dubai') into v_tz from jc_communities where id = v_comm;
  with e as (
    select 'visit' as kind, v.id,
           case when v.visited_on = (v.logged_at at time zone v_tz)::date then v.logged_at
                else (v.visited_on + time '12:00') at time zone v_tz end as at
      from jc_cat_visits v
     where v.community_id = v_comm and (v_coord or v.hidden_at is null or v.logged_by = v_me)
       and coalesce(p_kind, 'visit') in ('visit', 'problem') and (p_kind is distinct from 'problem' or v.problem is not null)
       and (p_station is null or v.station_id = p_station)
       and (p_cat is null or exists (select 1 from jc_cat_visit_cats vc where vc.visit_id = v.id and vc.cat_id = any (v_cats)))
    union all
    select 'sighting', s.id, s.seen_at
      from jc_cat_sightings s
     where s.community_id = v_comm and (v_coord or s.hidden_at is null or s.logged_by = v_me)
       and coalesce(p_kind, 'sighting') in ('sighting', 'unidentified') and (p_kind is distinct from 'unidentified' or s.cat_id is null)
       and (p_station is null or s.station_id = p_station)
       and (p_cat is null or s.cat_id = any (v_cats))
  ), page as (
    select * from e
     where p_before is null or (e.at, e.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
     order by e.at desc, e.id desc limit 51
  )
  select coalesce(jsonb_agg(jc_cat_log_json(kind, id, v_coord, v_me) order by at desc, id desc) filter (where rn <= 50), '[]'::jsonb),
         count(*)
    into v_items, v_n
    from (select page.*, row_number() over (order by at desc, id desc) rn from page) x;
  return jsonb_build_object('items', v_items, 'more', v_n > 50, 'can_edit', v_coord);
end;
$$;

-- ---------- 6. hide / show again ----------
-- coordinators: any entry; the author: their own, within 24 h of logging it. Logged without content.
create function public.jc_cat_log_hide(p_kind text, p_id uuid, p_hidden boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_comm text; v_coord boolean; v_by uuid; v_at timestamptz; v_hidden timestamptz; v_hid_by uuid;
begin
  v_comm := jc_cat_reader();
  v_coord := jc_admin_has('cats');
  if p_kind is null or p_kind not in ('visit', 'sighting') or p_hidden is null then raise exception 'BAD_FIELDS'; end if;  -- security L4
  if p_kind = 'visit' then
    select logged_by, logged_at, hidden_at, hidden_by into v_by, v_at, v_hidden, v_hid_by from jc_cat_visits where id = p_id and community_id = v_comm for update;
  else
    select logged_by, logged_at, hidden_at, hidden_by into v_by, v_at, v_hidden, v_hid_by from jc_cat_sightings where id = p_id and community_id = v_comm for update;
  end if;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (v_coord or (v_by = auth.uid() and v_at > now() - interval '24 hours')) then raise exception 'NOT_ADMIN'; end if;
  -- security M1: an author never undoes a coordinator's hide
  if not v_coord and not p_hidden and v_hidden is not null and v_hid_by is distinct from auth.uid() then raise exception 'NOT_ADMIN'; end if;
  if p_kind = 'visit' then
    update jc_cat_visits set hidden_at = case when p_hidden then coalesce(hidden_at, now()) end,
                             hidden_by = case when p_hidden then coalesce(hidden_by, auth.uid()) end where id = p_id;
  else
    update jc_cat_sightings set hidden_at = case when p_hidden then coalesce(hidden_at, now()) end,
                                hidden_by = case when p_hidden then coalesce(hidden_by, auth.uid()) end where id = p_id;
  end if;
  if (v_hidden is not null) <> p_hidden then
    perform jc_admin_log_add(v_comm, 'cat_log_hide', jsonb_build_object('kind', p_kind, 'id', p_id, 'hidden', p_hidden));
  end if;
  return jsonb_build_object(p_kind, jc_cat_log_json(p_kind, p_id, v_coord, auth.uid()));
end;
$$;

-- ---------- 7. link a sighting to a cat (coordinators) ----------
-- Only a sighting logged with a description (not identified at the time) is linked / relinked / unlinked (db L6:
-- a sighting logged against a cat keeps it). p_cat null = unlink.
create function public.jc_cat_sighting_link(p_sighting uuid, p_cat uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_comm text; s public.jc_cat_sightings%rowtype;
begin
  perform jc_cat_reader();                                           -- security L1: module first, like the others
  v_comm := jc_assert_admin('cats');
  select * into s from jc_cat_sightings where id = p_sighting and community_id = v_comm for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if s.description is null then raise exception 'NO_CAT'; end if;
  if p_cat is not null and not exists (select 1 from jc_cats where id = p_cat and community_id = v_comm and merged_into is null) then
    raise exception 'BAD_CAT';
  end if;
  update jc_cat_sightings
     set cat_id = p_cat,
         linked_at = case when p_cat is null then null else now() end,
         linked_by = case when p_cat is null then null else auth.uid() end
   where id = p_sighting;
  perform jc_admin_log_add(v_comm, 'cat_sighting_link', jsonb_build_object('id', p_sighting, 'cat_id', p_cat));
  return jsonb_build_object('sighting', jc_cat_log_json('sighting', p_sighting, true, auth.uid()));
end;
$$;

-- ---------- 8. snapshots: the cats row counts the last 7 days' visits, sightings, problems ----------
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
$$;

-- ---------- 9. grants ----------
revoke execute on function public.jc_cat_log_json(text, uuid, boolean, uuid) from public, anon, authenticated;
revoke execute on function
  public.jc_cat_visit_add(uuid, jsonb), public.jc_cat_sighting_add(jsonb),
  public.jc_cat_activity(uuid, uuid, text, timestamptz, uuid), public.jc_cat_log_hide(text, uuid, boolean),
  public.jc_cat_sighting_link(uuid, uuid)
from public, anon;
grant execute on function
  public.jc_cat_visit_add(uuid, jsonb), public.jc_cat_sighting_add(jsonb),
  public.jc_cat_activity(uuid, uuid, text, timestamptz, uuid), public.jc_cat_log_hide(text, uuid, boolean),
  public.jc_cat_sighting_link(uuid, uuid)
to authenticated;
