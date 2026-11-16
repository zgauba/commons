-- Report a new stray, PR 1b (20261116140000_stray_report_photos.sql): an optional photo on a report — who may write /
-- read it, replace / withdraw, move to the stray on Add / Already known, retire on Not a stray, nightly retention.
-- Own communities (testville30 / testville30b) — never jubail. Rolled back by build_dryrun.sh (storage rows included).
do $t$
declare
  r1 uuid := '00000000-0000-4000-8000-000000003001';  -- reporter, home 1
  r2 uuid := '00000000-0000-4000-8000-000000003002';  -- another resident, home 2
  a1 uuid := '00000000-0000-4000-8000-000000003003';  -- Pets admin of testville30
  o1 uuid := '00000000-0000-4000-8000-000000003004';  -- Pets admin of testville30b
  q1 uuid := '00000000-0000-4000-8000-0000000030a1';
  q2 uuid := '00000000-0000-4000-8000-0000000030a2';
  q3 uuid := '00000000-0000-4000-8000-0000000030a3';
  q4 uuid := '00000000-0000-4000-8000-0000000030a4';
  q5 uuid := '00000000-0000-4000-8000-0000000030a5';
  v jsonb; k int := 0; msg text; n int;
  v_cat uuid; v_dog uuid; v_p1 text; v_p2 text; v_p3 text; v_p4 text; v_pd text;
  v_meta jsonb := '{"size": 2048, "mimetype": "image/jpeg"}';
