-- TARGET PROJECT: JubailCommons (qrpxfssdeeuzmsmlbtbu) — NEVER SignalPost.
-- CC-7a Cats reports queue (docs/plans/CC-community-cats.md "CC-7 plan"; Zee approved + pre-authorised apply + merge
-- for all of CC-7, 2026-11-20). Replaced functions start from the live bodies (pg_get_functiondef, 2026-11-20) + lines
-- marked "CC-7a".
--
-- 1. Stray reports move to Community Cats: residents report a stray CAT (D1: species must be 'cat'); the report,
--    its photo and My reports need the Cats module on (D2: the form lives on the Cats page), not Pets.
-- 2. The queue: Cats coordinators + community admins (jc_assert_admin('cats')) — never volunteers (cats_vol): a
--    report carries the reporter's home and WhatsApp number. jc_cat_reports_list(show) / jc_cat_report_close(id,
--    outcome, cat) with outcomes added (a new cat) · known (a register cat) · not_stray.
-- 3. Closing as added / known links the cat (jc_stray_reports.cat_id) and writes ONE sighting of it, as the
--    coordinator who closed it: the report's time and pin (else the cat's usual area; neither → no sighting), no note.
--    Nothing the resident typed is copied — neither the note nor the place text (security review M1: sightings are
--    kept forever and read by volunteers, who never see reports; reports are purged 30 days after close). Only "added" moves the report's photo to the cat (D3; cap 4, only while the
--    reporter is still a member); otherwise the photo is retired, as before.
-- 4. Transition (until CC-7d): Organizer Tools' Reported strays (jc_admin_stray_reports_list / _close, Pets admins)
--    keeps working on the same rows; whoever closes first wins (the other gets ALREADY_CLOSED). Its photo read branch
--    stays for Pets admins while Pets is on; CC-7d removes it. Accepted for the transition (db review M2): a Pets admin
--    closing a report there as added / known links a Pets stray, not a cat (e2e only; the screen goes in CC-7c).
--    Older non-cat reports (any left open) never reach the Cats queue and can't be closed there; they expire after
--    60 days as before (db review M1 / security L3; none open live on 2026-11-20).
-- 5. The report JSON gains 'cat' {id, name} (a merged cat shows the cat it was merged into).
-- +2 authenticated fns: jc_cat_reports_list, jc_cat_report_close. Replaced (signatures unchanged): jc_stray_report_add,
--   jc_stray_reports_mine, jc_stray_report_json, jc_stray_report_photo_begin, jc_stray_report_photo_commit,
--   jc_private.pet_photo_can_read, jc_private.pet_photo_can_write.
-- Rollback (pre-launch, test data only): re-create the replaced functions from 20261116100000 / 20261116140000 (stray
--   reports + photos) and 20261118180000_cc3_cat_register (photo policies); drop function jc_cat_report_close(uuid,
--   text, uuid), jc_cat_reports_list(text); alter table jc_stray_reports drop column cat_id; revert the tests.
--   Sightings written by closes stay (they are ordinary sightings).

-- ---------- 1. schema ----------
alter table public.jc_stray_reports add column cat_id uuid;
alter table public.jc_stray_reports add constraint jc_stray_reports_cat_fk
  foreign key (cat_id, community_id) references public.jc_cats(id, community_id) on delete set null (cat_id);
alter table public.jc_stray_reports add constraint jc_stray_reports_cat
  check (cat_id is null or state in ('added', 'known'));
alter table public.jc_stray_reports add constraint jc_stray_reports_one_animal
  check (cat_id is null or pet_id is null);
create index jc_stray_reports_cat_idx on public.jc_stray_reports (cat_id) where cat_id is not null;

