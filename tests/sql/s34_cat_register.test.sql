-- CC-3 — Cats register.
-- Done-when checks (docs/plans/CC-community-cats.md, CC-3):
--   D1 coordinators add cats: Cat ID C-001… (never reused, merges included), every register field saved; a new cat
--      needs a name or a coat description                                                                → CR01
--   D2 edits: provisional → confirmed; usual station inside the usual area; ear side only with an ear tip;
--      every status change kept with its date and source                                                  → CR02
--   D3 merge keeps history: the merged cat becomes a pointer, its photos + status entries show on the
--      surviving cat, cats merged into it follow; undo puts everything back                               → CR03
--   D4 several photos per cat (up to 4): begin → upload → commit, remove; storage rules: residents of the
--      community read current photos, never pending ones or another community's; only the coordinator who
--      began an upload can write it                                                                       → CR04
--   D5 residents see the resident view only: never the old ID, station, TNVR, dates, sources, history or
--      merged cats                                                                                         → CR05
--   D6 volunteers read the register (no merged cats) but can't edit; residents / Pets admins can't read it → CR06
--   D7 module off = MODULE_OFF from every Cats RPC; photos unreadable                                      → CR07
--   D8 bad input refused; the admin log holds no content; the hourly snapshot counts cats                 → CR08
--   D9 review negatives: unmerge after re-merge (db M1), retention / purge leave cat photos alone, storage
--      rules for Pets admins / other coordinators / merged cats / module off, cross-community refusals,
--      clearing + archived stations, the ledger's one-owner rule                                          → CR09
-- Own communities (testville34, testville34b) — never jubail. Run via tests/sql/build_dryrun.sh (rolls back).

do $t$
declare
  c1 uuid := '00000000-0000-4000-8000-000000003401';  -- community admin (community code)
  co uuid := '00000000-0000-4000-8000-000000003402';  -- Cats coordinator by invite
  vo uuid := '00000000-0000-4000-8000-000000003403';  -- Cats volunteer by invite
  pa uuid := '00000000-0000-4000-8000-000000003404';  -- Pets admin by invite
  r2 uuid := '00000000-0000-4000-8000-000000003405';  -- resident
  ob uuid := '00000000-0000-4000-8000-000000003406';  -- coordinator-level admin of ANOTHER community
  v jsonb; x jsonb; k int := 0; msg text; s text; tok text; n int;
  v_meta jsonb := '{"size": 52000, "mimetype": "image/jpeg"}';
  a_souk uuid; a_seef uuid; st_souk uuid; st_seef uuid;
  cat1 uuid; cat2 uuid; cat3 uuid; cat4 uuid; p1 text; p2 text; p3 text; pp text; pb text;
