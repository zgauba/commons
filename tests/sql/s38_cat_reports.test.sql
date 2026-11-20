-- CC-7a — Cats reports queue (stray-cat reports move from Pets to Community Cats).
-- Done-when checks (docs/plans/CC-community-cats.md, CC-7 plan):
--   D1 a resident's report (pin + photo + number) shows in the Cats queue for a coordinator and a community admin with
--      photo, place, home and number; volunteers, Pets admins, residents and other communities get nothing     → RP01
--   D2 "added" → the report's photo becomes the cat's, one sighting at the report's pin and time (nothing the resident
--      typed is copied: no note, no place text); the resident's My reports shows the cat; the log holds ids only         → RP02
--   D3 "known" → linked, one sighting, photo retired (never moved); a retry adds no second sighting; no pin → the
--      cat's usual area; no pin and no area → no sighting                                                       → RP03
--   D4 Cats off → MODULE_OFF (report, My reports, queue); Pets off with Cats on → reporting still works        → RP04
--   D5 refusals (bad outcome / cat, other community's cat, merged cat), photo cap 4, a reporter who left, a merged
--      cat shows its survivor, a closed report can't be closed again (CC-7d: the Organizer Tools close is gone),
--      photo reads by role                                                                                     → RP05
-- Own communities (testville38, testville38b) — never jubail. Run via tests/sql/build_dryrun.sh (rolls back).

do $t$
declare
  c1 uuid := '00000000-0000-4000-8000-000000003801';  -- community admin (community code)
  co uuid := '00000000-0000-4000-8000-000000003802';  -- Cats coordinator by invite
  vo uuid := '00000000-0000-4000-8000-000000003803';  -- Cats volunteer by invite
  pa uuid := '00000000-0000-4000-8000-000000003804';  -- Pets admin by invite
  r1 uuid := '00000000-0000-4000-8000-000000003805';  -- resident (reporter)
  r2 uuid := '00000000-0000-4000-8000-000000003806';  -- resident who leaves
  ob uuid := '00000000-0000-4000-8000-000000003807';  -- coordinator of ANOTHER community
  r3 uuid := '00000000-0000-4000-8000-000000003808';  -- another resident (the 5-a-day cap)
  q1 uuid := '00000000-0000-4000-8000-0000000038a1';  -- pin + photo + number → added
  q2 uuid := '00000000-0000-4000-8000-0000000038a2';  -- pin + photo → known
  q3 uuid := '00000000-0000-4000-8000-0000000038a3';  -- place only → known (cat's area)
  q4 uuid := '00000000-0000-4000-8000-0000000038a4';  -- place only → known (no area: no sighting)
  q5 uuid := '00000000-0000-4000-8000-0000000038a5';  -- not a stray
  q6 uuid := '00000000-0000-4000-8000-0000000038a6';  -- photo, cat already has 4 → not moved
  q7 uuid := '00000000-0000-4000-8000-0000000038a7';  -- reporter leaves → not moved
  q8 uuid := '00000000-0000-4000-8000-0000000038a8';  -- closed not_stray, then a different outcome (CC-7d)
  q9 uuid := '00000000-0000-4000-8000-0000000038a9';  -- RP06: photo, cat has 3 → moved (4)
  q10 uuid := '00000000-0000-4000-8000-0000000038aa'; -- RP06: a pending upload at close
  q11 uuid := '00000000-0000-4000-8000-0000000038ab'; -- RP06: no pin, the cat's area archived
  q12 uuid := '00000000-0000-4000-8000-0000000038ac'; -- RP06: an older dog report
  q13 uuid := '00000000-0000-4000-8000-0000000038ad'; -- RP06: expired
  q14 uuid := '00000000-0000-4000-8000-0000000038ae'; -- RP06: open with a photo (reads by role)
  a2 uuid; cat6 uuid; cat7 uuid;
  v jsonb; x jsonb; k int := 0; s text; tok text; msg text; n int;
  a1 uuid; cat1 uuid; cat2 uuid; cat3 uuid; cat4 uuid; cat5 uuid; cat_b uuid; v_p text; v_p6 text; v_p7 text; v_t timestamptz;
  v_meta jsonb := '{"size": 2048, "mimetype": "image/jpeg"}';
begin
  execute $f$create function pg_temp.s38_as(u uuid) returns void language sql as
    $b$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $b$$f$;
  execute $f$create function pg_temp.s38_err(q text) returns text language plpgsql as
    $b$ begin execute q; return null; exception when others then return sqlerrm; end $b$$f$;
  execute $f$create function pg_temp.s38_ids(d jsonb) returns text[] language sql as
    $b$ select coalesce(array_agg(x ->> 'id' order by ord), '{}') from jsonb_array_elements(d) with ordinality t(x, ord) $b$$f$;
  execute 'grant execute on function pg_temp.s38_as(uuid), pg_temp.s38_err(text), pg_temp.s38_ids(jsonb) to authenticated';

  -- ---------- fixtures (as postgres) ----------
  insert into auth.users (id, email) values (c1, 'c1@s38.test'), (co, 'co@s38.test'), (vo, 'vo@s38.test'),
    (pa, 'pa@s38.test'), (r1, 'r1@s38.test'), (r2, 'r2@s38.test'), (ob, 'ob@s38.test'), (r3, 'r3@s38.test');
  insert into jc_communities (id, name_en, map_lat, map_lng, modules) values
    ('testville38', 'Testville 38', 24.53, 54.43, '{"pets": {"enabled": true}, "cats": {"enabled": true}}'),
    ('testville38b', 'Testville 38b', 24.53, 54.43, '{"pets": {"enabled": true}, "cats": {"enabled": true}}');
  insert into jc_villages (community_id, key, name_en) values ('testville38', 'north', 'North'), ('testville38b', 'north', 'North');
  perform jc_code_set('testville38', 'join', 'S38-JOIN-CODE-01');
  perform jc_code_set('testville38', 'community', 'S38-COMMUNITY-01');
  perform jc_code_set('testville38b', 'join', 'S38-JOIN-CODE-02');
  perform jc_code_set('testville38b', 'community', 'S38-COMMUNITY-02');

  execute 'set local role authenticated';
  perform pg_temp.s38_as(c1); perform jc_join('testville38', 'S38-JOIN-CODE-01'); perform jc_admin_unlock('S38-COMMUNITY-01');
  perform pg_temp.s38_as(ob); perform jc_join('testville38b', 'S38-JOIN-CODE-02'); perform jc_admin_unlock('S38-COMMUNITY-02');
  foreach s in array array[co::text, vo::text, pa::text, r1::text, r2::text, r3::text] loop
    perform pg_temp.s38_as(s::uuid); perform jc_join('testville38', 'S38-JOIN-CODE-01');
  end loop;
  foreach s in array array['cats:' || co, 'cats_vol:' || vo, 'pets:' || pa] loop
    perform pg_temp.s38_as(c1);
    tok := jc_module_admin_link_create(split_part(s, ':', 1)) ->> 'token';
    perform pg_temp.s38_as(split_part(s, ':', 2)::uuid);
    perform jc_module_admin_accept(tok);
  end loop;
  execute 'reset role';
  update jc_accounts set display_name = 'Coco Coordinator' where user_id = co;
  execute 'set local role authenticated';

  perform pg_temp.s38_as(co);
  a1 := (jc_cat_area_save(null, 'Souk', null) #>> '{areas,0,id}')::uuid;
  select (y ->> 'id')::uuid into cat1 from jsonb_array_elements(jc_cat_save(null, '{"name": "Newcomer"}') -> 'cats') y where y ->> 'name' = 'Newcomer';
  select (y ->> 'id')::uuid into cat2 from jsonb_array_elements(jc_cat_save(null, jsonb_build_object('name', 'Caramel', 'area_id', a1)) -> 'cats') y where y ->> 'name' = 'Caramel';
  select (y ->> 'id')::uuid into cat3 from jsonb_array_elements(jc_cat_save(null, '{"name": "Nowhere"}') -> 'cats') y where y ->> 'name' = 'Nowhere';
  select (y ->> 'id')::uuid into cat4 from jsonb_array_elements(jc_cat_save(null, '{"name": "Full"}') -> 'cats') y where y ->> 'name' = 'Full';
  select (y ->> 'id')::uuid into cat5 from jsonb_array_elements(jc_cat_save(null, '{"name": "Gwen2"}') -> 'cats') y where y ->> 'name' = 'Gwen2';
  perform pg_temp.s38_as(ob);
  cat_b := (jc_cat_save(null, '{"name": "Elsewhere"}') #>> '{cats,0,id}')::uuid;

  -- the residents' reports
  perform pg_temp.s38_as(r1);
  perform jc_stray_report_add(q1, jsonb_build_object('note', 'Thin ginger, my neighbour Ali feeds her', 'lat', 24.531, 'lng', 54.431,
                                                     'place', 'Behind the souk', 'contact', '+971 50 123 4567'));
  v_p := jc_stray_report_photo_begin(q1, 'jpg') ->> 'path';
  execute 'reset role';
  insert into storage.objects (bucket_id, name, owner, metadata) values ('pet-photos', v_p, r1, v_meta);
  execute 'set local role authenticated';
  perform jc_stray_report_photo_commit(q1);
  perform jc_stray_report_add(q2, jsonb_build_object('species', 'cat', 'lat', 24.532, 'lng', 54.432));
  perform jc_stray_report_add(q3, jsonb_build_object('place', 'Marina steps'));
  perform jc_stray_report_add(q4, jsonb_build_object('place', 'Somewhere'));
  v_p6 := jc_stray_report_photo_begin(q2, 'jpg') ->> 'path';
  execute 'reset role';
  insert into storage.objects (bucket_id, name, owner, metadata) values ('pet-photos', v_p6, r1, v_meta);
  execute 'set local role authenticated';
  perform jc_stray_report_photo_commit(q2);
  perform pg_temp.s38_as(r3);
  perform jc_stray_report_add(q5, jsonb_build_object('place', 'Villa 12 garden'));
  perform jc_stray_report_add(q6, jsonb_build_object('place', 'Full house'));
  v_p6 := jc_stray_report_photo_begin(q6, 'jpg') ->> 'path';
  execute 'reset role';
  insert into storage.objects (bucket_id, name, owner, metadata) values ('pet-photos', v_p6, r3, v_meta);
  execute 'set local role authenticated';
  perform jc_stray_report_photo_commit(q6);
  perform jc_stray_report_add(q8, jsonb_build_object('place', 'Gate'));
  perform pg_temp.s38_as(r2);
  perform jc_stray_report_add(q7, jsonb_build_object('place', 'Leaver'));
  v_p7 := jc_stray_report_photo_begin(q7, 'jpg') ->> 'path';
  execute 'reset role';
  insert into storage.objects (bucket_id, name, owner, metadata) values ('pet-photos', v_p7, r2, v_meta);
  execute 'set local role authenticated';
  perform jc_stray_report_photo_commit(q7);

  -- ---------- RP01 the queue: coordinators + community admins; never volunteers / Pets admins / residents ----------
  perform pg_temp.s38_as(co);
  v := jc_cat_reports_list('open');
  if pg_temp.s38_ids(v) <> array[q1, q2, q3, q4, q5, q6, q7, q8]::text[] then raise exception 'FAIL RP01a open queue (one transaction: same created_at, then id): %', pg_temp.s38_ids(v); end if;
  select y into x from jsonb_array_elements(v) y where y ->> 'id' = q1::text;
  if x ->> 'species' <> 'cat' or x ->> 'contact' <> '+971501234567' or x ->> 'photo_path' <> v_p or x ->> 'place' <> 'Behind the souk'
     or x -> 'reporter_home' is null or (x ->> 'reporter_left')::boolean or x ->> 'state' <> 'open' then
    raise exception 'FAIL RP01b the report as the coordinator sees it: %', x; end if;
  if not jc_private.pet_photo_can_read(v_p) then raise exception 'FAIL RP01c coordinator reads the report photo'; end if;
  perform pg_temp.s38_as(c1);
  if jsonb_array_length(jc_cat_reports_list('open')) <> 8 then raise exception 'FAIL RP01d community admin'; end if;
  foreach s in array array[vo::text, pa::text, r2::text] loop
    perform pg_temp.s38_as(s::uuid);
    msg := pg_temp.s38_err('select jc_cat_reports_list(''open'')');
    if msg is distinct from 'NOT_ADMIN' then raise exception 'FAIL RP01e % lists the queue: %', s, msg; end if;
    msg := pg_temp.s38_err(format('select jc_cat_report_close(%L, %L, null)', q5, 'not_stray'));
    if msg is distinct from 'NOT_ADMIN' then raise exception 'FAIL RP01f % closes: %', s, msg; end if;
  end loop;
  perform pg_temp.s38_as(vo);
  if jc_private.pet_photo_can_read(v_p) then raise exception 'FAIL RP01g volunteer reads the report photo'; end if;
  perform pg_temp.s38_as(ob);
  if jsonb_array_length(jc_cat_reports_list('open')) <> 0 then raise exception 'FAIL RP01h another community sees them'; end if;
  if jc_private.pet_photo_can_read(v_p) then raise exception 'FAIL RP01i another community reads the photo'; end if;
  msg := pg_temp.s38_err(format('select jc_cat_report_close(%L, %L, null)', q5, 'not_stray'));
  if msg is distinct from 'NOT_FOUND' then raise exception 'FAIL RP01j another community closes: %', msg; end if;
  k := k + 10;

  -- ---------- RP02 added: photo → the cat, one sighting at the pin, My reports shows the cat ----------
  perform pg_temp.s38_as(co);
  execute 'reset role';
  select created_at into v_t from jc_stray_reports where id = q1;
  execute 'set local role authenticated';
  x := jc_cat_report_close(q1, 'added', cat1);
  if x ->> 'state' <> 'added' or x #>> '{cat,id}' <> cat1::text or x #>> '{cat,name}' <> 'Newcomer' or x ->> 'contact' is not null
     or x ->> 'photo_path' is not null then raise exception 'FAIL RP02a closed: %', x; end if;
  execute 'reset role';
  if not exists (select 1 from jc_pet_photos where path = v_p and cat_id = cat1 and report_id is null and state = 'current') then
    raise exception 'FAIL RP02b photo moved: %', (select row_to_json(p) from jc_pet_photos p where path = v_p); end if;
  if (select count(*) from jc_cat_sightings where cat_id = cat1) <> 1
     or not exists (select 1 from jc_cat_sightings where cat_id = cat1 and lat = 24.531 and lng = 54.431 and seen_at = v_t
                      and note is null and logged_by = co and logged_name = 'Coco Coordinator' and area_id is null) then
    raise exception 'FAIL RP02c sighting: %', (select jsonb_agg(row_to_json(z)) from jc_cat_sightings z where cat_id = cat1); end if;
  if exists (select 1 from jc_cat_sightings where community_id = 'testville38' and (note is not null or description is not null)) then
    raise exception 'FAIL RP02d resident text copied into a sighting (security M1)'; end if;
  if exists (select 1 from jc_admin_log where community_id = 'testville38' and action = 'cat_report_close'
              and target::text ~ '(971|Ali|souk)') then raise exception 'FAIL RP02e content in the admin log'; end if;
  if not exists (select 1 from jc_admin_log where community_id = 'testville38' and action = 'cat_report_close'
                  and target ->> 'report_id' = q1::text and (target ->> 'photo_moved')::boolean) then raise exception 'FAIL RP02f logged'; end if;
  execute 'set local role authenticated';
  perform pg_temp.s38_as(r1);
  select y into x from jsonb_array_elements(jc_stray_reports_mine()) y where y ->> 'id' = q1::text;
  if x ->> 'state' <> 'added' or x #>> '{cat,name}' <> 'Newcomer' or x ? 'contact' then raise exception 'FAIL RP02g My reports: %', x; end if;
  if not jc_private.pet_photo_can_read(v_p) then raise exception 'FAIL RP02h the cat''s photo is readable by residents'; end if;
  perform pg_temp.s38_as(co);
  if (select count(*) from jsonb_array_elements(jc_cat_register() -> 'cats') y, jsonb_array_elements(y -> 'photos') ph
       where y ->> 'id' = cat1::text) <> 1 then raise exception 'FAIL RP02i photo in the register'; end if;
  k := k + 9;

  -- ---------- RP03 known: link + one sighting, photo retired; retry; area fallback; no place → none ----------
  x := jc_cat_report_close(q2, 'known', cat2);
  if x ->> 'state' <> 'known' or x #>> '{cat,id}' <> cat2::text then raise exception 'FAIL RP03a: %', x; end if;
  x := jc_cat_report_close(q2, 'known', cat2);                                  -- a retry
  if x ->> 'state' <> 'known' then raise exception 'FAIL RP03b retry: %', x; end if;
  msg := pg_temp.s38_err(format('select jc_cat_report_close(%L, %L, %L)', q2, 'known', cat3));
  if msg is distinct from 'ALREADY_CLOSED' then raise exception 'FAIL RP03c another cat after close: %', msg; end if;
  msg := pg_temp.s38_err(format('select jc_cat_report_close(%L, %L, null)', q2, 'not_stray'));
  if msg is distinct from 'ALREADY_CLOSED' then raise exception 'FAIL RP03d another outcome after close: %', msg; end if;
  perform jc_cat_report_close(q3, 'known', cat2);                               -- place only → Caramel's area
  perform jc_cat_report_close(q4, 'known', cat3);                               -- place only, no area → no sighting
  execute 'reset role';
  if (select count(*) from jc_cat_sightings where cat_id = cat2) <> 2
     or (select count(*) from jc_cat_sightings where cat_id = cat2 and lat = 24.532) <> 1
     or (select count(*) from jc_cat_sightings where cat_id = cat2 and area_id = a1 and lat is null and note is null) <> 1 then
    raise exception 'FAIL RP03e sightings: %', (select jsonb_agg(row_to_json(z)) from jc_cat_sightings z where cat_id = cat2); end if;
  if exists (select 1 from jc_cat_sightings where cat_id = cat3) then raise exception 'FAIL RP03f no place → no sighting'; end if;
  if exists (select 1 from jc_pet_photos where report_id = q2 and state <> 'retired')
     or exists (select 1 from jc_pet_photos where cat_id = cat2) then raise exception 'FAIL RP03g known never moves the photo'; end if;
  if (select cat_id from jc_stray_reports where id = q4) <> cat3 then raise exception 'FAIL RP03h linked without a sighting'; end if;
  execute 'set local role authenticated';
  perform pg_temp.s38_as(co);
  x := jc_cat_report_close(q5, 'not_stray', null);
  if x ->> 'state' <> 'not_stray' or x -> 'cat' <> 'null'::jsonb then raise exception 'FAIL RP03i not a stray: %', x; end if;
  v := jc_cat_reports_list('closed');
  if jsonb_array_length(v) <> 5 or jsonb_array_length(jc_cat_reports_list('open')) <> 3 then
    raise exception 'FAIL RP03j closed / open lists: % / %', jsonb_array_length(v), jsonb_array_length(jc_cat_reports_list('open')); end if;
  k := k + 10;

  -- ---------- RP04 Cats off → MODULE_OFF; Pets off with Cats on → still works ----------
  execute 'reset role';
  update jc_communities set modules = '{"pets": {"enabled": true}, "cats": {"enabled": false}}' where id = 'testville38';
  execute 'set local role authenticated';
  perform pg_temp.s38_as(r1);
  msg := pg_temp.s38_err(format('select jc_stray_report_add(%L, %L)', gen_random_uuid(), '{"place": "X"}'));
  if msg is distinct from 'MODULE_OFF' then raise exception 'FAIL RP04a report with Cats off: %', msg; end if;
  msg := pg_temp.s38_err('select jc_stray_reports_mine()');
  if msg is distinct from 'MODULE_OFF' then raise exception 'FAIL RP04b My reports with Cats off: %', msg; end if;
  msg := pg_temp.s38_err(format('select jc_stray_report_photo_begin(%L, %L)', q8, 'jpg'));
  if msg is distinct from 'MODULE_OFF' then raise exception 'FAIL RP04c photo with Cats off: %', msg; end if;
  perform pg_temp.s38_as(co);
  msg := pg_temp.s38_err('select jc_cat_reports_list(''open'')');
  if msg is distinct from 'MODULE_OFF' then raise exception 'FAIL RP04d queue with Cats off: %', msg; end if;
  msg := pg_temp.s38_err(format('select jc_cat_report_close(%L, %L, null)', q8, 'not_stray'));
  if msg is distinct from 'MODULE_OFF' then raise exception 'FAIL RP04e close with Cats off: %', msg; end if;
  execute 'reset role';
  update jc_communities set modules = '{"pets": {"enabled": false}, "cats": {"enabled": true}}' where id = 'testville38';
  execute 'set local role authenticated';
  perform pg_temp.s38_as(r1);
  v := jc_stray_report_add('00000000-0000-4000-8000-0000000038b1', '{"place": "Pets is off"}');
  if v ->> 'species' <> 'cat' or v ->> 'state' <> 'open' then raise exception 'FAIL RP04f report with Pets off: %', v; end if;
  if jsonb_array_length(jc_stray_reports_mine()) < 1 then raise exception 'FAIL RP04g My reports with Pets off'; end if;
  execute 'reset role';
  update jc_communities set modules = '{"pets": {"enabled": true}, "cats": {"enabled": true}}' where id = 'testville38';
  execute 'set local role authenticated';
  k := k + 7;

  -- ---------- RP05 refusals, cap, leaver, merged cat, the two queues, photo reads ----------
  perform pg_temp.s38_as(co);
  foreach s in array array[
      format('select jc_cat_report_close(%L, %L, %L)', q8, 'adopted', cat1),       -- bad outcome
      format('select jc_cat_report_close(%L, %L, %L)', q8, 'not_stray', cat1),     -- not a stray with a cat
      format('select jc_cat_report_close(%L, %L, null)', q8, 'added'),             -- added without a cat
      format('select jc_cat_report_close(%L, null, null)', q8)] loop
    msg := pg_temp.s38_err(s);
    if msg is distinct from 'BAD_FIELDS' then raise exception 'FAIL RP05a % → %', s, msg; end if;
  end loop;
  msg := pg_temp.s38_err(format('select jc_cat_report_close(%L, %L, %L)', q8, 'known', cat_b));
  if msg is distinct from 'NOT_FOUND' then raise exception 'FAIL RP05b another community''s cat: %', msg; end if;
  msg := pg_temp.s38_err(format('select jc_cat_report_close(%L, %L, %L)', gen_random_uuid(), 'not_stray', null));
  if msg is distinct from 'NOT_FOUND' then raise exception 'FAIL RP05c unknown report: %', msg; end if;
  -- a merged cat is refused; a report already linked to a cat that is merged later shows the survivor
  perform jc_cat_merge(cat5, cat2);
  msg := pg_temp.s38_err(format('select jc_cat_report_close(%L, %L, %L)', q8, 'known', cat5));
  if msg is distinct from 'MERGED' then raise exception 'FAIL RP05d merged cat: %', msg; end if;
  perform jc_cat_merge(cat3, cat2);
  select y into x from jsonb_array_elements(jc_cat_reports_list('closed')) y where y ->> 'id' = q4::text;
  if x #>> '{cat,id}' <> cat2::text or x #>> '{cat,name}' <> 'Caramel' then raise exception 'FAIL RP05e survivor: %', x; end if;
  -- the cap: a cat with 4 photos keeps 4, the report's photo is retired
  execute 'reset role';
  insert into jc_pet_photos (path, community_id, cat_id, created_by, state)
  select 'testville38/c/' || cat4 || '/f' || i || '.jpg', 'testville38', cat4, co, 'current' from generate_series(1, 4) i;
  execute 'set local role authenticated';
  perform jc_cat_report_close(q6, 'added', cat4);
  execute 'reset role';
  if (select count(*) from jc_pet_photos where cat_id = cat4 and state = 'current') <> 4
     or not exists (select 1 from jc_pet_photos where path = v_p6 and report_id = q6 and state = 'retired') then
    raise exception 'FAIL RP05f cap 4'; end if;
  if (select (target ->> 'photo_moved')::boolean from jc_admin_log where action = 'cat_report_close' and target ->> 'report_id' = q6::text) then
    raise exception 'FAIL RP05g logged as moved'; end if;
  -- a reporter who left: the number + photo hidden from the queue at once, the photo never moves
  delete from jc_home_members where user_id = r2;
  delete from jc_accounts where user_id = r2;
  execute 'set local role authenticated';
  perform pg_temp.s38_as(co);
  select y into x from jsonb_array_elements(jc_cat_reports_list('open')) y where y ->> 'id' = q7::text;
  if x ->> 'photo_path' is not null or not (x ->> 'reporter_left')::boolean then raise exception 'FAIL RP05h leaver hidden: %', x; end if;
  if jc_private.pet_photo_can_read(v_p7) then raise exception 'FAIL RP05i leaver''s photo readable'; end if;
  perform jc_cat_report_close(q7, 'added', cat1);
  execute 'reset role';
  if exists (select 1 from jc_pet_photos where path = v_p7 and cat_id is not null) then raise exception 'FAIL RP05j leaver''s photo moved'; end if;
  -- CC-7d: the Organizer Tools close (Pets admins) is gone — the Cats queue is the only close; a second, different
  -- close is refused
  if to_regprocedure('public.jc_admin_stray_report_close(uuid, text, uuid)') is not null
     or to_regprocedure('public.jc_admin_stray_reports_list(text)') is not null then
    raise exception 'FAIL RP05k0 the Organizer Tools queue still exists'; end if;
  execute 'set local role authenticated';
  perform pg_temp.s38_as(co);
  perform jc_cat_report_close(q8, 'not_stray', null);
  msg := pg_temp.s38_err(format('select jc_cat_report_close(%L, %L, %L)', q8, 'known', cat1));
  if msg is distinct from 'ALREADY_CLOSED' then raise exception 'FAIL RP05k a different close after not_stray: %', msg; end if;
  x := jc_cat_report_close(q8, 'not_stray', null);                              -- the same outcome = a retry, no error
  if x ->> 'state' <> 'not_stray' then raise exception 'FAIL RP05l same outcome: %', x; end if;
  execute 'reset role';
  -- the constraints hold for direct writes too
  begin
    update jc_stray_reports set state = 'open', closed_at = null where id = q2;
    raise exception 'FAIL RP05m open report with a cat';
  exception when check_violation then null;
  end;
  begin
    insert into jc_pets (id, community_id, kind, species, name, care_state)
    values ('00000000-0000-4000-8000-0000000038c1', 'testville38', 'stray', 'cat', 'S38 stray', 'known_fine');
    update jc_stray_reports set pet_id = '00000000-0000-4000-8000-0000000038c1' where id = q1;
    raise exception 'FAIL RP05n a cat and a pet';
  exception when check_violation then null;
  end;
  k := k + 15;   -- CC-7d: + RP05k0

  -- ---------- RP06 db review: cap boundary, pending upload, archived area, non-cat, expired, bad show, volunteer,
  -- one log row per close, retry with the survivor, photo reads by module, retention after a close ----------
  execute 'set local role authenticated';
  perform pg_temp.s38_as(co);
  a2 := (select (y ->> 'id')::uuid from jsonb_array_elements(jc_cat_area_save(null, 'Old quarter', null) -> 'areas') y where y ->> 'name' = 'Old quarter');
  select (y ->> 'id')::uuid into cat6 from jsonb_array_elements(jc_cat_save(null, '{"name": "Three"}') -> 'cats') y where y ->> 'name' = 'Three';
  select (y ->> 'id')::uuid into cat7 from jsonb_array_elements(jc_cat_save(null, jsonb_build_object('name', 'Oldie', 'area_id', a2)) -> 'cats') y where y ->> 'name' = 'Oldie';
  perform jc_cat_area_save(a2, null, true);                                     -- archived
  execute 'reset role';
  insert into jc_stray_reports (id, community_id, reporter, species, place, lat, lng) values
    (q9, 'testville38', r1, 'cat', 'Cap three', 24.533, 54.433), (q10, 'testville38', r1, 'cat', 'Pending', null, null),
    (q11, 'testville38', r1, 'cat', 'Archived area', null, null), (q12, 'testville38', r1, 'dog', 'A dog', null, null),
    (q14, 'testville38', r1, 'cat', 'Reads', null, null);
  insert into jc_stray_reports (id, community_id, reporter, species, place, state, closed_at)
  values (q13, 'testville38', r1, 'cat', 'Old', 'expired', now());
  insert into jc_pet_photos (path, community_id, cat_id, created_by, state)
  select 'testville38/c/' || cat6 || '/t' || i || '.jpg', 'testville38', cat6, co, 'current' from generate_series(1, 3) i;
  insert into jc_pet_photos (path, community_id, report_id, created_by, state) values
    ('testville38/r/' || q9 || '/p.jpg', 'testville38', q9, r1, 'current'),
    ('testville38/r/' || q10 || '/p.jpg', 'testville38', q10, r1, 'pending'),
    ('testville38/r/' || q14 || '/p.jpg', 'testville38', q14, r1, 'current');
  update jc_stray_reports set photo_path = 'testville38/r/' || q9 || '/p.jpg' where id = q9;
  update jc_stray_reports set photo_path = 'testville38/r/' || q14 || '/p.jpg' where id = q14;
  update jc_stray_reports set pending_photo_path = 'testville38/r/' || q10 || '/p.jpg', pending_photo_by = r1, pending_photo_at = now() where id = q10;
  execute 'set local role authenticated';
  perform pg_temp.s38_as(co);
  perform jc_cat_report_close(q9, 'added', cat6);
  perform jc_cat_report_close(q10, 'added', cat1);
  perform jc_cat_report_close(q11, 'known', cat7);
  execute 'reset role';
  if (select count(*) from jc_pet_photos where cat_id = cat6 and state = 'current') <> 4
     or not exists (select 1 from jc_pet_photos where path = 'testville38/r/' || q9 || '/p.jpg' and cat_id = cat6) then
    raise exception 'FAIL RP06a 3 photos → the 4th moves'; end if;
  if not exists (select 1 from jc_pet_photos where path = 'testville38/r/' || q10 || '/p.jpg' and report_id = q10 and state = 'retired')
     or exists (select 1 from jc_stray_reports where id = q10 and (pending_photo_path is not null or pending_photo_by is not null
                                                                   or pending_photo_at is not null or photo_path is not null)) then
    raise exception 'FAIL RP06b pending upload retired, never moved'; end if;
  if exists (select 1 from jc_cat_sightings where cat_id = cat7) then raise exception 'FAIL RP06c archived area → no sighting'; end if;
  execute 'set local role authenticated';
  perform pg_temp.s38_as(co);
  if exists (select 1 from jsonb_array_elements(jc_cat_reports_list('open')) y where y ->> 'id' = q12::text) then
    raise exception 'FAIL RP06d a dog report in the Cats queue'; end if;
  msg := pg_temp.s38_err(format('select jc_cat_report_close(%L, %L, %L)', q12, 'known', cat1));
  if msg is distinct from 'NOT_FOUND' then raise exception 'FAIL RP06e a dog report closed onto a cat: %', msg; end if;
  msg := pg_temp.s38_err(format('select jc_cat_report_close(%L, %L, null)', q13, 'not_stray'));
  if msg is distinct from 'ALREADY_CLOSED' then raise exception 'FAIL RP06f expired: %', msg; end if;
  msg := pg_temp.s38_err('select jc_cat_reports_list(''all'')');
  if msg is distinct from 'BAD_FIELDS' then raise exception 'FAIL RP06g bad show: %', msg; end if;
  x := jc_cat_report_close(q4, 'known', cat2);                                  -- q4 → Nowhere, merged into Caramel since
  if x ->> 'state' <> 'known' then raise exception 'FAIL RP06h retry with the survivor: %', x; end if;
  perform pg_temp.s38_as(vo);
  msg := pg_temp.s38_err(format('select jc_cat_report_close(%L, %L, %L)', q14, 'added', cat1));
  if msg is distinct from 'NOT_ADMIN' then raise exception 'FAIL RP06i volunteer adds: %', msg; end if;
  -- photo reads: a coordinator while Cats is on; not once Cats is off (Pets on); CC-7d: never a Pets admin
  perform pg_temp.s38_as(co);
  if not jc_private.pet_photo_can_read('testville38/r/' || q14 || '/p.jpg') then raise exception 'FAIL RP06j coordinator reads'; end if;
  execute 'reset role';
  update jc_communities set modules = '{"pets": {"enabled": true}, "cats": {"enabled": false}}' where id = 'testville38';
  execute 'set local role authenticated';
  if jc_private.pet_photo_can_read('testville38/r/' || q14 || '/p.jpg') then raise exception 'FAIL RP06k coordinator reads with Cats off'; end if;
  perform pg_temp.s38_as(pa);
  if jc_private.pet_photo_can_read('testville38/r/' || q14 || '/p.jpg') then raise exception 'FAIL RP06l Pets admin reads (Cats off)'; end if;
  execute 'reset role';
  update jc_communities set modules = '{"pets": {"enabled": true}, "cats": {"enabled": true}}' where id = 'testville38';
  execute 'set local role authenticated';
  if jc_private.pet_photo_can_read('testville38/r/' || q14 || '/p.jpg') then raise exception 'FAIL RP06l2 Pets admin reads (Cats on)'; end if;
  execute 'reset role';
  if (select count(*) from jc_admin_log where action = 'cat_report_close' and target ->> 'report_id' = q2::text) <> 1 then
    raise exception 'FAIL RP06m a retry logged twice'; end if;
  -- retention, 31 days after the close: the report goes; the cat's photo and the sighting stay
  update jc_stray_reports set closed_at = now() - interval '31 days' where id = q1;
  perform jc_pets_retention();
  if exists (select 1 from jc_stray_reports where id = q1)
     or not exists (select 1 from jc_pet_photos where path = v_p and cat_id = cat1 and state = 'current')
     or (select count(*) from jc_cat_sightings where cat_id = cat1) <> 1 then
    raise exception 'FAIL RP06n retention after a close'; end if;
  k := k + 15;   -- CC-7d: + RP06l2

  perform set_config('jc_test.checks', (coalesce(nullif(current_setting('jc_test.checks', true), ''), '0')::int + k)::text, true);
  raise notice 's38_cat_reports: % checks passed', k;
end
$t$;
