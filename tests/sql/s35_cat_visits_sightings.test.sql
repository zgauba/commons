-- CC-4 — Cats visits + sightings.
-- Done-when checks (docs/plans/CC-community-cats.md, CC-4 plan):
--   D1 a volunteer logs a visit at a station with recognised cats + a problem; it shows in the activity (all, the
--      station's, Problems) and on each recognised cat's history                                        → CV01
--   D2 a sighting of a cat not yet identified is saved with a description, a coordinator links it, and it then shows
--      on that cat (also after the cat is merged into another); unlink                                   → CV02
--   D3 who: residents and Pets admins get nothing; a coordinator without cats_vol and a community admin can log;
--      hide = coordinator or the author within 24 h; link = coordinators only; residents' view unchanged → CV03
--   D4 module off → MODULE_OFF from every new RPC; jc_pets_retention leaves cat entries alone; the hourly
--      snapshot counts visits / sightings / problems                                                      → CV04
--   D5 bad input refused (dates, counts, cats of another community / merged, place, keys); rate limit; the
--      admin log holds no content; names kept after the author leaves the programme                       → CV05
-- Own communities (testville35, testville35b) — never jubail. Run via tests/sql/build_dryrun.sh (rolls back).

do $t$
declare
  c1 uuid := '00000000-0000-4000-8000-000000003501';  -- community admin (community code)
  co uuid := '00000000-0000-4000-8000-000000003502';  -- Cats coordinator by invite (no cats_vol)
  vo uuid := '00000000-0000-4000-8000-000000003503';  -- Cats volunteer by invite
  pa uuid := '00000000-0000-4000-8000-000000003504';  -- Pets admin by invite
  r2 uuid := '00000000-0000-4000-8000-000000003505';  -- resident
  ob uuid := '00000000-0000-4000-8000-000000003506';  -- coordinator of ANOTHER community
  v jsonb; x jsonb; k int := 0; s text; tok text; n int; q text;
  a1 uuid; a2 uuid; st1 uuid; st2 uuid; st_b uuid; cat1 uuid; cat2 uuid; cat3 uuid; cat_b uuid;
  vis1 uuid; vis2 uuid; si1 uuid; si2 uuid; v_today text;
begin
  execute $f$create function pg_temp.s35_as(u uuid) returns void language sql as
    $b$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $b$$f$;
  execute $f$create function pg_temp.s35_err(q text) returns text language plpgsql as
    $b$ begin execute q; return null; exception when others then return sqlerrm; end $b$$f$;
  execute $f$create function pg_temp.s35_ids(d jsonb) returns text[] language sql as
    $b$ select coalesce(array_agg(x ->> 'id' order by ord), '{}') from jsonb_array_elements(d -> 'items') with ordinality t(x, ord) $b$$f$;
  execute 'grant execute on function pg_temp.s35_as(uuid), pg_temp.s35_err(text), pg_temp.s35_ids(jsonb) to authenticated';

  -- ---------- fixtures (as postgres) ----------
  insert into auth.users (id, email) values (c1, 'c1@s35.test'), (co, 'co@s35.test'), (vo, 'vo@s35.test'),
    (pa, 'pa@s35.test'), (r2, 'r2@s35.test'), (ob, 'ob@s35.test');
  insert into jc_communities (id, name_en, map_lat, map_lng, modules) values
    ('testville35', 'Testville 35', 24.53, 54.43, '{"pets": {"enabled": true}, "cats": {"enabled": true}}'),
    ('testville35b', 'Testville 35b', 24.53, 54.43, '{"pets": {"enabled": true}, "cats": {"enabled": true}}');
  insert into jc_villages (community_id, key, name_en) values ('testville35', 'north', 'North'), ('testville35b', 'north', 'North');
  perform jc_code_set('testville35', 'join', 'S35-JOIN-CODE-01');
  perform jc_code_set('testville35', 'community', 'S35-COMMUNITY-01');
  perform jc_code_set('testville35b', 'join', 'S35-JOIN-CODE-02');
  perform jc_code_set('testville35b', 'community', 'S35-COMMUNITY-02');

  execute 'set local role authenticated';
  perform pg_temp.s35_as(c1); perform jc_join('testville35', 'S35-JOIN-CODE-01'); perform jc_admin_unlock('S35-COMMUNITY-01');
  perform pg_temp.s35_as(ob); perform jc_join('testville35b', 'S35-JOIN-CODE-02'); perform jc_admin_unlock('S35-COMMUNITY-02');
  foreach s in array array[co::text, vo::text, pa::text, r2::text] loop
    perform pg_temp.s35_as(s::uuid); perform jc_join('testville35', 'S35-JOIN-CODE-01');
  end loop;
  foreach s in array array['cats:' || co, 'cats_vol:' || vo, 'pets:' || pa] loop
    perform pg_temp.s35_as(c1);
    tok := jc_module_admin_link_create(split_part(s, ':', 1)) ->> 'token';
    perform pg_temp.s35_as(split_part(s, ':', 2)::uuid);
    perform jc_module_admin_accept(tok);
  end loop;
  execute 'reset role';
  update jc_accounts set display_name = 'Vee Volunteer' where user_id = vo;
  update jc_accounts set display_name = 'Coco Coordinator' where user_id = co;
  execute 'set local role authenticated';

  perform pg_temp.s35_as(co);
  a1 := (jc_cat_area_save(null, 'Souk', null) #>> '{areas,0,id}')::uuid;
  select (y ->> 'id')::uuid into a2 from jsonb_array_elements(jc_cat_area_save(null, 'Seef', null) -> 'areas') y where y ->> 'name' = 'Seef';
  st1 := (jc_cat_station_save(null, jsonb_build_object('area_id', a1, 'lat', 24.53, 'lng', 54.43, 'private', false)) #>> '{stations,0,id}')::uuid;
  select (y ->> 'id')::uuid into st2 from jsonb_array_elements(
    jc_cat_station_save(null, jsonb_build_object('area_id', a2, 'lat', 24.54, 'lng', 54.44, 'private', true)) -> 'stations') y
   where (y ->> 'area_id')::uuid = a2;
  select (y ->> 'id')::uuid into cat1 from jsonb_array_elements(jc_cat_save(null, '{"name": "Caramel"}') -> 'cats') y where y ->> 'name' = 'Caramel';
  select (y ->> 'id')::uuid into cat2 from jsonb_array_elements(jc_cat_save(null, '{"name": "Gwen"}') -> 'cats') y where y ->> 'name' = 'Gwen';
  select (y ->> 'id')::uuid into cat3 from jsonb_array_elements(jc_cat_save(null, '{"name": "Gwen2"}') -> 'cats') y where y ->> 'name' = 'Gwen2';
  perform pg_temp.s35_as(ob);
  st_b := (jc_cat_station_save(null, jsonb_build_object('area_id',
             (jc_cat_area_save(null, 'Other', null) #>> '{areas,0,id}')::uuid, 'lat', 24.5, 'lng', 54.4, 'private', false)) #>> '{stations,0,id}')::uuid;
  cat_b := (jc_cat_save(null, '{"name": "Elsewhere"}') #>> '{cats,0,id}')::uuid;

  -- ---------- CV01 a volunteer logs a visit ----------
  perform pg_temp.s35_as(vo);
  v := jc_cat_visit_add(st1, jsonb_build_object('food', true, 'water', true, 'cleaned', false, 'headcount', 7,
         'unfamiliar', 1, 'kittens', 2, 'problem', '  Bowl broken ', 'note', 'All good otherwise', 'cats', jsonb_build_array(cat1, cat2, cat1)));
  x := v -> 'visit'; vis1 := (x ->> 'id')::uuid;
  if x ->> 'kind' <> 'visit' or (x ->> 'food')::boolean is not true or (x ->> 'cleaned')::boolean is not false
     or (x ->> 'headcount')::int <> 7 or (x ->> 'kittens')::int <> 2 or x ->> 'problem' <> 'Bowl broken'
     or x ->> 'by' <> 'Vee Volunteer' or (x ->> 'mine')::boolean is not true or (x ->> 'can_hide')::boolean is not true
     or jsonb_array_length(x -> 'cats') <> 2 or x #>> '{station,code}' <> 'S-001' then
    raise exception 'FAIL CV01a visit saved: %', x; end if;
  if x::text ~ '(user_id|logged_by|@s35)' then raise exception 'FAIL CV01b ids / emails in the entry: %', x; end if;
  v_today := (x ->> 'visited_on');
  vis2 := (jc_cat_visit_add(st2, jsonb_build_object('visited_on', to_char(current_date - 3, 'YYYY-MM-DD'), 'headcount', 0)) #>> '{visit,id}')::uuid;
  v := jc_cat_activity(null, null, null, null, null);
  if pg_temp.s35_ids(v) <> array[vis1::text, vis2::text] or (v ->> 'more')::boolean or (v ->> 'can_edit')::boolean then
    raise exception 'FAIL CV01c activity order / flags: %', v; end if;
  if pg_temp.s35_ids(jc_cat_activity(st2, null, null, null, null)) <> array[vis2::text] then raise exception 'FAIL CV01d station filter'; end if;
  if pg_temp.s35_ids(jc_cat_activity(null, null, 'problem', null, null)) <> array[vis1::text] then raise exception 'FAIL CV01e problems'; end if;
  if pg_temp.s35_ids(jc_cat_activity(null, cat2, null, null, null)) <> array[vis1::text]
     or pg_temp.s35_ids(jc_cat_activity(null, cat3, null, null, null)) <> '{}' then raise exception 'FAIL CV01f cat history'; end if;
  if pg_temp.s35_ids(jc_cat_activity(null, null, null, (v #>> '{items,0,at}')::timestamptz, vis1)) <> array[vis2::text] then
    raise exception 'FAIL CV01g page cursor'; end if;
  k := k + 7;

  -- ---------- CV02 sightings: unidentified → linked → follows a merge ----------
  v := jc_cat_sighting_add(jsonb_build_object('description', 'Grey tabby, white paws', 'lat', 24.531, 'lng', 54.431, 'note', 'Near the bins'));
  x := v -> 'sighting'; si1 := (x ->> 'id')::uuid;
  if x -> 'cat' <> 'null'::jsonb or x ->> 'description' <> 'Grey tabby, white paws' or (x ->> 'lat')::float <> 24.531
     or x ->> 'by' <> 'Vee Volunteer' then raise exception 'FAIL CV02a unidentified sighting: %', x; end if;
  si2 := (jc_cat_sighting_add(jsonb_build_object('cat_id', cat1, 'station_id', st2)) #>> '{sighting,id}')::uuid;
  execute 'reset role';
  if (select area_id from jc_cat_sightings where id = si2) is distinct from a2 then raise exception 'FAIL CV02b station sets the area'; end if;
  execute 'set local role authenticated';
  if pg_temp.s35_ids(jc_cat_activity(null, null, 'unidentified', null, null)) <> array[si1::text] then raise exception 'FAIL CV02c unidentified filter'; end if;
  if pg_temp.s35_err(format('select jc_cat_sighting_link(%L, %L)', si1, cat3)) <> 'NOT_ADMIN' then raise exception 'FAIL CV02d volunteer links'; end if;
  perform pg_temp.s35_as(co);
  x := jc_cat_sighting_link(si1, cat3) -> 'sighting';
  if x #>> '{cat,name}' <> 'Gwen2' or (x ->> 'linked')::boolean is not true then raise exception 'FAIL CV02e linked: %', x; end if;
  if not (si1::text = any (pg_temp.s35_ids(jc_cat_activity(null, cat3, null, null, null)))) then raise exception 'FAIL CV02f on the cat'; end if;
  perform jc_cat_merge(cat3, cat2);                                  -- Gwen2 is Gwen: history follows to the survivor
  v := jc_cat_activity(null, cat2, null, null, null);
  if not (si1::text = any (pg_temp.s35_ids(v))) or not (vis1::text = any (pg_temp.s35_ids(v))) then raise exception 'FAIL CV02g merged history: %', v; end if;
  if (select x2 #>> '{cat,name}' from jsonb_array_elements(v -> 'items') x2 where x2 ->> 'id' = si1::text) <> 'Gwen' then
    raise exception 'FAIL CV02h shown as the survivor'; end if;
  if pg_temp.s35_err(format('select jc_cat_sighting_link(%L, %L)', si1, cat3)) <> 'BAD_CAT' then raise exception 'FAIL CV02i link to merged'; end if;
  perform jc_cat_unmerge(cat3);
  x := jc_cat_sighting_link(si1, null) -> 'sighting';
  if x -> 'cat' <> 'null'::jsonb or (x ->> 'linked')::boolean then raise exception 'FAIL CV02j unlink: %', x; end if;
  if pg_temp.s35_err(format('select jc_cat_sighting_link(%L, null)', si2)) <> 'NO_CAT'
     or pg_temp.s35_err(format('select jc_cat_sighting_link(%L, %L)', si2, cat2)) <> 'NO_CAT' then
    raise exception 'FAIL CV02k a sighting logged against a cat keeps it'; end if;
  k := k + 11;

  -- ---------- CV03 who ----------
  foreach s in array array[r2::text, pa::text, ob::text] loop
    perform pg_temp.s35_as(s::uuid);
    foreach q in array array[
      format('select jc_cat_visit_add(%L, %L)', st1, '{}'),
      format('select jc_cat_sighting_add(%L)', jsonb_build_object('cat_id', cat1, 'station_id', st1)),
      'select jc_cat_activity(null, null, null, null, null)',
      format('select jc_cat_log_hide(''visit'', %L, true)', vis1),
      format('select jc_cat_sighting_link(%L, %L)', si1, cat1)] loop
      if coalesce(pg_temp.s35_err(q), 'ran') not in ('NOT_ADMIN', 'NOT_FOUND', 'BAD_STATION', 'BAD_CAT')
         and not (s = ob::text and q like '%jc_cat_activity%') then
        raise exception 'FAIL CV03a % ran: %', s, q; end if;
    end loop;
  end loop;
  perform pg_temp.s35_as(ob);                                        -- another community's coordinator reads only its own
  if jsonb_array_length(jc_cat_activity(null, null, null, null, null) -> 'items') <> 0 then raise exception 'FAIL CV03a2 cross-community read'; end if;
  perform pg_temp.s35_as(r2);
  if jc_cats_public()::text ~ '(visit|sighting|Bowl broken|Vee)' then raise exception 'FAIL CV03b resident view'; end if;
  execute 'reset role';                                              -- coordinator without cats_vol logs
  if not exists (select 1 from jc_module_admins where user_id = co and scope = 'cats')
     or exists (select 1 from jc_module_admins where user_id = co and scope = 'cats_vol') then raise exception 'FAIL CV03c fixture'; end if;
  execute 'set local role authenticated';
  perform pg_temp.s35_as(co);
  x := jc_cat_visit_add(st1, '{"food": true}') -> 'visit';
  if x ->> 'by' <> 'Coco Coordinator' then raise exception 'FAIL CV03d coordinator logs'; end if;
  perform pg_temp.s35_as(c1);
  if pg_temp.s35_err(format('select jc_cat_visit_add(%L, %L)', st1, '{"water": true}')) is not null then raise exception 'FAIL CV03e community admin logs'; end if;
  -- hide: author within 24 h, coordinators always; hidden entries only for coordinators
  perform pg_temp.s35_as(vo);
  x := jc_cat_log_hide('visit', vis2, true) -> 'visit';
  if (x ->> 'hidden')::boolean is not true then raise exception 'FAIL CV03f author hides'; end if;
  -- the author still sees their own hidden entry (to show it again); db review L5
  if (select x2 ->> 'hidden' from jsonb_array_elements(jc_cat_activity(null, null, null, null, null) -> 'items') x2 where x2 ->> 'id' = vis2::text) <> 'true' then
    raise exception 'FAIL CV03g author sees own hidden'; end if;
  perform pg_temp.s35_as(c1);
  if pg_temp.s35_err(format('select jc_cat_log_hide(''sighting'', %L, true)', si2)) is not null then
    raise exception 'FAIL CV03h community admin is a coordinator here'; end if;
  perform jc_cat_log_hide('sighting', si2, false);
  perform pg_temp.s35_as(co);
  if not (vis2::text = any (pg_temp.s35_ids(jc_cat_activity(null, null, null, null, null)))) then raise exception 'FAIL CV03i coordinator sees hidden'; end if;
  perform jc_cat_log_hide('visit', vis2, false);
  execute 'reset role';
  update jc_cat_visits set logged_at = now() - interval '25 hours' where id = vis1;
  execute 'set local role authenticated';
  perform pg_temp.s35_as(vo);
  if pg_temp.s35_err(format('select jc_cat_log_hide(''visit'', %L, true)', vis1)) <> 'NOT_ADMIN' then raise exception 'FAIL CV03j author after 24 h'; end if;
  if (jc_cat_activity(null, null, 'problem', null, null) #>> '{items,0,can_hide}')::boolean then raise exception 'FAIL CV03k can_hide after 24 h'; end if;
  perform pg_temp.s35_as(co);
  if pg_temp.s35_err(format('select jc_cat_log_hide(''visit'', %L, true)', vis1)) is not null then raise exception 'FAIL CV03l coordinator hides'; end if;
  perform jc_cat_log_hide('visit', vis1, false);
  -- security M1: a coordinator's hide can't be undone by the author (even inside 24 h)
  perform jc_cat_log_hide('sighting', si1, true);
  perform pg_temp.s35_as(vo);
  if pg_temp.s35_err(format('select jc_cat_log_hide(''sighting'', %L, false)', si1)) <> 'NOT_ADMIN' then raise exception 'FAIL CV03m author undid a coordinator hide'; end if;
  if (select x2 ->> 'can_hide' from jsonb_array_elements(jc_cat_activity(null, null, null, null, null) -> 'items') x2 where x2 ->> 'id' = si1::text) is distinct from 'false' then
    raise exception 'FAIL CV03n no Show again for a hide by someone else'; end if;
  perform pg_temp.s35_as(co);
  perform jc_cat_log_hide('sighting', si1, false);
  -- keyset cursor: two entries at the same "at" are both reached (db review M1)
  execute 'reset role';
  update jc_cat_visits set logged_at = now() - interval '2 days', visited_on = current_date - 3 where community_id = 'testville35' and logged_by in (co, c1);
  execute 'set local role authenticated';
  v := jc_cat_activity(null, null, 'visit', null, null);
  if (v #>> '{items,1,at}') <> (v #>> '{items,2,at}') then raise exception 'FAIL CV03o tie fixture: %', v; end if;
  if pg_temp.s35_ids(jc_cat_activity(null, null, 'visit', (v #>> '{items,1,at}')::timestamptz, (v #>> '{items,1,id}')::uuid))
     <> (pg_temp.s35_ids(v))[3:] then raise exception 'FAIL CV03p tie lost at a page boundary: %', v; end if;
  k := k + 17;

  -- ---------- CV04 kill switch, retention, snapshot ----------
  execute 'reset role';
  update jc_communities set modules = jsonb_set(modules, '{cats,enabled}', 'false') where id = 'testville35';
  execute 'set local role authenticated';
  perform pg_temp.s35_as(co);
  foreach q in array array[
    format('select jc_cat_visit_add(%L, %L)', st1, '{}'),
    format('select jc_cat_sighting_add(%L)', jsonb_build_object('cat_id', cat1, 'station_id', st1)),
    'select jc_cat_activity(null, null, null, null, null)',
    format('select jc_cat_log_hide(''visit'', %L, true)', vis1),
    format('select jc_cat_sighting_link(%L, %L)', si1, cat1)] loop
    if pg_temp.s35_err(q) is distinct from 'MODULE_OFF' then raise exception 'FAIL CV04a module off: %', q; end if;
  end loop;
  execute 'reset role';
  update jc_communities set modules = jsonb_set(modules, '{cats,enabled}', 'true') where id = 'testville35';
  update jc_cat_sightings set seen_at = now() - interval '13 days', logged_at = now() - interval '60 days' where id = si2;
  n := (select count(*) from jc_cat_sightings where community_id = 'testville35') + (select count(*) from jc_cat_visits where community_id = 'testville35');
  perform jc_pets_retention();
  if (select count(*) from jc_cat_sightings where community_id = 'testville35') + (select count(*) from jc_cat_visits where community_id = 'testville35') <> n then
    raise exception 'FAIL CV04b retention touched cat entries'; end if;
  perform jc_snapshot_run();
  x := (select metrics from jc_snapshots where community_id = 'testville35' and module = 'cats' and bucket = date_trunc('hour', now()));
  -- vis1 (25 h ago, the problem), vis2, the coordinator's + the community admin's visits; si2 logged 60 days ago is out
  if (x ->> 'visits_7d')::int <> 4 or (x ->> 'problems_7d')::int <> 1 or (x ->> 'sightings_7d')::int <> 1 then
    raise exception 'FAIL CV04c snapshot: %', x; end if;
  k := k + 3;
  execute 'set local role authenticated';

  -- ---------- CV05 bad input, rate limit, admin log, names kept ----------
  perform pg_temp.s35_as(vo);
  foreach q in array array[
    format('select jc_cat_visit_add(%L, %L)', st_b, '{}') || '|BAD_STATION',
    format('select jc_cat_visit_add(%L, %L)', st1, jsonb_build_object('visited_on', to_char(current_date + 2, 'YYYY-MM-DD'))) || '|BAD_DATE',
    format('select jc_cat_visit_add(%L, %L)', st1, jsonb_build_object('visited_on', to_char(current_date - 20, 'YYYY-MM-DD'))) || '|BAD_DATE',
    format('select jc_cat_visit_add(%L, %L)', st1, '{"visited_on": "18/11/2026"}') || '|BAD_DATE',
    format('select jc_cat_visit_add(%L, %L)', st1, '{"headcount": 201}') || '|BAD_COUNT',
    format('select jc_cat_visit_add(%L, %L)', st1, '{"kittens": 1.5}') || '|BAD_COUNT',
    format('select jc_cat_visit_add(%L, %L)', st1, '{"food": "yes"}') || '|BAD_FIELDS',
    format('select jc_cat_visit_add(%L, %L)', st1, '{"colour": "x"}') || '|BAD_FIELDS',
    format('select jc_cat_visit_add(%L, %L)', st1, jsonb_build_object('cats', jsonb_build_array(cat_b))) || '|BAD_CAT',
    format('select jc_cat_visit_add(%L, %L)', st1, jsonb_build_object('cats', jsonb_build_array('nope'))) || '|BAD_CAT',
    format('select jc_cat_visit_add(%L, %L)', st1, jsonb_build_object('note', repeat('x', 501))) || '|BAD_FIELDS',
    format('select jc_cat_sighting_add(%L)', '{"note": "x", "area_id": null}') || '|NO_CAT',
    format('select jc_cat_sighting_add(%L)', '{"description": "Black cat"}') || '|NO_PLACE',
    format('select jc_cat_sighting_add(%L)', jsonb_build_object('cat_id', cat_b, 'station_id', st1)) || '|BAD_CAT',
    format('select jc_cat_sighting_add(%L)', jsonb_build_object('description', 'x', 'station_id', st_b)) || '|BAD_STATION',
    format('select jc_cat_sighting_add(%L)', jsonb_build_object('description', 'x', 'lat', 24.5)) || '|BAD_FIELDS',
    format('select jc_cat_sighting_add(%L)', jsonb_build_object('description', 'x', 'area_id', a1, 'seen_at', (now() + interval '1 day')::text)) || '|BAD_DATE',
    format('select jc_cat_sighting_add(%L)', jsonb_build_object('description', 'x', 'area_id', a1, 'seen_at', (now() - interval '15 days')::text)) || '|BAD_DATE',
    'select jc_cat_activity(null, null, ''everything'', null, null)|BAD_FIELDS',
    format('select jc_cat_activity(%L, null, null, null, null)', st_b) || '|NOT_FOUND',
    format('select jc_cat_log_hide(''photo'', %L, true)', vis1) || '|BAD_FIELDS',
    format('select jc_cat_log_hide(null, %L, true)', vis1) || '|BAD_FIELDS',
    format('select jc_cat_sighting_add(%L)', '{"description": "x", "lat": 1e400, "lng": 54}') || '|BAD_FIELDS',
    format('select jc_cat_visit_add(%L, %L)', st1, jsonb_build_object('cats', (select jsonb_agg(gen_random_uuid()) from generate_series(1, 201)))) || '|BAD_FIELDS'] loop
    if pg_temp.s35_err(split_part(q, '|', 1)) is distinct from split_part(q, '|', 2) then
      raise exception 'FAIL CV05a % → %', q, pg_temp.s35_err(split_part(q, '|', 1)); end if;
  end loop;
  -- an archived station takes no new visits
  perform pg_temp.s35_as(co); perform jc_cat_station_save(st2, '{"archived": true}');
  perform pg_temp.s35_as(vo);
  if pg_temp.s35_err(format('select jc_cat_visit_add(%L, %L)', st2, '{}')) <> 'BAD_STATION' then raise exception 'FAIL CV05b archived station'; end if;
  -- rate limit: 60 an hour across visits + sightings
  execute 'reset role';
  update jc_rate set n = 60 where user_id = vo and bucket = 'cat_log';
  if not found then raise exception 'FAIL CV05c no cat_log bucket row'; end if;
  execute 'set local role authenticated';
  if pg_temp.s35_err(format('select jc_cat_sighting_add(%L)', jsonb_build_object('cat_id', cat1, 'station_id', st1))) <> 'RATE_LIMITED' then
    raise exception 'FAIL CV05d rate limit'; end if;
  execute 'reset role';
  -- the admin log: hides + links, ids only, never content
  if exists (select 1 from jc_admin_log where community_id = 'testville35' and action like 'cat\_%'
              and target::text ~ '(Bowl|Grey tabby|bins|Vee|Coco)') then raise exception 'FAIL CV05e content in the admin log'; end if;
  if (select count(*) from jc_admin_log where community_id = 'testville35' and action = 'cat_log_hide') <> 8
     or (select count(*) from jc_admin_log where community_id = 'testville35' and action = 'cat_sighting_link') <> 2 then
    raise exception 'FAIL CV05f admin log counts: %', (select jsonb_agg(action) from jc_admin_log where community_id = 'testville35'); end if;
  -- a volunteer removed from the programme keeps their name on their entries
  delete from jc_module_admins where user_id = vo and community_id = 'testville35';
  update jc_accounts set display_name = 'Renamed' where user_id = vo;
  execute 'set local role authenticated';
  perform pg_temp.s35_as(co);
  if (select x2 ->> 'by' from jsonb_array_elements(jc_cat_activity(null, null, null, null, null) -> 'items') x2 where x2 ->> 'id' = vis1::text) <> 'Vee Volunteer' then
    raise exception 'FAIL CV05g name kept'; end if;
  perform pg_temp.s35_as(vo);
  if pg_temp.s35_err('select jc_cat_activity(null, null, null, null, null)') <> 'NOT_ADMIN' then raise exception 'FAIL CV05h removed volunteer reads'; end if;
  execute 'reset role';
  k := k + 32;                                                   -- ends as postgres, like every slice

  perform set_config('jc_test.checks', (coalesce(nullif(current_setting('jc_test.checks', true), ''), '0')::int + k)::text, true);
  raise notice 's35_cat_visits_sightings: % checks passed', k;
end
$t$;