begin
  execute $f$create function pg_temp.s34_as(u uuid) returns void language sql as
    $b$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $b$$f$;
  execute $f$create function pg_temp.s34_err(q text) returns text language plpgsql as
    $b$ begin execute q; return null; exception when others then return sqlerrm; end $b$$f$;
  execute $f$create function pg_temp.s34_cat(d jsonb, id uuid) returns jsonb language sql as
    $b$ select x from jsonb_array_elements(d -> 'cats') x where (x ->> 'id')::uuid = id $b$$f$;
  execute 'grant execute on function pg_temp.s34_as(uuid), pg_temp.s34_err(text), pg_temp.s34_cat(jsonb, uuid) to authenticated';

  -- ---------- fixtures (as postgres) ----------
  insert into auth.users (id, email) values (c1, 'c1@s34.test'), (co, 'co@s34.test'), (vo, 'vo@s34.test'),
    (pa, 'pa@s34.test'), (r2, 'r2@s34.test'), (ob, 'ob@s34.test');
  insert into jc_communities (id, name_en, map_lat, map_lng, modules) values
    ('testville34', 'Testville 34', 24.53, 54.43, '{"pets": {"enabled": true}, "cats": {"enabled": true}}'),
    ('testville34b', 'Testville 34b', 24.53, 54.43, '{"pets": {"enabled": true}, "cats": {"enabled": true}}');
  insert into jc_villages (community_id, key, name_en) values ('testville34', 'north', 'North'), ('testville34b', 'north', 'North');
  perform jc_code_set('testville34', 'join', 'S34-JOIN-CODE-01');
  perform jc_code_set('testville34', 'community', 'S34-COMMUNITY-01');
  perform jc_code_set('testville34b', 'join', 'S34-JOIN-CODE-02');
  perform jc_code_set('testville34b', 'community', 'S34-COMMUNITY-02');

  execute 'set local role authenticated';
  perform pg_temp.s34_as(c1); perform jc_join('testville34', 'S34-JOIN-CODE-01'); perform jc_admin_unlock('S34-COMMUNITY-01');
  perform pg_temp.s34_as(ob); perform jc_join('testville34b', 'S34-JOIN-CODE-02'); perform jc_admin_unlock('S34-COMMUNITY-02');
  foreach s in array array[co::text, vo::text, pa::text, r2::text] loop
    perform pg_temp.s34_as(s::uuid); perform jc_join('testville34', 'S34-JOIN-CODE-01');
  end loop;
  foreach s in array array['cats:' || co, 'cats_vol:' || vo, 'pets:' || pa] loop
    perform pg_temp.s34_as(c1);
    tok := jc_module_admin_link_create(split_part(s, ':', 1)) ->> 'token';
    perform pg_temp.s34_as(split_part(s, ':', 2)::uuid);
    perform jc_module_admin_accept(tok);
  end loop;
  perform pg_temp.s34_as(co);
  a_souk := (jc_cat_area_save(null, 'Souk', null) #>> '{areas,0,id}')::uuid;
  select (y ->> 'id')::uuid into a_seef from jsonb_array_elements(jc_cat_area_save(null, 'Seef', null) -> 'areas') y where y ->> 'name' = 'Seef';
  st_souk := (jc_cat_station_save(null, jsonb_build_object('area_id', a_souk, 'lat', 24.53, 'lng', 54.43, 'private', false)) #>> '{stations,0,id}')::uuid;
  select (y ->> 'id')::uuid into st_seef from jsonb_array_elements(
    jc_cat_station_save(null, jsonb_build_object('area_id', a_seef, 'lat', 24.54, 'lng', 54.44, 'private', true)) -> 'stations') y
   where (y ->> 'area_id')::uuid = a_seef;

  -- ---------- CR01 add cats: numbers, fields, something to recognise it by ----------
  v := jc_cat_save(null, jsonb_build_object('name', '  Caramel ', 'old_id', 'JB-07', 'sex', 'male', 'life_stage', 'adult',
         'coat', 'Orange tabby, white chin', 'area_id', a_souk, 'station_id', st_souk,
         'story', 'Very gentle, loves cuddles.', 'status', 'community', 'status_on', '2026-11-01', 'status_source', 'Feeder',
         'ear_tip', 'present', 'ear_side', 'left', 'sterilised', 'yes', 'sterilised_source', 'Clinic card',
         'tnvr', 'returned', 'tnvr_on', '2026-10-20', 'tnvr_place', 'Souk station'));
  if v -> 'can_edit' <> 'true'::jsonb or jsonb_array_length(v -> 'cats') <> 1 then raise exception 'FAIL CR01a create: %', v; end if;
  x := v -> 'cats' -> 0; cat1 := (x ->> 'id')::uuid;
  if x ->> 'code' <> 'C-001' or x ->> 'name' <> 'Caramel' or x ->> 'old_id' <> 'JB-07' or x ->> 'sex' <> 'male'
     or x ->> 'coat' <> 'Orange tabby, white chin' or (x ->> 'area_id')::uuid <> a_souk or (x ->> 'station_id')::uuid <> st_souk
     or x ->> 'area' <> 'Souk' or x ->> 'status_on' <> '2026-11-01' or x ->> 'ear_side' <> 'left' or x ->> 'tnvr' <> 'returned'
     or x ->> 'tnvr_place' <> 'Souk station' or x ->> 'sterilised_source' <> 'Clinic card' or (x -> 'confirmed') <> 'false'::jsonb
     or jsonb_array_length(x -> 'status_log') <> 1 or x #>> '{status_log,0,source}' <> 'Feeder' then
    raise exception 'FAIL CR01b fields: %', x; end if;
  perform jc_cat_save(null, '{"coat": "Orange, no markings"}');
  select (y ->> 'id')::uuid into cat2 from jsonb_array_elements(jc_cat_register() -> 'cats') y where y ->> 'code' = 'C-002';
  perform pg_temp.s34_as(c1);                                   -- a community admin edits the register too
  select (y ->> 'id')::uuid into cat3 from jsonb_array_elements(jc_cat_save(null, '{"name": "Gwen"}') -> 'cats') y where y ->> 'code' = 'C-003';
  select (y ->> 'id')::uuid into cat4 from jsonb_array_elements(jc_cat_save(null, '{"name": "Gwen", "coat": "Calico"}') -> 'cats') y where y ->> 'code' = 'C-004';
  if cat2 is null or cat3 is null or cat4 is null then raise exception 'FAIL CR01c numbering'; end if;
  if pg_temp.s34_err($q$select jc_cat_save(null, '{"sex": "female"}')$q$) is distinct from 'BAD_FIELDS'
     or pg_temp.s34_err($q$select jc_cat_save(null, '{"name": "  ", "coat": null}')$q$) is distinct from 'BAD_FIELDS' then
    raise exception 'FAIL CR01d a cat with nothing to recognise it by'; end if;
  k := k + 4;

  -- ---------- CR02 edits: confirm, station in area, ear side, status history ----------
  perform pg_temp.s34_as(co);
  v := jc_cat_save(cat2, jsonb_build_object('confirmed', true, 'area_id', a_seef, 'station_id', st_seef, 'name', 'Mango'));
  x := pg_temp.s34_cat(v, cat2);
  if (x -> 'confirmed') <> 'true'::jsonb or x ->> 'name' <> 'Mango' or (x ->> 'station_id')::uuid <> st_seef then
    raise exception 'FAIL CR02a edit: %', x; end if;
  if pg_temp.s34_err(format('select jc_cat_save(%L, %L)', cat2, jsonb_build_object('station_id', st_souk))) is distinct from 'BAD_STATION' then
    raise exception 'FAIL CR02b station outside the usual area'; end if;
  v := jc_cat_save(cat1, '{"ear_tip": "unclear"}');
  if pg_temp.s34_cat(v, cat1) -> 'ear_side' <> 'null'::jsonb then raise exception 'FAIL CR02c ear side kept without a tip'; end if;
  if pg_temp.s34_err(format('select jc_cat_save(%L, %L)', cat1, '{"ear_side": "right"}')) is distinct from 'BAD_FIELDS' then
    raise exception 'FAIL CR02d ear side without a tip'; end if;
  perform jc_cat_save(cat1, '{"status": "clinic", "status_on": "2026-11-10", "status_source": "Vet"}');
  perform jc_cat_save(cat1, '{"story": "Still gentle."}');                     -- no status change → no entry
  v := jc_cat_save(cat1, '{"status": "community", "status_on": "2026-11-15", "status_source": "Lead feeder"}');
  x := pg_temp.s34_cat(v, cat1);
  if jsonb_array_length(x -> 'status_log') <> 3 or x #>> '{status_log,0,status}' <> 'community'
     or x #>> '{status_log,0,on}' <> '2026-11-15' or x #>> '{status_log,1,status}' <> 'clinic'
     or x #>> '{status_log,1,source}' <> 'Vet' then raise exception 'FAIL CR02e status history: %', x -> 'status_log'; end if;
  k := k + 5;

  -- ---------- CR04 photos (before the merge, so the merge test has photos to carry) ----------
  pp := jc_cat_photo_begin(cat1, 'jpg') ->> 'path';
  if pp not like 'testville34/c/' || cat1 || '/%.jpg' then raise exception 'FAIL CR04a path: %', pp; end if;
  if not jc_private.pet_photo_can_write(pp) then raise exception 'FAIL CR04b coordinator can''t write own upload'; end if;
  foreach s in array array[c1::text, vo::text, r2::text, ob::text] loop
    perform pg_temp.s34_as(s::uuid);
    if jc_private.pet_photo_can_write(pp) then raise exception 'FAIL CR04c % writes another''s upload', s; end if;
  end loop;
  perform pg_temp.s34_as(r2);
  if jc_private.pet_photo_can_read(pp) then raise exception 'FAIL CR04d a resident reads a pending photo'; end if;
  perform pg_temp.s34_as(co);
  if pg_temp.s34_err(format('select jc_cat_photo_commit(%L, %L)', cat1, pp)) is distinct from 'PHOTO_MISSING' then
    raise exception 'FAIL CR04e commit without the upload'; end if;
  execute 'reset role';
  insert into storage.objects (bucket_id, name, owner, metadata) values ('pet-photos', pp, co, v_meta);
  execute 'set local role authenticated';
  v := jc_cat_photo_commit(cat1, pp); p1 := pp;
  if pg_temp.s34_cat(v, cat1) -> 'photos' <> jsonb_build_array(p1) then raise exception 'FAIL CR04f commit: %', pg_temp.s34_cat(v, cat1); end if;
  for n in 2 .. 4 loop
    pp := jc_cat_photo_begin(cat1, 'jpg') ->> 'path';
    execute 'reset role';
    insert into storage.objects (bucket_id, name, owner, metadata) values ('pet-photos', pp, co, v_meta);
    execute 'set local role authenticated';
    v := jc_cat_photo_commit(cat1, pp);
    if n = 2 then p2 := pp; end if;
  end loop;
  if jsonb_array_length(pg_temp.s34_cat(v, cat1) -> 'photos') <> 4
     or pg_temp.s34_err(format('select jc_cat_photo_begin(%L, %L)', cat1, 'jpg')) is distinct from 'TOO_MANY_PHOTOS' then
    raise exception 'FAIL CR04g the 4-photo cap'; end if;
  v := jc_cat_photo_remove(p2);
  if jsonb_array_length(pg_temp.s34_cat(v, cat1) -> 'photos') <> 3 or (pg_temp.s34_cat(v, cat1) -> 'photos') ? p2 then
    raise exception 'FAIL CR04h remove'; end if;
  execute 'reset role';
  if (select state from jc_pet_photos where path = p2) <> 'retired' then raise exception 'FAIL CR04h retired in the ledger'; end if;
  if p2 <> all (jc_photo_purge_queue(1000)) then raise exception 'FAIL CR04i a removed photo is not queued for the purge'; end if;
  execute 'set local role authenticated';
  -- cat3 gets one photo (it will be merged into cat4)
  pb := jc_cat_photo_begin(cat3, 'jpg') ->> 'path';
  execute 'reset role';
  insert into storage.objects (bucket_id, name, owner, metadata) values ('pet-photos', pb, co, v_meta);
  execute 'set local role authenticated';
  perform jc_cat_photo_commit(cat3, pb);
  perform pg_temp.s34_as(r2);
  if not jc_private.pet_photo_can_read(p1) then raise exception 'FAIL CR04j a resident can''t read a current photo'; end if;
  if jc_private.pet_photo_can_read(p2) then raise exception 'FAIL CR04k a removed photo is readable'; end if;
  perform pg_temp.s34_as(ob);
  if jc_private.pet_photo_can_read(p1) then raise exception 'FAIL CR04l another community reads a cat photo'; end if;
  perform pg_temp.s34_as(vo);
  if pg_temp.s34_err(format('select jc_cat_photo_begin(%L, %L)', cat1, 'jpg')) is distinct from 'NOT_ADMIN'
     or pg_temp.s34_err(format('select jc_cat_photo_remove(%L)', p1)) is distinct from 'NOT_ADMIN' then
    raise exception 'FAIL CR04m a volunteer changes photos'; end if;
  perform pg_temp.s34_as(ob);
  if pg_temp.s34_err(format('select jc_cat_photo_remove(%L)', p1)) is distinct from 'NOT_FOUND'
     or pg_temp.s34_err(format('select jc_cat_save(%L, %L)', cat1, '{"name": "Mine"}')) is distinct from 'NOT_FOUND' then
    raise exception 'FAIL CR04n another community''s admin reaches this register'; end if;
  k := k + 14;

  -- ---------- CR03 merge keeps history; undo ----------
  perform pg_temp.s34_as(co);
  perform jc_cat_save(cat3, '{"status": "missing", "status_source": "Neighbour"}');
  v := jc_cat_merge(cat3, cat4);                                -- Gwen filed twice: C-003 into C-004
  x := pg_temp.s34_cat(v, cat4);
  if (x -> 'photos') <> jsonb_build_array(pb) or jsonb_array_length(x -> 'own_photos') <> 0
     or not exists (select 1 from jsonb_array_elements(x -> 'status_log') y where y ->> 'source' = 'Neighbour' and y ->> 'code' = 'C-003')
     or x #>> '{merged_from,0,code}' <> 'C-003' then raise exception 'FAIL CR03a survivor carries history: %', x; end if;
  x := pg_temp.s34_cat(v, cat3);
  if x #>> '{merged_into,code}' <> 'C-004' or x ->> 'name' <> 'Gwen' or x ->> 'status' <> 'missing' then
    raise exception 'FAIL CR03b pointer keeps its fields: %', x; end if;
  if (v #>> '{cats,-1,id}')::uuid <> cat3 then raise exception 'FAIL CR03c merged cats listed last'; end if;
  if pg_temp.s34_err(format('select jc_cat_save(%L, %L)', cat3, '{"name": "X"}')) is distinct from 'MERGED'
     or pg_temp.s34_err(format('select jc_cat_merge(%L, %L)', cat1, cat3)) is distinct from 'MERGED'
     or pg_temp.s34_err(format('select jc_cat_photo_begin(%L, %L)', cat3, 'jpg')) is distinct from 'MERGED'
     or pg_temp.s34_err(format('select jc_cat_merge(%L, %L)', cat1, cat1)) is distinct from 'BAD_FIELDS'
     or pg_temp.s34_err(format('select jc_cat_unmerge(%L)', cat4)) is distinct from 'NOT_MERGED' then
    raise exception 'FAIL CR03d merge refusals'; end if;
  -- a chain: C-004 (with C-003 inside) into C-002 → C-003 follows, one level deep
  v := jc_cat_merge(cat4, cat2);
  if (pg_temp.s34_cat(v, cat3) #>> '{merged_into,code}') <> 'C-002' or (pg_temp.s34_cat(v, cat2) -> 'photos') <> jsonb_build_array(pb)
     or jsonb_array_length(pg_temp.s34_cat(v, cat2) -> 'merged_from') <> 2 then
    raise exception 'FAIL CR03e chain re-pointed: %', pg_temp.s34_cat(v, cat2); end if;
  v := jc_cat_unmerge(cat4);                                    -- undo the second: C-004 comes back with C-003 inside
  if pg_temp.s34_cat(v, cat4) -> 'merged_into' <> 'null'::jsonb or (pg_temp.s34_cat(v, cat3) #>> '{merged_into,code}') <> 'C-004'
     or jsonb_array_length(pg_temp.s34_cat(v, cat2) -> 'photos') <> 0 then
    raise exception 'FAIL CR03f undo restores the absorbed cat: %', v; end if;
  v := jc_cat_unmerge(cat3);
  if pg_temp.s34_cat(v, cat3) -> 'merged_into' <> 'null'::jsonb or (pg_temp.s34_cat(v, cat3) -> 'photos') <> jsonb_build_array(pb)
     or jsonb_array_length(pg_temp.s34_cat(v, cat4) -> 'merged_from') <> 0 then
    raise exception 'FAIL CR03g undo the first: %', v; end if;
  v := jc_cat_merge(cat3, cat4);                                -- merged again for the views below
  -- numbers never reused: a new cat after merges is C-005
  if (select y ->> 'code' from jsonb_array_elements(jc_cat_save(null, '{"name": "Pepper"}') -> 'cats') y
       where y ->> 'name' = 'Pepper') <> 'C-005' then raise exception 'FAIL CR03h numbers reused'; end if;
  k := k + 8;

  -- ---------- CR05 residents: the resident view only ----------
  perform pg_temp.s34_as(r2);
  v := jc_cats_public();
  -- (a merged cat's photo path still names its own folder: harmless, so the check is on the cat entries)
  if jsonb_array_length(v -> 'cats') <> 4 or exists (select 1 from jsonb_array_elements(v -> 'cats') y where (y ->> 'id')::uuid = cat3) then
    raise exception 'FAIL CR05a merged cat shown to residents: %', v; end if;
  if exists (select 1 from jsonb_array_elements(v -> 'cats') y, jsonb_object_keys(y) key
              where key not in ('id', 'code', 'name', 'sex', 'life_stage', 'coat', 'confirmed', 'story', 'status',
                                'ear_tip', 'sterilised', 'area', 'photos',
                                'vaccinated', 'invoices')) then                  -- CC-5
    raise exception 'FAIL CR05b resident keys: %', v; end if;
  if v::text like '%JB-07%' or v::text like '%Clinic card%' or v::text like '%Lead feeder%' or v::text like '%Souk station%'
     or v::text like '%2026-11-15%' or v::text like '%' || st_souk || '%' then
    raise exception 'FAIL CR05c private value reached a resident: %', v; end if;
  x := pg_temp.s34_cat(v, cat4);
  if (x -> 'photos') <> jsonb_build_array(pb) or x ->> 'name' <> 'Gwen' then raise exception 'FAIL CR05d survivor for residents: %', x; end if;
  if pg_temp.s34_err('select jc_cat_register()') is distinct from 'NOT_ADMIN'
     or pg_temp.s34_err($q$select jc_cat_save(null, '{"name": "Mine"}')$q$) is distinct from 'NOT_ADMIN'
     or pg_temp.s34_err(format('select jc_cat_merge(%L, %L)', cat1, cat2)) is distinct from 'NOT_ADMIN' then
    raise exception 'FAIL CR05e resident reaches the register'; end if;
  k := k + 5;

  -- ---------- CR06 volunteers read, can't write; Pets admins can't read ----------
  perform pg_temp.s34_as(vo);
  v := jc_cat_register();
  if v -> 'can_edit' <> 'false'::jsonb or jsonb_array_length(v -> 'cats') <> 4 or v::text like '%"merged_into": {%'
     or pg_temp.s34_cat(v, cat1) ->> 'old_id' <> 'JB-07' then raise exception 'FAIL CR06a volunteer view: %', v; end if;
  if v::text like '%@%' or v::text like '%' || co || '%' or v::text like '%' || c1 || '%' then
    raise exception 'FAIL CR06b user ids / emails in the register'; end if;
  if pg_temp.s34_err(format('select jc_cat_save(%L, %L)', cat1, '{"name": "X"}')) is distinct from 'NOT_ADMIN'
     or pg_temp.s34_err(format('select jc_cat_unmerge(%L)', cat3)) is distinct from 'NOT_ADMIN' then
    raise exception 'FAIL CR06c volunteer writes'; end if;
  perform pg_temp.s34_as(pa);
  if pg_temp.s34_err('select jc_cat_register()') is distinct from 'NOT_ADMIN'
     or pg_temp.s34_err(format('select jc_cat_save(%L, %L)', cat1, '{"name": "X"}')) is distinct from 'NOT_ADMIN' then
    raise exception 'FAIL CR06d Pets admin reaches the register'; end if;
  k := k + 4;

  -- ---------- CR07 module off ----------
  execute 'reset role';
  update jc_communities set modules = modules - 'cats' where id = 'testville34';
  execute 'set local role authenticated';
  foreach s in array array[r2::text, vo::text, co::text] loop
    perform pg_temp.s34_as(s::uuid);
    if pg_temp.s34_err('select jc_cats_public()') is distinct from 'MODULE_OFF'
       or (s <> r2::text and pg_temp.s34_err('select jc_cat_register()') is distinct from 'MODULE_OFF')
       or jc_private.pet_photo_can_read(p1) then
      raise exception 'FAIL CR07a % reads while off', s; end if;
  end loop;
  if pg_temp.s34_err($q$select jc_cat_save(null, '{"name": "Off"}')$q$) is distinct from 'MODULE_OFF'
     or pg_temp.s34_err(format('select jc_cat_merge(%L, %L)', cat1, cat2)) is distinct from 'MODULE_OFF'
     or pg_temp.s34_err(format('select jc_cat_unmerge(%L)', cat3)) is distinct from 'MODULE_OFF'
     or pg_temp.s34_err(format('select jc_cat_photo_begin(%L, %L)', cat1, 'jpg')) is distinct from 'MODULE_OFF'
     or pg_temp.s34_err(format('select jc_cat_photo_commit(%L, %L)', cat1, p1)) is distinct from 'MODULE_OFF'
     or pg_temp.s34_err(format('select jc_cat_photo_remove(%L)', p1)) is distinct from 'MODULE_OFF' then
    raise exception 'FAIL CR07b writes while off'; end if;
  execute 'reset role';
  update jc_communities set modules = modules || '{"cats": {"enabled": true}}' where id = 'testville34';
  execute 'set local role authenticated';
  k := k + 2;

  -- ---------- CR08 bad input; the log holds no content; snapshot ----------
  perform pg_temp.s34_as(co);
  foreach msg in array array[
      '[]', '{"colour": "red"}', '{"sex": "tom"}', '{"life_stage": "baby"}', '{"status": "lost"}', '{"ear_tip": "yes"}',
      '{"sterilised": true}', '{"tnvr": "done"}', '{"confirmed": "yes"}', '{"status_on": "yesterday"}',
      '{"status_on": "2099-01-01"}', '{"tnvr_on": "1999-12-31"}', '{"area_id": "nope"}', '{"station_id": 5}',
      '{"name": 7}', '{"name": "' || repeat('x', 41) || '"}', '{"story": "' || repeat('x', 1001) || '"}',
      '{"coat": "' || repeat('x', 121) || '"}', '{"old_id": "' || repeat('x', 41) || '"}'] loop
    if pg_temp.s34_err(format('select jc_cat_save(%L, %L)', cat1, msg)) is distinct from 'BAD_FIELDS' then
      raise exception 'FAIL CR08a accepted %', left(msg, 60); end if;
  end loop;
  if pg_temp.s34_err(format('select jc_cat_save(%L, %L)', cat1, jsonb_build_object('area_id', gen_random_uuid()))) is distinct from 'BAD_AREA'
     or pg_temp.s34_err(format('select jc_cat_save(%L, %L)', cat1, jsonb_build_object('station_id', gen_random_uuid()))) is distinct from 'BAD_STATION'
     or pg_temp.s34_err(format('select jc_cat_save(%L, %L)', gen_random_uuid(), '{"name": "X"}')) is distinct from 'NOT_FOUND'
     or pg_temp.s34_err(format('select jc_cat_photo_begin(%L, %L)', cat1, 'gif')) is distinct from 'BAD_FIELDS'
     or pg_temp.s34_err(format('select jc_cat_photo_commit(%L, %L)', cat1, 'testville34/c/nope.jpg')) is distinct from 'NO_PENDING_PHOTO' then
    raise exception 'FAIL CR08b refusals'; end if;
  execute 'reset role';
  select count(*) into n from jc_admin_log
   where community_id = 'testville34' and action like 'cat\_%' and action not in ('cat_area_save', 'cat_station_save')
     and (target::text like '%Caramel%' or target::text like '%JB-07%' or target::text like '%gentle%'
          or target::text like '%Clinic%' or target::text like '%Vet%' or target::text like '%testville34/c/%');
  if n <> 0 then raise exception 'FAIL CR08c content in the admin log'; end if;
  if (select count(*) from jc_admin_log where community_id = 'testville34' and action = 'cat_merge') <> 3 then
    raise exception 'FAIL CR08d merges not logged'; end if;
  perform jc_snapshot_run(now());
  v := (select metrics from jc_snapshots where community_id = 'testville34' and module = 'cats' and bucket = date_trunc('hour', now()));
  if (v ->> 'cats')::int <> 4 or (v ->> 'confirmed')::int <> 1 or (v ->> 'stations')::int <> 2 or (v -> 'enabled') <> 'true'::jsonb then
    raise exception 'FAIL CR08e snapshot: %', v; end if;
  k := k + 5;


  -- ---------- CR09 review negatives ----------
  perform pg_temp.s34_as(co);
  declare ca uuid; cb uuid; cc uuid; pq text; pz text;
  begin
    select (y ->> 'id')::uuid into ca from jsonb_array_elements(jc_cat_save(null, '{"name": "S34 A"}') -> 'cats') y where y ->> 'name' = 'S34 A';
    select (y ->> 'id')::uuid into cb from jsonb_array_elements(jc_cat_save(null, '{"name": "S34 B"}') -> 'cats') y where y ->> 'name' = 'S34 B';
    select (y ->> 'id')::uuid into cc from jsonb_array_elements(jc_cat_save(null, '{"name": "S34 C"}') -> 'cats') y where y ->> 'name' = 'S34 C';
    -- db M1: C into A, A into B (C follows), unmerge C, C into B directly, unmerge A → C must stay under B
    perform jc_cat_merge(cc, ca); perform jc_cat_merge(ca, cb); perform jc_cat_unmerge(cc);
    perform jc_cat_merge(cc, cb); v := jc_cat_unmerge(ca);
    if (pg_temp.s34_cat(v, cc) #>> '{merged_into,id}')::uuid is distinct from cb then
      raise exception 'FAIL CR09a unmerge re-pointed a re-merged cat: %', pg_temp.s34_cat(v, cc) -> 'merged_into'; end if;
    if pg_temp.s34_err(format('select jc_cat_merge(%L, %L)', cc, ca)) is distinct from 'MERGED' then
      raise exception 'FAIL CR09b a merged cat merged again (from side)'; end if;
    -- storage rules on a pending upload: Pets admin / another coordinator-level admin; merged cat; 15 minutes; module off
    pq := jc_cat_photo_begin(ca, 'jpg') ->> 'path';
    if not jc_private.pet_photo_can_read(pq) then raise exception 'FAIL CR09c uploader can''t read own pending'; end if;
    perform pg_temp.s34_as(pa);
    if jc_private.pet_photo_can_write(pq) then raise exception 'FAIL CR09d Pets admin writes a cat photo'; end if;
    perform pg_temp.s34_as(c1);
    if jc_private.pet_photo_can_read(pq) then raise exception 'FAIL CR09e another admin reads a pending photo'; end if;
    perform pg_temp.s34_as(co);
    if pg_temp.s34_err(format('select jc_cat_photo_commit(%L, %L)', cb, pq)) is distinct from 'NO_PENDING_PHOTO' then
      raise exception 'FAIL CR09f commit onto another cat'; end if;
    execute 'reset role';
    update jc_communities set modules = modules - 'cats' where id = 'testville34';
    execute 'set local role authenticated';
    if jc_private.pet_photo_can_write(pq) then raise exception 'FAIL CR09g writable while Cats is off'; end if;
    execute 'reset role';
    update jc_communities set modules = modules || '{"cats": {"enabled": true}}' where id = 'testville34';
    update jc_pet_photos set created_at = now() - interval '2 hours' where path = pq;
    if pq <> all (jc_photo_purge_queue(1000)) then raise exception 'FAIL CR09h a stale pending cat photo is not purged'; end if;
    execute 'set local role authenticated';
    if jc_private.pet_photo_can_write(pq) then raise exception 'FAIL CR09i writable after 15 minutes'; end if;
    if pg_temp.s34_err(format('select jc_cat_photo_commit(%L, %L)', ca, pq)) is distinct from 'PHOTO_EXPIRED' then
      raise exception 'FAIL CR09j expired commit'; end if;
    pz := jc_cat_photo_begin(ca, 'jpg') ->> 'path';
    perform jc_cat_merge(ca, cb);
    if jc_private.pet_photo_can_write(pz) then raise exception 'FAIL CR09k writable after the cat was merged'; end if;
    -- another community's admin: merge / unmerge / photos refused as not found
    perform pg_temp.s34_as(ob);
    if pg_temp.s34_err(format('select jc_cat_merge(%L, %L)', cat1, cat2)) is distinct from 'NOT_FOUND'
       or pg_temp.s34_err(format('select jc_cat_unmerge(%L)', cat3)) is distinct from 'NOT_FOUND'
       or pg_temp.s34_err(format('select jc_cat_photo_begin(%L, %L)', cat1, 'jpg')) is distinct from 'NOT_FOUND'
       or pg_temp.s34_err(format('select jc_cat_photo_commit(%L, %L)', cat1, p1)) is distinct from 'NOT_FOUND' then
      raise exception 'FAIL CR09l cross-community merge / photos'; end if;
  end;
  -- stations: clearing keeps the area; an archived station stays on an unchanged edit but can't be newly chosen
  perform pg_temp.s34_as(co);
  v := jc_cat_save(cat1, '{"station_id": null}');
  if pg_temp.s34_cat(v, cat1) -> 'station_id' <> 'null'::jsonb or (pg_temp.s34_cat(v, cat1) ->> 'area_id')::uuid <> a_souk then
    raise exception 'FAIL CR09m clear station: %', pg_temp.s34_cat(v, cat1); end if;
  perform jc_cat_station_save(st_seef, '{"archived": true}');
  if pg_temp.s34_err(format('select jc_cat_save(%L, %L)', cat2, jsonb_build_object('area_id', a_seef, 'station_id', st_seef, 'name', 'Mango'))) is not null
     or pg_temp.s34_err(format('select jc_cat_save(%L, %L)', cat1, jsonb_build_object('area_id', a_seef, 'station_id', st_seef))) is distinct from 'BAD_STATION' then
    raise exception 'FAIL CR09n archived station rules'; end if;
  v := jc_cat_save(cat1, jsonb_build_object('area_id', null, 'station_id', st_souk));
  if (pg_temp.s34_cat(v, cat1) ->> 'area_id')::uuid is distinct from a_souk then raise exception 'FAIL CR09o area from the station'; end if;
  -- retention leaves cat photos alone; the ledger keeps exactly one owner
  execute 'reset role';
  n := (select count(*) from jc_pet_photos where cat_id is not null and state = 'current');
  perform jc_pets_retention();
  if (select count(*) from jc_pet_photos where cat_id is not null and state = 'current') <> n or n < 4 then
    raise exception 'FAIL CR09p retention touched cat photos (% before)', n; end if;
  if pg_temp.s34_err($q$insert into jc_pet_photos (path, community_id) values ('testville34/x/none.jpg', 'testville34')$q$) not like '%jc_pet_photos_owner%' then
    raise exception 'FAIL CR09q a ledger row without an owner'; end if;
  k := k + 17;                                                   -- ends as postgres, like every slice

  perform set_config('jc_test.checks', (coalesce(nullif(current_setting('jc_test.checks', true), ''), '0')::int + k)::text, true);
  raise notice 's34_cat_register: % checks passed', k;
end
$t$;
