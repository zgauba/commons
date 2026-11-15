-- TARGET PROJECT: JubailCommons (qrpxfssdeeuzmsmlbtbu) — NEVER SignalPost.
-- Pets care v2, PR 1 (plan docs/plans/pets-care-v2.md, Zee 2026-11-15):
--
--   jc_pet_care_log.state      new: the care state a 'state' row records (auto-logged), shown in each reader's language.
--                              note may be null for fed / vet, or for kind 'state' carrying a state.
--   jc_admin_stray_save        an EXISTING stray whose care_state actually changes → one 'state' row (state = new value,
--                              note null). Any organizer changing the same animal again within 10 minutes updates
--                              that row instead (a mis-tap never leaves two public lines; two accounts can't flood the
--                              public log — security review M1). No row when a stray is added. Not rate-limited: bounded
--                              by real changes + the merge. jc_admin_log keeps every save with its actor.
--                              A → B → A within 10 minutes leaves one "A" row (true; accepted, db review L1).
--   jc_admin_pet_care_add      RATE_LIMITED past 60/h per account (jc_rate bucket 'pet_care_add') and 200/h per
--                              community (pet_care_add rows in jc_admin_log). Counts successes only (a raise rolls the
--                              counter back). Security review L1 of 20261115100000.
--   jc_admin_pets_list         + last_fed_at (newest fed row) and last_contact_at (newest of a visible sighting or a
--                              fed / vet row). Named apart from jc_pet_card's last_seen_at, which keeps its meaning.
--   jc_pet_get                 care_log rows + state.
--
-- Signatures unchanged: grants carry over. Bodies = the live bodies (pg_get_functiondef, 2026-11-15) + marked lines.
--
-- Rollback, in this order (bodies first, so nothing writes new state rows or bucket rows meanwhile — db review M):
--   1. restore the four bodies: jc_admin_stray_save (20261110090000_r5a_pets), jc_admin_pet_care_add
--      (20261115100000_pets_quick_log), jc_admin_pets_list (20261104000000_s4_pets), jc_pet_get
--      (20261113100000_r5b2b0_pets_visibility)
--   2. delete from jc_pet_care_log where kind = 'state' and note is null;   -- loses the auto-logged history; or instead
--      update them: set note = <the state's English label>
--   3. drop constraint jc_pet_care_log_note_check; re-add the 20261115100000 one:
--        check (case when note is null then kind in ('fed', 'vet') else char_length(note) between 1 and 280 end)
--   4. alter table jc_pet_care_log drop column state;   (drops jc_pet_care_log_state_check / _state_kind with it)
--   5. delete from jc_rate where bucket = 'pet_care_add'; drop jc_rate_bucket_check; re-add it as
--        check (bucket in ('join', 'admin_unlock', 'feedback', 'pet_archive', 'sighting_hide'))

-- ---------- the log row records a state ----------
alter table public.jc_pet_care_log add column state text
  constraint jc_pet_care_log_state_check check (state in ('known_fine', 'under_care', 'needs_help', 'rehomed'));
alter table public.jc_pet_care_log add constraint jc_pet_care_log_state_kind check (state is null or kind = 'state');
alter table public.jc_pet_care_log drop constraint if exists jc_pet_care_log_note_check;
alter table public.jc_pet_care_log add constraint jc_pet_care_log_note_check
  check (case when note is null then kind in ('fed', 'vet') or (kind = 'state' and state is not null)
              else char_length(note) between 1 and 280 end);

-- ---------- a new rate bucket ----------
alter table public.jc_rate drop constraint if exists jc_rate_bucket_check;
alter table public.jc_rate add constraint jc_rate_bucket_check
  check (bucket = any (array['join', 'admin_unlock', 'feedback', 'pet_archive', 'sighting_hide', 'pet_care_add']));

