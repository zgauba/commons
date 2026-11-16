-- Soft archive, PR 1 (20261117090000_soft_archive.sql): 30-day restore, un-hide, nightly moderation alert.
-- now() is frozen inside the dry-run transaction: "older" rows are made by rewinding timestamps as postgres.
-- Users h1 (home 31), n1 (joins later), m1 (member), a1 (pets admin), c1 (community admin), o1 (pets admin of
-- testville31b) and communities testville31 / testville31b are throwaway fixtures (rolled back).
do $t$
declare
  h1 uuid := '00000000-0000-4000-8000-000000003101';
  n1 uuid := '00000000-0000-4000-8000-000000003102';
  m1 uuid := '00000000-0000-4000-8000-000000003103';
  a1 uuid := '00000000-0000-4000-8000-000000003104';
  c1 uuid := '00000000-0000-4000-8000-000000003105';
  o1 uuid := '00000000-0000-4000-8000-000000003106';
  v_cat uuid; v_dog uuid; v_rex uuid; v_bo uuid; v_far uuid; v_home uuid; v_sid bigint; v_log bigint;
  p_keep text := 'testville31/pets/keep.jpg'; p_old text := 'testville31/pets/old.jpg'; p_pend text := 'testville31/pets/pend.jpg';
  p_rex text := 'testville31/pets/rex.jpg'; p_bo text := 'testville31/pets/bo.jpg';
  v jsonb; v_err text; k int := 0; i int;
