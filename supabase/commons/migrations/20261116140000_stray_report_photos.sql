-- TARGET PROJECT: JubailCommons (qrpxfssdeeuzmsmlbtbu) — NEVER SignalPost.
-- Report a new stray, PR 1b: an optional photo on a report (plan docs/plans/report-a-stray.md; Zee Q2 2026-11-16).
-- Builds on 20261116100000_stray_reports (PR 1a, live). Replaced bodies start from the live bodies (pg_get_functiondef,
-- 2026-11-16) + lines marked "PHOTOS".
--
-- One ledger, one bucket, one purge: report photos live in the existing private bucket 'pet-photos' and the existing
-- ledger jc_pet_photos (the T4 sweep — jc_photo_purge_queue / _done — reads only the ledger, so it purges them unchanged).
--   jc_pet_photos            pet_id becomes nullable; + report_id → (jc_stray_reports.id, community_id), NO ACTION
--                            (never cascade: a cascade drops ledger rows before the sweep deletes the objects — db
--                            review 1a); exactly one of pet_id / report_id.
--   jc_stray_reports         + photo_path, pending_photo_path / _by / _at (same shape as jc_pets).
--   path                     <community>/r/<report id>/<random>.<ext>
--
-- Who sees a report photo (storage read rule, jc_private.pet_photo_can_read):
--   while it belongs to the report: the reporter + Pets / community admins OF THAT COMMUNITY (jc_admin_has has no
--   community check, so the reader's account must be in the report's community) — never other residents;
--   once an organizer moves it to a stray (Add / Already known, when the stray has no photo): like any stray photo.
-- Who writes: only the reporter, on their own OPEN report, within 15 minutes of begin (jc_private.pet_photo_can_write).
-- EXIF / GPS: stripped on the phone (assets/pet-photo.js re-encodes through a canvas — the accepted pattern for every
--   pet photo). Server-side stripping would need an Edge Function: not done (security review 1a, decided here).
--
-- RPCs (resident, own report): jc_stray_report_photo_begin(p_id, p_ext), jc_stray_report_photo_commit(p_id),
--   jc_stray_report_photo_remove(p_id) (withdraw; works with Pets off, like the number). One photo per report; the
--   upload cap is the existing 20 / day per account across all pet photos (TOO_MANY_UPLOADS).
-- jc_admin_stray_report_close  body: under the report's row lock, Add / Already known MOVES the photo to the stray
--                              when the stray has none (ledger row re-pointed, state current, jc_pets.photo_path set);
--                              otherwise — and for Not a stray — the photo is RETIRED at close (organizers are done
--                              with it; minimization). Pending uploads are retired too. The idempotent retry returns
--                              before any of this (never moves twice).
-- jc_stray_report_json         + photo_path (callers with false are the reporter's own: add / mine / contact_clear /
--                              the photo RPCs; s29 SR17 keeps the true callers to the two organizer RPCs).
-- jc_pets_retention            body (db review 1a M2): expiring a report retires its photos; a report is deleted only
--                              once every photo row of it is purged (its purged rows go first), so the FK can never
--                              abort the nightly job. The photo purge is therefore the gate for deleting a closed
--                              report (accepted, db 1b M2: a failing purge already alarms via the maintenance canary).
--                              + retires photos of reporters who left (sec 1b M2) and current photos of archived pets.
--
-- +3 authenticated fns. Replaced (signatures unchanged): jc_private.pet_photo_can_read / _can_write,
--   jc_stray_report_json, jc_admin_stray_report_close, jc_pets_retention.
-- Rollback (pre-launch), in this order: (1) restore the 5 bodies from 20261116100000_stray_reports /
--   20261104000000_s4_pets; (2) drop the 3 functions; (3) retire + let the sweep purge report photos, then
--   delete from jc_pet_photos where report_id is not null; (4) drop constraint jc_pet_photos_owner,
--   jc_pet_photos_report_fk; drop column report_id; alter pet_id set not null; (5) drop the 4 jc_stray_reports columns.

-- ---------- 1. schema ----------
alter table public.jc_stray_reports
  add column photo_path         text,
  add column pending_photo_path text,
  add column pending_photo_by   uuid references auth.users(id) on delete set null,
  add column pending_photo_at   timestamptz;