begin
  execute $f$create function pg_temp.s30_as(u uuid) returns void language sql as
    $b$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $b$$f$;
  execute $f$create function pg_temp.s30_err(q text) returns text language plpgsql as
    $b$ begin execute q; return null; exception when others then return sqlerrm; end $b$$f$;
  execute 'grant execute on function pg_temp.s30_as(uuid), pg_temp.s30_err(text) to authenticated';

  -- ---------- fixtures (as postgres) ----------
  insert into auth.users (id, email) values (r1, 'r1@s30.test'), (r2, 'r2@s30.test'), (a1, 'a1@s30.test'), (o1, 'o1@s30.test');
  insert into jc_communities (id, name_en, map_lat, map_lng, modules) values
    ('testville30', 'Testville 30', 24.53, 54.43, '{"pets": {"enabled": true}}'),
    ('testville30b', 'Testville 30b', 25.00, 55.00, '{"pets": {"enabled": true}}');
  insert into jc_villages (community_id, key, name_en) values ('testville30', 'north', 'North');
  perform jc_code_set('testville30', 'join', 'S30-JOIN-CODE-01');
  perform jc_code_set('testville30', 'pets', 'S30-PETS-ADMIN-01');
  perform jc_code_set('testville30b', 'join', 'S30-JOIN-CODE-02');
  perform jc_code_set('testville30b', 'pets', 'S30-PETS-ADMIN-02');
  execute 'set local role authenticated';
  perform pg_temp.s30_as(r1); perform jc_join('testville30', 'S30-JOIN-CODE-01'); perform jc_home_claim('north', 'villa', null, '1');
  perform pg_temp.s30_as(r2); perform jc_join('testville30', 'S30-JOIN-CODE-01'); perform jc_home_claim('north', 'villa', null, '2');
  perform pg_temp.s30_as(o1); perform jc_join('testville30b', 'S30-JOIN-CODE-02'); perform jc_admin_unlock('S30-PETS-ADMIN-02');
  perform pg_temp.s30_as(a1); perform jc_join('testville30', 'S30-JOIN-CODE-01'); perform jc_admin_unlock('S30-PETS-ADMIN-01');
  v_cat := (jc_admin_stray_save(null, '{"species": "cat", "name": "S30 cat"}') ->> 'id')::uuid;   -- no photo
  v_dog := (jc_admin_stray_save(null, '{"species": "dog", "name": "S30 dog"}') ->> 'id')::uuid;   -- gets a photo
  v_pd := jc_pet_photo_begin(v_dog, 'jpg') ->> 'path';
  execute 'reset role';
  insert into storage.objects (bucket_id, name, owner, metadata) values ('pet-photos', v_pd, a1, v_meta);
  execute 'set local role authenticated';
  perform jc_pet_photo_commit(v_dog);
  perform pg_temp.s30_as(r1);
  perform jc_stray_report_add(q1, '{"species": "cat", "place": "By the gate"}');
  perform jc_stray_report_add(q2, '{"species": "cat", "place": "Marina"}');
  perform jc_stray_report_add(q3, '{"species": "dog", "place": "Park"}');
  perform jc_stray_report_add(q4, '{"species": "cat", "place": "Beach"}');
  perform pg_temp.s30_as(r2);
  perform jc_stray_report_add(q5, '{"species": "cat", "place": "Shop"}');

  -- ---------- P01 begin on your own open report: a report path, a pending ledger row, only you may write it ----------
  perform pg_temp.s30_as(r1);
  v := jc_stray_report_photo_begin(q1, 'jpg');
  v_p1 := v ->> 'path';
  if v_p1 !~ ('^testville30/r/' || q1 || '/[0-9a-f]{24}\.jpg$') or v ->> 'bucket' <> 'pet-photos' then raise exception 'FAIL P01a: %', v; end if;
  if not jc_private.pet_photo_can_write(v_p1) then raise exception 'FAIL P01b reporter can''t write'; end if;
  perform pg_temp.s30_as(r2);
  if jc_private.pet_photo_can_write(v_p1) then raise exception 'FAIL P01c another resident can write'; end if;
  perform pg_temp.s30_as(a1);
  if jc_private.pet_photo_can_write(v_p1) then raise exception 'FAIL P01d an organizer can write'; end if;
  execute 'reset role';
  if not exists (select 1 from jc_pet_photos where path = v_p1 and report_id = q1 and pet_id is null and state = 'pending'
                  and created_by = r1 and community_id = 'testville30') then raise exception 'FAIL P01e ledger'; end if;
  k := k + 5;

  -- ---------- P02 refusals: someone else's report, bad type, Pets off ----------
  execute 'set local role authenticated';
  perform pg_temp.s30_as(r2);
  msg := pg_temp.s30_err(format('select jc_stray_report_photo_begin(%L, %L)', q1, 'jpg'));
  if msg is distinct from 'NOT_FOUND' then raise exception 'FAIL P02a: %', msg; end if;
  perform pg_temp.s30_as(r1);
  msg := pg_temp.s30_err(format('select jc_stray_report_photo_begin(%L, %L)', q1, 'gif'));
  if msg is distinct from 'BAD_FIELDS' then raise exception 'FAIL P02b: %', msg; end if;
  execute 'reset role';
  update jc_communities set modules = '{"pets": {"enabled": false}}' where id = 'testville30';
  execute 'set local role authenticated';
  msg := pg_temp.s30_err(format('select jc_stray_report_photo_begin(%L, %L)', q1, 'jpg'));
  if msg is distinct from 'MODULE_OFF' then raise exception 'FAIL P02c: %', msg; end if;
  if jc_private.pet_photo_can_write(v_p1) then raise exception 'FAIL P02d writable while Pets is off'; end if;
  execute 'reset role';
  update jc_communities set modules = '{"pets": {"enabled": true}}' where id = 'testville30';
  k := k + 4;

  -- ---------- P03 commit: no file → PHOTO_MISSING; with the file → the report's photo ----------
  execute 'set local role authenticated';
  perform pg_temp.s30_as(r1);
  msg := pg_temp.s30_err(format('select jc_stray_report_photo_commit(%L)', q1));
  if msg is distinct from 'PHOTO_MISSING' then raise exception 'FAIL P03a: %', msg; end if;
  execute 'reset role';
  insert into storage.objects (bucket_id, name, owner, metadata) values ('pet-photos', v_p1, r1, v_meta);
  execute 'set local role authenticated';
  v := jc_stray_report_photo_commit(q1);
  if v ->> 'photo_path' <> v_p1 then raise exception 'FAIL P03b: %', v; end if;
  if (select x ->> 'photo_path' from jsonb_array_elements(jc_stray_reports_mine()) x where x ->> 'id' = q1::text) <> v_p1 then
    raise exception 'FAIL P03c mine'; end if;
  execute 'reset role';
  if (select state from jc_pet_photos where path = v_p1) <> 'current'
     or (select pending_photo_path from jc_stray_reports where id = q1) is not null then raise exception 'FAIL P03d ledger / pending'; end if;
  k := k + 4;

  -- ---------- P04 who reads a report photo: reporter + this community's organizers; not residents, not other communities ----------
  execute 'set local role authenticated';
  perform pg_temp.s30_as(r1);
  if not jc_private.pet_photo_can_read(v_p1) then raise exception 'FAIL P04a reporter'; end if;
  perform pg_temp.s30_as(a1);
  if not jc_private.pet_photo_can_read(v_p1) then raise exception 'FAIL P04b organizer'; end if;
  if (select x ->> 'photo_path' from jsonb_array_elements(jc_admin_stray_reports_list('open')) x where x ->> 'id' = q1::text) <> v_p1 then
    raise exception 'FAIL P04c organizer list'; end if;
  perform pg_temp.s30_as(r2);
  if jc_private.pet_photo_can_read(v_p1) then raise exception 'FAIL P04d another resident reads'; end if;
  perform pg_temp.s30_as(o1);
  if jc_private.pet_photo_can_read(v_p1) then raise exception 'FAIL P04e another community''s organizer reads'; end if;
  k := k + 5;

  -- ---------- P05 replace: a second upload is pending (uploader-only read), then replaces the first ----------
  perform pg_temp.s30_as(r1);
  v_p2 := jc_stray_report_photo_begin(q1, 'png') ->> 'path';
  if not jc_private.pet_photo_can_read(v_p2) then raise exception 'FAIL P05a uploader can''t read pending'; end if;
  perform pg_temp.s30_as(a1);
  if jc_private.pet_photo_can_read(v_p2) then raise exception 'FAIL P05b organizer reads a pending upload'; end if;
  execute 'reset role';
  insert into storage.objects (bucket_id, name, owner, metadata) values ('pet-photos', v_p2, r1, '{"size": 2048, "mimetype": "image/png"}');
  execute 'set local role authenticated';
  perform pg_temp.s30_as(r1);
  perform jc_stray_report_photo_commit(q1);
  execute 'reset role';
  if (select state from jc_pet_photos where path = v_p1) <> 'retired' or (select state from jc_pet_photos where path = v_p2) <> 'current'
     or (select photo_path from jc_stray_reports where id = q1) <> v_p2 then raise exception 'FAIL P05c replace'; end if;
  if not (v_p1 = any(jc_photo_purge_queue(1000))) then raise exception 'FAIL P05d retired photo not queued for the purge'; end if;
  k := k + 4;

  -- ---------- P06 withdraw: only the reporter; clears the photo, retires the rows ----------
  execute 'set local role authenticated';
  perform pg_temp.s30_as(r2);
  msg := pg_temp.s30_err(format('select jc_stray_report_photo_remove(%L)', q1));
  if msg is distinct from 'NOT_FOUND' then raise exception 'FAIL P06a: %', msg; end if;
  perform pg_temp.s30_as(r1);
  v := jc_stray_report_photo_remove(q1);
  if v -> 'photo_path' <> 'null'::jsonb then raise exception 'FAIL P06b: %', v; end if;
  if jc_private.pet_photo_can_read(v_p2) then raise exception 'FAIL P06c still readable'; end if;
  msg := pg_temp.s30_err(format('select jc_stray_report_photo_remove(%L)', q1));
  if msg is distinct from 'NO_PHOTO' then raise exception 'FAIL P06d: %', msg; end if;
  execute 'reset role';
  if (select state from jc_pet_photos where path = v_p2) <> 'retired' then raise exception 'FAIL P06e row'; end if;
  k := k + 4;

  -- ---------- P07 Not a stray: the photo is retired at close ----------
  execute 'set local role authenticated';
  perform pg_temp.s30_as(r1);
  v_p3 := jc_stray_report_photo_begin(q2, 'jpg') ->> 'path';
  execute 'reset role';
  insert into storage.objects (bucket_id, name, owner, metadata) values ('pet-photos', v_p3, r1, v_meta);
  execute 'set local role authenticated';
  perform jc_stray_report_photo_commit(q2);
  perform pg_temp.s30_as(a1);
  v := jc_admin_stray_report_close(q2, 'not_stray', null);
  if v -> 'photo_path' <> 'null'::jsonb then raise exception 'FAIL P07a: %', v; end if;
  perform pg_temp.s30_as(r1);
  if jc_private.pet_photo_can_read(v_p3) then raise exception 'FAIL P07b readable after close'; end if;
  execute 'reset role';
  if (select state from jc_pet_photos where path = v_p3) <> 'retired' then raise exception 'FAIL P07c row'; end if;
  k := k + 3;

  -- ---------- P08 Add as a stray (no photo yet): the photo moves to the stray and is public to members ----------
  execute 'set local role authenticated';
  perform pg_temp.s30_as(r1);
  v_p4 := jc_stray_report_photo_begin(q3, 'jpg') ->> 'path';
  execute 'reset role';
  insert into storage.objects (bucket_id, name, owner, metadata) values ('pet-photos', v_p4, r1, v_meta);
  execute 'set local role authenticated';
  perform jc_stray_report_photo_commit(q3);
  perform pg_temp.s30_as(a1);
  perform jc_admin_stray_report_close(q3, 'added', v_cat);
  execute 'reset role';
  if (select photo_path from jc_pets where id = v_cat) is distinct from v_p4 then raise exception 'FAIL P08a stray photo'; end if;
  if not exists (select 1 from jc_pet_photos where path = v_p4 and pet_id = v_cat and report_id is null and state = 'current') then
    raise exception 'FAIL P08b ledger: %', (select row_to_json(x) from jc_pet_photos x where path = v_p4); end if;
  if (select photo_path from jc_stray_reports where id = q3) is not null then raise exception 'FAIL P08c report keeps it'; end if;
  if not exists (select 1 from jc_admin_log where action = 'stray_report_close' and target ->> 'report_id' = q3::text
                  and (target -> 'photo_moved')::boolean) then raise exception 'FAIL P08d log'; end if;
  execute 'set local role authenticated';
  perform pg_temp.s30_as(r2);
  if not jc_private.pet_photo_can_read(v_p4) then raise exception 'FAIL P08e members can''t see the stray''s photo'; end if;
  k := k + 5;

  -- ---------- P09 a retry moves nothing again; Already known on a stray WITH a photo retires the report's ----------
  perform pg_temp.s30_as(a1);
  perform jc_admin_stray_report_close(q3, 'added', v_cat);
  execute 'reset role';
  if (select count(*) from jc_admin_log where action = 'stray_report_close' and target ->> 'report_id' = q3::text) <> 1
     or (select photo_path from jc_pets where id = v_cat) is distinct from v_p4 then raise exception 'FAIL P09a retry'; end if;
  execute 'set local role authenticated';
  perform pg_temp.s30_as(r1);
  v_p1 := jc_stray_report_photo_begin(q4, 'jpg') ->> 'path';
  execute 'reset role';
  insert into storage.objects (bucket_id, name, owner, metadata) values ('pet-photos', v_p1, r1, v_meta);
  execute 'set local role authenticated';
  perform jc_stray_report_photo_commit(q4);
  perform pg_temp.s30_as(a1);
  perform jc_admin_stray_report_close(q4, 'known', v_dog);
  execute 'reset role';
  if (select photo_path from jc_pets where id = v_dog) is distinct from v_pd then raise exception 'FAIL P09b stray photo replaced'; end if;
  if not exists (select 1 from jc_pet_photos where path = v_p1 and report_id = q4 and state = 'retired') then raise exception 'FAIL P09c not retired'; end if;
  k := k + 3;

  -- ---------- P10 closed reports take no photo; the ledger needs exactly one owner ----------
  execute 'set local role authenticated';
  perform pg_temp.s30_as(r1);
  msg := pg_temp.s30_err(format('select jc_stray_report_photo_begin(%L, %L)', q2, 'jpg'));
  if msg is distinct from 'NOT_FOUND' then raise exception 'FAIL P10a closed report: %', msg; end if;
  execute 'reset role';
  msg := null; begin insert into jc_pet_photos (path, community_id) values ('testville30/x.jpg', 'testville30'); exception when others then msg := sqlstate; end;
  if msg is distinct from '23514' then raise exception 'FAIL P10b no owner: %', msg; end if;
  msg := null; begin insert into jc_pet_photos (path, community_id, pet_id, report_id) values ('testville30/y.jpg', 'testville30', v_cat, q5);
    exception when others then msg := sqlstate; end;
  if msg is distinct from '23514' then raise exception 'FAIL P10c two owners: %', msg; end if;
  k := k + 3;

  -- ---------- P11 one upload cap across pet + report photos (20 / day per account) ----------
  insert into jc_pet_photos (path, community_id, report_id, created_by, state, retired_at)
  select 'testville30/r/cap/' || g || '.jpg', 'testville30', q5, r2, 'retired', now() from generate_series(1, 20) g;
  execute 'set local role authenticated';
  perform pg_temp.s30_as(r2);
  msg := pg_temp.s30_err(format('select jc_stray_report_photo_begin(%L, %L)', q5, 'jpg'));
  if msg is distinct from 'TOO_MANY_UPLOADS' then raise exception 'FAIL P11: %', msg; end if;
  execute 'reset role';
  k := k + 1;

  -- ---------- P12 nightly: an expiring report's photo is retired; a report waits for its photos' purge, then goes ----------
  update jc_stray_reports set created_at = now() - interval '61 days' where id = q5;              -- open, 20 retired rows
  update jc_pet_photos set purged_at = null where report_id = q5;
  update jc_stray_reports set closed_at = now() - interval '31 days' where id in (q2, q4);           -- retired, not purged
  perform jc_pets_retention();
  if (select state from jc_stray_reports where id = q5) <> 'expired' then raise exception 'FAIL P12a not expired'; end if;
  if not exists (select 1 from jc_stray_reports where id = q2) or not exists (select 1 from jc_stray_reports where id = q4) then
    raise exception 'FAIL P12b deleted before its photo was purged'; end if;
  update jc_pet_photos set purged_at = now() where report_id = q2;
  perform jc_pets_retention();
  if exists (select 1 from jc_stray_reports where id = q2) or exists (select 1 from jc_pet_photos where report_id = q2) then
    raise exception 'FAIL P12c purged report not deleted'; end if;
  if not exists (select 1 from jc_stray_reports where id = q4) then raise exception 'FAIL P12d q4 (unpurged) deleted'; end if;
  if not exists (select 1 from jc_pet_photos where path = v_p4 and pet_id = v_cat) then raise exception 'FAIL P12e the moved photo went'; end if;
  k := k + 5;

  -- ---------- P13 write window: closed after commit, after 15 minutes; reads stop while Pets is off (reporter too) ----------
  execute 'set local role authenticated';
  perform pg_temp.s30_as(r1);
  perform jc_stray_report_add('00000000-0000-4000-8000-0000000030b1', '{"species": "cat", "place": "Window"}');
  v_p1 := jc_stray_report_photo_begin('00000000-0000-4000-8000-0000000030b1', 'jpg') ->> 'path';
  execute 'reset role';
  update jc_stray_reports set pending_photo_at = now() - interval '16 minutes' where id = '00000000-0000-4000-8000-0000000030b1';
  execute 'set local role authenticated';
  if jc_private.pet_photo_can_write(v_p1) then raise exception 'FAIL P13a writable after 15 minutes'; end if;
  v_p1 := jc_stray_report_photo_begin('00000000-0000-4000-8000-0000000030b1', 'jpg') ->> 'path';
  execute 'reset role';
  insert into storage.objects (bucket_id, name, owner, metadata) values ('pet-photos', v_p1, r1, v_meta);
  execute 'set local role authenticated';
  perform jc_stray_report_photo_commit('00000000-0000-4000-8000-0000000030b1');
  if jc_private.pet_photo_can_write(v_p1) then raise exception 'FAIL P13b writable after commit'; end if;
  execute 'reset role';
  update jc_communities set modules = '{"pets": {"enabled": false}}' where id = 'testville30';
  execute 'set local role authenticated';
  if jc_private.pet_photo_can_read(v_p1) then raise exception 'FAIL P13c reporter reads while Pets is off'; end if;
  execute 'reset role';
  update jc_communities set modules = '{"pets": {"enabled": true}}' where id = 'testville30';
  k := k + 3;

  -- ---------- P14 the reporter leaves: photo hidden from organizers at once, never moved to a stray, retired overnight ----------
  delete from jc_home_members where user_id = r1;
  delete from jc_accounts where user_id = r1;                         -- as jc_account_delete leaves things for this table
  execute 'set local role authenticated';
  perform pg_temp.s30_as(a1);
  if jc_private.pet_photo_can_read(v_p1) then raise exception 'FAIL P14a organizer reads a departed reporter''s photo'; end if;
  if (select x -> 'photo_path' from jsonb_array_elements(jc_admin_stray_reports_list('open')) x
       where x ->> 'id' = '00000000-0000-4000-8000-0000000030b1') <> 'null'::jsonb then raise exception 'FAIL P14b list shows it'; end if;
  v_dog := (jc_admin_stray_save(null, '{"species": "dog", "name": "S30 pup"}') ->> 'id')::uuid;
  execute 'reset role';
  -- (a) nightly: retired + cleared
  perform jc_pets_retention();
  if (select photo_path from jc_stray_reports where id = '00000000-0000-4000-8000-0000000030b1') is not null
     or (select state from jc_pet_photos where path = v_p1) <> 'retired' then raise exception 'FAIL P14c not retired overnight'; end if;
  -- (b) close before the nightly run: put the photo back as postgres, then Add — it must retire, not move
  update jc_pet_photos set state = 'current', retired_at = null where path = v_p1;
  update jc_stray_reports set photo_path = v_p1 where id = '00000000-0000-4000-8000-0000000030b1';
  execute 'set local role authenticated';
  perform jc_admin_stray_report_close('00000000-0000-4000-8000-0000000030b1', 'added', v_dog);
  execute 'reset role';
  if (select photo_path from jc_pets where id = v_dog) is not null or (select state from jc_pet_photos where path = v_p1) <> 'retired' then
    raise exception 'FAIL P14d a departed reporter''s photo moved to a stray'; end if;
  k := k + 4;

  -- ---------- P15 nightly: a current photo left on an archived pet is retired (close-vs-archive race, db M1) ----------
  -- jc_pet_retire's pets update, after the move (soft archive: the move landed after retire chose what to keep → not kept)
  update jc_pets set status = 'archived', photo_path = null, archived_at = now(), archived_how = 'organizer' where id = v_cat;
  perform jc_pets_retention();
  if (select state from jc_pet_photos where path = v_p4) <> 'retired' then raise exception 'FAIL P15 archived pet''s photo kept'; end if;
  k := k + 1;

  perform set_config('jc_test.checks', (coalesce(nullif(current_setting('jc_test.checks', true), ''), '0')::int + k)::text, true);
  raise notice 's30_stray_report_photos: % checks passed', k;
end
$t$;
