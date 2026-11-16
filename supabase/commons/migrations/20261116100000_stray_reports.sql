-- TARGET PROJECT: JubailCommons (qrpxfssdeeuzmsmlbtbu) — NEVER SignalPost.
-- Report a new stray, PR 1a (plan docs/plans/report-a-stray.md, Zee decisions 2026-11-16). No photos (PR 1b).
--
-- PII: "only when necessary" (CLAUDE.md, Zee 2026-11-16). Each piece is kept only while it is needed:
--   reporter   kept for the life of the report so Pets organizers can see the reporter's HOME (read live from
--              jc_home_members: a reporter who left shows as gone). Never shown to other residents.
--   contact    opt-in WhatsApp number, per report. Only Pets / community admins read it (jc_admin_stray_reports_list).
--              Cleared when the report closes (a check enforces it), and by the nightly job once the reporter's
--              account is gone. Never written to jc_admin_log.
--   the report deleted 30 days after it closes; an open report expires (closes) after 60 days.
--
-- jc_stray_reports            new; RLS on, no table grants — RPCs only. Never read by jc_pets_list / jc_pet_get,
--                             so an unreviewed report is never public.
-- jc_stray_report_add         resident (Pets on). Idempotent on p_id (made on the phone: a doubled tap returns the
--                             first report). Location required: a pin or a written place. Caps (TOO_MANY_REPORTS):
--                             5 / day per account, 5 / day per home, 10 open per account; 100 / day per community
--                             (RATE_LIMITED). Counted on the table under per-account then per-community locks, so exact
--                             (reporters are kept; no jc_rate bucket needed — plan said one).
-- jc_stray_report_contact_clear  the reporter withdraws their own number from an open report (security L1).
-- jc_stray_reports_mine       the caller's own reports and their outcome (any device).
-- jc_admin_stray_reports_list Pets / community admins: 'open' (oldest first) or 'closed' (newest first).
-- jc_admin_stray_report_close outcome added | known (+ an active stray of this community) | not_stray.
--                             Same call again = no-op (the "Add" flow is save-the-stray then close: retry-safe).
-- jc_pets_retention           body: + clear contacts of departed reporters, expire 60-day-old open reports, delete
--                             reports 30 days after close. Same cron (jc-pets-purge), same log key.
--
-- +5 authenticated fns. Replaced (signature unchanged): jc_pets_retention (internal, no grants).
-- Rollback (pre-launch): restore jc_pets_retention from 20261110090000_r5a_pets; drop the 5 functions + the helper;
-- drop table jc_stray_reports. Deleted reports cannot be restored (by design).

-- ---------- 1. table ----------
create table public.jc_stray_reports (
  id            uuid primary key,
  community_id  text not null references public.jc_communities(id),
  reporter      uuid references auth.users(id) on delete set null,
  species       text not null check (species in ('cat', 'dog', 'bird', 'rabbit', 'other')),
  note          text check (note is null or char_length(note) between 1 and 280),
  lat           double precision check (lat between -90 and 90),
  lng           double precision check (lng between -180 and 180),
  place         text check (place is null or char_length(place) between 1 and 120),
  contact       text check (contact is null or contact ~ '^\+?[0-9]{8,15}$'),
  state         text not null default 'open' check (state in ('open', 'added', 'known', 'not_stray', 'expired')),
  pet_id        uuid,
  created_at    timestamptz not null default now(),
  closed_at     timestamptz,
  closed_by     uuid references auth.users(id) on delete set null,
  unique (id, community_id),                                   -- PR 1b: report photos reference (id, community_id)
  constraint jc_stray_reports_pos_pair check ((lat is null) = (lng is null)),
  constraint jc_stray_reports_where    check (lat is not null or place is not null),
  constraint jc_stray_reports_closed   check ((state = 'open') = (closed_at is null)),
  constraint jc_stray_reports_contact  check (state = 'open' or contact is null),
  constraint jc_stray_reports_pet      check (pet_id is null or state in ('added', 'known')),
  constraint jc_stray_reports_pet_fk   foreign key (pet_id, community_id)
    references public.jc_pets(id, community_id) on delete set null (pet_id)
);
alter table public.jc_stray_reports enable row level security;
revoke all on table public.jc_stray_reports from public, anon, authenticated;
create index jc_stray_reports_queue    on public.jc_stray_reports (community_id, state, created_at);
create index jc_stray_reports_reporter on public.jc_stray_reports (reporter, created_at) where reporter is not null;
create index jc_stray_reports_closed   on public.jc_stray_reports (closed_at) where closed_at is not null;
create index jc_stray_reports_pet      on public.jc_stray_reports (pet_id) where pet_id is not null;
create index jc_stray_reports_day      on public.jc_stray_reports (community_id, created_at);         -- community cap (db L2)
create index jc_stray_reports_closer   on public.jc_stray_reports (closed_by) where closed_by is not null;  -- FK (db L1)