alter table public.jc_pet_photos alter column pet_id drop not null;
alter table public.jc_pet_photos add column report_id uuid;
alter table public.jc_pet_photos
  add constraint jc_pet_photos_owner check ((pet_id is null) <> (report_id is null)),
  add constraint jc_pet_photos_report_fk foreign key (report_id, community_id)
    references public.jc_stray_reports(id, community_id);
create index jc_pet_photos_report on public.jc_pet_photos (report_id) where report_id is not null;
create index jc_stray_reports_pending_by on public.jc_stray_reports (pending_photo_by) where pending_photo_by is not null;
create index jc_stray_reports_photo on public.jc_stray_reports (photo_path) where photo_path is not null;        -- read rule (sec L3)
create index jc_stray_reports_pending on public.jc_stray_reports (pending_photo_path) where pending_photo_path is not null;

-- ---------- 2. storage rules (bodies only; signatures + grants unchanged) ----------
create or replace function jc_private.pet_photo_can_write(p_name text) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.jc_pets p
      join public.jc_communities c on c.id = p.community_id
     where p.pending_photo_path = p_name and p.pending_photo_by = auth.uid()
       and p.pending_photo_at > now() - interval '15 minutes' and p.status = 'active'
       and coalesce((c.modules -> 'pets' ->> 'enabled')::boolean, false)
       and ((p.kind = 'owned' and exists (select 1 from public.jc_home_members m
                                           where m.user_id = auth.uid() and m.home_id = p.home_id))
            or (p.kind = 'stray' and public.jc_admin_has('pets'))))
  -- PHOTOS: the reporter's own pending upload on their own open report
  or exists (
    select 1 from public.jc_stray_reports r
      join public.jc_communities c on c.id = r.community_id
     where r.pending_photo_path = p_name and r.pending_photo_by = auth.uid() and r.reporter = auth.uid()
       and r.pending_photo_at > now() - interval '15 minutes' and r.state = 'open'
       and coalesce((c.modules -> 'pets' ->> 'enabled')::boolean, false));
$$;

create or replace function jc_private.pet_photo_can_read(p_name text) returns boolean
language sql stable security definer set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.jc_pets p
      join public.jc_accounts a on a.user_id = auth.uid() and a.community_id = p.community_id
      join public.jc_communities c on c.id = p.community_id
     where p.status = 'active'
       and coalesce((c.modules -> 'pets' ->> 'enabled')::boolean, false)
       and (p.photo_path = p_name
            or (p.pending_photo_path = p_name and p.pending_photo_by = auth.uid())))
  -- PHOTOS: a report's photo — its reporter or this community's Pets admins; a pending one — its uploader
  or exists (
    select 1 from public.jc_stray_reports r
      join public.jc_accounts a on a.user_id = auth.uid() and a.community_id = r.community_id
      join public.jc_communities c on c.id = r.community_id
     where coalesce((c.modules -> 'pets' ->> 'enabled')::boolean, false)
       -- organizers: only while the reporter is still a member (security 1b M2). Community isolation of the admin
       -- branch rests on the join above: jc_accounts.user_id is the PK (one community per account) and grants are
       -- tied to that account — jc_admin_has has no community check of its own (security 1b L1).
       and ((r.photo_path = p_name
             and (r.reporter = auth.uid()
                  or (public.jc_admin_has('pets')
                      and exists (select 1 from public.jc_accounts ra
                                   where ra.user_id = r.reporter and ra.community_id = r.community_id))))
            or (r.pending_photo_path = p_name and r.pending_photo_by = auth.uid())));
$$;

-- ---------- 3. the report JSON (+ photo_path) ----------
create or replace function public.jc_stray_report_json(r public.jc_stray_reports, p_admin boolean) returns jsonb
language sql stable security definer set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', r.id, 'species', r.species, 'note', r.note, 'lat', r.lat, 'lng', r.lng, 'place', r.place,
    'state', r.state, 'created_at', r.created_at, 'closed_at', r.closed_at,
    -- PHOTOS: hidden once the reporter left (like the number — security 1b M2)
    'photo_path', case when r.reporter is not null
                        and exists (select 1 from jc_accounts a where a.user_id = r.reporter and a.community_id = r.community_id)
                       then r.photo_path end,
    'pet', (select jsonb_build_object('id', p.id, 'name', p.name) from jc_pets p
             where p.id = r.pet_id and p.status = 'active'))
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
$$;

