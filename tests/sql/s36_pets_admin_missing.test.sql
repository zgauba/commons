-- Pets admins mark / un-mark a resident's pet missing (migration 20261119140000_pets_admin_missing).
-- Own communities (testville36 / testville36b) — never jubail. Run via tests/sql/build_dryrun.sh (rolls back).

do $t$
declare
  o1 uuid := '00000000-0000-4000-8000-000000003601';  -- owner of Rex + Bo (home 1)
  o2 uuid := '00000000-0000-4000-8000-000000003602';  -- neighbour, plain member (home 2)
  ad uuid := '00000000-0000-4000-8000-000000003603';  -- Pets admin (no home)
  ca uuid := '00000000-0000-4000-8000-000000003604';  -- community admin (no home)
  x1 uuid := '00000000-0000-4000-8000-000000003605';  -- testville36b owner of Max
  xa uuid := '00000000-0000-4000-8000-000000003606';  -- testville36b Pets admin
  v jsonb; k int := 0; msg text; r public.jc_pets%rowtype;
  v_rex uuid; v_bo uuid; v_max uuid; v_snow uuid;
begin
  execute $f$create function pg_temp.s36_as(u uuid) returns void language sql as
    $b$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $b$$f$;
  execute $f$create function pg_temp.s36_err(q text) returns text language plpgsql as
    $b$ begin execute q; return null; exception when others then return sqlerrm; end $b$$f$;
  execute 'grant execute on function pg_temp.s36_as(uuid), pg_temp.s36_err(text) to authenticated';

  -- ---------- fixtures ----------
  insert into auth.users (id, email) values (o1, 'o1@s36.test'), (o2, 'o2@s36.test'), (ad, 'ad@s36.test'),
    (ca, 'ca@s36.test'), (x1, 'x1@s36.test'), (xa, 'xa@s36.test');
  insert into jc_communities (id, name_en, map_lat, map_lng, modules) values
    ('testville36', 'Testville 36', 24.53, 54.43, '{"pets": {"enabled": true}}'),
    ('testville36b', 'Testville 36b', 25.00, 55.00, '{"pets": {"enabled": true}}');
  insert into jc_villages (community_id, key, name_en) values ('testville36', 'north', 'North'), ('testville36b', 'north', 'North');
  perform jc_code_set('testville36', 'join', 'S36-JOIN-CODE-01');
  perform jc_code_set('testville36', 'pets', 'S36-PETS-ADMIN-01');
  perform jc_code_set('testville36', 'community', 'S36-COMMUNITY-01');
  perform jc_code_set('testville36b', 'join', 'S36-JOIN-CODE-02');
  perform jc_code_set('testville36b', 'pets', 'S36B-PETS-ADMIN1');

  execute 'set local role authenticated';
  perform pg_temp.s36_as(o1); perform jc_join('testville36', 'S36-JOIN-CODE-01'); perform jc_home_claim('north', 'villa', null, '1');
  v_rex := (jc_pet_save(null, '{"species": "dog", "name": "Rex"}') ->> 'id')::uuid;
  v_bo := (jc_pet_save(null, '{"species": "cat", "name": "Bo"}') ->> 'id')::uuid;
  perform pg_temp.s36_as(o2); perform jc_join('testville36', 'S36-JOIN-CODE-01'); perform jc_home_claim('north', 'villa', null, '2');
  perform pg_temp.s36_as(ad); perform jc_join('testville36', 'S36-JOIN-CODE-01'); perform jc_admin_unlock('S36-PETS-ADMIN-01');
  v_snow := (jc_admin_stray_save(null, '{"species": "cat", "name": "Snow"}') ->> 'id')::uuid;
  perform pg_temp.s36_as(ca); perform jc_join('testville36', 'S36-JOIN-CODE-01'); perform jc_admin_unlock('S36-COMMUNITY-01');
  perform pg_temp.s36_as(x1); perform jc_join('testville36b', 'S36-JOIN-CODE-02'); perform jc_home_claim('north', 'villa', null, '9');
  v_max := (jc_pet_save(null, '{"species": "dog", "name": "Max"}') ->> 'id')::uuid;
  perform pg_temp.s36_as(xa); perform jc_join('testville36b', 'S36-JOIN-CODE-02'); perform jc_admin_unlock('S36B-PETS-ADMIN1');

  -- ---------- AM01 a Pets admin marks a neighbour's pet missing (Done when 1) ----------
  perform pg_temp.s36_as(ad);
  v := jc_admin_pet_missing_set(v_rex, true, '  Last seen by the <b>canal</b>  ');
  if (v ->> 'missing')::boolean is not true or v ->> 'missing_since' is null or v ->> 'id' <> v_rex::text then
    raise exception 'FAIL AM01a card: %', v; end if;
  if v -> 'missing_by_team' <> 'null'::jsonb then raise exception 'FAIL AM01b admin is not the household: %', v -> 'missing_by_team'; end if;
  execute 'reset role';
  select * into r from jc_pets where id = v_rex;
  if not r.missing or not r.missing_by_team or r.missing_since is null or r.last_seen_note is null
     or r.updated_by <> ad then raise exception 'FAIL AM01c row: % % % %', r.missing, r.missing_by_team, r.last_seen_note, r.updated_by; end if;
  if (select count(*) from jc_admin_log where community_id = 'testville36' and actor = ad and action = 'pet_missing'
        and target = jsonb_build_object('pet_id', v_rex, 'missing', true)) <> 1 then
    raise exception 'FAIL AM01d not logged with the admin'; end if;
  execute 'set local role authenticated';
  k := k + 4;

  -- ---------- AM02 the owner learns the team did it; a neighbour doesn't (Done when 2) ----------
  perform pg_temp.s36_as(o1);
  v := jc_pet_get(v_rex);
  if (v ->> 'missing_by_team')::boolean is not true or (v ->> 'mine')::boolean is not true then
    raise exception 'FAIL AM02a owner card: %', v; end if;
  perform pg_temp.s36_as(o2);
  v := jc_pet_get(v_rex);
  if (v ->> 'missing')::boolean is not true or v -> 'missing_by_team' <> 'null'::jsonb then
    raise exception 'FAIL AM02b neighbour card: %', v; end if;
  if exists (select 1 from jsonb_array_elements(jc_pets_list('all')) x
              where x ->> 'id' = v_rex::text and x -> 'missing_by_team' <> 'null'::jsonb) then
    raise exception 'FAIL AM02c neighbour list carries the flag'; end if;
  k := k + 3;

  -- ---------- AM03 the household's own switch clears the flag, both ways ----------
  perform pg_temp.s36_as(o1);
  v := jc_pet_missing_set(v_rex, false, null);
  execute 'reset role';
  select * into r from jc_pets where id = v_rex;
  if r.missing or r.missing_by_team or r.missing_since is not null or r.last_seen_note is not null then
    raise exception 'FAIL AM03a owner found: % %', r.missing, r.missing_by_team; end if;
  execute 'set local role authenticated';
  perform pg_temp.s36_as(ad); perform jc_admin_pet_missing_set(v_rex, true, null);
  perform pg_temp.s36_as(o1);
  v := jc_pet_missing_set(v_rex, true, 'still out');                -- the household re-reports: now theirs
  if (v ->> 'missing_by_team')::boolean is not false then raise exception 'FAIL AM03b owner write keeps the flag: %', v; end if;
  k := k + 2;

  -- ---------- AM04 an admin marks the pet back home (Done when 3); a community admin may too ----------
  perform pg_temp.s36_as(ca);
  perform jc_admin_pet_missing_set(v_rex, true, null);
  execute 'reset role';
  -- a community admin passes jc_assert_admin('pets'); the household reported it (AM03b), so it stays theirs (review M2)
  if (select missing and not missing_by_team and last_seen_note = 'still out' from jc_pets where id = v_rex) is not true then
    raise exception 'FAIL AM04a community admin re-mark'; end if;
  execute 'set local role authenticated';
  perform pg_temp.s36_as(ad);
  v := jc_admin_pet_missing_set(v_rex, false, 'ignored when found');
  execute 'reset role';
  select * into r from jc_pets where id = v_rex;
  if r.missing or r.missing_by_team or r.missing_since is not null or r.last_seen_note is not null then
    raise exception 'FAIL AM04b admin found: % % %', r.missing, r.missing_by_team, r.last_seen_note; end if;
  if (select count(*) from jc_admin_log where community_id = 'testville36' and action = 'pet_missing'
        and target = jsonb_build_object('pet_id', v_rex, 'missing', false) and actor = ad) <> 1 then
    raise exception 'FAIL AM04c found not logged'; end if;
  execute 'set local role authenticated';
  k := k + 3;

  -- ---------- AM05 refusals (Done when 4) ----------
  perform pg_temp.s36_as(o2);                                         -- a plain member, even a neighbour
  msg := pg_temp.s36_err(format('select jc_admin_pet_missing_set(%L, true, null)', v_rex));
  if msg is distinct from 'NOT_ADMIN' then raise exception 'FAIL AM05a member: %', msg; end if;
  perform pg_temp.s36_as(o1);                                         -- the owner too: their door is jc_pet_missing_set
  msg := pg_temp.s36_err(format('select jc_admin_pet_missing_set(%L, true, null)', v_rex));
  if msg is distinct from 'NOT_ADMIN' then raise exception 'FAIL AM05b owner: %', msg; end if;
  perform pg_temp.s36_as(ad);
  msg := pg_temp.s36_err(format('select jc_admin_pet_missing_set(%L, true, null)', v_snow));
  if msg is distinct from 'NOT_FOUND' then raise exception 'FAIL AM05c stray: %', msg; end if;
  msg := pg_temp.s36_err(format('select jc_admin_pet_missing_set(%L, true, null)', v_max));
  if msg is distinct from 'NOT_FOUND' then raise exception 'FAIL AM05d other community: %', msg; end if;
  perform pg_temp.s36_as(xa);                                         -- and the other community's admin can't reach ours
  msg := pg_temp.s36_err(format('select jc_admin_pet_missing_set(%L, true, null)', v_rex));
  if msg is distinct from 'NOT_FOUND' then raise exception 'FAIL AM05e other admin: %', msg; end if;
  perform pg_temp.s36_as(ad);
  msg := pg_temp.s36_err(format('select jc_admin_pet_missing_set(%L, null, null)', v_rex));
  if msg is distinct from 'BAD_FIELDS' then raise exception 'FAIL AM05f null: %', msg; end if;
  msg := pg_temp.s36_err(format('select jc_admin_pet_missing_set(%L, true, %L)', v_rex, repeat('x', 401)));
  if msg is distinct from 'BAD_FIELDS' then raise exception 'FAIL AM05g long note: %', msg; end if;
  msg := pg_temp.s36_err(format('select jc_admin_pet_missing_set(%L, true, null)', gen_random_uuid()));
  if msg is distinct from 'NOT_FOUND' then raise exception 'FAIL AM05h unknown: %', msg; end if;
  execute 'reset role';
  update jc_communities set modules = '{"pets": {"enabled": false}}' where id = 'testville36';
  execute 'set local role authenticated';
  perform pg_temp.s36_as(ad);
  msg := pg_temp.s36_err(format('select jc_admin_pet_missing_set(%L, true, null)', v_rex));
  if msg is distinct from 'MODULE_OFF' then raise exception 'FAIL AM05i module off: %', msg; end if;
  execute 'reset role';
  update jc_communities set modules = '{"pets": {"enabled": true}}' where id = 'testville36';
  if (select missing from jc_pets where id = v_rex) then raise exception 'FAIL AM05j a refusal wrote'; end if;
  if has_function_privilege('anon', 'public.jc_admin_pet_missing_set(uuid, boolean, text)', 'execute') then
    raise exception 'FAIL AM05k anon can execute'; end if;
  execute 'set local role authenticated';
  k := k + 11;

  -- ---------- AM06 archiving a team-marked pet clears the flag (CHECK); an archived pet is NOT_FOUND ----------
  perform pg_temp.s36_as(ad); perform jc_admin_pet_missing_set(v_bo, true, null);
  perform pg_temp.s36_as(o1); perform jc_pet_archive(v_bo);
  execute 'reset role';
  select * into r from jc_pets where id = v_bo;
  if r.status <> 'archived' or r.missing or r.missing_by_team then raise exception 'FAIL AM06a archive: % % %', r.status, r.missing, r.missing_by_team; end if;
  execute 'set local role authenticated';
  perform pg_temp.s36_as(ad);
  msg := pg_temp.s36_err(format('select jc_admin_pet_missing_set(%L, true, null)', v_bo));
  if msg is distinct from 'NOT_FOUND' then raise exception 'FAIL AM06b archived: %', msg; end if;
  k := k + 2;

  -- ---------- AM08 review M2: an admin re-mark keeps the household's note and their attribution ----------
  execute 'set local role authenticated';
  perform pg_temp.s36_as(o1); perform jc_pet_missing_set(v_rex, true, 'by the gate');
  perform pg_temp.s36_as(ad); perform jc_admin_pet_missing_set(v_rex, true, null);
  execute 'reset role';
  select * into r from jc_pets where id = v_rex;
  if r.last_seen_note is distinct from 'by the gate' or r.missing_by_team then
    raise exception 'FAIL AM08a re-mark: % %', r.last_seen_note, r.missing_by_team; end if;
  execute 'set local role authenticated';
  perform pg_temp.s36_as(ad); perform jc_admin_pet_missing_set(v_rex, true, 'seen at the souk');
  execute 'reset role';
  if (select last_seen_note from jc_pets where id = v_rex) is distinct from 'seen at the souk' then
    raise exception 'FAIL AM08b a new note replaces'; end if;
  execute 'set local role authenticated';
  perform pg_temp.s36_as(ad); perform jc_admin_pet_missing_set(v_rex, false, null);
  k := k + 2;

  -- ---------- AM09 review M1: 20 marks an hour per admin, 60 per community; found is never limited ----------
  execute 'reset role';
  insert into jc_rate (user_id, bucket, window_start, n)                          -- the counter as 20 marks would leave it
    values (ad, 'pet_missing', now(), 20)
    on conflict (user_id, bucket) do update set window_start = now(), n = 20;
  execute 'set local role authenticated';
  perform pg_temp.s36_as(ad);
  msg := pg_temp.s36_err(format('select jc_admin_pet_missing_set(%L, true, null)', v_rex));
  if msg is distinct from 'RATE_LIMITED' then raise exception 'FAIL AM09a per admin: %', msg; end if;
  msg := pg_temp.s36_err(format('select jc_admin_pet_missing_set(%L, false, null)', v_rex));
  if msg is not null then raise exception 'FAIL AM09b found while limited: %', msg; end if;
  execute 'reset role';
  insert into jc_admin_log (community_id, actor, action, target)
    select 'testville36', ad, 'pet_missing', jsonb_build_object('pet_id', v_rex, 'missing', true) from generate_series(1, 60);
  execute 'set local role authenticated';
  perform pg_temp.s36_as(ca);                                                          -- another admin, same community
  msg := pg_temp.s36_err(format('select jc_admin_pet_missing_set(%L, true, null)', v_rex));
  if msg is distinct from 'RATE_LIMITED' then raise exception 'FAIL AM09c per community: %', msg; end if;
  k := k + 3;

  -- ---------- AM07 the CHECK: the team flag never stands without missing ----------
  execute 'reset role';
  msg := null; begin update jc_pets set missing_by_team = true where id = v_rex; exception when others then msg := sqlstate; end;
  if msg is distinct from '23514' then raise exception 'FAIL AM07 flag without missing: %', msg; end if;
  k := k + 1;

  perform set_config('jc_test.checks', (coalesce(nullif(current_setting('jc_test.checks', true), ''), '0')::int + k)::text, true);
  raise notice 's36_pets_admin_missing: % checks passed', k;
end
$t$;