begin
  -- ---------- setup (as postgres) ----------
  insert into auth.users (id, email) values (h1, 'h1@s31.test'), (n1, 'n1@s31.test'), (m1, 'm1@s31.test'),
    (a1, 'a1@s31.test'), (c1, 'c1@s31.test'), (o1, 'o1@s31.test');
  insert into jc_communities (id, name_en, map_lat, map_lng, modules) values
    ('testville31', 'Testville 31', 25.0, 55.0, '{"pets": {"enabled": true}}'),
    ('testville31b', 'Testville 31b', 25.0, 55.0, '{"pets": {"enabled": true}}');
  insert into jc_villages (community_id, key, name_en) values ('testville31', 'north', 'North');
  perform jc_code_set('testville31', 'join', 'S31-JOIN-CODE-01');
  perform jc_code_set('testville31', 'pets', 'S31-PETS-ADMIN-01');
  perform jc_code_set('testville31', 'community', 'S31-COMMUNITY-01');
  perform jc_code_set('testville31b', 'join', 'S31B-JOIN-CODE-1');
  perform jc_code_set('testville31b', 'pets', 'S31B-PETS-ADMIN1');
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', h1, 'role', 'authenticated')::text, true);
  perform jc_join('testville31', 'S31-JOIN-CODE-01');
  perform jc_home_claim('north', 'villa', null, '31');
  v_rex := (jc_pet_save(null, '{"species": "dog", "name": "S31 Rex"}') ->> 'id')::uuid;
  v_bo := (jc_pet_save(null, '{"species": "cat", "name": "S31 Bo"}') ->> 'id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', n1, 'role', 'authenticated')::text, true);
  perform jc_join('testville31', 'S31-JOIN-CODE-01');
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  perform jc_join('testville31', 'S31-JOIN-CODE-01');
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  perform jc_join('testville31', 'S31-JOIN-CODE-01');
  perform jc_admin_unlock('S31-COMMUNITY-01');
  perform set_config('request.jwt.claims', json_build_object('sub', o1, 'role', 'authenticated')::text, true);
  perform jc_join('testville31b', 'S31B-JOIN-CODE-1');
  perform jc_admin_unlock('S31B-PETS-ADMIN1');
  v_far := (jc_admin_stray_save(null, jsonb_build_object('species', 'cat', 'name', 'S31 far cat')) ->> 'id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  perform jc_join('testville31', 'S31-JOIN-CODE-01');
  perform jc_admin_unlock('S31-PETS-ADMIN-01');
  v_cat := (jc_admin_stray_save(null, jsonb_build_object('species', 'cat', 'name', 'S31 cat')) ->> 'id')::uuid;
  v_dog := (jc_admin_stray_save(null, jsonb_build_object('species', 'dog', 'name', 'S31 dog')) ->> 'id')::uuid;
  execute 'reset role';
  select home_id into v_home from jc_home_members where user_id = h1;
  -- photos: the cat has a current photo, an older retired-pending-cleanup row and a pending upload; Rex and Bo one each
  insert into jc_pet_photos (path, community_id, pet_id, created_by, state) values
    (p_keep, 'testville31', v_cat, a1, 'current'), (p_old, 'testville31', v_cat, a1, 'current'),
    (p_pend, 'testville31', v_cat, a1, 'pending'),
    (p_rex, 'testville31', v_rex, h1, 'current'), (p_bo, 'testville31', v_bo, h1, 'current');
  update jc_pets set photo_path = p_keep, pending_photo_path = p_pend, pending_photo_by = a1, pending_photo_at = now() where id = v_cat;
  update jc_pets set photo_path = p_rex where id = v_rex;
  update jc_pets set photo_path = p_bo where id = v_bo;

  -- ---------- SA01 organizer archive keeps ONE photo, unreadable; everything else retires ----------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  if not jc_private.pet_photo_can_read(p_keep) then raise exception 'FAIL SA01a photo unreadable before archive'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  perform jc_admin_pet_archive(v_cat, 'duplicate listing');
  if jc_private.pet_photo_can_read(p_keep) then raise exception 'FAIL SA01b kept photo readable by an admin'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  if jc_private.pet_photo_can_read(p_keep) then raise exception 'FAIL SA01c kept photo readable by a member'; end if;
  execute 'reset role';
  if not exists (select 1 from jc_pets where id = v_cat and status = 'archived' and archived_how = 'organizer'
                  and archived_at = now() and archived_photo_path = p_keep and photo_path is null and pending_photo_path is null) then
    raise exception 'FAIL SA01d row: %', (select row_to_json(p) from jc_pets p where id = v_cat); end if;
  if (select state from jc_pet_photos where path = p_keep) <> 'current'
     or (select state from jc_pet_photos where path = p_old) <> 'retired'
     or (select state from jc_pet_photos where path = p_pend) <> 'retired' then
    raise exception 'FAIL SA01e ledger: %', (select jsonb_object_agg(path, state) from jc_pet_photos where pet_id = v_cat); end if;
  k := k + 5;

  -- ---------- SA02 the admin list says until when; refusals ----------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  v := (select x from jsonb_array_elements(jc_admin_pets_list()) x where x ->> 'id' = v_cat::text);
  if (v ->> 'restorable_until')::timestamptz <> now() + interval '30 days' or (v ->> 'archived_at')::timestamptz <> now() then
    raise exception 'FAIL SA02a list: %', v; end if;
  v := (select x from jsonb_array_elements(jc_admin_pets_list()) x where x ->> 'id' = v_dog::text);
  if v -> 'restorable_until' <> 'null'::jsonb then raise exception 'FAIL SA02b active pet restorable: %', v; end if;
  v_err := null; begin perform jc_admin_pet_restore(v_dog); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'NOT_FOUND' then raise exception 'FAIL SA02c active: %', v_err; end if;
  v_err := null; begin perform jc_admin_pet_restore(v_far); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'NOT_FOUND' then raise exception 'FAIL SA02d other community: %', v_err; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  v_err := null; begin perform jc_admin_pet_restore(v_cat); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'NOT_ADMIN' then raise exception 'FAIL SA02e member: %', v_err; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', o1, 'role', 'authenticated')::text, true);
  v_err := null; begin perform jc_admin_pet_restore(v_cat); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'NOT_FOUND' then raise exception 'FAIL SA02f other community admin: %', v_err; end if;
  k := k + 6;

  -- ---------- SA03 a nightly run inside the window keeps the photo; restore brings it back, readable ----------
  execute 'reset role';
  update jc_pets set archived_at = now() - interval '29 days' where id = v_cat;
  perform jc_pets_retention();
  if (select state from jc_pet_photos where path = p_keep) <> 'current'
     or (select archived_photo_path from jc_pets where id = v_cat) is distinct from p_keep then
    raise exception 'FAIL SA03a 29-day photo retired'; end if;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  perform jc_admin_pet_restore(v_cat);
  execute 'reset role';
  if not exists (select 1 from jc_pets where id = v_cat and status = 'active' and photo_path = p_keep and archived_at is null
                  and archived_how is null and archived_photo_path is null and updated_by = a1) then
    raise exception 'FAIL SA03b restored row: %', (select row_to_json(p) from jc_pets p where id = v_cat); end if;
  if not exists (select 1 from jc_admin_log where community_id = 'testville31' and action = 'pet_restore'
                  and actor = a1 and target ->> 'pet_id' = v_cat::text) then raise exception 'FAIL SA03c not logged'; end if;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  if not jc_private.pet_photo_can_read(p_keep) then raise exception 'FAIL SA03d restored photo unreadable'; end if;
  if not exists (select 1 from jsonb_array_elements(jc_pets_list('all')) x where x ->> 'id' = v_cat::text) then
    raise exception 'FAIL SA03e restored cat not listed'; end if;
  k := k + 5;

  -- ---------- SA04 past 30 days: RESTORE_EXPIRED, and the nightly run retires the kept photo ----------
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  perform jc_admin_pet_archive(v_cat, 'passed away');
  execute 'reset role';
  update jc_pets set archived_at = now() - interval '31 days' where id = v_cat;
  execute 'set local role authenticated';
  v_err := null; begin perform jc_admin_pet_restore(v_cat); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'RESTORE_EXPIRED' then raise exception 'FAIL SA04a 31 days: %', v_err; end if;
  v := (select x from jsonb_array_elements(jc_admin_pets_list()) x where x ->> 'id' = v_cat::text);
  if v -> 'restorable_until' <> 'null'::jsonb then raise exception 'FAIL SA04b list still restorable: %', v; end if;
  execute 'reset role';
  perform jc_pets_retention();
  if (select state from jc_pet_photos where path = p_keep) <> 'retired'
     or (select archived_photo_path from jc_pets where id = v_cat) is not null
     or (select status from jc_pets where id = v_cat) <> 'archived' then raise exception 'FAIL SA04c window end'; end if;
  k := k + 3;

  -- ---------- SA05 a photo the ledger retired meanwhile does not come back ----------
  update jc_pets set archived_at = now() - interval '1 day', archived_photo_path = p_keep where id = v_cat;  -- ledger row is retired
  execute 'set local role authenticated';
  perform jc_admin_pet_restore(v_cat);
  execute 'reset role';
  if (select photo_path from jc_pets where id = v_cat) is not null or (select status from jc_pets where id = v_cat) <> 'active' then
    raise exception 'FAIL SA05 retired photo restored'; end if;
  k := k + 1;

  -- ---------- SA06 household archive: restorable; a new member since → refused; gone again → allowed ----------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', h1, 'role', 'authenticated')::text, true);
  perform jc_pet_archive(v_rex);
  execute 'reset role';
  if not exists (select 1 from jc_pets where id = v_rex and archived_how = 'household' and archived_photo_path = p_rex) then
    raise exception 'FAIL SA06a household archive'; end if;
  update jc_pets set archived_at = now() - interval '1 hour' where id = v_rex;
  update jc_home_members set joined_at = now() - interval '2 hours' where user_id = h1;   -- the family was there first
  insert into jc_home_members (user_id, community_id, home_id, via, joined_at) values (n1, 'testville31', v_home, 'claim', now());
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  v_err := null; begin perform jc_admin_pet_restore(v_rex); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'RESTORE_EXPIRED' then raise exception 'FAIL SA06b new member: %', v_err; end if;
  execute 'reset role';
  delete from jc_home_members where user_id = n1;
  execute 'set local role authenticated';
  perform jc_admin_pet_restore(v_rex);
  execute 'reset role';
  if not exists (select 1 from jc_pets where id = v_rex and status = 'active' and home_id = v_home and photo_path = p_rex) then
    raise exception 'FAIL SA06c restore to the same household'; end if;
  k := k + 3;

  -- ---------- SA07 the family leaves: active pets vacated (photos gone now); pets archived earlier no longer restorable ----------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  perform jc_admin_pet_archive(v_bo, 'wrong photo');
  perform set_config('request.jwt.claims', json_build_object('sub', h1, 'role', 'authenticated')::text, true);
  perform jc_home_leave();
  execute 'reset role';
  if not exists (select 1 from jc_pets where id = v_rex and status = 'archived' and archived_how = 'vacated' and archived_photo_path is null)
     or (select state from jc_pet_photos where path = p_rex) <> 'retired' then raise exception 'FAIL SA07a active pet on leave'; end if;
  if not exists (select 1 from jc_pets where id = v_bo and archived_how = 'vacated' and archived_photo_path is null)
     or (select state from jc_pet_photos where path = p_bo) <> 'retired' then raise exception 'FAIL SA07b archived pet on leave'; end if;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  v_err := null; begin perform jc_admin_pet_restore(v_bo); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'RESTORE_EXPIRED' then raise exception 'FAIL SA07c vacated restored: %', v_err; end if;
  v_err := null; begin perform jc_admin_pet_restore(v_rex); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'RESTORE_EXPIRED' then raise exception 'FAIL SA07d vacated restored: %', v_err; end if;
  k := k + 4;

  -- ---------- SA08 hidden sightings: listed for admins (no reporter), un-hide brings it back once ----------
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  perform jc_pet_sighting_add(v_dog, 'by the gate', 25.001, 55.001);
  execute 'reset role';
  select id into v_sid from jc_pet_sightings where pet_id = v_dog;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  perform jc_admin_sighting_hide(v_sid);
  v := jc_admin_pet_hidden_sightings(v_dog);
  if jsonb_array_length(v) <> 1 or (v -> 0 ->> 'id')::bigint <> v_sid or v -> 0 ->> 'note' <> 'by the gate' or v -> 0 ? 'reporter' then
    raise exception 'FAIL SA08a hidden list: %', v; end if;
  v_err := null; begin perform jc_admin_pet_hidden_sightings(v_far); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'NOT_FOUND' then raise exception 'FAIL SA08b other community: %', v_err; end if;
  perform jc_admin_sighting_unhide(v_sid);
  if jsonb_array_length(jc_admin_pet_hidden_sightings(v_dog)) <> 0 then raise exception 'FAIL SA08c still hidden'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  if not exists (select 1 from jsonb_array_elements(jc_pet_get(v_dog) -> 'sightings') x where (x ->> 'id')::bigint = v_sid) then
    raise exception 'FAIL SA08d un-hidden sighting not shown: %', jc_pet_get(v_dog); end if;
  v_err := null; begin perform jc_admin_pet_hidden_sightings(v_dog); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'NOT_ADMIN' then raise exception 'FAIL SA08e member list: %', v_err; end if;
  v_err := null; begin perform jc_admin_sighting_unhide(v_sid); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'NOT_ADMIN' then raise exception 'FAIL SA08f member unhide: %', v_err; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  v_err := null; begin perform jc_admin_sighting_unhide(v_sid); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'NOT_FOUND' then raise exception 'FAIL SA08g twice: %', v_err; end if;
  execute 'reset role';
  if not exists (select 1 from jc_admin_log where action = 'sighting_unhide' and actor = a1 and (target ->> 'sighting_id')::bigint = v_sid) then
    raise exception 'FAIL SA08h not logged'; end if;
  k := k + 8;

  -- ---------- SA09 nightly alert: thresholds, 24 h window, one open notice per community ----------
  delete from jc_admin_log where community_id in ('testville31', 'testville31b');
  delete from jc_admin_notices where community_id in ('testville31', 'testville31b');
  insert into jc_admin_log (community_id, actor, action, target)
    select 'testville31', a1, 'pet_archive', '{}' from generate_series(1, 9);
  insert into jc_admin_log (community_id, actor, action, target, at)
    select 'testville31', a1, 'pet_restore', '{}', now() - interval '25 hours' from generate_series(1, 5);   -- too old
  insert into jc_admin_log (community_id, actor, action, target)
    select 'testville31b', o1, 'sighting_hide', '{}' from generate_series(1, 19);
  perform jc_pets_retention();
  if exists (select 1 from jc_admin_notices where community_id in ('testville31', 'testville31b') and kind = 'moderation_spike') then
    raise exception 'FAIL SA09a below threshold alerted'; end if;
  insert into jc_admin_log (community_id, actor, action, target) values ('testville31', a1, 'pet_restore', '{}');
  insert into jc_admin_log (community_id, actor, action, target) values ('testville31b', o1, 'sighting_hide', '{}');
  perform jc_pets_retention();
  if (select detail from jc_admin_notices where community_id = 'testville31' and kind = 'moderation_spike' and resolved_at is null)
     is distinct from '{"archives": 9, "restores": 1, "hides": 0, "unhides": 0}'::jsonb then
    raise exception 'FAIL SA09b archives+restores: %', (select jsonb_agg(detail) from jc_admin_notices where community_id = 'testville31'); end if;
  if (select detail ->> 'hides' from jc_admin_notices where community_id = 'testville31b' and kind = 'moderation_spike') <> '20' then
    raise exception 'FAIL SA09c hides'; end if;
  perform jc_pets_retention();
  if (select count(*) from jc_admin_notices where community_id = 'testville31' and kind = 'moderation_spike') <> 1 then
    raise exception 'FAIL SA09d duplicate notice'; end if;
  k := k + 4;

  -- ---------- SA10 community admins see it (Pets admins don't) and can resolve it ----------
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  v := (select x from jsonb_array_elements(jc_admin_notices_list()) x where x ->> 'kind' = 'moderation_spike');
  if v is null or v -> 'home' <> 'null'::jsonb or (v -> 'detail' ->> 'archives')::int <> 9 then raise exception 'FAIL SA10a: %', v; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  v_err := null; begin perform jc_admin_notices_list(); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'NOT_ADMIN' then raise exception 'FAIL SA10b pets admin reads notices: %', v_err; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', c1, 'role', 'authenticated')::text, true);
  perform jc_admin_notice_resolve((v ->> 'id')::bigint);
  execute 'reset role';
  if exists (select 1 from jc_admin_notices where community_id = 'testville31' and kind = 'moderation_spike' and resolved_at is null) then
    raise exception 'FAIL SA10c not resolved'; end if;
  k := k + 3;

  -- ---------- SA11 an alert failure is logged on the purge row and never undoes the purge ----------
  insert into jc_pet_sightings (community_id, pet_id, note, seen_at) values ('testville31', v_dog, 'old', now() - interval '31 days')
    returning id into v_sid;
  delete from jc_admin_notices where community_id in ('testville31', 'testville31b');
  alter table jc_admin_notices add constraint s31_no_spike check (kind <> 'moderation_spike') not valid;
  perform jc_pets_retention();
  alter table jc_admin_notices drop constraint s31_no_spike;
  select id into v_log from jc_maintenance_log where job = 'pets_purge' order by at desc, id desc limit 1;
  if (select error from jc_maintenance_log where id = v_log) not like 'moderation_alert: %' then
    raise exception 'FAIL SA11a error not on the purge row: %', (select error from jc_maintenance_log where id = v_log); end if;
  if exists (select 1 from jc_pet_sightings where id = v_sid) then raise exception 'FAIL SA11b purge undone'; end if;
  perform jc_pets_retention();   -- a clean run clears App Health again (later slices check jc_health)
  if (select error from jc_maintenance_log where job = 'pets_purge' order by at desc, id desc limit 1) is not null then
    raise exception 'FAIL SA11c clean run still shows the error'; end if;
  k := k + 3;

  -- ---------- SA13 review gaps: exactly 30 days = expired; empty home; the per-home cap on the way back ----------
  update jc_pets set status = 'active', archived_at = null, archived_how = null, archived_photo_path = null where id = v_dog;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  perform jc_admin_pet_archive(v_dog, 'boundary check');
  execute 'reset role';
  update jc_pets set archived_at = now() - interval '30 days' where id = v_dog;
  execute 'set local role authenticated';
  v_err := null; begin perform jc_admin_pet_restore(v_dog); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'RESTORE_EXPIRED' then raise exception 'FAIL SA13a exactly 30 days: %', v_err; end if;
  -- a new household on home 32: archive one pet, fill the home to 10, then restore → TOO_MANY_PETS; empty home → expired
  perform set_config('request.jwt.claims', json_build_object('sub', m1, 'role', 'authenticated')::text, true);
  perform jc_home_claim('north', 'villa', null, '32');
  v_bo := (jc_pet_save(null, '{"species": "cat", "name": "S31 Kit"}') ->> 'id')::uuid;
  perform jc_pet_archive(v_bo);
  for i in 1..10 loop perform jc_pet_save(null, jsonb_build_object('species', 'other', 'name', 'S31 fish ' || i)); end loop;
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  v_err := null; begin perform jc_admin_pet_restore(v_bo); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'TOO_MANY_PETS' then raise exception 'FAIL SA13b over the cap: %', v_err; end if;
  execute 'reset role';
  delete from jc_home_members where user_id = m1;            -- members gone without the leave path (no vacate)
  execute 'set local role authenticated';
  v_err := null; begin perform jc_admin_pet_restore(v_bo); exception when others then v_err := sqlerrm; end;
  if v_err is distinct from 'RESTORE_EXPIRED' then raise exception 'FAIL SA13c empty home: %', v_err; end if;
  execute 'reset role';
  k := k + 3;

  -- ---------- SA14 alert: an open notice is refreshed, not duplicated; unhides count with hides ----------
  delete from jc_admin_log where community_id = 'testville31b';
  delete from jc_admin_notices where community_id = 'testville31b';
  insert into jc_admin_log (community_id, actor, action, target)
    select 'testville31b', o1, 'sighting_hide', '{}' from generate_series(1, 12);
  insert into jc_admin_log (community_id, actor, action, target)
    select 'testville31b', o1, 'sighting_unhide', '{}' from generate_series(1, 8);
  perform jc_pets_retention();
  if (select detail from jc_admin_notices where community_id = 'testville31b' and kind = 'moderation_spike' and resolved_at is null)
     is distinct from '{"archives": 0, "restores": 0, "hides": 12, "unhides": 8}'::jsonb then
    raise exception 'FAIL SA14a: %', (select jsonb_agg(detail) from jc_admin_notices where community_id = 'testville31b'); end if;
  insert into jc_admin_log (community_id, actor, action, target) values ('testville31b', o1, 'sighting_hide', '{}');
  perform jc_pets_retention();
  if (select count(*) from jc_admin_notices where community_id = 'testville31b' and kind = 'moderation_spike') <> 1
     or (select detail ->> 'hides' from jc_admin_notices where community_id = 'testville31b' and kind = 'moderation_spike') <> '13' then
    raise exception 'FAIL SA14b not refreshed: %', (select jsonb_agg(detail) from jc_admin_notices where community_id = 'testville31b'); end if;
  k := k + 2;

  -- ---------- SA12 shape check: archived fields only on archived rows ----------
  v_err := null; begin update jc_pets set archived_at = now() where id = v_cat; exception when others then v_err := sqlstate; end;
  if v_err is distinct from '23514' then raise exception 'FAIL SA12a active with archived_at: %', v_err; end if;
  v_err := null; begin update jc_pets set archived_photo_path = 'x' where id = v_rex; exception when others then v_err := sqlstate; end;
  if v_err is distinct from '23514' then raise exception 'FAIL SA12b vacated keeps a photo: %', v_err; end if;
  k := k + 2;

  perform set_config('jc_test.checks', (coalesce(nullif(current_setting('jc_test.checks', true), ''), '0')::int + k)::text, true);
  raise notice 's31_soft_archive: % checks passed', k;
end
$t$;