-- ---------- 4. resident photo RPCs (own report) ----------
-- Step 1: a fresh path to upload to (within 15 minutes). A previous pending upload of this report is abandoned.
create function public.jc_stray_report_photo_begin(p_id uuid, p_ext text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_user uuid; v_comm text; v_home uuid; r public.jc_stray_reports%rowtype; v_path text;
begin
  select o_user, o_community, o_home into v_user, v_comm, v_home from jc_me();
  perform jc_module_on(v_comm, 'pets');
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
$$;

-- Step 3: the uploaded object becomes the report's photo (replacing an earlier one).
create function public.jc_stray_report_photo_commit(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_user uuid; v_comm text; v_home uuid; r public.jc_stray_reports%rowtype;
begin
  select o_user, o_community, o_home into v_user, v_comm, v_home from jc_me();
  perform jc_module_on(v_comm, 'pets');
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
$$;

-- The reporter withdraws the photo (and any pending upload). Not blocked while Pets is off.
create function public.jc_stray_report_photo_remove(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_user uuid; v_comm text; v_home uuid; r public.jc_stray_reports%rowtype;
begin
  select o_user, o_community, o_home into v_user, v_comm, v_home from jc_me();
  select * into r from jc_stray_reports where id = p_id and reporter = v_user and community_id = v_comm for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if r.photo_path is null and r.pending_photo_path is null then raise exception 'NO_PHOTO'; end if;
  update jc_pet_photos set state = 'retired', retired_at = now() where report_id = r.id and state in ('current', 'pending');
  update jc_stray_reports set photo_path = null, pending_photo_path = null, pending_photo_by = null, pending_photo_at = null
   where id = r.id
  returning * into r;
  return jc_stray_report_json(r, false);
end;
$$;

revoke execute on function public.jc_stray_report_photo_begin(uuid, text), public.jc_stray_report_photo_commit(uuid),
  public.jc_stray_report_photo_remove(uuid) from public, anon;
grant execute on function public.jc_stray_report_photo_begin(uuid, text), public.jc_stray_report_photo_commit(uuid),
  public.jc_stray_report_photo_remove(uuid) to authenticated;

-- ---------- 5. close: move or retire the photo (live body + PHOTOS) ----------
create or replace function public.jc_admin_stray_report_close(p_id uuid, p_outcome text, p_pet uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_comm text; r public.jc_stray_reports%rowtype; v_moved boolean := false;                  -- PHOTOS: + v_moved
begin
  v_comm := jc_assert_admin('pets');
  if coalesce(p_outcome, '') not in ('added', 'known', 'not_stray')
     or (p_outcome = 'not_stray') <> (p_pet is null) then
    raise exception 'BAD_FIELDS';
  end if;
  select * into r from jc_stray_reports where id = p_id and community_id = v_comm for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if r.state <> 'open' then
    if r.state = p_outcome and (r.pet_id is not distinct from p_pet or r.pet_id is null) then   -- db L4
      return jc_stray_report_json(r, true);                    -- a retry: nothing moves again
    end if;
    raise exception 'ALREADY_CLOSED';
  end if;
  if p_pet is not null and not exists (select 1 from jc_pets where id = p_pet and community_id = v_comm
                                         and kind = 'stray' and status = 'active') then
    raise exception 'NOT_FOUND';
  end if;
  -- PHOTOS: Add / Already known → the photo becomes the stray's when it has none (the stray row locked, so two
  -- reports can't both claim it); otherwise the photo is retired. Pending uploads are always retired.
  if r.photo_path is not null and p_pet is not null
     and exists (select 1 from jc_accounts a where a.user_id = r.reporter and a.community_id = r.community_id) then  -- sec M2
    -- the full predicate under the lock: a stray archived meanwhile gets nothing (db 1b M1)
    perform 1 from jc_pets where id = p_pet and community_id = v_comm and kind = 'stray' and status = 'active'
                             and photo_path is null for no key update;
    if found then
      update jc_pet_photos set pet_id = p_pet, report_id = null
       where path = r.photo_path and report_id = r.id and state = 'current';
      if found then                                              -- only a ledger row that really moved (db 1b L1)
        update jc_pets set photo_path = r.photo_path, updated_at = now(), updated_by = auth.uid() where id = p_pet;
        v_moved := true;
      end if;
    end if;
  end if;
  update jc_pet_photos set state = 'retired', retired_at = now()
   where report_id = r.id and state in ('current', 'pending');
  update jc_stray_reports
     set state = p_outcome, pet_id = p_pet, closed_at = now(), closed_by = auth.uid(), contact = null,
         photo_path = null, pending_photo_path = null, pending_photo_by = null, pending_photo_at = null  -- PHOTOS
   where id = r.id
  returning * into r;
  -- never the contact number or the note: the outcome only
  perform jc_admin_log_add(v_comm, 'stray_report_close', jsonb_build_object(
    'report_id', r.id, 'outcome', p_outcome, 'pet_id', p_pet, 'photo_moved', v_moved));             -- PHOTOS
  return jc_stray_report_json(r, true);
end;
$$;

-- ---------- 6. nightly retention (live body + PHOTOS; db review 1a M2) ----------
create or replace function public.jc_pets_retention() returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare n int; m int;
begin
  update jc_pet_sightings set reporter = null
   where reporter is not null and seen_at < now() - interval '24 hours';
  with gone as (delete from jc_pet_sightings where seen_at < now() - interval '30 days' returning 1)
  select count(*) into n from gone;
  update jc_stray_reports r set contact = null
   where r.contact is not null
     and (r.reporter is null or not exists (select 1 from jc_accounts a
                                             where a.user_id = r.reporter and a.community_id = r.community_id));
  -- PHOTOS: a current photo of an archived pet is retired (closes the close-vs-archive race, db 1b M1; jc_pet_retire
  -- retires the ledger before it updates jc_pets, so a move landing in between would otherwise never be purged)
  update jc_pet_photos ph set state = 'retired', retired_at = now()
    from jc_pets p
   where ph.pet_id = p.id and ph.state = 'current' and p.status = 'archived';
  -- PHOTOS: a reporter who left → their report photos are retired too (security 1b M2)
  update jc_pet_photos ph set state = 'retired', retired_at = now()
    from jc_stray_reports r
   where ph.report_id = r.id and ph.state in ('current', 'pending')
     and (r.reporter is null or not exists (select 1 from jc_accounts a
                                             where a.user_id = r.reporter and a.community_id = r.community_id));
  update jc_stray_reports r set photo_path = null, pending_photo_path = null, pending_photo_by = null, pending_photo_at = null
   where (r.photo_path is not null or r.pending_photo_path is not null)
     and (r.reporter is null or not exists (select 1 from jc_accounts a
                                             where a.user_id = r.reporter and a.community_id = r.community_id));
  -- PHOTOS: an expiring report's photos are retired first (the sweep deletes the objects)
  update jc_pet_photos ph set state = 'retired', retired_at = now()
    from jc_stray_reports r
   where ph.report_id = r.id and ph.state in ('current', 'pending')
     and r.state = 'open' and r.created_at < now() - interval '60 days';
  update jc_stray_reports set state = 'expired', closed_at = now(), contact = null,
         photo_path = null, pending_photo_path = null, pending_photo_by = null, pending_photo_at = null   -- PHOTOS
   where state = 'open' and created_at < now() - interval '60 days';
  -- PHOTOS: a report due for deletion goes only once all its photo rows are purged; those rows go first
  delete from jc_pet_photos ph using jc_stray_reports r
   where ph.report_id = r.id and r.closed_at < now() - interval '30 days'
     and not exists (select 1 from jc_pet_photos x where x.report_id = r.id and x.purged_at is null);
  with gone as (delete from jc_stray_reports r
                 where r.closed_at < now() - interval '30 days'
                   and not exists (select 1 from jc_pet_photos x where x.report_id = r.id)     -- PHOTOS
                returning 1)
  select count(*) into m from gone;
  n := n + m;
  insert into jc_maintenance_log (job, affected) values ('pets_purge', n);
  return n;
end;
$$;