-- ---------- auto-log a care_state change ----------
create or replace function public.jc_admin_stray_save(p_pet uuid, p_fields jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_comm text; v_id uuid := p_pet; p public.jc_pets%rowtype;
        v_new text; v_last record;                                                                    -- CARE V2
begin
  v_comm := jc_assert_admin('pets');
  if jsonb_typeof(p_fields) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(p_fields) k
                 where k not in ('species', 'name', 'description', 'care_state',
                                 'territory', 'territory_lat', 'territory_lng'))                  -- R5a
     or (p_fields ? 'species' and jsonb_typeof(p_fields -> 'species') <> 'string')
     or (p_fields ? 'care_state' and jsonb_typeof(p_fields -> 'care_state') <> 'string')
     or (p_fields ? 'name' and (jsonb_typeof(p_fields -> 'name') <> 'string' or jc_clean_line(p_fields ->> 'name') is null))
     or char_length(p_fields ->> 'description') > 400
     -- R5a: territory = a string (cleaned, 1–120) or null to clear; the spot comes as a pair of numbers or nulls
     or (p_fields ? 'territory' and jsonb_typeof(p_fields -> 'territory') not in ('string', 'null'))
     or (p_fields ? 'territory' and jsonb_typeof(p_fields -> 'territory') = 'string'
         and (char_length(p_fields ->> 'territory') > 400 or jc_clean_line(p_fields ->> 'territory') is null
              or char_length(jc_clean_line(p_fields ->> 'territory')) > 120))
     or (p_fields ? 'territory_lat') <> (p_fields ? 'territory_lng')
     or (p_fields ? 'territory_lat' and (jsonb_typeof(p_fields -> 'territory_lat') not in ('number', 'null')
                                         or jsonb_typeof(p_fields -> 'territory_lng') not in ('number', 'null')
                                         or jsonb_typeof(p_fields -> 'territory_lat') <> jsonb_typeof(p_fields -> 'territory_lng'))) then
    raise exception 'BAD_FIELDS';
  end if;
  begin
    if v_id is null then
      if not p_fields ? 'name' or not p_fields ? 'species' then raise exception 'BAD_FIELDS'; end if;
      insert into jc_pets (community_id, kind, species, name, care_state, created_by, updated_by)
      values (v_comm, 'stray', p_fields ->> 'species', jc_clean_line(p_fields ->> 'name'),
              coalesce(p_fields ->> 'care_state', 'under_care'), auth.uid(), auth.uid())
      returning id into v_id;
    else
      p := jc_pet_manage(v_id);                                  -- locks the row: concurrent saves queue here
      if p.kind <> 'stray' then raise exception 'NOT_FOUND'; end if;
    end if;
    update jc_pets set
      species     = coalesce(p_fields ->> 'species', species),
      name        = coalesce(jc_clean_line(p_fields ->> 'name'), name),
      description = case when p_fields ? 'description' then jc_clean_text(p_fields ->> 'description') else description end,
      care_state  = coalesce(p_fields ->> 'care_state', care_state),
      territory   = case when p_fields ? 'territory' then jc_clean_line(p_fields ->> 'territory') else territory end,      -- R5a
      territory_lat = case when p_fields ? 'territory_lat' then (p_fields ->> 'territory_lat')::double precision else territory_lat end,
      territory_lng = case when p_fields ? 'territory_lng' then (p_fields ->> 'territory_lng')::double precision else territory_lng end,
      updated_at = now(), updated_by = auth.uid()
     where id = v_id
     returning care_state into v_new;                                                                 -- CARE V2
  -- R5a: + numeric_value_out_of_range (e.g. a territory_lat of 1e400 — db review L1)
  exception when check_violation or not_null_violation or numeric_value_out_of_range then raise exception 'BAD_FIELDS';
  end;
  -- CARE V2: an existing stray whose state actually changed → one public 'state' row; an auto row < 10 min old → update it
  if p.id is not null and v_new is distinct from p.care_state then
    select id, kind, state, created_at into v_last
      from jc_pet_care_log where pet_id = v_id order by created_at desc, id desc limit 1;
    if v_last.id is not null and v_last.kind = 'state' and v_last.state is not null
       and v_last.created_at > now() - interval '10 minutes' then                           -- any author (security M1)
      update jc_pet_care_log set state = v_new, author = auth.uid(), created_at = now() where id = v_last.id;
    else
      insert into jc_pet_care_log (community_id, pet_id, author, kind, state)
      values (v_comm, v_id, auth.uid(), 'state', v_new);
    end if;
  end if;
  perform jc_admin_log_add(v_comm, 'stray_save', jsonb_build_object(
    'pet_id', v_id, 'fields', (select jsonb_agg(k) from jsonb_object_keys(p_fields) k)));
  return jc_pet_card(v_id, null);
end;
$$;

