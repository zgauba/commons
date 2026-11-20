-- Pets care v2 (20261115120000_pets_care_v2.sql). CC-7d (20261120140000_cc7d_strays_off.sql) dropped the stray editor
-- (jc_admin_stray_save: auto 'state' rows, CV01-CV06 / CV11a) and the care log add (jc_admin_pet_care_add: rate limits,
-- CV10-CV12) with the rest of the Pets stray tools. What stays and is pinned here: the care log table's rules (CV07),
-- jc_pet_get's care_log shape (CV08) and the organizer list's last_fed_at / last_contact_at (CV09) over the existing rows
-- — care log rows are now written as postgres.
-- now() is frozen inside the dry-run transaction: "older" rows are made by rewinding timestamps as postgres.
-- Users c1, c3 and community testville28 are throwaway fixtures (rolled back); a community of its own (slice order).
do $t$
declare
  c1 uuid := '00000000-0000-4000-8000-000000002801';
  c3 uuid := '00000000-0000-4000-8000-000000002803';
  v_cat uuid; v_dog uuid; v jsonb; r jsonb; v_err text; k int := 0;
begin
  -- ---------- setup (as postgres) ----------
  insert into auth.users (id, email) values (c1, 'c1@s28.test'), (c3, 'c3@s28.test');
  insert into jc_communities (id, name_en, map_lat, map_lng, modules)
  values ('testville28', 'Testville 28', 25.0, 55.0, '{"pets": {"enabled": true}}');
  perform jc_code_set('testville28', 'join', 'S28-JOIN-CODE-01');
  perform jc_code_set('testville28', 'pets', 'S28-PETS-ADMIN-01');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', c3, 'role', 'authenticated')::text, true);
  perform jc_join('testville28', 'S28-JOIN-CODE-01');                          -- c3 stays a resident
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  perform jc_join('testville28', 'S28-JOIN-CODE-01');
  perform jc_admin_unlock('S28-PETS-ADMIN-01');
  execute 'reset role';
  insert into jc_pets (community_id, kind, species, name, care_state) values ('testville28', 'stray', 'cat', 'S28 cat', 'needs_help')
    returning id into v_cat;
  insert into jc_pets (community_id, kind, species, name, care_state) values ('testville28', 'stray', 'dog', 'S28 dog', 'known_fine')
    returning id into v_dog;
  -- the cat's log as care v2 wrote it: an auto state row (state, no note) and a manual state row (text, no state)
  insert into jc_pet_care_log (community_id, pet_id, author, kind, state, created_at)
  values ('testville28', v_cat, c1, 'state', 'needs_help', now() - interval '1 hour');
  insert into jc_pet_care_log (community_id, pet_id, author, kind, note, created_at)
  values ('testville28', v_cat, c1, 'state', 'Moved to the vet clinic garden', now() - interval '2 hours');

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

  -- ---------- CV08 readers: a resident's jc_pet_get carries state ----------
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

  -- ---------- CV09 CC-7d: Organizer Tools → Pets lists owned pets only (security review L1: no stray territory / care) ----------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  if exists (select 1 from jsonb_array_elements(jc_admin_pets_list()) e where e ->> 'id' in (v_dog::text, v_cat::text)) then
    raise exception 'FAIL CV09a a stray in the organizer list'; end if;
  if exists (select 1 from jsonb_array_elements(jc_admin_pets_list()) e where e ->> 'kind' is distinct from 'owned') then
    raise exception 'FAIL CV09b only owned pets'; end if;
  execute 'reset role';
  k := k + 2;

  -- CC-7d: the RPCs behind CV01-CV06 / CV10-CV12 are gone
  if to_regprocedure('public.jc_admin_stray_save(uuid, jsonb)') is not null
     or to_regprocedure('public.jc_admin_pet_care_add(uuid, text, text)') is not null then
    raise exception 'FAIL CV13 the stray editor / care log add still exist'; end if;
  k := k + 1;

  perform set_config('jc_test.checks', (coalesce(nullif(current_setting('jc_test.checks', true), ''), '0')::int + k)::text, true);
  raise notice 's28_pets_care_v2: % checks passed', k;
end
$t$;
