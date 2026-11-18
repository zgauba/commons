-- CC-1 — Cats foundation: module key 'cats' + two invite-only roles 'cats' (coordinator) and 'cats_vol' (volunteer).
-- Done-when checks (docs/plans/CC-community-cats.md, CC-1):
--   D1 a community admin can invite Cats coordinators and volunteers, list and remove them      → CF01, CF02, CF08
--   D2 a volunteer (or coordinator) passes NO other gate: no Organizer power, no Pets / Events  → CF03, CF04
--   D3 no shared code can ever grant a Cats role                                                 → CF05
--   D4 'cats' is in every module-key list (label names, page hits, both scope CHECKs agree)     → CF06, CF07, CF10
--   D5 volunteers aren't counted as admins in the hourly snapshot                                 → CF09
-- Each CF check fails on the code live before CC-1 (BAD_SCOPE / BAD_MODULE / BAD_PAGE / count) unless "unchanged".
-- Own community (testville32) — never jubail. Run via tests/sql/build_dryrun.sh (rolls back).

do $t$
declare
  c1 uuid := '00000000-0000-4000-8000-000000003201';  -- community admin (community code)
  co uuid := '00000000-0000-4000-8000-000000003202';  -- Cats coordinator by invite
  vo uuid := '00000000-0000-4000-8000-000000003203';  -- Cats volunteer by invite
  r2 uuid := '00000000-0000-4000-8000-000000003204';  -- resident
  v jsonb; k int := 0; msg text; s text; tok text; n int;
