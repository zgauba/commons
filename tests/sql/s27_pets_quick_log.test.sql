-- Pets quick log (20261115100000_pets_quick_log.sql). CC-7d (20261120140000_cc7d_strays_off.sql) dropped the quick-log
-- RPC jc_admin_pet_care_add with the rest of the Pets stray tools (QL01-QL03 + QL05 went with it); the care log table
-- stays (existing rows, retention), so its own rules are still pinned here.
-- Community testville27 is a throwaway fixture (rolled back); a community of its own (slice order).

do $t$
declare
  v_cat uuid; v_err text; k int := 0;
begin
  -- ---------- setup (as postgres): a stray row as CC-7d leaves them ----------
  insert into jc_communities (id, name_en, map_lat, map_lng, modules)
  values ('testville27', 'Testville 27', 25.0, 55.0, '{"pets": {"enabled": true}}');
  insert into jc_pets (community_id, kind, species, name, care_state) values ('testville27', 'stray', 'cat', 'S27 cat', 'known_fine')
    returning id into v_cat;

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

  perform set_config('jc_test.checks', (coalesce(nullif(current_setting('jc_test.checks', true), ''), '0')::int + k)::text, true);
  raise notice 's27_pets_quick_log: % checks passed', k;
end
$t$;
