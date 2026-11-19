-- TARGET PROJECT: JubailCommons (qrpxfssdeeuzmsmlbtbu) — NEVER SignalPost.
-- Pets admins mark / un-mark a resident's pet missing (ROADMAP "Pets admins mark / un-mark a pet missing"; Zee
-- 2026-11-19: the owner sees "Marked missing by the Pets team"). Reviews: docs/qa/pets-admin-missing-db-review-2026-11-19.md.
--
-- jc_pets.missing_by_team        true only while missing AND the Pets team (not the household) marked it.
--                                CHECK jc_pets_missing_by_team: never true unless missing. 0 rows need a backfill
--                                (default false; 1 pet missing live 2026-11-19, marked by its household).
-- jc_admin_pet_missing_set(...)  NEW. Pets / community admins (jc_assert_admin('pets')), owned + active pets of their
--                                own community only. Same fields as the owner's switch + missing_by_team = p_missing.
--                                Logged in jc_admin_log with the admin (actor). Returns the pet card as the admin sees it.
-- jc_pet_missing_set(...)        body replaced from live: every household write clears missing_by_team. Signature unchanged.
-- jc_pet_retire(...)             body replaced from live: archiving clears missing_by_team with missing (the CHECK).
-- jc_pet_card(...)               body replaced from live: + 'missing_by_team' for the owner's household only (null for
--                                everyone else). Additive key; signature unchanged.

alter table public.jc_pets add column missing_by_team boolean not null default false;
alter table public.jc_pets add constraint jc_pets_missing_by_team check (not missing_by_team or missing);

create or replace function public.jc_pet_missing_set(p_pet uuid, p_missing boolean, p_note text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_user uuid; v_comm text; v_home uuid; p public.jc_pets%rowtype;
begin
  select o_user, o_community, o_home into v_user, v_comm, v_home from jc_me();
  perform jc_module_on(v_comm, 'pets');
  if p_missing is null or char_length(p_note) > 400 then raise exception 'BAD_FIELDS'; end if;
  p := jc_pet_manage(p_pet);
  if p.kind <> 'owned' then raise exception 'NOT_FOUND'; end if;
  update jc_pets
     set missing = p_missing,
         missing_since = case when p_missing then coalesce(missing_since, now()) end,
         last_seen_note = case when p_missing then left(jc_clean_text(p_note), 200) else null end,
         missing_by_team = false,                                                            -- PETS ADMIN MISSING
         updated_at = now(), updated_by = v_user
   where id = p.id;
  perform jc_log(v_comm, null, null, 'pet_missing', jsonb_build_object('pet_id', p.id, 'missing', p_missing));
  return jc_pet_card(p.id, v_home);
end;
$function$;

create or replace function public.jc_admin_pet_missing_set(p_pet uuid, p_missing boolean, p_note text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_user uuid; v_comm text; v_home uuid; p public.jc_pets%rowtype;
begin
  select o_user, o_home into v_user, v_home from jc_me();
  v_comm := jc_assert_admin('pets');                      -- Pets admins and community admins; their community only
  perform jc_module_on(v_comm, 'pets');
  if p_missing is null or char_length(p_note) > 400 then raise exception 'BAD_FIELDS'; end if;
  -- a resident's pet only (strays have no missing switch); the same row lock as the household's switch
  select * into p from jc_pets where id = p_pet and community_id = v_comm and status = 'active' for no key update;
  if p.id is null or p.kind <> 'owned' then raise exception 'NOT_FOUND'; end if;
  update jc_pets
     set missing = p_missing,
         missing_since = case when p_missing then coalesce(missing_since, now()) end,
         last_seen_note = case when p_missing then left(jc_clean_text(p_note), 200) else null end,
         missing_by_team = p_missing,
         updated_at = now(), updated_by = v_user
   where id = p.id;
  perform jc_admin_log_add(v_comm, 'pet_missing', jsonb_build_object('pet_id', p.id, 'missing', p_missing));
  return jc_pet_card(p.id, v_home);
end;
$function$;
revoke all on function public.jc_admin_pet_missing_set(uuid, boolean, text) from public, anon;
grant execute on function public.jc_admin_pet_missing_set(uuid, boolean, text) to authenticated;

create or replace function public.jc_pet_retire(p_pet uuid, p_how text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_keep text;
begin
  if p_how not in ('organizer', 'household', 'vacated') then raise exception 'BAD_FIELDS'; end if;
  select photo_path into v_keep from jc_pets where id = p_pet and status = 'active' for no key update;
  if not found then return; end if;
  if p_how = 'vacated' then v_keep := null; end if;
  -- the kept photo stays 'current' (unreadable: the rule needs status = 'active'); everything else retires now
  update jc_pet_photos set state = 'retired', retired_at = now()
   where pet_id = p_pet and state <> 'retired' and path is distinct from v_keep;
  update jc_pets
     set status = 'archived', archived_at = now(), archived_how = p_how, archived_photo_path = v_keep,
         missing = false, missing_since = null, last_seen_note = null, missing_by_team = false,   -- PETS ADMIN MISSING
         photo_path = null, pending_photo_path = null, pending_photo_by = null, pending_photo_at = null,
         updated_at = now()
   where id = p_pet and status = 'active';
end;
$function$;

create or replace function public.jc_pet_card(p_pet uuid, p_viewer_home uuid)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
    'id', p.id, 'kind', p.kind, 'species', p.species, 'name', p.name,
    'description', p.description, 'wanderer', p.wanderer, 'microchipped', p.microchipped,
    'missing', p.missing, 'missing_since', p.missing_since, 'last_seen_note', p.last_seen_note,
    -- PETS ADMIN MISSING: only the pet's own household learns the Pets team marked it
    'missing_by_team', case when p.home_id is not null and p.home_id = p_viewer_home then p.missing_by_team end,
    'care_state', p.care_state, 'photo_path', p.photo_path,
    'mine', p.home_id is not null and p.home_id = p_viewer_home,
    'home', case when h.id is not null then
                   jsonb_build_object('village', h.village_key, 'type', h.home_type,
                                      'building', h.building, 'number', h.number_raw) end,
    'territory', p.territory,
    'territory_lat', p.territory_lat, 'territory_lng', p.territory_lng,
    'care', case when p.kind = 'stray' then p.care end,
    'last_seen', (select jsonb_build_object('lat', s.lat, 'lng', s.lng, 'at', s.seen_at)            -- R5b-2b-0
                    from jc_pet_sightings s
                   where s.pet_id = p.id and not s.hidden and s.lat is not null and s.seen_at >= vis.since
                   order by s.seen_at desc limit 1),
    'last_seen_at', (select max(s.seen_at) from jc_pet_sightings s                                  -- R5b-2b-0
                      where s.pet_id = p.id and not s.hidden and s.seen_at >= vis.since))
  from jc_pets p
  left join jc_homes h on h.id = p.home_id
  cross join lateral (select jc_pet_sight_from(p.id, p_viewer_home) as since) vis
  where p.id = p_pet;
$function$;
