-- Report a new stray, PR 1a (20261116100000_stray_reports.sql): residents report, Pets organizers review.
-- now() is frozen inside the dry-run transaction: "older" rows are made by rewinding timestamps as postgres.
-- Users r1 (home 29), r2 (no home), a1 (pets admin), o1 (admin of another community) and communities testville29 /
-- testville29b are throwaway fixtures (rolled back).
do $t$
declare
  r1 uuid := '00000000-0000-4000-8000-000000002901';
  r3 uuid := '00000000-0000-4000-8000-000000002905';
  r2 uuid := '00000000-0000-4000-8000-000000002902';
  a1 uuid := '00000000-0000-4000-8000-000000002903';
  o1 uuid := '00000000-0000-4000-8000-000000002904';
  id1 uuid := '00000000-0000-4000-8000-0000000029a1';
  id2 uuid := '00000000-0000-4000-8000-0000000029a2';
  id3 uuid := '00000000-0000-4000-8000-0000000029a3';
  v_cat uuid; v_far uuid; v_old uuid; v jsonb; v_err text; k int := 0; i int;
begin
  -- ---------- setup (as postgres) ----------
  insert into auth.users (id, email) values (r1, 'r1@s29.test'), (r2, 'r2@s29.test'), (a1, 'a1@s29.test'), (o1, 'o1@s29.test'), (r3, 'r3@s29.test');
  insert into jc_communities (id, name_en, map_lat, map_lng, modules) values
    ('testville29', 'Testville 29', 25.0, 55.0, '{"pets": {"enabled": true}}'),
    ('testville29b', 'Testville 29b', 25.0, 55.0, '{"pets": {"enabled": true}}');
  insert into jc_villages (community_id, key, name_en) values ('testville29', 'north', 'North');
  perform jc_code_set('testville29', 'join', 'S29-JOIN-CODE-01');
  perform jc_code_set('testville29', 'pets', 'S29-PETS-ADMIN-01');
  perform jc_code_set('testville29b', 'join', 'S29B-JOIN-CODE-1');
  perform jc_code_set('testville29b', 'pets', 'S29B-PETS-ADMIN1');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', r1, 'role', 'authenticated')::text, true);
  perform jc_join('testville29', 'S29-JOIN-CODE-01');
  perform jc_home_claim('north', 'villa', null, '29');
  perform set_config('request.jwt.claims', json_build_object('sub', r2, 'role', 'authenticated')::text, true);
  perform jc_join('testville29', 'S29-JOIN-CODE-01');
  perform set_config('request.jwt.claims', json_build_object('sub', o1, 'role', 'authenticated')::text, true);
  perform jc_join('testville29b', 'S29B-JOIN-CODE-1');
  perform jc_admin_unlock('S29B-PETS-ADMIN1');
  v_far := (jc_admin_stray_save(null, jsonb_build_object('species', 'cat', 'name', 'S29 far cat')) ->> 'id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  perform jc_join('testville29', 'S29-JOIN-CODE-01');
  perform jc_admin_unlock('S29-PETS-ADMIN-01');
  v_cat := (jc_admin_stray_save(null, jsonb_build_object('species', 'cat', 'name', 'S29 cat')) ->> 'id')::uuid;
  v_old := (jc_admin_stray_save(null, jsonb_build_object('species', 'dog', 'name', 'S29 old dog')) ->> 'id')::uuid;
  perform jc_admin_pet_archive(v_old, 'duplicate');

  -- ---------- SR01 a report with a pin + a number: stored, number cleaned, never echoed back ----------
  perform set_config('request.jwt.claims', json_build_object('sub', r1, 'role', 'authenticated')::text, true);
  v := jc_stray_report_add(id1, jsonb_build_object('species', 'cat', 'note', '  Ginger, thin  ', 'lat', 25.001, 'lng', 55.002,
                                                   'contact', '+971 (50) 123-4567'));
  if v ->> 'state' <> 'open' or v ->> 'id' <> id1::text or (v -> 'has_contact')::boolean is not true or v ? 'contact'
     or v ? 'reporter_home' then raise exception 'FAIL SR01a reply: %', v; end if;
  execute 'reset role';
  if not exists (select 1 from jc_stray_reports where id = id1 and reporter = r1 and community_id = 'testville29'
                  and contact = '+971501234567' and note = 'Ginger, thin' and lat = 25.001 and place is null) then
    raise exception 'FAIL SR01b row: %', (select row_to_json(s) from jc_stray_reports s where id = id1); end if;
  k := k + 2;

  -- ---------- SR02 the same id again (a doubled tap) → the same report, one row; another user's id → refused ----------
  execute 'set local role authenticated';
  v := jc_stray_report_add(id1, jsonb_build_object('species', 'dog', 'place', 'Somewhere else'));
  if v ->> 'id' <> id1::text or v ->> 'species' <> 'cat' then raise exception 'FAIL SR02a idempotent: %', v; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', r2, 'role', 'authenticated')::text, true);
  v_err := null; begin perform jc_stray_report_add(id1, jsonb_build_object('species', 'cat', 'place', 'Gate')); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'BAD_FIELDS' then raise exception 'FAIL SR02b someone else''s id: %', v_err; end if;
  execute 'reset role';
  if (select count(*) from jc_stray_reports where id = id1) <> 1 then raise exception 'FAIL SR02c rows'; end if;
  k := k + 3;

  -- ---------- SR03 where is required (pin or place); a place alone is enough ----------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', r1, 'role', 'authenticated')::text, true);
  v_err := null; begin perform jc_stray_report_add(id2, jsonb_build_object('species', 'cat', 'note', 'No place')); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'BAD_FIELDS' then raise exception 'FAIL SR03a no location: %', v_err; end if;
  v := jc_stray_report_add(id2, jsonb_build_object('species', 'dog', 'place', 'Behind the clubhouse'));
  if (v -> 'has_contact')::boolean is not false then raise exception 'FAIL SR03b place only: %', v; end if;
  k := k + 2;

  -- ---------- SR04 bad fields ----------
  i := 0;
  for v in select x from jsonb_array_elements(jsonb_build_array(
      jsonb_build_object('species', 'cat', 'place', 'X', 'name', 'Tom'),              -- unknown key
      jsonb_build_object('place', 'X'),                                                -- no species
      jsonb_build_object('species', 'lion', 'place', 'X'),                             -- bad species
      jsonb_build_object('species', 'cat', 'lat', 25.0),                               -- lat without lng
      jsonb_build_object('species', 'cat', 'lat', 95.0, 'lng', 55.0),                  -- out of range
      jsonb_build_object('species', 'cat', 'lat', '25', 'lng', '55'),                  -- strings
      jsonb_build_object('species', 'cat', 'place', 'X', 'contact', '050-12ab-567'),   -- letters
      jsonb_build_object('species', 'cat', 'place', 'X', 'contact', '1234567'),        -- too short
      jsonb_build_object('species', 'cat', 'place', 'X', 'contact', '+1234567890123456'), -- too long
      jsonb_build_object('species', 'cat', 'place', 'X', 'note', repeat('a', 401)),    -- note too long
      jsonb_build_object('species', 'cat', 'place', '   ')                             -- blank place, no pin
    )) x loop
    v_err := null; begin perform jc_stray_report_add(gen_random_uuid(), v); exception when others then v_err := sqlerrm; end;
    if v_err is distinct from 'BAD_FIELDS' then raise exception 'FAIL SR04 % → %', v, v_err; end if;
    i := i + 1;
  end loop;
  v_err := null; begin perform jc_stray_report_add(null, jsonb_build_object('species', 'cat', 'place', 'X')); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'BAD_FIELDS' then raise exception 'FAIL SR04 null id: %', v_err; end if;
  k := k + i + 1;

  -- ---------- SR05 Pets off → MODULE_OFF for residents ----------
  execute 'reset role';
  update jc_communities set modules = '{"pets": {"enabled": false}}' where id = 'testville29';
  execute 'set local role authenticated';
  v_err := null; begin perform jc_stray_report_add(gen_random_uuid(), jsonb_build_object('species', 'cat', 'place', 'X')); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'MODULE_OFF' then raise exception 'FAIL SR05a add: %', v_err; end if;
  v_err := null; begin perform jc_stray_reports_mine(); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'MODULE_OFF' then raise exception 'FAIL SR05b mine: %', v_err; end if;
  execute 'reset role';
  update jc_communities set modules = '{"pets": {"enabled": true}}' where id = 'testville29';
  k := k + 2;

  -- ---------- SR06 5 a day per reporter; a day later it opens again ----------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', r2, 'role', 'authenticated')::text, true);
  for i in 1..5 loop perform jc_stray_report_add(gen_random_uuid(), jsonb_build_object('species', 'cat', 'place', 'Cap ' || i)); end loop;
  v_err := null; begin perform jc_stray_report_add(gen_random_uuid(), jsonb_build_object('species', 'cat', 'place', 'Cap 6')); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'TOO_MANY_REPORTS' then raise exception 'FAIL SR06a sixth: %', v_err; end if;
  execute 'reset role';
  update jc_stray_reports set created_at = now() - interval '1 day 1 second' where reporter = r2;
  execute 'set local role authenticated';
  perform jc_stray_report_add(id3, jsonb_build_object('species', 'cat', 'place', 'Next day'));
  k := k + 2;

  -- ---------- SR07 100 a day per community → RATE_LIMITED ----------
  execute 'reset role';
  insert into jc_stray_reports (id, community_id, species, place) select gen_random_uuid(), 'testville29', 'cat', 'Bulk' from generate_series(1, 97);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', r1, 'role', 'authenticated')::text, true);
  v_err := null; begin perform jc_stray_report_add(gen_random_uuid(), jsonb_build_object('species', 'cat', 'place', 'Hundred-and-first')); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'RATE_LIMITED' then raise exception 'FAIL SR07 community cap: % (today %)', v_err,
    (select count(*) from jc_stray_reports where community_id = 'testville29' and created_at > now() - interval '1 day'); end if;
  execute 'reset role';
  delete from jc_stray_reports where place = 'Bulk';
  k := k + 1;

  -- ---------- SR08 mine: own reports only, newest first; no number, no home ----------
  update jc_stray_reports set created_at = now() - interval '1 minute' where id = id1;
  execute 'set local role authenticated';
  v := jc_stray_reports_mine();
  if jsonb_array_length(v) <> 2 or v -> 0 ->> 'id' <> id2::text or v -> 1 ->> 'id' <> id1::text
     or v -> 1 ? 'contact' or v -> 1 ? 'reporter_home' then raise exception 'FAIL SR08 mine: %', v; end if;
  k := k + 1;

  -- ---------- SR09 residents can't use the organizer RPCs; nobody reads the table directly ----------
  v_err := null; begin perform jc_admin_stray_reports_list('open'); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'NOT_ADMIN' then raise exception 'FAIL SR09a list: %', v_err; end if;
  v_err := null; begin perform jc_admin_stray_report_close(id1, 'not_stray', null); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'NOT_ADMIN' then raise exception 'FAIL SR09b close: %', v_err; end if;
  v_err := null; begin perform count(*) from jc_stray_reports; exception when others then v_err := sqlstate; end;
  if v_err is distinct from '42501' then raise exception 'FAIL SR09c direct select: %', v_err; end if;
  v_err := null; begin perform jc_stray_report_json(null::jc_stray_reports, true); exception when others then v_err := sqlstate; end;
  if v_err is distinct from '42501' then raise exception 'FAIL SR09d internal helper: %', v_err; end if;
  k := k + 4;

  -- ---------- SR10 the organizer queue: open, oldest first, with the number and the reporter's home ----------
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  v := jc_admin_stray_reports_list('open');
  if jsonb_array_length(v) <> 8 then raise exception 'FAIL SR10a open count: %', jsonb_array_length(v); end if;
  v := (select x from jsonb_array_elements(v) x where x ->> 'id' = id1::text);
  if v ->> 'contact' <> '+971501234567' or v -> 'reporter_home' ->> 'number' <> '29' or v -> 'reporter_home' ->> 'village' <> 'north'
     or (v -> 'reporter_left')::boolean is not false then raise exception 'FAIL SR10b report: %', v; end if;
  v := (select x from jsonb_array_elements(jc_admin_stray_reports_list('open')) x where x ->> 'id' = id3::text);
  if v -> 'reporter_home' <> 'null'::jsonb or (v -> 'reporter_left')::boolean is not false then raise exception 'FAIL SR10c no home: %', v; end if;
  v_err := null; begin perform jc_admin_stray_reports_list('all'); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'BAD_FIELDS' then raise exception 'FAIL SR10d bad show: %', v_err; end if;
  k := k + 4;

  -- ---------- SR11 close: outcome / pet must agree; the pet must be an active stray of this community ----------
  v_err := null; begin perform jc_admin_stray_report_close(id1, 'not_stray', v_cat); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'BAD_FIELDS' then raise exception 'FAIL SR11a not_stray + pet: %', v_err; end if;
  v_err := null; begin perform jc_admin_stray_report_close(id1, 'added', null); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'BAD_FIELDS' then raise exception 'FAIL SR11b added, no pet: %', v_err; end if;
  v_err := null; begin perform jc_admin_stray_report_close(id1, 'adopted', null); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'BAD_FIELDS' then raise exception 'FAIL SR11c bad outcome: %', v_err; end if;
  v_err := null; begin perform jc_admin_stray_report_close(id1, 'known', v_far); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'NOT_FOUND' then raise exception 'FAIL SR11d other community''s stray: %', v_err; end if;
  v_err := null; begin perform jc_admin_stray_report_close(id1, 'known', v_old); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'NOT_FOUND' then raise exception 'FAIL SR11e archived stray: %', v_err; end if;
  k := k + 5;

  -- ---------- SR12 Add: closed, number gone, logged without number or note; the reporter sees the outcome ----------
  v := jc_admin_stray_report_close(id1, 'added', v_cat);
  if v ->> 'state' <> 'added' or v -> 'pet' ->> 'name' <> 'S29 cat' or v -> 'contact' <> 'null'::jsonb then
    raise exception 'FAIL SR12a reply: %', v; end if;
  execute 'reset role';
  if not exists (select 1 from jc_stray_reports where id = id1 and contact is null and closed_by = a1 and closed_at is not null) then
    raise exception 'FAIL SR12b row'; end if;
  if not exists (select 1 from jc_admin_log where community_id = 'testville29' and action = 'stray_report_close'
                  and target = jsonb_build_object('report_id', id1, 'outcome', 'added', 'pet_id', v_cat)) then
    raise exception 'FAIL SR12c admin log: %', (select jsonb_agg(target) from jc_admin_log where community_id = 'testville29' and action = 'stray_report_close'); end if;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', r1, 'role', 'authenticated')::text, true);
  v := (select x from jsonb_array_elements(jc_stray_reports_mine()) x where x ->> 'id' = id1::text);
  if v ->> 'state' <> 'added' or v -> 'pet' ->> 'id' <> v_cat::text or (v -> 'has_contact')::boolean is not false then
    raise exception 'FAIL SR12d mine: %', v; end if;
  k := k + 4;

  -- ---------- SR13 the same close again is a no-op (retry-safe); a different one → ALREADY_CLOSED; closed list ----------
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  v := jc_admin_stray_report_close(id1, 'added', v_cat);
  if v ->> 'state' <> 'added' then raise exception 'FAIL SR13a retry: %', v; end if;
  v_err := null; begin perform jc_admin_stray_report_close(id1, 'not_stray', null); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'ALREADY_CLOSED' then raise exception 'FAIL SR13b: %', v_err; end if;
  perform jc_admin_stray_report_close(id2, 'not_stray', null);
  v := jc_admin_stray_reports_list('closed');
  if jsonb_array_length(v) <> 2 then raise exception 'FAIL SR13c closed list: %', v; end if;
  execute 'reset role';
  if (select count(*) from jc_admin_log where community_id = 'testville29' and action = 'stray_report_close') <> 2 then
    raise exception 'FAIL SR13d a no-op wrote a log row'; end if;
  k := k + 4;

  -- ---------- SR14 another community's organizer: can't see or close these ----------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', o1, 'role', 'authenticated')::text, true);
  if jsonb_array_length(jc_admin_stray_reports_list('open')) <> 0 then raise exception 'FAIL SR14a sees other community'; end if;
  v_err := null; begin perform jc_admin_stray_report_close(id3, 'not_stray', null); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'NOT_FOUND' then raise exception 'FAIL SR14b: %', v_err; end if;
  k := k + 2;

  -- ---------- SR15 the table refuses a closed report with a number, an open one with a pet ----------
  execute 'reset role';
  v_err := null; begin update jc_stray_reports set contact = '+971501234567' where id = id1; exception when others then v_err := sqlstate; end;
  if v_err is distinct from '23514' then raise exception 'FAIL SR15a closed + number: %', v_err; end if;
  v_err := null; begin update jc_stray_reports set pet_id = v_cat where id = id3; exception when others then v_err := sqlstate; end;
  if v_err is distinct from '23514' then raise exception 'FAIL SR15b open + pet: %', v_err; end if;
  k := k + 2;

  -- ---------- SR16 nightly job: departed reporter's number, 60-day expiry, 30 days after close ----------
  update jc_stray_reports set contact = '+971509999999' where id = id3;               -- r2's open report gets a number
  update jc_stray_reports set reporter = null where id = id3;                          -- …and r2's account is gone
  -- the organizer list hides it at once, before the nightly clear (security M1)
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  v := (select x from jsonb_array_elements(jc_admin_stray_reports_list('open')) x where x ->> 'id' = id3::text);
  if v -> 'contact' <> 'null'::jsonb or (v -> 'reporter_left')::boolean is not true then raise exception 'FAIL SR16g departed number shown: %', v; end if;
  execute 'reset role';
  k := k + 1;
  insert into jc_stray_reports (id, community_id, reporter, species, place, contact, created_at) values
    ('00000000-0000-4000-8000-0000000029b1', 'testville29', r1, 'cat', 'Old open', '+971508888888', now() - interval '61 days'),
    ('00000000-0000-4000-8000-0000000029b2', 'testville29', r1, 'cat', 'Young open', '+971507777777', now() - interval '59 days');
  update jc_stray_reports set closed_at = now() - interval '31 days' where id = id1;
  update jc_stray_reports set closed_at = now() - interval '29 days' where id = id2;
  perform jc_pets_retention();
  if (select contact from jc_stray_reports where id = id3) is not null then raise exception 'FAIL SR16a departed number kept'; end if;
  if not exists (select 1 from jc_stray_reports where id = '00000000-0000-4000-8000-0000000029b1'
                  and state = 'expired' and contact is null and closed_at = now()) then raise exception 'FAIL SR16b 61-day open not expired'; end if;
  if not exists (select 1 from jc_stray_reports where id = '00000000-0000-4000-8000-0000000029b2'
                  and state = 'open' and contact = '+971507777777') then raise exception 'FAIL SR16c 59-day open touched'; end if;
  if exists (select 1 from jc_stray_reports where id = id1) then raise exception 'FAIL SR16d 31 days after close kept'; end if;
  if not exists (select 1 from jc_stray_reports where id = id2) then raise exception 'FAIL SR16e 29 days after close deleted'; end if;
  if (select job from jc_maintenance_log order by id desc limit 1) <> 'pets_purge' then raise exception 'FAIL SR16f not logged'; end if;
  k := k + 6;

  -- ---------- SR17 the reporter's home + number reach clients only through the two organizer RPCs ----------
  -- (a) every client-callable call of the helper passes a literal true / false (security L2: no computed flag)
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname in ('public', 'jc_private') and p.prokind = 'f' and has_function_privilege('authenticated', p.oid, 'execute')
                and regexp_count(pg_get_functiondef(p.oid), 'jc_stray_report_json\(')
                    <> regexp_count(pg_get_functiondef(p.oid), 'jc_stray_report_json\(\s*\w+\s*,\s*(true|false)\s*\)')) then
    raise exception 'FAIL SR17a a computed admin flag'; end if;
  -- (b) true only from these two
  if (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'jc_private') and p.prokind = 'f' and has_function_privilege('authenticated', p.oid, 'execute')
         and pg_get_functiondef(p.oid) ~* 'jc_stray_report_json\(\s*\w+\s*,\s*true\s*\)')
     is distinct from array['jc_admin_stray_report_close', 'jc_admin_stray_reports_list'] then
    raise exception 'FAIL SR17b admin view reachable from more than the organizer RPCs'; end if;
  if exists (select 1 from pg_policies where tablename = 'jc_stray_reports')
     or has_any_column_privilege('authenticated', 'public.jc_stray_reports', 'select')
     or has_any_column_privilege('anon', 'public.jc_stray_reports', 'select') then raise exception 'FAIL SR17c table reachable'; end if;
  k := k + 3;

  -- ---------- SR18 10 open per account (security M2) ----------
  insert into jc_stray_reports (id, community_id, reporter, species, place, created_at)
  select gen_random_uuid(), 'testville29', r1, 'cat', 'Open cap', now() - interval '2 days' from generate_series(1, 9);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', r1, 'role', 'authenticated')::text, true);
  v_err := null; begin perform jc_stray_report_add(gen_random_uuid(), jsonb_build_object('species', 'cat', 'place', 'Eleventh open')); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'TOO_MANY_REPORTS' then raise exception 'FAIL SR18 open cap: % (open %)', v_err,
    (select count(*) from jc_stray_reports where reporter = r1 and state = 'open'); end if;
  execute 'reset role';
  delete from jc_stray_reports where place = 'Open cap';
  k := k + 1;

  -- ---------- SR19 5 a day per home: a second account of r1's home shares r1's count (security M2) ----------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', r3, 'role', 'authenticated')::text, true);
  perform jc_join('testville29', 'S29-JOIN-CODE-01');
  execute 'reset role';
  insert into jc_home_members (user_id, home_id, community_id, via)
  select r3, m.home_id, 'testville29', 'invite' from jc_home_members m where m.user_id = r1;
  i := (select count(*) from jc_stray_reports r join jc_home_members m on m.user_id = r.reporter
         where m.home_id = (select home_id from jc_home_members where user_id = r1) and r.created_at > now() - interval '1 day');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', r3, 'role', 'authenticated')::text, true);
  while i < 5 loop perform jc_stray_report_add(gen_random_uuid(), jsonb_build_object('species', 'cat', 'place', 'Home cap')); i := i + 1; end loop;
  v_err := null; begin perform jc_stray_report_add(gen_random_uuid(), jsonb_build_object('species', 'cat', 'place', 'Home cap 6')); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'TOO_MANY_REPORTS' then raise exception 'FAIL SR19 home cap: %', v_err; end if;
  execute 'reset role';
  if (select count(*) from jc_stray_reports where reporter = r3) >= 5 then raise exception 'FAIL SR19b r3 alone hit 5 — not a home test'; end if;
  k := k + 2;

  -- ---------- SR20 the reporter withdraws their own number; nobody else can (security L1) ----------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', r3, 'role', 'authenticated')::text, true);
  v_err := null; begin perform jc_stray_report_contact_clear('00000000-0000-4000-8000-0000000029b2'); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'NOT_FOUND' then raise exception 'FAIL SR20a someone else''s report: %', v_err; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', r1, 'role', 'authenticated')::text, true);
  v := jc_stray_report_contact_clear('00000000-0000-4000-8000-0000000029b2');
  if (v -> 'has_contact')::boolean is not false then raise exception 'FAIL SR20b reply: %', v; end if;
  execute 'reset role';
  if (select contact from jc_stray_reports where id = '00000000-0000-4000-8000-0000000029b2') is not null then raise exception 'FAIL SR20c kept'; end if;
  k := k + 3;

  perform set_config('jc_test.checks', (coalesce(nullif(current_setting('jc_test.checks', true), ''), '0')::int + k)::text, true);
  raise notice 's29_stray_reports: % checks passed', k;
end
$t$;
