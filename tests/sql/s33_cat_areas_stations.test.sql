-- CC-2 — Cats areas + feeding stations.
-- Done-when checks (docs/plans/CC-community-cats.md, CC-2):
--   D1 coordinators create, rename, archive / restore areas; names unique; in-use areas can't be archived  → CS01
--   D2 coordinators add + edit stations: Station ID S-001… (never reused), area, pin required, landmark,
--      access notes, private flag, archive / restore                                                       → CS02
--   D3 moving a station keeps its earlier spot (with landmark + dates) in the history                       → CS03
--   D4 lead + feeders + backups: current Cats role holders only, one lead; a removed volunteer drops off    → CS04
--   D5 residents see public stations only: never a private station, access notes, people or history       → CS05
--   D6 volunteers read the programme view (private pins too) but can't edit; residents / Pets admins
--      can't read it; volunteers never see masked emails                                                   → CS06
--   D7 module off = MODULE_OFF from every Cats RPC                                                          → CS07
--   D8 bad input refused; the admin log never holds a station's content                                    → CS08
-- Own community (testville33) — never jubail. Run via tests/sql/build_dryrun.sh (rolls back).

do $t$
declare
  c1 uuid := '00000000-0000-4000-8000-000000003301';  -- community admin (community code)
  co uuid := '00000000-0000-4000-8000-000000003302';  -- Cats coordinator by invite
  vo uuid := '00000000-0000-4000-8000-000000003303';  -- Cats volunteer by invite (display name "Vera")
  v2 uuid := '00000000-0000-4000-8000-000000003304';  -- Cats volunteer, no display name, removed later
  pa uuid := '00000000-0000-4000-8000-000000003305';  -- Pets admin by invite
  r2 uuid := '00000000-0000-4000-8000-000000003306';  -- resident
  v jsonb; k int := 0; msg text; s text; tok text; n int;
  a_souk uuid; a_seef uuid; a_maha uuid; st1 uuid; st2 uuid; st3 uuid;