-- ---------- rate limit on log adds ----------
create or replace function public.jc_admin_pet_care_add(p_pet uuid, p_kind text, p_note text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_comm text; v_note text;
begin
  v_comm := jc_assert_admin('pets');
  if char_length(p_note) > 400 then raise exception 'BAD_FIELDS'; end if;
  v_note := left(jc_clean_text(p_note), 280);
  if coalesce(p_kind, '') not in ('fed', 'vet', 'note', 'state') then raise exception 'BAD_FIELDS'; end if;   -- QUICK LOG
  if v_note is null and p_kind not in ('fed', 'vet') then raise exception 'BAD_FIELDS'; end if;                 -- QUICK LOG
  if (select count(*) from jc_admin_log where community_id = v_comm and action = 'pet_care_add'               -- CARE V2
       and at > now() - interval '1 hour') >= 200 then raise exception 'RATE_LIMITED'; end if;
  perform jc_rate_take(auth.uid(), 'pet_care_add', 60, interval '1 hour');                                     -- CARE V2
  if not exists (select 1 from jc_pets where id = p_pet and community_id = v_comm and kind = 'stray' and status = 'active') then
    raise exception 'NOT_FOUND';
  end if;
  insert into jc_pet_care_log (community_id, pet_id, author, kind, note)
  values (v_comm, p_pet, auth.uid(), p_kind, v_note);
  perform jc_admin_log_add(v_comm, 'pet_care_add', jsonb_build_object('pet_id', p_pet, 'kind', p_kind));
  return jsonb_build_object('pet_id', p_pet, 'logged', true);
end;
$$;

-- ---------- last fed / last contact on the organizer list ----------
create or replace function public.jc_admin_pets_list() returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_comm text;
begin
  v_comm := jc_assert_admin('pets');
  return coalesce((
    select jsonb_agg(jc_pet_card(p.id, null) || jsonb_build_object(
             'status', p.status, 'created_at', p.created_at, 'updated_at', p.updated_at,
             'sightings_7d', (select count(*) from jc_pet_sightings s
                               where s.pet_id = p.id and s.seen_at > now() - interval '7 days'),
             'last_fed_at', (select max(c.created_at) from jc_pet_care_log c                              -- CARE V2
                              where c.pet_id = p.id and c.kind = 'fed'),
             'last_contact_at', greatest(                                                                  -- CARE V2
               (select max(s.seen_at) from jc_pet_sightings s where s.pet_id = p.id and not s.hidden),
               (select max(c.created_at) from jc_pet_care_log c where c.pet_id = p.id and c.kind in ('fed', 'vet'))))
           order by p.status, p.missing desc, p.name, p.id)
      from jc_pets p where p.community_id = v_comm), '[]'::jsonb);
end;
$$;

-- ---------- the state reaches the readers ----------
create or replace function public.jc_pet_get(p_pet uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_user uuid; v_comm text; v_home uuid; p public.jc_pets%rowtype; v_since timestamptz;
begin
  select o_user, o_community, o_home into v_user, v_comm, v_home from jc_me();
  perform jc_module_on(v_comm, 'pets');
  select * into p from jc_pets where id = p_pet and community_id = v_comm and status = 'active';
  if p.id is null then raise exception 'NOT_FOUND'; end if;
  v_since := jc_pet_sight_from(p.id, v_home);                                                       -- R5b-2b-0
  return jc_pet_card(p.id, v_home) || jsonb_build_object(
    'sightings', case when v_since is not null then coalesce((
      select jsonb_agg(jsonb_build_object('id', s.id, 'note', s.note, 'lat', s.lat, 'lng', s.lng,
                                          'seen_at', s.seen_at, 'by_me', s.reporter = v_user)
                       order by s.seen_at desc)
        from (select * from jc_pet_sightings where pet_id = p.id and not hidden and seen_at >= v_since
               order by seen_at desc limit 30) s), '[]'::jsonb) end,
    'care_log', case when p.kind = 'stray' then coalesce((
      select jsonb_agg(jsonb_build_object('kind', c.kind, 'note', c.note, 'state', c.state, 'at', c.created_at)   -- CARE V2
                       order by c.created_at desc)
        from (select * from jc_pet_care_log where pet_id = p.id order by created_at desc limit 20) c), '[]'::jsonb) end);
end;
$$;
