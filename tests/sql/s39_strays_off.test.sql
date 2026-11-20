-- CC-7d — Strays off in Pets (20261120140000_cc7d_strays_off.sql; docs/plans/CC-community-cats.md "CC-7 plan", Done when #6).
--   ST01 no active stray left from before (the migration archived them) and the 5 stray-only RPCs are gone
--   ST02 jc_pets_list: 'strays' / 'community' → BAD_FILTER; 'all' is owned pets only, even with an active stray row
--   ST03 an archived stray can't be restored (RESTORE_EXPIRED); an archived owned pet still can (regression)
--   ST04 report photos: reporter + Cats coordinators / community admins while Cats is on — never a Pets admin; nobody
--        with Cats off; a stray's pending photo can't be written (an owned pet's still can)
--   ST05 jc_snapshot_run: the pets row has owned + missing and no 'strays'
--   ST06 regression: a household's owned pet — save, mark missing, the 'missing' list
-- Own communities (testville39, testville39b) — never jubail / e2e. Run via tests/sql/build_dryrun.sh (rolls back —
-- storage rows included). now() is frozen inside the transaction: rows this run inserts have created_at = now().

do $t$
declare
  c1 uuid := '00000000-0000-4000-8000-000000003901';  -- community admin (community code)
  co uuid := '00000000-0000-4000-8000-000000003902';  -- Cats coordinator by invite
  pa uuid := '00000000-0000-4000-8000-000000003903';  -- Pets admin by invite
  r1 uuid := '00000000-0000-4000-8000-000000003904';  -- resident (reporter), home 1
  o1 uuid := '00000000-0000-4000-8000-000000003905';  -- pet owner, home 2
  m1 uuid := '00000000-0000-4000-8000-000000003906';  -- member, no home
  x1 uuid := '00000000-0000-4000-8000-000000003907';  -- member of testville39b
  q1 uuid := '00000000-0000-4000-8000-0000000039a1';
  v jsonb; k int := 0; s text; tok text; msg text; n int;
  v_stray uuid; v_old uuid; v_pend uuid; v_dog uuid; v_cat uuid; v_p text; v_po text;
  v_meta jsonb := '{"size": 2048, "mimetype": "image/jpeg"}';
begin
  execute $f$create function pg_temp.s39_as(u uuid) returns void language sql as
    $b$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $b$$f$;
  execute $f$create function pg_temp.s39_err(q text) returns text language plpgsql as
    $b$ begin execute q; return null; exception when others then return sqlerrm; end $b$$f$;
  execute 'grant execute on function pg_temp.s39_as(uuid), pg_temp.s39_err(text) to authenticated';

  -- ---------- ST01 the migration's archive + drops (before any fixture of this slice) ----------
  -- every stray that existed before this run is archived (live: e2e's 9 test strays); rows other slices inserted in
  -- this same transaction carry created_at = now() and are left out
  select count(*) into n from jc_pets where kind = 'stray' and status = 'active' and created_at < now();
  if n <> 0 then raise exception 'FAIL ST01a % active strays left from before the migration', n; end if;
  if to_regprocedure('public.jc_admin_stray_save(uuid, jsonb)') is not null
     or to_regprocedure('public.jc_admin_pet_care_add(uuid, text, text)') is not null
     or to_regprocedure('public.jc_admin_pet_care_set(uuid, text, text, date, text)') is not null
     or to_regprocedure('public.jc_admin_stray_reports_list(text)') is not null
     or to_regprocedure('public.jc_admin_stray_report_close(uuid, text, uuid)') is not null then
    raise exception 'FAIL ST01b a stray-only RPC still exists'; end if;
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace
              and proname in ('jc_admin_stray_save', 'jc_admin_pet_care_add', 'jc_admin_pet_care_set',
                              'jc_admin_stray_reports_list', 'jc_admin_stray_report_close')) then
    raise exception 'FAIL ST01c an overload of a dropped RPC survives'; end if;
  k := k + 3;

  -- ---------- fixtures (as postgres) ----------
  insert into auth.users (id, email) values (c1, 'c1@s39.test'), (co, 'co@s39.test'), (pa, 'pa@s39.test'),
    (r1, 'r1@s39.test'), (o1, 'o1@s39.test'), (m1, 'm1@s39.test'), (x1, 'x1@s39.test');
  insert into jc_communities (id, name_en, map_lat, map_lng, modules) values
    ('testville39', 'Testville 39', 24.53, 54.43, '{"pets": {"enabled": true}, "cats": {"enabled": true}}'),
    ('testville39b', 'Testville 39b', 24.53, 54.43, '{"pets": {"enabled": true}, "cats": {"enabled": true}}');
  insert into jc_villages (community_id, key, name_en) values ('testville39', 'north', 'North'), ('testville39b', 'north', 'North');
  perform jc_code_set('testville39', 'join', 'S39-JOIN-CODE-01');
  perform jc_code_set('testville39', 'community', 'S39-COMMUNITY-01');
  perform jc_code_set('testville39b', 'join', 'S39-JOIN-CODE-02');

  execute 'set local role authenticated';
  perform pg_temp.s39_as(c1); perform jc_join('testville39', 'S39-JOIN-CODE-01'); perform jc_admin_unlock('S39-COMMUNITY-01');
  foreach s in array array[co::text, pa::text, r1::text, o1::text, m1::text] loop
    perform pg_temp.s39_as(s::uuid); perform jc_join('testville39', 'S39-JOIN-CODE-01');
  end loop;
  perform pg_temp.s39_as(x1); perform jc_join('testville39b', 'S39-JOIN-CODE-02');
  foreach s in array array['cats:' || co, 'pets:' || pa] loop
    perform pg_temp.s39_as(c1);
    tok := jc_module_admin_link_create(split_part(s, ':', 1)) ->> 'token';
    perform pg_temp.s39_as(split_part(s, ':', 2)::uuid);
    perform jc_module_admin_accept(tok);
  end loop;
  perform pg_temp.s39_as(r1); perform jc_home_claim('north', 'villa', null, '1');
  perform pg_temp.s39_as(o1); perform jc_home_claim('north', 'villa', null, '2');
  v_dog := (jc_pet_save(null, '{"species": "dog", "name": "S39 Rex"}') ->> 'id')::uuid;
  v_cat := (jc_pet_save(null, '{"species": "cat", "name": "S39 Bo", "wanderer": true}') ->> 'id')::uuid;
  execute 'reset role';
  -- strays only a direct insert can make now: one active (as if left behind), one to archive, one with a pending photo
  insert into jc_pets (community_id, kind, species, name, care_state) values ('testville39', 'stray', 'cat', 'S39 stray', 'under_care')
    returning id into v_stray;
  insert into jc_pets (community_id, kind, species, name, care_state) values ('testville39', 'stray', 'cat', 'S39 old stray', 'known_fine')
    returning id into v_old;
  insert into jc_pets (community_id, kind, species, name, care_state, pending_photo_path, pending_photo_by, pending_photo_at)
  values ('testville39', 'stray', 'cat', 'S39 pending stray', 'known_fine', 'testville39/s39-stray/pending.jpg', pa, now())
    returning id into v_pend;

  -- ---------- ST02 jc_pets_list: strays left Pets ----------
  execute 'set local role authenticated';
  perform pg_temp.s39_as(m1);
  msg := pg_temp.s39_err('select jc_pets_list(''strays'')');
  if msg is distinct from 'BAD_FILTER' then raise exception 'FAIL ST02a strays filter: %', msg; end if;
  msg := pg_temp.s39_err('select jc_pets_list(''community'')');
  if msg is distinct from 'BAD_FILTER' then raise exception 'FAIL ST02b community filter: %', msg; end if;
  v := jc_pets_list('all');
  if (select array_agg((x ->> 'id')::uuid order by x ->> 'id') from jsonb_array_elements(v) x)
     is distinct from (select array_agg(id order by id::text) from unnest(array[v_dog, v_cat]) id) then
    raise exception 'FAIL ST02c all = owned only (active stray inserted): %', v; end if;
  if jsonb_array_length(jc_pets_list('owned')) <> 2 or jsonb_array_length(jc_pets_list('wanderers')) <> 1 then
    raise exception 'FAIL ST02d owned / wanderers filters: % / %', jc_pets_list('owned'), jc_pets_list('wanderers'); end if;
  k := k + 4;

  -- ---------- ST03 restore: never a stray; an owned pet within 30 days still comes back ----------
  execute 'reset role';
  perform jc_pet_retire(v_old, 'organizer');                                    -- what the migration does
  if (select status || ':' || archived_how from jc_pets where id = v_old) <> 'archived:organizer' then
    raise exception 'FAIL ST03a retire: %', (select row_to_json(p) from jc_pets p where id = v_old); end if;
  execute 'set local role authenticated';
  perform pg_temp.s39_as(pa);
  msg := pg_temp.s39_err(format('select jc_admin_pet_restore(%L)', v_old));
  if msg is distinct from 'RESTORE_EXPIRED' then raise exception 'FAIL ST03b archived stray restored: %', msg; end if;
  execute 'reset role';
  if (select status from jc_pets where id = v_old) <> 'archived' then raise exception 'FAIL ST03c stray active again'; end if;
  execute 'set local role authenticated';
  perform pg_temp.s39_as(o1);
  perform jc_pet_archive(v_dog);
  perform pg_temp.s39_as(pa);
  msg := pg_temp.s39_err(format('select jc_admin_pet_restore(%L)', v_dog));
  if msg is not null then raise exception 'FAIL ST03d owned pet restore refused: %', msg; end if;
  execute 'reset role';
  if (select status from jc_pets where id = v_dog) <> 'active' then raise exception 'FAIL ST03e owned pet not restored'; end if;
  k := k + 5;

  -- ---------- ST04 photo rules ----------
  execute 'set local role authenticated';
  perform pg_temp.s39_as(r1);
  perform jc_stray_report_add(q1, jsonb_build_object('place', 'Behind the souk', 'lat', 24.531, 'lng', 54.431));
  v_p := jc_stray_report_photo_begin(q1, 'jpg') ->> 'path';
  execute 'reset role';
  insert into storage.objects (bucket_id, name, owner, metadata) values ('pet-photos', v_p, r1, v_meta);
  execute 'set local role authenticated';
  perform jc_stray_report_photo_commit(q1);
  -- Cats on (Pets on): reporter, coordinator, community admin read; a Pets admin, a member, another community don't
  if not jc_private.pet_photo_can_read(v_p) then raise exception 'FAIL ST04a reporter'; end if;
  perform pg_temp.s39_as(co);
  if not jc_private.pet_photo_can_read(v_p) then raise exception 'FAIL ST04b Cats coordinator'; end if;
  perform pg_temp.s39_as(c1);
  if not jc_private.pet_photo_can_read(v_p) then raise exception 'FAIL ST04c community admin'; end if;
  perform pg_temp.s39_as(pa);
  if jc_private.pet_photo_can_read(v_p) then raise exception 'FAIL ST04d Pets admin reads a report photo (Pets on)'; end if;
  perform pg_temp.s39_as(m1);
  if jc_private.pet_photo_can_read(v_p) then raise exception 'FAIL ST04e member reads a report photo'; end if;
  perform pg_temp.s39_as(x1);
  if jc_private.pet_photo_can_read(v_p) then raise exception 'FAIL ST04f another community reads'; end if;
  -- Cats off (Pets on): nobody
  execute 'reset role';
  update jc_communities set modules = '{"pets": {"enabled": true}, "cats": {"enabled": false}}' where id = 'testville39';
  execute 'set local role authenticated';
  foreach s in array array[r1::text, co::text, c1::text, pa::text] loop
    perform pg_temp.s39_as(s::uuid);
    if jc_private.pet_photo_can_read(v_p) then raise exception 'FAIL ST04g % reads with Cats off', s; end if;
  end loop;
  execute 'reset role';
  update jc_communities set modules = '{"pets": {"enabled": true}, "cats": {"enabled": true}}' where id = 'testville39';
  -- a stray's pending photo: never writable, even by the Pets admin who began it within the window
  execute 'set local role authenticated';
  perform pg_temp.s39_as(pa);
  if jc_private.pet_photo_can_write('testville39/s39-stray/pending.jpg') then raise exception 'FAIL ST04h stray photo writable'; end if;
  msg := null;
  begin
    insert into storage.objects (bucket_id, name, owner, metadata) values ('pet-photos', 'testville39/s39-stray/pending.jpg', pa, v_meta);
  exception when others then msg := sqlerrm; end;
  if msg is null or msg not like 'new row violates row-level security policy%' then raise exception 'FAIL ST04i stray photo upload: %', msg; end if;
  -- regression: the household's own pending upload is writable
  perform pg_temp.s39_as(o1);
  v_po := jc_pet_photo_begin(v_cat, 'jpg') ->> 'path';
  if not jc_private.pet_photo_can_write(v_po) then raise exception 'FAIL ST04j owned pet photo not writable'; end if;
  k := k + 10;

  -- ---------- ST05 snapshot: owned + missing, no 'strays' ----------
  perform jc_pet_missing_set(v_dog, true, null);
  execute 'reset role';
  n := jc_snapshot_run(now());
  v := (select metrics from jc_snapshots where community_id = 'testville39' and module = 'pets' and bucket = date_trunc('hour', now()));
  if v is null or v ? 'strays' then raise exception 'FAIL ST05a strays key: %', v; end if;
  if (v ->> 'owned')::int <> 2 or (v ->> 'missing')::int <> 1 or (v ->> 'enabled')::boolean is not true then
    raise exception 'FAIL ST05b owned / missing (the active stray not counted): %', v; end if;
  k := k + 2;

  -- ---------- ST06 regression: a household's owned pet ----------
  execute 'set local role authenticated';
  perform pg_temp.s39_as(o1);
  v := jc_pet_save(null, '{"species": "rabbit", "name": "S39 Thumper"}');
  if v ->> 'name' <> 'S39 Thumper' or not (v ->> 'mine')::boolean then raise exception 'FAIL ST06a save: %', v; end if;
  perform jc_pet_missing_set((v ->> 'id')::uuid, true, 'by the marina');
  perform pg_temp.s39_as(m1);
  v := jc_pets_list('missing');
  if jsonb_array_length(v) <> 2 or not exists (select 1 from jsonb_array_elements(v) x where x ->> 'name' = 'S39 Thumper'
                                                  and (x ->> 'missing')::boolean and x ->> 'last_seen_note' = 'by the marina') then
    raise exception 'FAIL ST06b missing list: %', v; end if;
  execute 'reset role';
  k := k + 2;

  perform set_config('jc_test.checks', (coalesce(nullif(current_setting('jc_test.checks', true), ''), '0')::int + k)::text, true);
  raise notice 's39_strays_off: % checks passed', k;
end
$t$;
