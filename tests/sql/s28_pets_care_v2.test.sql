-- Pets care v2 (20261115120000_pets_care_v2.sql): auto-log a care_state change (10-minute merge), rate limit on log adds,
-- last_fed_at / last_contact_at on the organizer list, state on jc_pet_get's care_log.
-- now() is frozen inside the dry-run transaction: "older" rows and windows are made by rewinding timestamps as postgres.
-- Users c1..c3 and community testville28 are throwaway fixtures (rolled back); a community of its own (slice order).
do $t$
declare
  c1 uuid := '00000000-0000-4000-8000-000000002801';
  c2 uuid := '00000000-0000-4000-8000-000000002802';
  c3 uuid := '00000000-0000-4000-8000-000000002803';
  v_cat uuid; v_dog uuid; v_new uuid; v jsonb; r jsonb; v_err text; k int := 0; i int; n int;
begin
  -- ---------- setup (as postgres) ----------
  insert into auth.users (id, email) values (c1, 'c1@s28.test'), (c2, 'c2@s28.test'), (c3, 'c3@s28.test');
  insert into jc_communities (id, name_en, map_lat, map_lng, modules)
  values ('testville28', 'Testville 28', 25.0, 55.0, '{"pets": {"enabled": true}}');
  perform jc_code_set('testville28', 'join', 'S28-JOIN-CODE-01');
  perform jc_code_set('testville28', 'pets', 'S28-PETS-ADMIN-01');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', c3, 'role', 'authenticated')::text, true);
  perform jc_join('testville28', 'S28-JOIN-CODE-01');                          -- c3 stays a resident
  perform set_config('request.jwt.claims', json_build_object('sub', c2, 'role', 'authenticated')::text, true);
  perform jc_join('testville28', 'S28-JOIN-CODE-01');
  perform jc_admin_unlock('S28-PETS-ADMIN-01');
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  perform jc_join('testville28', 'S28-JOIN-CODE-01');
  perform jc_admin_unlock('S28-PETS-ADMIN-01');

  -- ---------- CV01 adding a stray (with or without a state) writes no log row ----------
  v_cat := (jc_admin_stray_save(null, jsonb_build_object('species', 'cat', 'name', 'S28 cat', 'care_state', 'needs_help')) ->> 'id')::uuid;
  v_dog := (jc_admin_stray_save(null, jsonb_build_object('species', 'dog', 'name', 'S28 dog')) ->> 'id')::uuid;
  execute 'reset role';
  if exists (select 1 from jc_pet_care_log where pet_id in (v_cat, v_dog)) then raise exception 'FAIL CV01 create wrote a log row'; end if;
  k := k + 1;

  -- ---------- CV02 no change → no row: other fields, the same state again ----------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  perform jc_admin_stray_save(v_cat, jsonb_build_object('name', 'S28 cat two', 'territory', 'By the marina'));
  perform jc_admin_stray_save(v_cat, jsonb_build_object('care_state', 'needs_help'));
  perform jc_admin_stray_save(v_cat, jsonb_build_object('care_state', 'needs_help', 'description', 'Grey, shy'));   -- db review
  execute 'reset role';
  if exists (select 1 from jc_pet_care_log where pet_id = v_cat) then raise exception 'FAIL CV02 a no-op save logged'; end if;
  k := k + 1;

  -- ---------- CV03 a real change → exactly one 'state' row: state = new, note null, author = the organizer ----------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  perform jc_admin_stray_save(v_cat, jsonb_build_object('care_state', 'under_care'));
  execute 'reset role';
  if (select count(*) from jc_pet_care_log where pet_id = v_cat) <> 1 then raise exception 'FAIL CV03a rows'; end if;
  if not exists (select 1 from jc_pet_care_log where pet_id = v_cat and kind = 'state' and state = 'under_care'
                  and note is null and author = c1 and community_id = 'testville28') then
    raise exception 'FAIL CV03b row: %', (select jsonb_agg(row_to_json(c)) from jc_pet_care_log c where pet_id = v_cat); end if;
  k := k + 2;

  -- ---------- CV04 same organizer again within 10 minutes → the row is updated, not added ----------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  perform jc_admin_stray_save(v_cat, jsonb_build_object('care_state', 'known_fine'));
  execute 'reset role';
  if (select count(*) from jc_pet_care_log where pet_id = v_cat) <> 1 then raise exception 'FAIL CV04a merged rows'; end if;
  if (select state from jc_pet_care_log where pet_id = v_cat) is distinct from 'known_fine' then raise exception 'FAIL CV04b merged state'; end if;
  k := k + 2;

  -- ---------- CV05 merge rules: any organizer < 10 min merges (security M1); the 10-minute edge; A→B→A; manual rows ----------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', c2, 'role', 'authenticated')::text, true);
  perform jc_admin_stray_save(v_cat, jsonb_build_object('care_state', 'needs_help'));
  execute 'reset role';
  if (select count(*) from jc_pet_care_log where pet_id = v_cat) <> 1
     or not exists (select 1 from jc_pet_care_log where pet_id = v_cat and state = 'needs_help' and author = c2) then
    raise exception 'FAIL CV05a another organizer merges: %', (select jsonb_agg(row_to_json(c)) from jc_pet_care_log c where pet_id = v_cat); end if;
  update jc_pet_care_log set created_at = now() - interval '9 minutes 59 seconds' where pet_id = v_cat;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  perform jc_admin_stray_save(v_cat, jsonb_build_object('care_state', 'under_care'));
  execute 'reset role';
  if (select count(*) from jc_pet_care_log where pet_id = v_cat) <> 1 then raise exception 'FAIL CV05b 9m59s merges'; end if;
  update jc_pet_care_log set created_at = now() - interval '10 minutes 1 second' where pet_id = v_cat;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  perform jc_admin_stray_save(v_cat, jsonb_build_object('care_state', 'known_fine'));
  execute 'reset role';
  if (select count(*) from jc_pet_care_log where pet_id = v_cat) <> 2 then raise exception 'FAIL CV05c 10m01s is a new row'; end if;
  -- A → B → A within 10 minutes: one row saying A (accepted, db review L1)
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  perform jc_admin_stray_save(v_cat, jsonb_build_object('care_state', 'under_care'));
  perform jc_admin_stray_save(v_cat, jsonb_build_object('care_state', 'known_fine', 'name', 'S28 cat three'));
  execute 'reset role';
  if (select count(*) from jc_pet_care_log where pet_id = v_cat) <> 2
     or (select state from jc_pet_care_log where pet_id = v_cat order by created_at desc, id desc limit 1) is distinct from 'known_fine' then
    raise exception 'FAIL CV05d A→B→A: %', (select jsonb_agg(row_to_json(c)) from jc_pet_care_log c where pet_id = v_cat); end if;
  -- a manual state row (text, no state) is never merged into
  update jc_pet_care_log set created_at = now() - interval '20 minutes' where pet_id = v_cat;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', c2, 'role', 'authenticated')::text, true);
  perform jc_admin_pet_care_add(v_cat, 'state', 'Moved to the vet clinic garden');
  perform jc_admin_stray_save(v_cat, jsonb_build_object('care_state', 'needs_help'));
  execute 'reset role';
  if (select count(*) from jc_pet_care_log where pet_id = v_cat and kind = 'state') <> 4 then
    raise exception 'FAIL CV05e a manual state row was overwritten: %', (select jsonb_agg(row_to_json(c)) from jc_pet_care_log c where pet_id = v_cat); end if;
  if not exists (select 1 from jc_pet_care_log where pet_id = v_cat and note = 'Moved to the vet clinic garden' and state is null) then
    raise exception 'FAIL CV05f manual row changed'; end if;
  k := k + 6;

  -- ---------- CV06 refusals write nothing: bad state, resident, owned pet ----------
  n := (select count(*) from jc_pet_care_log where pet_id = v_cat);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  v_err := null; begin perform jc_admin_stray_save(v_cat, jsonb_build_object('care_state', 'adopted')); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'BAD_FIELDS' then raise exception 'FAIL CV06a bad state: %', v_err; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c3, 'role', 'authenticated')::text, true);
  v_err := null; begin perform jc_admin_stray_save(v_cat, jsonb_build_object('care_state', 'rehomed')); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'NOT_ADMIN' then raise exception 'FAIL CV06b resident: %', v_err; end if;
  execute 'reset role';
  if (select count(*) from jc_pet_care_log where pet_id = v_cat) <> n then raise exception 'FAIL CV06c a refusal logged'; end if;
  k := k + 3;

  -- ---------- CV07 the table: state only on kind 'state'; a null note needs fed / vet or a state; unknown state refused ----------
  v_err := null; begin insert into jc_pet_care_log (community_id, pet_id, kind, state) values ('testville28', v_cat, 'note', 'rehomed');
    exception when others then v_err := sqlstate; end;
  if v_err is distinct from '23514' then raise exception 'FAIL CV07a state on a note: %', v_err; end if;
  v_err := null; begin insert into jc_pet_care_log (community_id, pet_id, kind, note, state) values ('testville28', v_cat, 'state', null, null);
    exception when others then v_err := sqlstate; end;
  if v_err is distinct from '23514' then raise exception 'FAIL CV07b state row with nothing: %', v_err; end if;
  v_err := null; begin insert into jc_pet_care_log (community_id, pet_id, kind, state) values ('testville28', v_cat, 'state', 'adopted');
    exception when others then v_err := sqlstate; end;
  if v_err is distinct from '23514' then raise exception 'FAIL CV07c unknown state: %', v_err; end if;
  v_err := null; begin insert into jc_pet_care_log (community_id, pet_id, kind, note) values ('testville28', v_cat, 'note', null);
    exception when others then v_err := sqlstate; end;
  if v_err is distinct from '23514' then raise exception 'FAIL CV07d null note on a note: %', v_err; end if;
  k := k + 4;

  -- ---------- CV08 readers: a resident's jc_pet_get carries state; the newest first ----------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', c3, 'role', 'authenticated')::text, true);
  v := jc_pet_get(v_cat);
  execute 'reset role';
  if not exists (select 1 from jsonb_array_elements(v -> 'care_log') e
                  where e ->> 'kind' = 'state' and e ->> 'state' = 'needs_help' and e -> 'note' = 'null'::jsonb) then
    raise exception 'FAIL CV08a auto row: %', v -> 'care_log'; end if;
  if not exists (select 1 from jsonb_array_elements(v -> 'care_log') e where e ? 'state' and e -> 'state' = 'null'::jsonb) then
    raise exception 'FAIL CV08b manual rows carry state null: %', v -> 'care_log'; end if;
  k := k + 2;

  -- ---------- CV09 organizer list: last_fed_at, last_contact_at (hidden sightings ignored); card's last_seen_at kept ----------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  r := (select e from jsonb_array_elements(jc_admin_pets_list()) e where e ->> 'id' = v_dog::text);
  if r -> 'last_fed_at' <> 'null'::jsonb or r -> 'last_contact_at' <> 'null'::jsonb then raise exception 'FAIL CV09a never fed / seen: %', r; end if;
  if not r ? 'last_seen_at' then raise exception 'FAIL CV09b card last_seen_at gone'; end if;
  execute 'reset role';
  insert into jc_pet_sightings (community_id, pet_id, note, hidden) values ('testville28', v_cat, 'S28 hidden only', true);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  r := (select e from jsonb_array_elements(jc_admin_pets_list()) e where e ->> 'id' = v_cat::text);
  if r -> 'last_contact_at' <> 'null'::jsonb then raise exception 'FAIL CV09f hidden sighting is no contact: %', r; end if;
  k := k + 1;
  perform jc_admin_pet_care_add(v_dog, 'vet', null);
  execute 'reset role';
  update jc_pet_care_log set created_at = now() - interval '3 days' where pet_id = v_dog;
  insert into jc_pet_sightings (community_id, pet_id, note, seen_at, hidden) values ('testville28', v_dog, 'S28 hidden', now() - interval '1 hour', true);
  insert into jc_pet_sightings (community_id, pet_id, note, seen_at) values ('testville28', v_dog, 'S28 seen', now() - interval '2 days');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  r := (select e from jsonb_array_elements(jc_admin_pets_list()) e where e ->> 'id' = v_dog::text);
  if r -> 'last_fed_at' <> 'null'::jsonb then raise exception 'FAIL CV09c a vet visit is not a feed: %', r; end if;
  if (r ->> 'last_contact_at')::timestamptz <> now() - interval '2 days' then raise exception 'FAIL CV09d contact = visible sighting: %', r; end if;
  perform jc_admin_pet_care_add(v_dog, 'fed', null);
  r := (select e from jsonb_array_elements(jc_admin_pets_list()) e where e ->> 'id' = v_dog::text);
  if (r ->> 'last_fed_at')::timestamptz <> now() or (r ->> 'last_contact_at')::timestamptz <> now() then
    raise exception 'FAIL CV09e fed now: %', r; end if;
  execute 'reset role';
  k := k + 5;

  -- ---------- CV10 log adds: 60 an hour per organizer; refusals don't count; the 61st writes nothing ----------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  v_err := null; begin perform jc_admin_pet_care_add(gen_random_uuid(), 'fed', null); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'NOT_FOUND' then raise exception 'FAIL CV10a: %', v_err; end if;
  v_err := null; begin perform jc_admin_pet_care_add(v_dog, 'note', null); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'BAD_FIELDS' then raise exception 'FAIL CV10b: %', v_err; end if;
  execute 'reset role';
  if (select jc_rate.n from jc_rate where user_id = c1 and bucket = 'pet_care_add') is distinct from 2 then   -- CV09: vet + fed
    raise exception 'FAIL CV10c refusals counted: %', (select jc_rate.n from jc_rate where user_id = c1 and bucket = 'pet_care_add'); end if;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  for i in 3..60 loop perform jc_admin_pet_care_add(v_dog, 'fed', null); end loop;
  v_err := null; begin perform jc_admin_pet_care_add(v_dog, 'fed', null); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'RATE_LIMITED' then raise exception 'FAIL CV10d 61st: %', v_err; end if;
  execute 'reset role';
  if (select count(*) from jc_pet_care_log where pet_id = v_dog and kind = 'fed') <> 59 then raise exception 'FAIL CV10e rows while limited'; end if;
  k := k + 5;

  -- ---------- CV11 auto rows are never limited; another organizer is not; the window expires ----------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  v_err := null; begin perform jc_admin_stray_save(v_dog, jsonb_build_object('care_state', 'needs_help')); exception when others then v_err := sqlerrm; end;
  if v_err is not null then raise exception 'FAIL CV11a state change while limited: %', v_err; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c2, 'role', 'authenticated')::text, true);
  v_err := null; begin perform jc_admin_pet_care_add(v_dog, 'fed', null); exception when others then v_err := sqlerrm; end;
  if v_err is not null then raise exception 'FAIL CV11b other organizer: %', v_err; end if;
  execute 'reset role';
  update jc_rate set window_start = now() - interval '61 minutes' where user_id = c1 and bucket = 'pet_care_add';
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  v_err := null; begin perform jc_admin_pet_care_add(v_dog, 'fed', null); exception when others then v_err := sqlerrm; end;
  if v_err is not null then raise exception 'FAIL CV11c after the hour: %', v_err; end if;
  execute 'reset role';
  k := k + 3;

  -- ---------- CV12 the community ceiling: 200 an hour however many organizers ----------
  insert into jc_admin_log (community_id, actor, action, target, at)
  select 'testville28', null, 'pet_care_add', '{}'::jsonb, now() - interval '61 minutes' from generate_series(1, 250);
  insert into jc_admin_log (community_id, actor, action, target)
  select 'testville28', null, 'pet_archive', '{}'::jsonb from generate_series(1, 250);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', c2, 'role', 'authenticated')::text, true);
  v_err := null; begin perform jc_admin_pet_care_add(v_dog, 'fed', null); exception when others then v_err := sqlerrm; end;
  if v_err is not null then raise exception 'FAIL CV12c old / other rows counted: %', v_err; end if;
  execute 'reset role';
  k := k + 1;
  n := (select count(*) from jc_admin_log where community_id = 'testville28' and action = 'pet_care_add' and at > now() - interval '1 hour');
  i := (select jc_rate.n from jc_rate where user_id = c2 and bucket = 'pet_care_add');
  insert into jc_admin_log (community_id, actor, action, target)
  select 'testville28', null, 'pet_care_add', '{}'::jsonb from generate_series(1, 200 - n);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', c2, 'role', 'authenticated')::text, true);
  v_err := null; begin perform jc_admin_pet_care_add(v_dog, 'fed', null); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'RATE_LIMITED' then raise exception 'FAIL CV12a community ceiling: %', v_err; end if;
  execute 'reset role';
  if (select jc_rate.n from jc_rate where user_id = c2 and bucket = 'pet_care_add') is distinct from i then
    raise exception 'FAIL CV12b the ceiling took from the organizer''s own count'; end if;
  k := k + 2;

  perform set_config('jc_test.checks', (coalesce(nullif(current_setting('jc_test.checks', true), ''), '0')::int + k)::text, true);
  raise notice 's28_pets_care_v2: % checks passed', k;
end
$t$;
