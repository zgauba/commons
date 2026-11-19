-- CC-5 — Cats vet log.
-- Done-when checks (docs/plans/CC-community-cats.md, CC-5 plan):
--   D1 a coordinator logs a vet visit for 2 cats (sterilisation + rabies, next due); it shows in the activity (all,
--      Vet, each cat's history, never a station's) and in both cats' vaccines                                → VT01
--   D2 residents see vaccinated only while rabies is current (due today ✓, due yesterday ✗, no due date: 364 days ✓
--      366 ✗, hidden ✗, the latest entry decides, core only ✗, a merged cat's record counts); their JSON has exactly
--      the listed keys; shared invoices only, without clinic / note / names                                    → VT02
--   D3 volunteers read the facts but not an unshared invoice number / link, and can't log or hide; residents, Pets
--      admins and other communities get nothing; community admins can log; only Google Drive / Docs links     → VT03
--   D4 module off → MODULE_OFF                                                                               → VT04
--   D5 bad input refused; rate limit shared with visits + sightings; admin log holds ids only               → VT05
-- Own communities (testville37, testville37b) — never jubail. Run via tests/sql/build_dryrun.sh (rolls back).

do $t$
declare
  c1 uuid := '00000000-0000-4000-8000-000000003701';  -- community admin (community code)
  co uuid := '00000000-0000-4000-8000-000000003702';  -- Cats coordinator by invite
  vo uuid := '00000000-0000-4000-8000-000000003703';  -- Cats volunteer by invite
  pa uuid := '00000000-0000-4000-8000-000000003704';  -- Pets admin by invite
  r2 uuid := '00000000-0000-4000-8000-000000003705';  -- resident
  ob uuid := '00000000-0000-4000-8000-000000003706';  -- coordinator of ANOTHER community
  v jsonb; x jsonb; k int := 0; s text; tok text; q text; d date; n int;
  a1 uuid; st1 uuid; cat1 uuid; cat2 uuid; cat3 uuid; cat4 uuid; cat_b uuid; vt1 uuid; vt2 uuid; vt3 uuid; vt4 uuid; ids text[]; L jsonb; pages int;
  drive text := 'https://drive.google.com/file/d/1AbC_dEf-123/view?usp=sharing';
begin
  execute $f$create function pg_temp.s37_as(u uuid) returns void language sql as
    $b$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $b$$f$;
  execute $f$create function pg_temp.s37_err(q text) returns text language plpgsql as
    $b$ begin execute q; return null; exception when others then return sqlerrm; end $b$$f$;
  execute $f$create function pg_temp.s37_ids(d jsonb) returns text[] language sql as
    $b$ select coalesce(array_agg(x ->> 'id' order by ord), '{}') from jsonb_array_elements(d -> 'items') with ordinality t(x, ord) $b$$f$;
  -- a cat as residents see it
  execute $f$create function pg_temp.s37_pub(id uuid) returns jsonb language sql as
    $b$ select y from jsonb_array_elements(jc_cats_public() -> 'cats') y where y ->> 'id' = id::text $b$$f$;
  execute $f$create function pg_temp.s37_reg(id uuid) returns jsonb language sql as
    $b$ select y from jsonb_array_elements(jc_cat_register() -> 'cats') y where y ->> 'id' = id::text $b$$f$;
  execute 'grant execute on function pg_temp.s37_as(uuid), pg_temp.s37_err(text), pg_temp.s37_ids(jsonb),
           pg_temp.s37_pub(uuid), pg_temp.s37_reg(uuid) to authenticated';

  -- ---------- fixtures (as postgres) ----------
  insert into auth.users (id, email) values (c1, 'c1@s37.test'), (co, 'co@s37.test'), (vo, 'vo@s37.test'),
    (pa, 'pa@s37.test'), (r2, 'r2@s37.test'), (ob, 'ob@s37.test');
  insert into jc_communities (id, name_en, map_lat, map_lng, modules) values
    ('testville37', 'Testville 37', 24.53, 54.43, '{"pets": {"enabled": true}, "cats": {"enabled": true}}'),     -- tz set below
    ('testville37b', 'Testville 37b', 24.53, 54.43, '{"pets": {"enabled": true}, "cats": {"enabled": true}}');
  insert into jc_villages (community_id, key, name_en) values ('testville37', 'north', 'North'), ('testville37b', 'north', 'North');
  perform jc_code_set('testville37', 'join', 'S37-JOIN-CODE-01');
  perform jc_code_set('testville37', 'community', 'S37-COMMUNITY-01');
  perform jc_code_set('testville37b', 'join', 'S37-JOIN-CODE-02');
  perform jc_code_set('testville37b', 'community', 'S37-COMMUNITY-02');
  update jc_communities set tz = 'Pacific/Kiritimati' where id = 'testville37';   -- UTC+14 (db review L1)
  d := (now() at time zone 'Pacific/Kiritimati')::date;                            -- today there, stated, not looked up

  execute 'set local role authenticated';
  perform pg_temp.s37_as(c1); perform jc_join('testville37', 'S37-JOIN-CODE-01'); perform jc_admin_unlock('S37-COMMUNITY-01');
  perform pg_temp.s37_as(ob); perform jc_join('testville37b', 'S37-JOIN-CODE-02'); perform jc_admin_unlock('S37-COMMUNITY-02');
  foreach s in array array[co::text, vo::text, pa::text, r2::text] loop
    perform pg_temp.s37_as(s::uuid); perform jc_join('testville37', 'S37-JOIN-CODE-01');
  end loop;
  foreach s in array array['cats:' || co, 'cats_vol:' || vo, 'pets:' || pa] loop
    perform pg_temp.s37_as(c1);
    tok := jc_module_admin_link_create(split_part(s, ':', 1)) ->> 'token';
    perform pg_temp.s37_as(split_part(s, ':', 2)::uuid);
    perform jc_module_admin_accept(tok);
  end loop;
  execute 'reset role';
  update jc_accounts set display_name = 'Coco Coordinator' where user_id = co;
  execute 'set local role authenticated';

  perform pg_temp.s37_as(co);
  a1 := (jc_cat_area_save(null, 'Souk', null) #>> '{areas,0,id}')::uuid;
  st1 := (jc_cat_station_save(null, jsonb_build_object('area_id', a1, 'lat', 24.53, 'lng', 54.43, 'private', false)) #>> '{stations,0,id}')::uuid;
  select (y ->> 'id')::uuid into cat1 from jsonb_array_elements(jc_cat_save(null, '{"name": "Caramel"}') -> 'cats') y where y ->> 'name' = 'Caramel';
  select (y ->> 'id')::uuid into cat2 from jsonb_array_elements(jc_cat_save(null, '{"name": "Gwen"}') -> 'cats') y where y ->> 'name' = 'Gwen';
  select (y ->> 'id')::uuid into cat3 from jsonb_array_elements(jc_cat_save(null, '{"name": "Gwen2"}') -> 'cats') y where y ->> 'name' = 'Gwen2';
  select (y ->> 'id')::uuid into cat4 from jsonb_array_elements(jc_cat_save(null, '{"name": "Pepper"}') -> 'cats') y where y ->> 'name' = 'Pepper';
  perform pg_temp.s37_as(ob);
  cat_b := (jc_cat_save(null, '{"name": "Elsewhere"}') #>> '{cats,0,id}')::uuid;

  -- ---------- VT01 a coordinator logs a vet visit for 2 cats ----------
  perform pg_temp.s37_as(co);
  v := jc_cat_vet_add(jsonb_build_object('clinic', ' Jubail Vet Clinic ', 'done', jsonb_build_array('vaccination', 'sterilisation', 'vaccination'),
         'vaccine', 'rabies', 'vaccine_name', 'Rabisin', 'next_due', to_char(d + 365, 'YYYY-MM-DD'), 'invoice_no', 'INV-0042',
         'doc_url', drive, 'note', 'Recovering well', 'cats', jsonb_build_array(cat1, cat2, cat1)));
  x := v -> 'vet'; vt1 := (x ->> 'id')::uuid;
  if x ->> 'kind' <> 'vet' or x ->> 'clinic' <> 'Jubail Vet Clinic' or x -> 'done' <> '["sterilisation", "vaccination"]'::jsonb
     or x ->> 'vaccine' <> 'rabies' or x ->> 'vaccine_name' <> 'Rabisin' or (x ->> 'next_due')::date <> d + 365
     or (x ->> 'overdue')::boolean or x ->> 'invoice_no' <> 'INV-0042' or x ->> 'doc_url' <> drive
     or (x ->> 'shared')::boolean or x ->> 'by' <> 'Coco Coordinator' or (x ->> 'can_hide')::boolean is not true
     or jsonb_array_length(x -> 'cats') <> 2 or (x ->> 'visited_on')::date <> d then
    raise exception 'FAIL VT01a vet visit saved: %', x; end if;
  if x::text ~ '(user_id|logged_by|@s37)' then raise exception 'FAIL VT01b ids / emails in the entry: %', x; end if;
  v := jc_cat_activity(null, null, null, null, null);
  if pg_temp.s37_ids(v) <> array[vt1::text] then raise exception 'FAIL VT01c in the activity: %', v; end if;
  if pg_temp.s37_ids(jc_cat_activity(null, null, 'vet', null, null)) <> array[vt1::text]
     or pg_temp.s37_ids(jc_cat_activity(null, null, 'visit', null, null)) <> '{}'
     or pg_temp.s37_ids(jc_cat_activity(null, null, 'sighting', null, null)) <> '{}' then raise exception 'FAIL VT01d Vet filter'; end if;
  if pg_temp.s37_ids(jc_cat_activity(null, cat1, null, null, null)) <> array[vt1::text]
     or pg_temp.s37_ids(jc_cat_activity(null, cat2, null, null, null)) <> array[vt1::text]
     or pg_temp.s37_ids(jc_cat_activity(null, cat4, null, null, null)) <> '{}' then raise exception 'FAIL VT01e cat history'; end if;
  if pg_temp.s37_ids(jc_cat_activity(st1, null, null, null, null)) <> '{}' then raise exception 'FAIL VT01f never a station''s'; end if;
  x := pg_temp.s37_reg(cat2) -> 'vaccines';
  if jsonb_array_length(x) <> 1 or x #>> '{0,vaccine}' <> 'rabies' or x #>> '{0,name}' <> 'Rabisin'
     or (x #>> '{0,given}')::date <> d or (x #>> '{0,next_due}')::date <> d + 365 or (x #>> '{0,overdue}')::boolean then
    raise exception 'FAIL VT01g vaccines in the register: %', x; end if;
  -- a core vaccine on another day joins the list (rabies first)
  vt2 := (jc_cat_vet_add(jsonb_build_object('visited_on', to_char(d - 30, 'YYYY-MM-DD'), 'done', '["vaccination", "deworming"]'::jsonb,
           'vaccine', 'core', 'next_due', to_char(d - 1, 'YYYY-MM-DD'), 'cats', jsonb_build_array(cat2))) #>> '{vet,id}')::uuid;
  x := pg_temp.s37_reg(cat2) -> 'vaccines';
  if jsonb_array_length(x) <> 2 or x #>> '{1,vaccine}' <> 'core' or (x #>> '{1,overdue}')::boolean is not true then
    raise exception 'FAIL VT01h two vaccines, core overdue: %', x; end if;
  if pg_temp.s37_ids(jc_cat_activity(null, cat2, null, null, null)) <> array[vt1::text, vt2::text] then
    raise exception 'FAIL VT01i newest first'; end if;
  -- each named "other" vaccine keeps its own latest entry (db review M1)
  perform jc_cat_vet_add(jsonb_build_object('visited_on', to_char(d - 60, 'YYYY-MM-DD'), 'done', '["vaccination"]'::jsonb, 'vaccine', 'other',
    'vaccine_name', 'FeLV', 'next_due', to_char(d - 2, 'YYYY-MM-DD'), 'cats', jsonb_build_array(cat4)));
  perform jc_cat_vet_add(jsonb_build_object('visited_on', to_char(d - 20, 'YYYY-MM-DD'), 'done', '["vaccination"]'::jsonb, 'vaccine', 'other',
    'vaccine_name', 'FIV', 'cats', jsonb_build_array(cat4)));
  x := pg_temp.s37_reg(cat4) -> 'vaccines';
  if jsonb_array_length(x) <> 2 or x #>> '{0,name}' <> 'FIV' or x #>> '{1,name}' <> 'FeLV' or (x #>> '{1,overdue}')::boolean is not true then
    raise exception 'FAIL VT01j two other vaccines: %', x; end if;
  k := k + 10;

  -- ---------- VT02 what residents see ----------
  perform pg_temp.s37_as(r2);
  x := pg_temp.s37_pub(cat1);
  if (select array_agg(key order by key) from jsonb_object_keys(x) key) is distinct from (select array_agg(e order by e) from unnest(array[
       'area', 'code', 'coat', 'confirmed', 'ear_tip', 'id', 'invoices', 'life_stage', 'name', 'photos', 'sex', 'status',
       'sterilised', 'story', 'vaccinated']) e) then
    raise exception 'FAIL VT02a resident keys: %', x; end if;
  if (x ->> 'vaccinated')::boolean is not true or x -> 'invoices' <> '[]'::jsonb then raise exception 'FAIL VT02b rabies current, invoice unshared: %', x; end if;
  if jc_cats_public()::text ~ '(Jubail Vet|Rabisin|Recovering|INV-0042|drive\.google|Coco|next_due|clinic)' then
    raise exception 'FAIL VT02c programme detail reached residents'; end if;
  if (pg_temp.s37_pub(cat4) ->> 'vaccinated')::boolean then raise exception 'FAIL VT02d nothing logged = not vaccinated'; end if;
  -- boundaries (dates moved as postgres)
  execute 'reset role';
  update jc_cat_vet_visits set visited_on = d - 365, next_due = d where id = vt1;
  execute 'set local role authenticated';
  if (pg_temp.s37_pub(cat1) ->> 'vaccinated')::boolean is not true then raise exception 'FAIL VT02e due today = still current'; end if;
  execute 'reset role';
  update jc_cat_vet_visits set visited_on = d - 400, next_due = d - 1 where id = vt1;
  execute 'set local role authenticated';
  if (pg_temp.s37_pub(cat1) ->> 'vaccinated')::boolean then raise exception 'FAIL VT02f due yesterday = overdue'; end if;
  perform pg_temp.s37_as(co);
  if (pg_temp.s37_reg(cat1) #>> '{vaccines,0,overdue}')::boolean is not true then raise exception 'FAIL VT02g programme sees overdue'; end if;
  perform pg_temp.s37_as(r2);
  execute 'reset role';
  update jc_cat_vet_visits set visited_on = d - 364, next_due = null where id = vt1;
  execute 'set local role authenticated';
  if (pg_temp.s37_pub(cat1) ->> 'vaccinated')::boolean is not true then raise exception 'FAIL VT02h no due date, 364 days'; end if;
  execute 'reset role';
  update jc_cat_vet_visits set visited_on = d - 365 where id = vt1;
  execute 'set local role authenticated';
  if (pg_temp.s37_pub(cat1) ->> 'vaccinated')::boolean is not true then raise exception 'FAIL VT02h2 no due date, 365 days still counts'; end if;
  execute 'reset role';
  update jc_cat_vet_visits set visited_on = d - 366 where id = vt1;
  execute 'set local role authenticated';
  if (pg_temp.s37_pub(cat1) ->> 'vaccinated')::boolean then raise exception 'FAIL VT02i no due date, 366 days'; end if;
  -- the latest rabies entry decides: an older entry with a later due date doesn't count
  perform pg_temp.s37_as(co);
  vt3 := (jc_cat_vet_add(jsonb_build_object('visited_on', to_char(d - 10, 'YYYY-MM-DD'), 'done', '["vaccination"]'::jsonb, 'vaccine', 'rabies',
           'next_due', to_char(d + 300, 'YYYY-MM-DD'), 'invoice_no', 'INV-0050', 'shared', true, 'note', 'Private note',
           'cats', jsonb_build_array(cat3))) #>> '{vet,id}')::uuid;
  perform pg_temp.s37_as(r2);
  if (pg_temp.s37_pub(cat3) ->> 'vaccinated')::boolean is not true then raise exception 'FAIL VT02j fresh rabies'; end if;
  execute 'reset role';
  insert into jc_cat_vet_visits (community_id, visited_on, done, vaccine, next_due) values ('testville37', d - 5, '{vaccination}', 'rabies', d - 1);
  insert into jc_cat_vet_cats select id, cat3 from jc_cat_vet_visits where community_id = 'testville37' and visited_on = d - 5;
  execute 'set local role authenticated';
  if (pg_temp.s37_pub(cat3) ->> 'vaccinated')::boolean then raise exception 'FAIL VT02k the latest entry decides'; end if;
  execute 'reset role';
  delete from jc_cat_vet_visits where community_id = 'testville37' and visited_on = d - 5;
  execute 'set local role authenticated';
  -- core only (cat2's rabies entry is vt1, now 366 days old) → not vaccinated
  if (pg_temp.s37_pub(cat2) ->> 'vaccinated')::boolean then raise exception 'FAIL VT02l core only'; end if;
  -- a shared invoice: residents get date, what was done, number, link — nothing else
  x := pg_temp.s37_pub(cat3) -> 'invoices';
  if jsonb_array_length(x) <> 1 or x #>> '{0,invoice_no}' <> 'INV-0050' or (x #>> '{0,on}')::date <> d - 10
     or x #> '{0,done}' <> '["vaccination"]'::jsonb or x -> 0 -> 'doc_url' <> 'null'::jsonb
     or (select array_agg(key order by key) from jsonb_object_keys(x -> 0) key) is distinct from
        (select array_agg(e order by e) from unnest(array['doc_url', 'done', 'invoice_no', 'on']) e) then
    raise exception 'FAIL VT02m shared invoice: %', x; end if;
  if pg_temp.s37_pub(cat3)::text ~ 'Private note' then raise exception 'FAIL VT02n note leaked'; end if;
  -- a merged cat's record counts for the survivor; hidden entries never count
  perform pg_temp.s37_as(co);
  vt4 := (jc_cat_vet_add(jsonb_build_object('done', '["checkup"]'::jsonb, 'cats', jsonb_build_array(cat2, cat3))) #>> '{vet,id}')::uuid;
  perform jc_cat_merge(cat3, cat2);
  perform pg_temp.s37_as(r2);
  x := pg_temp.s37_pub(cat2);
  if (x ->> 'vaccinated')::boolean is not true or jsonb_array_length(x -> 'invoices') <> 1 then raise exception 'FAIL VT02o merged record counts: %', x; end if;
  perform pg_temp.s37_as(co);
  v := jc_cat_activity(null, cat2, null, null, null);
  if not (vt3::text = any (pg_temp.s37_ids(v))) then raise exception 'FAIL VT02o2 the merged cat''s visit on the survivor: %', v; end if;
  if (select jsonb_array_length(y -> 'cats') from jsonb_array_elements(v -> 'items') y where y ->> 'id' = vt4::text) <> 1 then
    raise exception 'FAIL VT02o3 both cats on one visit = the survivor once: %', v; end if;
  if (pg_temp.s37_reg(cat2) #>> '{vaccines,0,given}')::date <> d - 10 then raise exception 'FAIL VT02o4 survivor''s vaccines include the merged cat''s'; end if;
  perform jc_cat_log_hide('vet', vt3, true);
  perform pg_temp.s37_as(r2);
  x := pg_temp.s37_pub(cat2);
  if (x ->> 'vaccinated')::boolean or x -> 'invoices' <> '[]'::jsonb then raise exception 'FAIL VT02p hidden = gone: %', x; end if;
  -- a hidden vet visit: coordinators see it (marked), volunteers don't (db review M2)
  perform pg_temp.s37_as(co);
  if (select y ->> 'hidden' from jsonb_array_elements(jc_cat_activity(null, null, 'vet', null, null) -> 'items') y where y ->> 'id' = vt3::text) <> 'true' then
    raise exception 'FAIL VT02q coordinator sees the hidden entry'; end if;
  perform pg_temp.s37_as(vo);
  if vt3::text = any (pg_temp.s37_ids(jc_cat_activity(null, null, 'vet', null, null))) then raise exception 'FAIL VT02r volunteer sees a hidden entry'; end if;
  perform pg_temp.s37_as(c1);                                        -- a community admin shows it again
  if (jc_cat_log_hide('vet', vt3, false) #>> '{vet,hidden}')::boolean then raise exception 'FAIL VT02s community admin shows again'; end if;
  perform pg_temp.s37_as(co);
  perform jc_cat_unmerge(cat3);
  k := k + 22;

  -- ---------- VT03 who ----------
  perform pg_temp.s37_as(vo);
  v := jc_cat_activity(null, null, 'vet', null, null);
  x := (select y from jsonb_array_elements(v -> 'items') y where y ->> 'id' = vt1::text);
  if x ->> 'clinic' <> 'Jubail Vet Clinic' or x -> 'invoice_no' <> 'null'::jsonb or x -> 'doc_url' <> 'null'::jsonb
     or (x ->> 'can_hide')::boolean then raise exception 'FAIL VT03a volunteer sees facts, not the invoice: %', x; end if;
  if (select y ->> 'invoice_no' from jsonb_array_elements(v -> 'items') y where y ->> 'id' = vt3::text) <> 'INV-0050' then
    raise exception 'FAIL VT03b volunteer sees a shared invoice'; end if;
  if jsonb_array_length(pg_temp.s37_reg(cat1) -> 'vaccines') <> 1 then raise exception 'FAIL VT03c volunteer sees vaccines'; end if;
  if pg_temp.s37_err(format('select jc_cat_vet_add(%L)', jsonb_build_object('done', '["checkup"]'::jsonb, 'cats', jsonb_build_array(cat1)))) <> 'NOT_ADMIN'
     or pg_temp.s37_err(format('select jc_cat_log_hide(''vet'', %L, true)', vt1)) <> 'NOT_ADMIN' then
    raise exception 'FAIL VT03d volunteer logs or hides a vet visit'; end if;
  foreach s in array array[r2::text, pa::text, ob::text] loop
    perform pg_temp.s37_as(s::uuid);
    foreach q in array array[
      format('select jc_cat_vet_add(%L)', jsonb_build_object('done', '["checkup"]'::jsonb, 'cats', jsonb_build_array(cat1))),
      format('select jc_cat_log_hide(''vet'', %L, true)', vt1)] loop
      if coalesce(pg_temp.s37_err(q), 'ran') not in ('NOT_ADMIN', 'NOT_FOUND', 'BAD_CAT') then
        raise exception 'FAIL VT03e % ran: %', s, q; end if;
    end loop;
  end loop;
  perform pg_temp.s37_as(ob);                                        -- another community: reads only its own
  if jsonb_array_length(jc_cat_activity(null, null, 'vet', null, null) -> 'items') <> 0 then raise exception 'FAIL VT03f cross-community read'; end if;
  perform pg_temp.s37_as(c1);
  if pg_temp.s37_err(format('select jc_cat_vet_add(%L)', jsonb_build_object('done', '["checkup"]'::jsonb, 'cats', jsonb_build_array(cat4)))) is not null then
    raise exception 'FAIL VT03g community admin logs'; end if;
  foreach q in array array['http://drive.google.com/file/d/1', 'https://evil.example/drive.google.com/', 'javascript:alert(1)',
                           'https://drive.google.com.evil.example/x', 'https://docs.google.com/a b', 'https://docs.google.com/a"onmouseover=x',
                           'https://drive.google.com/file/d/' || repeat('a', 480), 'https://DRIVE.google.com/file/d/x',
                           'https://drive.google.com@evil.example/file/d/x', 'https://drive.google.com', 'https://docs.google.com/viewer?url=https://evil.example',
                           'https://docs.google.com/forms/d/x/viewform', 'https://drive.google.com/file/d/x' || chr(10),
                           'https://drive.google.com/uc?id=x'] loop
    if pg_temp.s37_err(format('select jc_cat_vet_add(%L)', jsonb_build_object('done', '["checkup"]'::jsonb, 'doc_url', q,
         'cats', jsonb_build_array(cat4)))) is distinct from 'BAD_LINK' then raise exception 'FAIL VT03h link accepted: %', q; end if;
  end loop;
  if pg_temp.s37_err(format('select jc_cat_vet_add(%L)', jsonb_build_object('done', '["checkup"]'::jsonb,
       'doc_url', 'https://docs.google.com/document/d/1x/edit', 'cats', jsonb_build_array(cat4)))) is not null
     or pg_temp.s37_err(format('select jc_cat_vet_add(%L)', jsonb_build_object('done', '["checkup"]'::jsonb,
       'doc_url', 'https://drive.google.com/drive/u/0/folders/1AbC', 'cats', jsonb_build_array(cat4)))) is not null then
    raise exception 'FAIL VT03i a Docs link / a Drive folder'; end if;
  k := k + 8;

  -- ---------- VT04 kill switch ----------
  execute 'reset role';
  update jc_communities set modules = jsonb_set(modules, '{cats,enabled}', 'false') where id = 'testville37';
  execute 'set local role authenticated';
  perform pg_temp.s37_as(co);
  foreach q in array array[
    format('select jc_cat_vet_add(%L)', jsonb_build_object('done', '["checkup"]'::jsonb, 'cats', jsonb_build_array(cat1))),
    format('select jc_cat_log_hide(''vet'', %L, true)', vt1),
    'select jc_cat_activity(null, null, ''vet'', null, null)'] loop
    if pg_temp.s37_err(q) is distinct from 'MODULE_OFF' then raise exception 'FAIL VT04 module off: %', q; end if;
  end loop;
  execute 'reset role';
  update jc_communities set modules = jsonb_set(modules, '{cats,enabled}', 'true') where id = 'testville37';
  execute 'set local role authenticated';
  k := k + 1;

  -- ---------- VT05 bad input, rate limit, admin log ----------
  perform pg_temp.s37_as(co);
  foreach q in array array[
    '{"cats": "C1"}|BAD_FIELDS',
    '{"done": [], "cats": "C1"}|BAD_DONE',
    '{"done": ["haircut"], "cats": "C1"}|BAD_DONE',
    '{"done": "checkup", "cats": "C1"}|BAD_FIELDS',
    '{"done": [1], "cats": "C1"}|BAD_FIELDS',
    '{"done": ["vaccination"], "cats": "C1"}|BAD_VACCINE',
    '{"done": ["checkup"], "vaccine": "rabies", "cats": "C1"}|BAD_VACCINE',
    '{"done": ["vaccination"], "vaccine": "flu", "cats": "C1"}|BAD_VACCINE',
    '{"done": ["checkup"], "vaccine_name": "X", "cats": "C1"}|BAD_VACCINE',
    '{"done": ["checkup"], "visited_on": "FUTURE", "cats": "C1"}|BAD_DATE',
    '{"done": ["checkup"], "visited_on": "1999-12-31", "cats": "C1"}|BAD_DATE',
    '{"done": ["checkup"], "visited_on": "19/11/2026", "cats": "C1"}|BAD_DATE',
    '{"done": ["checkup"], "next_due": "TODAY", "cats": "C1"}|BAD_DUE',
    '{"done": ["checkup"], "next_due": "SIXYEARS", "cats": "C1"}|BAD_DUE',
    '{"done": ["checkup"], "next_due": "2027-02-30", "cats": "C1"}|BAD_DUE',
    '{"done": ["checkup"], "shared": true, "cats": "C1"}|NO_INVOICE',
    '{"done": ["checkup"], "shared": "yes", "cats": "C1"}|BAD_FIELDS',
    '{"done": ["checkup"], "cats": []}|NO_CAT',
    '{"done": ["checkup"], "cats": "CB"}|BAD_CAT',
    '{"done": ["checkup"], "cats": "C3M"}|BAD_CAT',
    '{"done": ["checkup"], "cats": ["nope"]}|BAD_CAT',
    '{"done": ["checkup"], "colour": "x", "cats": "C1"}|BAD_FIELDS',
    '{"done": ["checkup"], "invoice_no": "LONG", "cats": "C1"}|BAD_FIELDS',
    '[1]|BAD_FIELDS'] loop
    q := replace(replace(replace(replace(replace(replace(replace(q,
           '"cats": "C1"', '"cats": ["' || cat1 || '"]'), '"cats": "CB"', '"cats": ["' || cat_b || '"]'),
           '"FUTURE"', '"' || to_char(d + 1, 'YYYY-MM-DD') || '"'), '"TODAY"', '"' || to_char(d, 'YYYY-MM-DD') || '"'),
           '"SIXYEARS"', '"' || to_char(d + 365 * 5 + 2, 'YYYY-MM-DD') || '"'), '"LONG"', '"' || repeat('x', 61) || '"'),
           '"cats": "C3M"', '"cats": ["' || cat3 || '"]');
    if q like '%C3M%' then raise exception 'FAIL VT05 fixture'; end if;
    if split_part(q, '|', 2) = 'BAD_CAT' and q like '%' || cat3 || '%' then
      perform jc_cat_merge(cat3, cat2);                                -- a merged cat takes no new vet visits
    end if;
    if pg_temp.s37_err(format('select jc_cat_vet_add(%L)', split_part(q, '|', 1))) is distinct from split_part(q, '|', 2) then
      raise exception 'FAIL VT05a % → %', q, pg_temp.s37_err(format('select jc_cat_vet_add(%L)', split_part(q, '|', 1))); end if;
    if q like '%' || cat3 || '%' then perform jc_cat_unmerge(cat3); end if;
  end loop;
  if pg_temp.s37_err('select jc_cat_log_hide(''vet'', gen_random_uuid(), true)') <> 'NOT_FOUND' then raise exception 'FAIL VT05b hide unknown'; end if;
  -- rate limit: the visits + sightings bucket
  execute 'reset role';
  update jc_rate set n = 60 where user_id = co and bucket = 'cat_log';
  if not found then raise exception 'FAIL VT05c no cat_log bucket row'; end if;
  execute 'set local role authenticated';
  if pg_temp.s37_err(format('select jc_cat_vet_add(%L)', jsonb_build_object('done', '["checkup"]'::jsonb, 'cats', jsonb_build_array(cat1)))) <> 'RATE_LIMITED' then
    raise exception 'FAIL VT05d rate limit'; end if;
  execute 'reset role';
  if exists (select 1 from jc_admin_log where community_id = 'testville37' and action like 'cat\_%'
              and target::text ~ '(Jubail Vet|Rabisin|Recovering|INV-|drive\.google|Private note)') then
    raise exception 'FAIL VT05e content in the admin log'; end if;
  if (select count(*) from jc_admin_log where community_id = 'testville37' and action = 'cat_vet_add') <> 9 then
    raise exception 'FAIL VT05f vet adds logged: %', (select jsonb_agg(action) from jc_admin_log where community_id = 'testville37'); end if;
  -- ---------- VT06 paging: 55+ vet entries, backdated and same-day, page by page — none lost or repeated ----------
  insert into jc_cat_vet_visits (community_id, visited_on, done, logged_at)
  select 'testville37', d - (i % 4), '{checkup}', now() - make_interval(mins => i) from generate_series(1, 55) i;
  insert into jc_cat_vet_cats select w.id, cat4 from jc_cat_vet_visits w where w.community_id = 'testville37'
     and not exists (select 1 from jc_cat_vet_cats vc where vc.visit_id = w.id);
  n := (select count(*) from jc_cat_vet_visits where community_id = 'testville37');
  execute 'set local role authenticated';
  perform pg_temp.s37_as(co);
  ids := '{}'; pages := 0; L := jc_cat_activity(null, null, 'vet', null, null);
  if (L ->> 'more')::boolean is not true then raise exception 'FAIL VT06a first page says more'; end if;
  loop
    ids := ids || pg_temp.s37_ids(L); pages := pages + 1;
    exit when (L ->> 'more')::boolean is not true or pages > 5;
    L := jc_cat_activity(null, null, 'vet', (L #>> '{items,-1,at}')::timestamptz, (L #>> '{items,-1,id}')::uuid);
  end loop;
  if cardinality(ids) <> n or (select count(distinct e) from unnest(ids) e) <> n or pages <> 2 then
    raise exception 'FAIL VT06b paging: % ids (% distinct) over % pages, expected %', cardinality(ids),
      (select count(distinct e) from unnest(ids) e), pages, n; end if;
  execute 'reset role';
  k := k + 31;                                                   -- ends as postgres, like every slice

  perform set_config('jc_test.checks', (coalesce(nullif(current_setting('jc_test.checks', true), ''), '0')::int + k)::text, true);
  raise notice 's37_cat_vet_log: % checks passed', k;
end
$t$;