-- ---------- 2. the report JSON (+ 'cat') ----------
create or replace function public.jc_stray_report_json(r jc_stray_reports, p_admin boolean)
 returns jsonb
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select jsonb_build_object(
    'id', r.id, 'species', r.species, 'note', r.note, 'lat', r.lat, 'lng', r.lng, 'place', r.place,
    'state', r.state, 'created_at', r.created_at, 'closed_at', r.closed_at,
    -- PHOTOS: hidden once the reporter left (like the number — security 1b M2)
    'photo_path', case when r.reporter is not null
                        and exists (select 1 from jc_accounts a where a.user_id = r.reporter and a.community_id = r.community_id)
                       then r.photo_path end,
    'pet', (select jsonb_build_object('id', p.id, 'name', p.name) from jc_pets p
             where p.id = r.pet_id and p.status = 'active'),
    -- CC-7a: the cat it became / was known as (a merged cat → the cat it was merged into)
    'cat', (select jsonb_build_object('id', k2.id, 'name', k2.name)
              from jc_cats k join jc_cats k2 on k2.id = coalesce(k.merged_into, k.id)
             where k.id = r.cat_id))
  || case when p_admin then jsonb_build_object(
       -- a reporter who left: the number is hidden at once, not only after the nightly clear (security M1)
       'contact', case when r.reporter is not null
                        and exists (select 1 from jc_accounts a where a.user_id = r.reporter and a.community_id = r.community_id)
                       then r.contact end,
       'reporter_home', (select jsonb_build_object('village', h.village_key, 'type', h.home_type,
                                                   'building', h.building, 'number', h.number_raw)
                           from jc_home_members m join jc_homes h on h.id = m.home_id
                          where m.user_id = r.reporter and m.community_id = r.community_id),
       'reporter_left', r.reporter is null
                        or not exists (select 1 from jc_accounts a
                                        where a.user_id = r.reporter and a.community_id = r.community_id))
     else jsonb_build_object('has_contact', r.contact is not null) end;
$function$;

-- ---------- 3. resident side: cat only, gated on Cats ----------
create or replace function public.jc_stray_report_add(p_id uuid, p_fields jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_user uuid; v_comm text; v_home uuid; r public.jc_stray_reports%rowtype; v_contact text;
begin
  select o_user, o_community, o_home into v_user, v_comm, v_home from jc_me();
  perform jc_module_on(v_comm, 'cats');                                         -- CC-7a: was 'pets'
  if p_id is null or jsonb_typeof(p_fields) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(p_fields) k
                 where k not in ('species', 'note', 'lat', 'lng', 'place', 'contact'))
     or (p_fields ? 'species' and p_fields -> 'species' is distinct from '"cat"'::jsonb)   -- CC-7a (D1): cats only
     or (p_fields ? 'note' and jsonb_typeof(p_fields -> 'note') not in ('string', 'null'))
     or (p_fields ? 'place' and jsonb_typeof(p_fields -> 'place') not in ('string', 'null'))
     or (p_fields ? 'contact' and jsonb_typeof(p_fields -> 'contact') not in ('string', 'null'))
     or (p_fields ? 'lat') <> (p_fields ? 'lng')
     or (p_fields ? 'lat' and (jsonb_typeof(p_fields -> 'lat') not in ('number', 'null')
                               or jsonb_typeof(p_fields -> 'lat') <> jsonb_typeof(p_fields -> 'lng')))
     or char_length(p_fields ->> 'note') > 400 or char_length(p_fields ->> 'place') > 400
     or char_length(p_fields ->> 'contact') > 40 then
    raise exception 'BAD_FIELDS';
  end if;
  -- serialize this reporter's calls: the idempotency check and the caps can't be raced (a doubled tap waits here)
  perform pg_advisory_xact_lock(hashtext('jc_stray_report:' || v_user::text));
  -- then the community (always this order): the 50 / day cap is exact (db review M1)
  perform pg_advisory_xact_lock(hashtext('jc_stray_report_comm:' || v_comm));
  select * into r from jc_stray_reports where id = p_id;
  if found then
    if r.reporter is distinct from v_user or r.community_id <> v_comm then raise exception 'BAD_FIELDS'; end if;
    return jc_stray_report_json(r, false);                       -- the same report again: no second row
  end if;
  -- 5 a day per account AND per home (several accounts of one home share it); 10 open per account (security M2)
  if (select count(*) from jc_stray_reports where reporter = v_user and created_at > now() - interval '1 day') >= 5
     or (v_home is not null and (select count(*) from jc_stray_reports sr join jc_home_members m on m.user_id = sr.reporter
                                  where m.home_id = v_home and sr.created_at > now() - interval '1 day') >= 5)
     or (select count(*) from jc_stray_reports where reporter = v_user and state = 'open') >= 10 then
    raise exception 'TOO_MANY_REPORTS';
  end if;
  if (select count(*) from jc_stray_reports where community_id = v_comm and created_at > now() - interval '1 day') >= 100 then
    raise exception 'RATE_LIMITED';
  end if;
  v_contact := nullif(regexp_replace(coalesce(p_fields ->> 'contact', ''), '[\s().-]', '', 'g'), '');
  begin
    insert into jc_stray_reports (id, community_id, reporter, species, note, lat, lng, place, contact)
    values (p_id, v_comm, v_user, 'cat',                                        -- CC-7a: always a cat
            nullif(left(jc_clean_text(p_fields ->> 'note'), 280), ''),
            (p_fields ->> 'lat')::double precision, (p_fields ->> 'lng')::double precision,
            jc_clean_line(p_fields ->> 'place'), v_contact)
    returning * into r;
  exception when check_violation or not_null_violation or numeric_value_out_of_range or unique_violation then   -- db L3
    raise exception 'BAD_FIELDS';
  end;
  return jc_stray_report_json(r, false);