-- ---------- 2. internal helper (no grants): one report as JSON ----------
-- p_admin: + the reporter's home (live), whether they left, and the contact number.
create function public.jc_stray_report_json(r public.jc_stray_reports, p_admin boolean) returns jsonb
language sql stable security definer set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'id', r.id, 'species', r.species, 'note', r.note, 'lat', r.lat, 'lng', r.lng, 'place', r.place,
    'state', r.state, 'created_at', r.created_at, 'closed_at', r.closed_at,
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
revoke execute on function public.jc_stray_report_json(public.jc_stray_reports, boolean) from public, anon, authenticated;

-- ---------- 3. resident RPCs ----------
create function public.jc_stray_report_add(p_id uuid, p_fields jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_user uuid; v_comm text; v_home uuid; r public.jc_stray_reports%rowtype; v_contact text;
begin
  select o_user, o_community, o_home into v_user, v_comm, v_home from jc_me();
  perform jc_module_on(v_comm, 'pets');
  if p_id is null or jsonb_typeof(p_fields) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(p_fields) k
                 where k not in ('species', 'note', 'lat', 'lng', 'place', 'contact'))
     or jsonb_typeof(p_fields -> 'species') is distinct from 'string'
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
    values (p_id, v_comm, v_user, p_fields ->> 'species',
            nullif(left(jc_clean_text(p_fields ->> 'note'), 280), ''),
            (p_fields ->> 'lat')::double precision, (p_fields ->> 'lng')::double precision,
            jc_clean_line(p_fields ->> 'place'), v_contact)
    returning * into r;
  exception when check_violation or not_null_violation or numeric_value_out_of_range or unique_violation then   -- db L3
    raise exception 'BAD_FIELDS';
  end;
  return jc_stray_report_json(r, false);
end;
$$;

create function public.jc_stray_reports_mine() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_user uuid; v_comm text; v_home uuid;
begin
  select o_user, o_community, o_home into v_user, v_comm, v_home from jc_me();
  perform jc_module_on(v_comm, 'pets');
  return coalesce((select jsonb_agg(jc_stray_report_json(r, false) order by r.created_at desc, r.id desc)
                     from jc_stray_reports r where r.reporter = v_user and r.community_id = v_comm), '[]'::jsonb);
end;
$$;