begin
  execute $f$create function pg_temp.s33_as(u uuid) returns void language sql as
    $b$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $b$$f$;
  execute $f$create function pg_temp.s33_err(q text) returns text language plpgsql as
    $b$ begin execute q; return null; exception when others then return sqlerrm; end $b$$f$;
  execute 'grant execute on function pg_temp.s33_as(uuid), pg_temp.s33_err(text) to authenticated';

  -- ---------- fixtures (as postgres) ----------
  insert into auth.users (id, email) values (c1, 'c1@s33.test'), (co, 'co@s33.test'), (vo, 'vo@s33.test'),
    (v2, 'volunteer.two@s33.test'), (pa, 'pa@s33.test'), (r2, 'r2@s33.test');
  insert into jc_communities (id, name_en, map_lat, map_lng, modules) values
    ('testville33', 'Testville 33', 24.53, 54.43, '{"pets": {"enabled": true}, "cats": {"enabled": true}}');
  insert into jc_villages (community_id, key, name_en) values ('testville33', 'north', 'North');
  perform jc_code_set('testville33', 'join', 'S33-JOIN-CODE-01');
  perform jc_code_set('testville33', 'community', 'S33-COMMUNITY-01');

  execute 'set local role authenticated';
  perform pg_temp.s33_as(c1); perform jc_join('testville33', 'S33-JOIN-CODE-01'); perform jc_admin_unlock('S33-COMMUNITY-01');
  foreach s in array array[co::text, vo::text, v2::text, pa::text, r2::text] loop
    perform pg_temp.s33_as(s::uuid); perform jc_join('testville33', 'S33-JOIN-CODE-01');
  end loop;
  perform pg_temp.s33_as(vo); perform jc_display_name_set('Vera');
  perform pg_temp.s33_as(co); perform jc_display_name_set('Cora');
  foreach s in array array['cats:' || co, 'cats_vol:' || vo, 'cats_vol:' || v2, 'pets:' || pa] loop
    perform pg_temp.s33_as(c1);
    tok := jc_module_admin_link_create(split_part(s, ':', 1)) ->> 'token';
    perform pg_temp.s33_as(split_part(s, ':', 2)::uuid);
    perform jc_module_admin_accept(tok);
  end loop;

  -- ---------- CS01 areas: create, rename, unique names, archive / restore ----------
  perform pg_temp.s33_as(co);
  v := jc_cat_area_save(null, '  Souk ', null);
  if v -> 'can_edit' <> 'true'::jsonb or jsonb_array_length(v -> 'areas') <> 1 or v #>> '{areas,0,name}' <> 'Souk' then
    raise exception 'FAIL CS01a create: %', v; end if;
  a_souk := (v #>> '{areas,0,id}')::uuid;
  select (x ->> 'id')::uuid into a_seef from jsonb_array_elements(jc_cat_area_save(null, 'Seef', null) -> 'areas') x
   where x ->> 'name' = 'Seef';
  perform pg_temp.s33_as(c1);                                  -- a community admin manages the programme too
  v := jc_cat_area_save(null, 'Mahaa', null);
  select (x ->> 'id')::uuid into a_maha from jsonb_array_elements(v -> 'areas') x where x ->> 'name' = 'Mahaa';
  v := jc_cat_area_save(a_maha, 'Maha', null);
  if not exists (select 1 from jsonb_array_elements(v -> 'areas') x where x ->> 'name' = 'Maha') then
    raise exception 'FAIL CS01b rename: %', v; end if;
  if pg_temp.s33_err($q$select jc_cat_area_save(null, 'souk', null)$q$) is distinct from 'NAME_TAKEN'
     or pg_temp.s33_err(format('select jc_cat_area_save(%L, %L, null)', a_seef, 'SOUK')) is distinct from 'NAME_TAKEN' then
    raise exception 'FAIL CS01c names not unique: % / %', pg_temp.s33_err($q$select jc_cat_area_save(null, 'souk', null)$q$),
      pg_temp.s33_err(format('select jc_cat_area_save(%L, %L, null)', a_seef, 'SOUK')); end if;
  v := jc_cat_area_save(a_maha, null, true);
  if not exists (select 1 from jsonb_array_elements(v -> 'areas') x where (x ->> 'id')::uuid = a_maha and (x -> 'archived') = 'true') then
    raise exception 'FAIL CS01d archive: %', v; end if;
  perform jc_cat_area_save(null, 'Maha', null);                -- an archived name is free again …
  if pg_temp.s33_err(format('select jc_cat_area_save(%L, null, false)', a_maha)) is distinct from 'NAME_TAKEN' then
    raise exception 'FAIL CS01e restore over a taken name'; end if;   -- … so restoring the old one clashes
  k := k + 5;

  -- ---------- CS02 stations: numbers, pin required, fields, private flag, archive / restore ----------
  perform pg_temp.s33_as(co);
  v := jc_cat_station_save(null, jsonb_build_object('area_id', a_souk, 'lat', 24.5301, 'lng', 54.4301,
         'landmark', 'Behind the souk', 'access_notes', 'Gate code from the lead', 'private', false));
  st1 := (v #>> '{stations,0,id}')::uuid;
  if v #>> '{stations,0,code}' <> 'S-001' or v #>> '{stations,0,landmark}' <> 'Behind the souk'
     or v #>> '{stations,0,access_notes}' <> 'Gate code from the lead' or (v #>> '{stations,0,lat}')::float8 <> 24.5301 then
    raise exception 'FAIL CS02a create: %', v; end if;
  v := jc_cat_station_save(null, jsonb_build_object('area_id', a_seef, 'lat', 24.54, 'lng', 54.44,
         'landmark', 'A homeowner''s villa', 'private', true));
  st2 := (v #>> '{stations,1,id}')::uuid;
  if v #>> '{stations,1,code}' <> 'S-002' or (v #> '{stations,1,private}') <> 'true'::jsonb then
    raise exception 'FAIL CS02b private station: %', v; end if;
  if pg_temp.s33_err(format('select jc_cat_station_save(null, %L)', jsonb_build_object('area_id', a_souk)))
       is distinct from 'BAD_FIELDS' then raise exception 'FAIL CS02c a station needs a pin'; end if;
  v := jc_cat_station_save(st1, '{"archived": true}');
  if (v #> '{stations,0,archived}') <> 'true'::jsonb then raise exception 'FAIL CS02d archive: %', v; end if;
  if pg_temp.s33_err(format('select jc_cat_station_save(null, %L)', jsonb_build_object('area_id', a_souk, 'lat', 24.53, 'lng', 54.43)))
       is distinct from 'BAD_FIELDS' then raise exception 'FAIL CS02h private must be chosen (security M1)'; end if;
  st3 := (jc_cat_station_save(null, jsonb_build_object('area_id', a_souk, 'lat', 24.53, 'lng', 54.43, 'private', false)) #>> '{stations,2,id}')::uuid;
  v := jc_cat_programme();
  if v #>> '{stations,2,code}' <> 'S-003' then raise exception 'FAIL CS02e numbers never reused: %', v -> 'stations'; end if;
  if pg_temp.s33_err(format('select jc_cat_area_save(%L, null, true)', a_souk)) is distinct from 'AREA_IN_USE' then
    raise exception 'FAIL CS02f area with stations archived'; end if;
  v := jc_cat_station_save(st1, jsonb_build_object('archived', false, 'landmark', null, 'access_notes', '  '));
  if (v #> '{stations,0,archived}') <> 'false'::jsonb or v #> '{stations,0,landmark}' <> 'null'::jsonb
     or v #> '{stations,0,access_notes}' <> 'null'::jsonb then
    raise exception 'FAIL CS02g restore + clear: %', v -> 'stations' -> 0; end if;
  k := k + 8;

  -- ---------- CS03 moving a station keeps the old spot ----------
  v := jc_cat_station_save(st2, '{"lat": 24.5401, "lng": 54.4401, "landmark": "Next door"}');
  select x into v from jsonb_array_elements(v -> 'stations') x where (x ->> 'id')::uuid = st2;
  if jsonb_array_length(v -> 'moves') <> 1 or (v #>> '{moves,0,lat}')::float8 <> 24.54
     or v #>> '{moves,0,landmark}' <> 'A homeowner''s villa' or v ->> 'landmark' <> 'Next door'
     or (v #>> '{moves,0,until}')::timestamptz <> (v ->> 'located_at')::timestamptz then
    raise exception 'FAIL CS03a move kept: %', v; end if;
  v := jc_cat_station_save(st2, '{"lat": 24.5401, "lng": 54.4401, "access_notes": "Ring twice"}');
  select x into v from jsonb_array_elements(v -> 'stations') x where (x ->> 'id')::uuid = st2;
  if jsonb_array_length(v -> 'moves') <> 1 then raise exception 'FAIL CS03b same pin = no move: %', v -> 'moves'; end if;
  k := k + 2;

  -- ---------- CS04 people: Cats role holders only, one lead, a removed volunteer drops off ----------
  v := jc_cat_station_save(st2, jsonb_build_object('people', jsonb_build_array(
         jsonb_build_object('user_id', vo, 'role', 'lead'), jsonb_build_object('user_id', v2, 'role', 'feeder'),
         jsonb_build_object('user_id', co, 'role', 'backup'))));
  select x into v from jsonb_array_elements(v -> 'stations') x where (x ->> 'id')::uuid = st2;
  if jsonb_array_length(v -> 'people') <> 3 or v #>> '{people,0,name}' <> 'Vera' or v #>> '{people,0,role}' <> 'lead'
     or v #>> '{people,1,role}' <> 'feeder' or v #>> '{people,1,name}' is null then
    raise exception 'FAIL CS04a people: %', v -> 'people'; end if;
  if pg_temp.s33_err(format('select jc_cat_station_save(%L, %L)', st2, jsonb_build_object('people', jsonb_build_array(
       jsonb_build_object('user_id', pa, 'role', 'feeder'))))) is distinct from 'NOT_VOLUNTEER'
     or pg_temp.s33_err(format('select jc_cat_station_save(%L, %L)', st2, jsonb_build_object('people', jsonb_build_array(
       jsonb_build_object('user_id', r2, 'role', 'feeder'))))) is distinct from 'NOT_VOLUNTEER' then
    raise exception 'FAIL CS04b a non-volunteer assigned'; end if;
  if pg_temp.s33_err(format('select jc_cat_station_save(%L, %L)', st2, jsonb_build_object('people', jsonb_build_array(
       jsonb_build_object('user_id', vo, 'role', 'lead'), jsonb_build_object('user_id', co, 'role', 'lead'))))) is distinct from 'BAD_FIELDS'
     or pg_temp.s33_err(format('select jc_cat_station_save(%L, %L)', st2, jsonb_build_object('people', jsonb_build_array(
       jsonb_build_object('user_id', vo, 'role', 'feeder'), jsonb_build_object('user_id', vo, 'role', 'backup'))))) is distinct from 'BAD_FIELDS' then
    raise exception 'FAIL CS04c two leads / a person twice'; end if;
  v := jc_cat_programme();
  if (select count(*) from jsonb_array_elements(v -> 'people')) <> 3
     or not exists (select 1 from jsonb_array_elements(v -> 'people') x where (x ->> 'user_id')::uuid = co and x ->> 'scope' = 'cats') then
    raise exception 'FAIL CS04d picker: %', v -> 'people'; end if;
  perform pg_temp.s33_as(c1); perform jc_module_admin_revoke('cats_vol', v2, null);
  v := jc_cat_programme();
  select x into v from jsonb_array_elements(v -> 'stations') x where (x ->> 'id')::uuid = st2;
  if jsonb_array_length(v -> 'people') <> 2 or v::text like '%' || v2 || '%' then
    raise exception 'FAIL CS04e removed volunteer still listed: %', v -> 'people'; end if;
  -- the old assignment predates the new grant (one test transaction shares now(): backdate it, as days pass live)
  execute 'reset role';
  update jc_cat_station_people set assigned_at = now() - interval '1 day' where user_id = v2;
  execute 'set local role authenticated';
  tok := jc_module_admin_link_create('cats_vol') ->> 'token';
  perform pg_temp.s33_as(v2); perform jc_module_admin_accept(tok);
  perform pg_temp.s33_as(c1);
  select x into v from jsonb_array_elements(jc_cat_programme() -> 'stations') x where (x ->> 'id')::uuid = st2;
  if v::text like '%' || v2 || '%' then raise exception 'FAIL CS04f re-invited volunteer reappeared (security L4)'; end if;
  k := k + 6;

  -- ---------- CS05 residents: public stations only, nothing private ----------
  perform pg_temp.s33_as(r2);
  v := jc_cat_places();
  if jsonb_array_length(v -> 'stations') <> 2
     or exists (select 1 from jsonb_array_elements(v -> 'stations') x where (x ->> 'id')::uuid = st2)
     or v::text like '%' || st2 || '%' or v::text like '%Next door%' or v::text like '%24.5401%' then
    raise exception 'FAIL CS05a private station reached a resident: %', v; end if;
  if exists (select 1 from jsonb_array_elements(v -> 'stations') x, jsonb_object_keys(x) key
              where key not in ('id', 'area_id', 'landmark', 'lat', 'lng')) then
    raise exception 'FAIL CS05b resident station keys: %', v -> 'stations'; end if;
  if exists (select 1 from jsonb_array_elements(v -> 'areas') x, jsonb_object_keys(x) key where key not in ('id', 'name'))
     or v -> 'areas' <> jsonb_build_array(jsonb_build_object('id', a_souk, 'name', 'Souk')) then
    raise exception 'FAIL CS05c resident areas: %', v -> 'areas'; end if;
  if pg_temp.s33_err('select jc_cat_programme()') is distinct from 'NOT_ADMIN' then
    raise exception 'FAIL CS05d resident reads the programme'; end if;
  k := k + 4;

  -- ---------- CS06 volunteers read everything active (private pins too), can't edit; Pets admins can't read ----------
  perform pg_temp.s33_as(vo);
  v := jc_cat_programme();
  if v -> 'can_edit' <> 'false'::jsonb or jsonb_array_length(v -> 'people') <> 0
     or not exists (select 1 from jsonb_array_elements(v -> 'stations') x where (x ->> 'id')::uuid = st2 and (x ->> 'lat')::float8 = 24.5401)
     or exists (select 1 from jsonb_array_elements(v -> 'areas') x where (x -> 'archived') = 'true') then
    raise exception 'FAIL CS06a volunteer view: %', v; end if;
  if v::text like '%@%' or v::text like '%' || co || '%' or v::text like '%' || vo || '%' then
    raise exception 'FAIL CS06b volunteer sees an email or a user id: %', v; end if;
  if pg_temp.s33_err(format('select jc_cat_station_save(%L, %L)', st1, '{"private": true}')) is distinct from 'NOT_ADMIN'
     or pg_temp.s33_err($q$select jc_cat_area_save(null, 'Mine', null)$q$) is distinct from 'NOT_ADMIN' then
    raise exception 'FAIL CS06c volunteer edits'; end if;
  perform pg_temp.s33_as(pa);
  if pg_temp.s33_err('select jc_cat_programme()') is distinct from 'NOT_ADMIN'
     or pg_temp.s33_err(format('select jc_cat_station_save(%L, %L)', st1, '{"private": true}')) is distinct from 'NOT_ADMIN' then
    raise exception 'FAIL CS06d Pets admin reaches Cats'; end if;
  k := k + 4;

  -- ---------- CS07 module off: MODULE_OFF everywhere ----------
  execute 'reset role';
  update jc_communities set modules = modules - 'cats' where id = 'testville33';
  execute 'set local role authenticated';
  foreach s in array array[r2::text, vo::text, co::text] loop
    perform pg_temp.s33_as(s::uuid);
    if pg_temp.s33_err('select jc_cat_places()') is distinct from 'MODULE_OFF'
       or (s <> r2::text and pg_temp.s33_err('select jc_cat_programme()') is distinct from 'MODULE_OFF') then
      raise exception 'FAIL CS07a % read while off', s; end if;
  end loop;
  if pg_temp.s33_err($q$select jc_cat_area_save(null, 'Off', null)$q$) is distinct from 'MODULE_OFF'
     or pg_temp.s33_err(format('select jc_cat_station_save(%L, %L)', st1, '{"private": true}')) is distinct from 'MODULE_OFF' then
    raise exception 'FAIL CS07b write while off'; end if;
  execute 'reset role';
  update jc_communities set modules = modules || '{"cats": {"enabled": true}}' where id = 'testville33';
  execute 'set local role authenticated';
  k := k + 2;

  -- ---------- CS08 bad input; the log holds no content ----------
  perform pg_temp.s33_as(co);
  foreach msg in array array[
      '[]', '{"colour": "red"}', '{"lat": 24.5}', '{"lat": "24", "lng": 54}', '{"lat": 91, "lng": 54}',
      '{"private": "yes"}', '{"area_id": "nope"}', '{"people": [{"user_id": "x", "role": "lead"}]}',
      '{"people": [{"user_id": "00000000-0000-4000-8000-000000003303", "role": "boss"}]}',
      '{"people": [{"user_id": "00000000-0000-4000-8000-000000003303"}]}',
      '{"landmark": "' || repeat('x', 121) || '"}', '{"access_notes": "' || repeat('x', 401) || '"}'] loop
    if pg_temp.s33_err(format('select jc_cat_station_save(%L, %L)', st1, msg)) is distinct from 'BAD_FIELDS' then
      raise exception 'FAIL CS08a accepted %', left(msg, 60); end if;
  end loop;
  if pg_temp.s33_err(format('select jc_cat_station_save(%L, %L)', st1, jsonb_build_object('area_id', a_maha))) is distinct from 'BAD_AREA'
     or pg_temp.s33_err(format('select jc_cat_station_save(%L, %L)', st1, jsonb_build_object('area_id', gen_random_uuid()))) is distinct from 'BAD_AREA' then
    raise exception 'FAIL CS08b archived / unknown area'; end if;
  if pg_temp.s33_err(format('select jc_cat_station_save(%L, %L)', gen_random_uuid(), '{"private": true}')) is distinct from 'NOT_FOUND'
     or pg_temp.s33_err(format('select jc_cat_area_save(%L, %L, null)', gen_random_uuid(), 'X')) is distinct from 'NOT_FOUND'
     or pg_temp.s33_err(format('select jc_cat_area_save(null, %L, null)', repeat('x', 41))) is distinct from 'BAD_FIELDS'
     or pg_temp.s33_err('select jc_cat_area_save(null, null, null)') is distinct from 'BAD_FIELDS' then
    raise exception 'FAIL CS08c not found / bad area'; end if;
  execute 'reset role';
  select count(*) into n from jc_admin_log
   where community_id = 'testville33' and action in ('cat_station_save', 'cat_area_save')
     and (target::text like '%villa%' or target::text like '%Next door%' or target::text like '%24.54%'
          or target::text like '%Gate code%' or target::text like '%Ring twice%');
  if n <> 0 then raise exception 'FAIL CS08d content in the admin log'; end if;
  if (select count(*) from jc_admin_log where community_id = 'testville33' and action = 'cat_station_save'
        and (target ->> 'moved')::boolean) <> 1 then raise exception 'FAIL CS08e move not logged'; end if;
  k := k + 5;

  perform set_config('jc_test.checks', (coalesce(nullif(current_setting('jc_test.checks', true), ''), '0')::int + k)::text, true);
  raise notice 's33_cat_areas_stations: % checks passed', k;
end
$t$;