begin
  execute $f$create function pg_temp.s32_as(u uuid) returns void language sql as
    $b$ select set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true) $b$$f$;
  execute $f$create function pg_temp.s32_err(q text) returns text language plpgsql as
    $b$ begin execute q; return null; exception when others then return sqlerrm; end $b$$f$;
  execute 'grant execute on function pg_temp.s32_as(uuid), pg_temp.s32_err(text) to authenticated';

  -- ---------- fixtures (as postgres) ----------
  insert into auth.users (id, email) values (c1, 'c1@s32.test'), (co, 'co@s32.test'), (vo, 'vo@s32.test'), (r2, 'r2@s32.test');
  insert into jc_communities (id, name_en, map_lat, map_lng, modules) values
    ('testville32', 'Testville 32', 24.53, 54.43,
     '{"events": {"enabled": true}, "bookings": {"enabled": true}, "pets": {"enabled": true}, "cats": {"enabled": true}}');
  insert into jc_villages (community_id, key, name_en) values ('testville32', 'north', 'North');
  perform jc_code_set('testville32', 'join', 'S32-JOIN-CODE-01');
  perform jc_code_set('testville32', 'community', 'S32-COMMUNITY-01');

  execute 'set local role authenticated';
  perform pg_temp.s32_as(c1); perform jc_join('testville32', 'S32-JOIN-CODE-01'); perform jc_admin_unlock('S32-COMMUNITY-01');
  foreach s in array array[co::text, vo::text, r2::text] loop
    perform pg_temp.s32_as(s::uuid); perform jc_join('testville32', 'S32-JOIN-CODE-01');
  end loop;

  -- ---------- CF01 a community admin invites at both Cats levels (72 h links, listed) ----------
  perform pg_temp.s32_as(c1);
  foreach s in array array['cats', 'cats_vol'] loop
    v := jc_module_admin_link_create(s);
    if v ->> 'scope' is distinct from s or length(v ->> 'token') < 20
       or (v ->> 'expires_at')::timestamptz not between now() + interval '71 hours' and now() + interval '73 hours' then
      raise exception 'FAIL CF01a % link: %', s, v; end if;
    v := jc_module_admins_list(s);
    if v ->> 'scope' is distinct from s or jsonb_array_length(v -> 'links') <> 1 or jsonb_array_length(v -> 'admins') <> 0 then
      raise exception 'FAIL CF01b % list: %', s, v; end if;
  end loop;
  foreach s in array array['cat', 'Cats', 'cats_volunteer', 'vol'] loop
    if pg_temp.s32_err(format('select jc_module_admin_link_create(%L)', s)) is distinct from 'BAD_SCOPE' then
      raise exception 'FAIL CF01c scope % accepted', s; end if;
  end loop;
  k := k + 5;

  -- ---------- CF02 both invites accepted: the server names the level; listed under it ----------
  tok := jc_module_admin_link_create('cats') ->> 'token';
  perform pg_temp.s32_as(co);
  v := jc_module_admin_accept(tok);
  if v ->> 'scope' is distinct from 'cats' then raise exception 'FAIL CF02a: %', v; end if;
  perform pg_temp.s32_as(c1); tok := jc_module_admin_link_create('cats_vol') ->> 'token';
  perform pg_temp.s32_as(vo);
  v := jc_module_admin_accept(tok);
  if v ->> 'scope' is distinct from 'cats_vol' then raise exception 'FAIL CF02b: %', v; end if;
  if jc_me_get() -> 'admin_scopes' is distinct from '["cats_vol"]'::jsonb then
    raise exception 'FAIL CF02c volunteer scopes: %', jc_me_get() -> 'admin_scopes'; end if;
  perform pg_temp.s32_as(co);
  if jc_me_get() -> 'admin_scopes' is distinct from '["cats"]'::jsonb then
    raise exception 'FAIL CF02e coordinator scopes: %', jc_me_get() -> 'admin_scopes'; end if;
  perform pg_temp.s32_as(c1);
  if (jc_module_admins_list('cats') #>> '{admins,0,user_id}')::uuid is distinct from co
     or (jc_module_admins_list('cats_vol') #>> '{admins,0,user_id}')::uuid is distinct from vo
     or jsonb_array_length(jc_module_admins_list('pets') -> 'admins') <> 0 then
    raise exception 'FAIL CF02d lists'; end if;
  k := k + 5;

  -- ---------- CF03 a volunteer passes no other gate ----------
  perform pg_temp.s32_as(vo);
  execute 'reset role';                                  -- jc_admin_has / jc_assert_admin are internal (not granted)
  if not jc_admin_has('cats_vol') then raise exception 'FAIL CF03a own gate'; end if;
  foreach s in array array['community', 'events', 'bookings', 'pets', 'cats'] loop
    if jc_admin_has(s) then raise exception 'FAIL CF03b volunteer passes %', s; end if;
    if pg_temp.s32_err(format('select jc_assert_admin(%L)', s)) is distinct from 'NOT_ADMIN' then
      raise exception 'FAIL CF03c volunteer asserts %', s; end if;
  end loop;
  execute 'set local role authenticated';
  if pg_temp.s32_err('select jc_admin_events_list()') is distinct from 'NOT_ADMIN' then
    raise exception 'FAIL CF03d volunteer sees events admin'; end if;
  k := k + 4;

  -- ---------- CF04 a coordinator passes only its own gate; neither role can invite, list or remove ----------
  perform pg_temp.s32_as(co);
  execute 'reset role';
  if not jc_admin_has('cats') then raise exception 'FAIL CF04a own gate'; end if;
  foreach s in array array['community', 'events', 'bookings', 'pets'] loop
    if jc_admin_has(s) then raise exception 'FAIL CF04b coordinator passes %', s; end if;
  end loop;
  execute 'set local role authenticated';
  foreach s in array array[co::text, vo::text, r2::text] loop
    perform pg_temp.s32_as(s::uuid);
    foreach msg in array array['cats', 'cats_vol', 'pets'] loop
      if pg_temp.s32_err(format('select jc_module_admin_link_create(%L)', msg)) is distinct from 'NOT_ADMIN'
         or pg_temp.s32_err(format('select jc_module_admins_list(%L)', msg)) is distinct from 'NOT_ADMIN'
         or pg_temp.s32_err(format('select jc_module_admin_revoke(%L, %L, null)', msg, vo)) is distinct from 'NOT_ADMIN' then
        raise exception 'FAIL CF04c % reached % invites', s, msg; end if;
    end loop;
  end loop;
  k := k + 3;

  -- ---------- CF05 no shared code grants a Cats role ----------
  perform pg_temp.s32_as(c1);
  foreach s in array array['cats', 'cats_vol'] loop
    if pg_temp.s32_err(format('select jc_admin_code_rotate(%L)', s)) is distinct from 'BAD_SCOPE' then
      raise exception 'FAIL CF05a code for %', s; end if;
  end loop;
  execute 'reset role';
  msg := null; begin insert into jc_admin_grants (user_id, community_id, scope, code_version) values (r2, 'testville32', 'cats', 1);
  exception when others then msg := sqlstate; end;
  if msg is distinct from '23514' then raise exception 'FAIL CF05b grant row for cats: %', msg; end if;
  msg := null; begin perform jc_code_set('testville32', 'cats_vol', 'S32-CATS-VOL-01');
  exception when others then msg := sqlstate; end;
  if msg is distinct from '23514' then raise exception 'FAIL CF05c code row for cats_vol: %', msg; end if;
  execute 'set local role authenticated';
  k := k + 3;

  -- ---------- CF06 section name: Cats is renamable, and its built-in names are reserved elsewhere ----------
  perform pg_temp.s32_as(c1);
  v := jc_admin_module_label_set('cats', 'Strays', 'الضالة', null, null);
  if v #>> '{cats,name,en}' is distinct from 'Strays' then raise exception 'FAIL CF06a: %', v; end if;
  if pg_temp.s32_err($q$select jc_admin_module_label_set('pets', 'Cats', 'قطط', null, null)$q$) is distinct from 'RESERVED_NAME'
     or pg_temp.s32_err($q$select jc_admin_module_label_set('events', 'Fun', 'القطط', null, null)$q$) is distinct from 'RESERVED_NAME' then
    raise exception 'FAIL CF06b Cats not reserved'; end if;
  if pg_temp.s32_err($q$select jc_admin_module_label_set('pets', 'Strays', 'حيوانات', null, null)$q$) is distinct from 'NAME_TAKEN' then
    raise exception 'FAIL CF06c name taken across Cats / Pets'; end if;
  v := jc_admin_module_label_set('cats', null, null, null, null);
  if v ? 'cats' then raise exception 'FAIL CF06d reset: %', v; end if;
  k := k + 4;

  -- ---------- CF07 page hits for the Cats page ----------
  perform jc_hit('testville32', 'cats');
  if pg_temp.s32_err($q$select jc_hit('testville32', 'cat')$q$) is distinct from 'BAD_PAGE' then raise exception 'FAIL CF07b'; end if;
  execute 'reset role';
  if (select count from jc_hits where community_id = 'testville32' and page = 'cats') is distinct from 1 then
    raise exception 'FAIL CF07a hit not counted'; end if;
  execute 'set local role authenticated';
  k := k + 2;

  -- ---------- CF08 removing a volunteer ends the role; removing again = NOT_FOUND ----------
  perform pg_temp.s32_as(c1);
  v := jc_module_admin_revoke('cats_vol', vo, null);
  if jsonb_array_length(v -> 'admins') <> 0 then raise exception 'FAIL CF08a: %', v; end if;
  if pg_temp.s32_err(format('select jc_module_admin_revoke(%L, %L, null)', 'cats_vol', vo)) is distinct from 'NOT_FOUND' then
    raise exception 'FAIL CF08b'; end if;
  perform pg_temp.s32_as(vo);
  if jc_me_get() -> 'admin_scopes' <> '[]'::jsonb then raise exception 'FAIL CF08c still a volunteer'; end if;
  execute 'reset role';
  if jc_admin_has('cats_vol') then raise exception 'FAIL CF08d still passes the gate'; end if;
  execute 'set local role authenticated';
  k := k + 4;

  -- ---------- CF09 the hourly snapshot counts coordinators, not volunteers ----------
  perform pg_temp.s32_as(c1); tok := jc_module_admin_link_create('cats_vol') ->> 'token';
  perform pg_temp.s32_as(r2); perform jc_module_admin_accept(tok);
  execute 'reset role';
  perform jc_snapshot_run(now());
  -- c1 (code) + co (coordinator); r2 (volunteer) left out
  select (metrics ->> 'admins')::int into n from jc_snapshots
   where community_id = 'testville32' and module = 'accounts' and bucket = date_trunc('hour', now());
  if n is distinct from 2 then raise exception 'FAIL CF09 admins = %', n; end if;
  k := k + 1;

  -- ---------- CF10 structural: both scope CHECKs list the same scopes, and every module key is in them ----------
  if pg_get_constraintdef((select oid from pg_constraint where conname = 'jc_module_admins_scope_check'))
     is distinct from pg_get_constraintdef((select oid from pg_constraint where conname = 'jc_module_admin_links_scope_check')) then
    raise exception 'FAIL CF10a scope CHECKs differ'; end if;
  foreach s in array array['events', 'bookings', 'pets', 'cats'] loop
    if pg_get_constraintdef((select oid from pg_constraint where conname = 'jc_module_admins_scope_check')) !~ ('''' || s || '''') then
      raise exception 'FAIL CF10b % missing from scopes', s; end if;
  end loop;
  k := k + 2;

  perform set_config('jc_test.checks', (coalesce(nullif(current_setting('jc_test.checks', true), ''), '0')::int + k)::text, true);
  raise notice 's32_cats_foundation: % checks passed', k;
end
$t$;