-- The reporter takes their number back (security L1). Works while Pets is off: withdrawing data is never blocked.
create function public.jc_stray_report_contact_clear(p_id uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_user uuid; v_comm text; v_home uuid; r public.jc_stray_reports%rowtype;
begin
  select o_user, o_community, o_home into v_user, v_comm, v_home from jc_me();
  update jc_stray_reports set contact = null
   where id = p_id and reporter = v_user and community_id = v_comm
  returning * into r;
  if not found then raise exception 'NOT_FOUND'; end if;
  return jc_stray_report_json(r, false);
end;
$$;

-- ---------- 4. admin RPCs (pets scope or community) ----------
create function public.jc_admin_stray_reports_list(p_show text) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_comm text;
begin
  v_comm := jc_assert_admin('pets');
  if coalesce(p_show, '') not in ('open', 'closed') then raise exception 'BAD_FIELDS'; end if;
  if p_show = 'open' then
    return coalesce((select jsonb_agg(jc_stray_report_json(r, true) order by r.created_at, r.id)
                       from jc_stray_reports r where r.community_id = v_comm and r.state = 'open'), '[]'::jsonb);
  end if;
  -- the newest 200 closed (db review M3); open is bounded by the caps + 60-day expiry
  return coalesce((select jsonb_agg(jc_stray_report_json(c, true) order by c.closed_at desc, c.id desc)
                     from (select * from jc_stray_reports r where r.community_id = v_comm and r.state <> 'open'
                            order by r.closed_at desc, r.id desc limit 200) c), '[]'::jsonb);
end;
$$;

create function public.jc_admin_stray_report_close(p_id uuid, p_outcome text, p_pet uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_comm text; r public.jc_stray_reports%rowtype;
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
      return jc_stray_report_json(r, true);
    end if;
    raise exception 'ALREADY_CLOSED';
  end if;
  if p_pet is not null and not exists (select 1 from jc_pets where id = p_pet and community_id = v_comm
                                         and kind = 'stray' and status = 'active') then
    raise exception 'NOT_FOUND';
  end if;
  update jc_stray_reports
     set state = p_outcome, pet_id = p_pet, closed_at = now(), closed_by = auth.uid(), contact = null
   where id = r.id
  returning * into r;
  -- never the contact number or the note: the outcome only
  perform jc_admin_log_add(v_comm, 'stray_report_close', jsonb_build_object(
    'report_id', r.id, 'outcome', p_outcome, 'pet_id', p_pet));
  return jc_stray_report_json(r, true);
end;
$$;

revoke execute on function public.jc_stray_report_add(uuid, jsonb), public.jc_stray_reports_mine(), public.jc_stray_report_contact_clear(uuid),
  public.jc_admin_stray_reports_list(text), public.jc_admin_stray_report_close(uuid, text, uuid) from public, anon;
grant execute on function public.jc_stray_report_add(uuid, jsonb), public.jc_stray_reports_mine(), public.jc_stray_report_contact_clear(uuid),
  public.jc_admin_stray_reports_list(text), public.jc_admin_stray_report_close(uuid, text, uuid) to authenticated;

-- ---------- 5. nightly retention (body only; live body 2026-11-16 + marked lines) ----------
create or replace function public.jc_pets_retention() returns integer
language plpgsql security definer set search_path = public, pg_temp
as $$
declare n int; m int;                                                                              -- REPORTS: + m
begin
  update jc_pet_sightings set reporter = null
   where reporter is not null and seen_at < now() - interval '24 hours';
  with gone as (delete from jc_pet_sightings where seen_at < now() - interval '30 days' returning 1)
  select count(*) into n from gone;
  -- REPORTS: a reporter whose account is gone from this community → their number goes too
  update jc_stray_reports r set contact = null
   where r.contact is not null
     and (r.reporter is null or not exists (select 1 from jc_accounts a
                                             where a.user_id = r.reporter and a.community_id = r.community_id));
  -- REPORTS: open for 60 days → expired (the closed check clears the number with it)
  update jc_stray_reports set state = 'expired', closed_at = now(), contact = null
   where state = 'open' and created_at < now() - interval '60 days';
  -- REPORTS: deleted 30 days after closing
  with gone as (delete from jc_stray_reports where closed_at < now() - interval '30 days' returning 1)
  select count(*) into m from gone;
  n := n + m;                                                                                      -- REPORTS
  insert into jc_maintenance_log (job, affected) values ('pets_purge', n);
  return n;
end;
$$;
