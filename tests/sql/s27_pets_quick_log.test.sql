-- Pets quick log (20261115100000_pets_quick_log.sql): Fed / Vet visit without a note; Note / Status change still need text.
-- Users q1, q2 and community testville27 are throwaway fixtures (rolled back); a community of its own (slice order).

do $t$
declare
  q1 uuid := '00000000-0000-4000-8000-000000002701';
  q2 uuid := '00000000-0000-4000-8000-000000002702';
  v_cat uuid; v jsonb; v_err text; k int := 0;
begin
  -- ---------- setup (as postgres) ----------
  insert into auth.users (id, email) values (q1, 'q1@s27.test'), (q2, 'q2@s27.test');
  insert into jc_communities (id, name_en, map_lat, map_lng, modules)
  values ('testville27', 'Testville 27', 25.0, 55.0, '{"pets": {"enabled": true}}');
  perform jc_code_set('testville27', 'join', 'S27-JOIN-CODE-01');
  perform jc_code_set('testville27', 'pets', 'S27-PETS-ADMIN-01');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', q2, 'role', 'authenticated')::text, true);
  perform jc_join('testville27', 'S27-JOIN-CODE-01');                          -- q2 stays a resident
  perform set_config('request.jwt.claims', json_build_object('sub', q1, 'role', 'authenticated')::text, true);
  perform jc_join('testville27', 'S27-JOIN-CODE-01');
  perform jc_admin_unlock('S27-PETS-ADMIN-01');
  v_cat := (jc_admin_stray_save(null, jsonb_build_object('species', 'cat', 'name', 'S27 cat')) ->> 'id')::uuid;

  -- ---------- QL01 fed / vet: null, '' and blank notes are logged, stored as null (never '') ----------
  perform jc_admin_pet_care_add(v_cat, 'fed', null);
  perform jc_admin_pet_care_add(v_cat, 'vet', '');
  perform jc_admin_pet_care_add(v_cat, 'fed', '    ');
  perform jc_admin_pet_care_add(v_cat, 'vet', null);                           -- db review L3
  execute 'reset role';
  if (select count(*) from jc_pet_care_log where pet_id = v_cat and note is null) <> 4 then
    raise exception 'FAIL QL01a quick logs: %', (select jsonb_agg(row_to_json(c)) from jc_pet_care_log c where pet_id = v_cat); end if;
  if exists (select 1 from jc_pet_care_log where pet_id = v_cat and note = '') then raise exception 'FAIL QL01b empty string stored'; end if;
  if (select count(*) from jc_admin_log where community_id = 'testville27' and action = 'pet_care_add') <> 4 then
    raise exception 'FAIL QL01c admin log rows'; end if;
  k := k + 3;

  -- ---------- QL02 note / state still need text (BAD_FIELDS) and write nothing ----------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', q1, 'role', 'authenticated')::text, true);
  v_err := null; begin perform jc_admin_pet_care_add(v_cat, 'note', null); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'BAD_FIELDS' then raise exception 'FAIL QL02a note without text: %', v_err; end if;
  v_err := null; begin perform jc_admin_pet_care_add(v_cat, 'state', '   '); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'BAD_FIELDS' then raise exception 'FAIL QL02b state without text: %', v_err; end if;
  v_err := null; begin perform jc_admin_pet_care_add(v_cat, 'walk', null); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'BAD_FIELDS' then raise exception 'FAIL QL02c unknown kind: %', v_err; end if;
  v_err := null; begin perform jc_admin_pet_care_add(v_cat, null, 'x'); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'BAD_FIELDS' then raise exception 'FAIL QL02d null kind: %', v_err; end if;
  v_err := null; begin perform jc_admin_pet_care_add(v_cat, 'fed', repeat('x', 401)); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'BAD_FIELDS' then raise exception 'FAIL QL02e over 400: %', v_err; end if;
  execute 'reset role';
  if (select count(*) from jc_pet_care_log where pet_id = v_cat) <> 4 then raise exception 'FAIL QL02f a refusal wrote a row'; end if;
  k := k + 6;

  -- ---------- QL03 with a note: unchanged (trimmed, kept) ----------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', q1, 'role', 'authenticated')::text, true);
  perform jc_admin_pet_care_add(v_cat, 'fed', '  Fed at the marina  ');
  perform jc_admin_pet_care_add(v_cat, 'note', 'Limping a little');
  perform jc_admin_pet_care_add(v_cat, 'vet', repeat('v', 350));               -- 281..400 → kept, cut to 280 (db review L3)
  execute 'reset role';
  if not exists (select 1 from jc_pet_care_log where pet_id = v_cat and kind = 'vet' and note = repeat('v', 280)) then
    raise exception 'FAIL QL03c truncation to 280'; end if;
  if not exists (select 1 from jc_pet_care_log where pet_id = v_cat and kind = 'fed' and note = 'Fed at the marina') then
    raise exception 'FAIL QL03a fed with a note'; end if;
  if not exists (select 1 from jc_pet_care_log where pet_id = v_cat and kind = 'note' and note = 'Limping a little') then
    raise exception 'FAIL QL03b note'; end if;
  k := k + 3;

  -- ---------- QL04 the table itself: a null note only for fed / vet; '' never ----------
  v_err := null; begin insert into jc_pet_care_log (community_id, pet_id, kind, note) values ('testville27', v_cat, 'note', null);
    exception when others then v_err := sqlstate; end;
  if v_err is distinct from '23514' then raise exception 'FAIL QL04a null note for kind note: %', v_err; end if;
  v_err := null; begin insert into jc_pet_care_log (community_id, pet_id, kind, note) values ('testville27', v_cat, 'state', null);
    exception when others then v_err := sqlstate; end;
  if v_err is distinct from '23514' then raise exception 'FAIL QL04b null note for kind state: %', v_err; end if;
  v_err := null; begin insert into jc_pet_care_log (community_id, pet_id, kind, note) values ('testville27', v_cat, 'fed', '');
    exception when others then v_err := sqlstate; end;
  if v_err is distinct from '23514' then raise exception 'FAIL QL04c empty string: %', v_err; end if;
  v_err := null; begin insert into jc_pet_care_log (community_id, pet_id, kind, note) values ('testville27', v_cat, 'vet', repeat('x', 281));
    exception when others then v_err := sqlstate; end;
  if v_err is distinct from '23514' then raise exception 'FAIL QL04d over 280: %', v_err; end if;
  k := k + 4;

  -- ---------- QL05 readers: a resident sees the quick logs with note null; still admin-only to write ----------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', q2, 'role', 'authenticated')::text, true);
  v := jc_pet_get(v_cat);
  if jsonb_array_length(v -> 'care_log') <> 7 then raise exception 'FAIL QL05a care_log length: %', v -> 'care_log'; end if;
  if (select count(*) from jsonb_array_elements(v -> 'care_log') e where e -> 'note' = 'null'::jsonb) <> 4 then
    raise exception 'FAIL QL05b null notes in care_log: %', v -> 'care_log'; end if;
  v_err := null; begin perform jc_admin_pet_care_add(v_cat, 'fed', null); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'NOT_ADMIN' then raise exception 'FAIL QL05c resident quick log: %', v_err; end if;
  execute 'reset role';
  k := k + 3;

  perform set_config('jc_test.checks', (coalesce(nullif(current_setting('jc_test.checks', true), ''), '0')::int + k)::text, true);
  raise notice 's27_pets_quick_log: % checks passed', k;
end
$t$;