end;
$function$;

create or replace function public.jc_stray_reports_mine()
 returns jsonb
 language plpgsql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_user uuid; v_comm text; v_home uuid;
begin
  select o_user, o_community, o_home into v_user, v_comm, v_home from jc_me();
  perform jc_module_on(v_comm, 'cats');                                         -- CC-7a: was 'pets'
  return coalesce((select jsonb_agg(jc_stray_report_json(r, false) order by r.created_at desc, r.id desc)
                     from jc_stray_reports r where r.reporter = v_user and r.community_id = v_comm), '[]'::jsonb);
end;
$function$;

create or replace function public.jc_stray_report_photo_begin(p_id uuid, p_ext text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_user uuid; v_comm text; v_home uuid; r public.jc_stray_reports%rowtype; v_path text;
begin
  select o_user, o_community, o_home into v_user, v_comm, v_home from jc_me();
  perform jc_module_on(v_comm, 'cats');                                         -- CC-7a: was 'pets'
  if coalesce(p_ext, '') not in ('jpg', 'png', 'webp') then raise exception 'BAD_FIELDS'; end if;
  select * into r from jc_stray_reports
   where id = p_id and reporter = v_user and community_id = v_comm and state = 'open' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  -- the same per-account cap as every pet photo (one ledger)
  if (select count(*) from jc_pet_photos where created_by = v_user and created_at > now() - interval '1 day') >= 20 then
    raise exception 'TOO_MANY_UPLOADS';
  end if;
  update jc_pet_photos set state = 'retired', retired_at = now() where report_id = r.id and state = 'pending';
  v_path := v_comm || '/r/' || r.id || '/' || encode(extensions.gen_random_bytes(12), 'hex') || '.' || p_ext;
  insert into jc_pet_photos (path, community_id, report_id, created_by) values (v_path, v_comm, r.id, v_user);
  update jc_stray_reports set pending_photo_path = v_path, pending_photo_by = v_user, pending_photo_at = now()
   where id = r.id;
  return jsonb_build_object('bucket', 'pet-photos', 'path', v_path, 'expires_in_seconds', 900);
end;
$function$;

create or replace function public.jc_stray_report_photo_commit(p_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_user uuid; v_comm text; v_home uuid; r public.jc_stray_reports%rowtype;
begin
  select o_user, o_community, o_home into v_user, v_comm, v_home from jc_me();
  perform jc_module_on(v_comm, 'cats');                                         -- CC-7a: was 'pets'
  select * into r from jc_stray_reports
   where id = p_id and reporter = v_user and community_id = v_comm and state = 'open' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if r.pending_photo_path is null or r.pending_photo_by is distinct from v_user then raise exception 'NO_PENDING_PHOTO'; end if;
  if r.pending_photo_at <= now() - interval '15 minutes' then raise exception 'PHOTO_EXPIRED'; end if;
  if not exists (select 1 from storage.objects o
                  where o.bucket_id = 'pet-photos' and o.name = r.pending_photo_path
                    and (o.metadata ->> 'size') is not null
                    and o.metadata ->> 'mimetype' in ('image/jpeg', 'image/png', 'image/webp')) then
    raise exception 'PHOTO_MISSING';
  end if;
  update jc_pet_photos set state = 'retired', retired_at = now() where report_id = r.id and state = 'current';
  update jc_pet_photos set state = 'current' where path = r.pending_photo_path;
  update jc_stray_reports
     set photo_path = pending_photo_path, pending_photo_path = null, pending_photo_by = null, pending_photo_at = null
   where id = r.id
  returning * into r;
  return jc_stray_report_json(r, false);
end;
$function$;

-- ---------- 4. the Cats queue ----------
create or replace function public.jc_cat_reports_list(p_show text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_comm text;
begin
  v_comm := jc_assert_admin('cats');                       -- coordinators + community admins; never volunteers
  perform jc_module_on(v_comm, 'cats');
  if coalesce(p_show, '') not in ('open', 'closed') then raise exception 'BAD_FIELDS'; end if;
  if p_show = 'open' then
    return coalesce((select jsonb_agg(jc_stray_report_json(r, true) order by r.created_at, r.id)
                       from jc_stray_reports r where r.community_id = v_comm and r.state = 'open'
                        and r.species = 'cat'), '[]'::jsonb);          -- db review M1
  end if;
  -- the newest 200 closed; open is bounded by the caps + 60-day expiry
  return coalesce((select jsonb_agg(jc_stray_report_json(c, true) order by c.closed_at desc, c.id desc)
                     from (select * from jc_stray_reports r where r.community_id = v_comm and r.state <> 'open' and r.species = 'cat'
                            order by r.closed_at desc, r.id desc limit 200) c), '[]'::jsonb);
end;
$function$;

create or replace function public.jc_cat_report_close(p_id uuid, p_outcome text, p_cat uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare v_comm text; r public.jc_stray_reports%rowtype; k public.jc_cats%rowtype; v_moved boolean := false;
        v_lat double precision; v_lng double precision; v_area uuid; v_sight uuid;
begin
  v_comm := jc_assert_admin('cats');
  perform jc_module_on(v_comm, 'cats');
  if coalesce(p_outcome, '') not in ('added', 'known', 'not_stray')
     or (p_outcome = 'not_stray') <> (p_cat is null) then
    raise exception 'BAD_FIELDS';
  end if;
  select * into r from jc_stray_reports where id = p_id and community_id = v_comm and species = 'cat' for update;   -- db M1
  if not found then raise exception 'NOT_FOUND'; end if;
  if r.state <> 'open' then
    -- a retry, also with the cat it was merged into since (the JSON shows the survivor — db review L1)
    if r.state = p_outcome and (r.cat_id is not distinct from p_cat
                                or p_cat = (select k0.merged_into from jc_cats k0 where k0.id = r.cat_id)) then
      return jc_stray_report_json(r, true);                    -- a retry: nothing moves, no second sighting
    end if;
    raise exception 'ALREADY_CLOSED';
  end if;
  if p_cat is not null then
    -- the cat locked: the 4-photo cap below can't be raced by a concurrent photo commit / merge
    select * into k from jc_cats where id = p_cat and community_id = v_comm for update;
    if not found then raise exception 'NOT_FOUND'; end if;
    if k.merged_into is not null then raise exception 'MERGED'; end if;
  end if;
  -- D3: only "added" moves the photo, only while the reporter is still a member (security 1b M2), only under the cap
  if p_outcome = 'added' and r.photo_path is not null
     and exists (select 1 from jc_accounts a where a.user_id = r.reporter and a.community_id = r.community_id)
     and (select count(*) from jc_pet_photos where cat_id = k.id and state = 'current') < 4 then
    update jc_pet_photos set cat_id = k.id, report_id = null
     where path = r.photo_path and report_id = r.id and state = 'current';
    v_moved := found;
  end if;
  update jc_pet_photos set state = 'retired', retired_at = now()
   where report_id = r.id and state in ('current', 'pending');
  -- one sighting of the cat: the report's pin, else the cat's usual area (neither → none); nothing the resident typed
  if p_cat is not null then
    v_lat := r.lat; v_lng := r.lng;
    if v_lat is null then
      select a.id into v_area from jc_cat_areas a where a.id = k.area_id and a.community_id = v_comm and a.archived_at is null;
    end if;
    if v_lat is not null or v_area is not null then
      insert into jc_cat_sightings (community_id, cat_id, seen_at, area_id, lat, lng, note, logged_by, logged_name)
      values (v_comm, k.id, r.created_at, v_area, v_lat, v_lng, null, auth.uid(),
              left((select display_name from jc_accounts where user_id = auth.uid()), 80))
      returning id into v_sight;
    end if;
  end if;
  update jc_stray_reports
     set state = p_outcome, cat_id = p_cat, closed_at = now(), closed_by = auth.uid(), contact = null,
         photo_path = null, pending_photo_path = null, pending_photo_by = null, pending_photo_at = null
   where id = r.id
  returning * into r;
  -- never the contact number or the note: the outcome only
  perform jc_admin_log_add(v_comm, 'cat_report_close', jsonb_build_object(
    'report_id', r.id, 'outcome', p_outcome, 'cat_id', p_cat, 'photo_moved', v_moved, 'sighting_id', v_sight));
  return jc_stray_report_json(r, true);
end;
$function$;

revoke all on function public.jc_cat_reports_list(text) from public, anon;
revoke all on function public.jc_cat_report_close(uuid, text, uuid) from public, anon;
grant execute on function public.jc_cat_reports_list(text) to authenticated;
grant execute on function public.jc_cat_report_close(uuid, text, uuid) to authenticated;

-- ---------- 5. photo policies: report photos follow the Cats module ----------
create or replace function jc_private.pet_photo_can_read(p_name text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1 from public.jc_pets p
      join public.jc_accounts a on a.user_id = auth.uid() and a.community_id = p.community_id
      join public.jc_communities c on c.id = p.community_id
     where p.status = 'active'
       and coalesce((c.modules -> 'pets' ->> 'enabled')::boolean, false)
       and (p.photo_path = p_name
            or (p.pending_photo_path = p_name and p.pending_photo_by = auth.uid())))
  -- PHOTOS: a report's photo — its reporter or this community's queue holders; a pending one — its uploader
  -- CC-7a: the reporter + Cats coordinators / community admins while Cats is on; Pets admins only while Pets is on
  -- (Organizer Tools' Reported strays, until CC-7d)
  or exists (
    select 1 from public.jc_stray_reports r
      join public.jc_accounts a on a.user_id = auth.uid() and a.community_id = r.community_id
      join public.jc_communities c on c.id = r.community_id
     where (coalesce((c.modules -> 'cats' ->> 'enabled')::boolean, false)
            or coalesce((c.modules -> 'pets' ->> 'enabled')::boolean, false))
       -- organizers: only while the reporter is still a member (security 1b M2). Community isolation of the admin
       -- branch rests on the join above: jc_accounts.user_id is the PK (one community per account) and grants are
       -- tied to that account — jc_admin_has has no community check of its own (security 1b L1).
       and ((r.photo_path = p_name
             and ((r.reporter = auth.uid() and coalesce((c.modules -> 'cats' ->> 'enabled')::boolean, false))
                  or (((public.jc_admin_has('cats') and coalesce((c.modules -> 'cats' ->> 'enabled')::boolean, false))
                       or (public.jc_admin_has('pets') and coalesce((c.modules -> 'pets' ->> 'enabled')::boolean, false)))
                      and exists (select 1 from public.jc_accounts ra
                                   where ra.user_id = r.reporter and ra.community_id = r.community_id))))
            or (r.pending_photo_path = p_name and r.pending_photo_by = auth.uid()
                and coalesce((c.modules -> 'cats' ->> 'enabled')::boolean, false))))
  -- CC-3: a cat's current photo — any member of its community while Cats is on (photos are in the resident view);
  -- a pending one — its uploader only
  or exists (
    select 1 from public.jc_pet_photos ph
      join public.jc_cats k on k.id = ph.cat_id
      join public.jc_accounts a on a.user_id = auth.uid() and a.community_id = k.community_id
      join public.jc_communities c on c.id = k.community_id
     where ph.path = p_name
       and coalesce((c.modules -> 'cats' ->> 'enabled')::boolean, false)
       and (ph.state = 'current' or (ph.state = 'pending' and ph.created_by = auth.uid())));
$function$;

create or replace function jc_private.pet_photo_can_write(p_name text)
 returns boolean
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1 from public.jc_pets p
      join public.jc_communities c on c.id = p.community_id
     where p.pending_photo_path = p_name and p.pending_photo_by = auth.uid()
       and p.pending_photo_at > now() - interval '15 minutes' and p.status = 'active'
       and coalesce((c.modules -> 'pets' ->> 'enabled')::boolean, false)
       and ((p.kind = 'owned' and exists (select 1 from public.jc_home_members m
                                           where m.user_id = auth.uid() and m.home_id = p.home_id))
            or (p.kind = 'stray' and public.jc_admin_has('pets'))))
  -- PHOTOS: the reporter's own pending upload on their own open report (CC-7a: while Cats is on)
  or exists (
    select 1 from public.jc_stray_reports r
      join public.jc_communities c on c.id = r.community_id
     where r.pending_photo_path = p_name and r.pending_photo_by = auth.uid() and r.reporter = auth.uid()
       and r.pending_photo_at > now() - interval '15 minutes' and r.state = 'open'
       and coalesce((c.modules -> 'cats' ->> 'enabled')::boolean, false))
  -- CC-3: a cat photo — the coordinator who began it, within 15 minutes, on a cat of their own community, Cats on
  or exists (
    select 1 from public.jc_pet_photos ph
      join public.jc_cats k on k.id = ph.cat_id
      join public.jc_accounts a on a.user_id = auth.uid() and a.community_id = k.community_id
      join public.jc_communities c on c.id = k.community_id
     where ph.path = p_name and ph.state = 'pending' and ph.created_by = auth.uid()
       and ph.created_at > now() - interval '15 minutes' and k.merged_into is null
       and coalesce((c.modules -> 'cats' ->> 'enabled')::boolean, false)
       and public.jc_admin_has('cats'));
$function$;
