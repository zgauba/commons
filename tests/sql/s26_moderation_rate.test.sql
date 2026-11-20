-- R5d moderation rate limit (20261114200000_r5d_moderation_rate_limit.sql): archive and hide, 20 per hour per account.
-- now() is frozen inside the dry-run transaction: windows are expired by rewinding window_start as postgres.
-- Users m1..m3, community testville26 and its animals are throwaway fixtures (rolled back with everything else); a
-- community of its own, so slice order never matters (db review L4).
-- Not testable in one session (advisory locks are re-entrant): two parallel calls → the second RATE_LIMITED at once.

do $t$
declare
  m1 uuid := '00000000-0000-4000-8000-000000002601';
  m2 uuid := '00000000-0000-4000-8000-000000002602';
  m3 uuid := '00000000-0000-4000-8000-000000002603';
  v jsonb; v_err text; n int; k int := 0; i int;
  v_ids uuid[] := '{}'; v_id uuid; v_sids bigint[] := '{}'; v_sid bigint;
begin
  -- ---------- setup (as postgres) ----------
  insert into auth.users (id, email) values (m1, 'm1@s26.test'), (m2, 'm2@s26.test'), (m3, 'm3@s26.test');
  insert into jc_communities (id, name_en, map_lat, map_lng, modules)
  values ('testville26', 'Testville 26', 25.0, 55.0, '{"pets": {"enabled": true}}');
  perform jc_code_set('testville26', 'join', 'S26-JOIN-CODE-01');
  perform jc_code_set('testville26', 'pets', 'S26-PETS-ADMIN-01');
  execute 'set local role authenticated';
  foreach v_id in array array[m1, m2, m3] loop
    perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
    perform jc_join('testville26', 'S26-JOIN-CODE-01');
  end loop;
  foreach v_id in array array[m1, m2] loop                                   -- m3 stays a resident
    perform set_config('request.jwt.claims', json_build_object('sub', v_id, 'role', 'authenticated')::text, true);
    perform jc_admin_unlock('S26-PETS-ADMIN-01');
  end loop;
  execute 'reset role';
  -- the animals: stray rows inserted as postgres (CC-7d dropped the stray editor; archive / hide don't care about kind)
  for i in 1..23 loop
    insert into jc_pets (community_id, kind, species, name, care_state, created_by)
    values ('testville26', 'stray', 'cat', 'S26 cat ' || i, 'known_fine', m1) returning id into v_id;
    v_ids := v_ids || v_id;
  end loop;
  for i in 1..23 loop
    insert into jc_pet_sightings (community_id, pet_id, note) values ('testville26', v_ids[23], 'S26 sighting ' || i)
    returning id into v_sid;
    v_sids := v_sids || v_sid;
  end loop;

  -- ---------- MR01 refusals never count (they raise, so the counter rolls back with them) ----------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  v_err := null; begin perform jc_admin_pet_archive(v_ids[1], 'no'); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'REASON_REQUIRED' then raise exception 'FAIL MR01a: %', v_err; end if;
  v_err := null; begin perform jc_admin_pet_archive(gen_random_uuid(), 'not there'); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'NOT_FOUND' then raise exception 'FAIL MR01b: %', v_err; end if;
  v_err := null; begin perform jc_admin_sighting_hide(-1); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'NOT_FOUND' then raise exception 'FAIL MR01c: %', v_err; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  v_err := null; begin perform jc_admin_pet_archive(v_ids[1], 'not an admin'); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'NOT_ADMIN' then raise exception 'FAIL MR01d: %', v_err; end if;
  execute 'reset role';
  if exists (select 1 from jc_rate where user_id in (m1, m3) and bucket in ('pet_archive', 'sighting_hide')) then
    raise exception 'FAIL MR01e a refusal was counted: %', (select jsonb_agg(row_to_json(r)) from jc_rate r where user_id in (m1, m3)); end if;
  k := k + 5;

  -- ---------- MR02 archive: 20 per hour; the 21st is refused and archives nothing ----------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  for i in 1..20 loop perform jc_admin_pet_archive(v_ids[i], 'S26 duplicate ' || i); end loop;
  v_err := null; begin perform jc_admin_pet_archive(v_ids[21], 'S26 one too many'); exception when others then v_err := sqlerrm; end;
  execute 'reset role';
  if v_err is distinct from 'RATE_LIMITED' then raise exception 'FAIL MR02a 21st archive: %', v_err; end if;
  if (select status from jc_pets where id = v_ids[21]) is distinct from 'active' then raise exception 'FAIL MR02b archived while limited'; end if;
  select jc_rate.n into n from jc_rate where user_id = m1 and bucket = 'pet_archive';
  if n is distinct from 20 then raise exception 'FAIL MR02c archive counter = % (expected 20)', n; end if;
  if (select count(*) from jc_admin_log where community_id = 'testville26' and action = 'pet_archive') <> 20 then
    raise exception 'FAIL MR02d log rows'; end if;
  k := k + 4;

  -- ---------- MR03 per account and per bucket: another admin archives; m1 can still hide ----------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);
  v_err := null; begin perform jc_admin_pet_archive(v_ids[21], 'S26 by another admin'); exception when others then v_err := sqlerrm; end;
  if v_err is not null then raise exception 'FAIL MR03a other admin: %', v_err; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  v_err := null; begin perform jc_admin_sighting_hide(v_sids[1]); exception when others then v_err := sqlerrm; end;
  if v_err is not null then raise exception 'FAIL MR03b hide while archive-limited: %', v_err; end if;
  k := k + 2;

  -- ---------- MR04 hide: 20 per hour; the 21st is refused and hides nothing ----------
  for i in 2..20 loop perform jc_admin_sighting_hide(v_sids[i]); end loop;
  v_err := null; begin perform jc_admin_sighting_hide(v_sids[21]); exception when others then v_err := sqlerrm; end;
  execute 'reset role';
  if v_err is distinct from 'RATE_LIMITED' then raise exception 'FAIL MR04a 21st hide: %', v_err; end if;
  if (select hidden from jc_pet_sightings where id = v_sids[21]) then raise exception 'FAIL MR04b hidden while limited'; end if;
  if (select jc_rate.n from jc_rate where user_id = m1 and bucket = 'sighting_hide') is distinct from 20 then
    raise exception 'FAIL MR04c hide counter'; end if;
  k := k + 3;

  -- ---------- MR05 the window expires: allowed again ----------
  update jc_rate set window_start = now() - interval '61 minutes' where user_id = m1;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  v_err := null; begin perform jc_admin_pet_archive(v_ids[22], 'S26 after the hour'); exception when others then v_err := sqlerrm; end;
  if v_err is not null then raise exception 'FAIL MR05a archive after expiry: %', v_err; end if;
  v_err := null; begin perform jc_admin_sighting_hide(v_sids[21]); exception when others then v_err := sqlerrm; end;
  if v_err is not null then raise exception 'FAIL MR05b hide after expiry: %', v_err; end if;
  execute 'reset role';
  if (select jc_rate.n from jc_rate where user_id = m1 and bucket = 'pet_archive') is distinct from 1 then
    raise exception 'FAIL MR05c counter restarted'; end if;
  k := k + 3;

  -- ---------- MR06 the community ceiling: 60 an hour however many accounts (db + security reviews M2) ----------
  -- 22 archives and 21 hides so far this hour in testville26; top both up to 60 as if other organizers had acted
  insert into jc_admin_log (community_id, actor, action, target)
  select 'testville26', null, 'pet_archive', '{}'::jsonb from generate_series(1, 38);
  insert into jc_admin_log (community_id, actor, action, target)
  select 'testville26', null, 'sighting_hide', '{}'::jsonb from generate_series(1, 39);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', m2, 'role', 'authenticated')::text, true);   -- 1 of 20 used
  v_err := null; begin perform jc_admin_pet_archive(v_ids[23], 'S26 over the community ceiling'); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'RATE_LIMITED' then raise exception 'FAIL MR06a community archive ceiling: %', v_err; end if;
  v_err := null; begin perform jc_admin_sighting_hide(v_sids[22]); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'RATE_LIMITED' then raise exception 'FAIL MR06b community hide ceiling: %', v_err; end if;
  execute 'reset role';
  if (select status from jc_pets where id = v_ids[23]) is distinct from 'active' then raise exception 'FAIL MR06c archived over the ceiling'; end if;
  if (select jc_rate.n from jc_rate where user_id = m2 and bucket = 'pet_archive') is distinct from 1 then
    raise exception 'FAIL MR06d a ceiling refusal was counted'; end if;
  -- another community's ceiling is its own
  if exists (select 1 from jc_admin_log where community_id <> 'testville26' and action = 'pet_archive' and target = '{}'::jsonb and actor is null
             and at = now()) then raise exception 'FAIL MR06e fixture leaked'; end if;
  k := k + 5;

  -- ---------- MR07 residents can't read or write the counter (security review L) ----------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', m3, 'role', 'authenticated')::text, true);
  v_err := null; begin perform 1 from jc_rate; exception when others then v_err := sqlerrm; end;
  if v_err is null then raise exception 'FAIL MR07a jc_rate readable by authenticated'; end if;
  v_err := null; begin insert into jc_rate (user_id, bucket, n) values (m3, 'pet_archive', 0); exception when others then v_err := sqlerrm; end;
  if v_err is null then raise exception 'FAIL MR07b jc_rate insertable'; end if;
  v_err := null; begin update jc_rate set n = 0; exception when others then v_err := sqlerrm; end;
  if v_err is null then raise exception 'FAIL MR07c jc_rate updatable'; end if;
  v_err := null; begin delete from jc_rate; exception when others then v_err := sqlerrm; end;
  if v_err is null then raise exception 'FAIL MR07d jc_rate deletable'; end if;
  v_err := null; begin perform jc_rate_take(m1, 'pet_archive', 20, interval '1 hour'); exception when others then v_err := sqlerrm; end;
  if v_err is null then raise exception 'FAIL MR07e jc_rate_take callable'; end if;
  execute 'reset role';
  k := k + 5;

  perform set_config('jc_test.checks', (coalesce(nullif(current_setting('jc_test.checks', true), ''), '0')::int + k)::text, true);
  raise notice 's26_moderation_rate: % checks passed', k;
end
$t$;
