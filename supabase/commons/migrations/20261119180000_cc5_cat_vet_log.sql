-- TARGET PROJECT: JubailCommons (qrpxfssdeeuzmsmlbtbu) — NEVER SignalPost.
-- CC-5 Cats vet log (docs/plans/CC-community-cats.md "CC-5 plan"; Zee approved + pre-authorised apply + merge,
-- 2026-11-19). Builds on CC-1 … CC-4 (all live). Replaced functions start from the live bodies (md5-checked against
-- 20261118180000_cc3_cat_register / 20261118220000_cc4_cat_visits_sightings) + lines marked "CC-5".
--
-- 1. jc_cat_vet_visits: one clinic visit (date, clinic, what was done, vaccine + name, next dose due, invoice number,
--    link to the document in the programme's Google Drive, "shared" = the invoice is shown to everyone, note) +
--    jc_cat_vet_cats (the cats seen on that visit: her counting rule counts clinic visits apart from cats treated).
--    The visit date is the date given. Medical facts only — no amounts. Kept forever.
-- 2. Who: logging = Cats coordinators + community admins (jc_assert_admin('cats')). Reading = the programme
--    (coordinators, volunteers, community admins). Invoice number + Drive link: coordinators only, unless the
--    coordinator ticked "shared" — then everyone, residents included (Zee 2026-11-19). Hide / show again =
--    coordinators. Fix a mistake = hide + log again (same as visits).
-- 3. The Drive link is checked here, ≤ 500 chars: a Drive file (drive.google.com/file/d/…, /open?id=…), a Drive folder
--    (drive.google.com/drive/folders/…) or a Docs / Sheets / Slides document (docs.google.com/document|spreadsheets|
--    presentation/d/…). Never Google's viewer, Forms or any other path (security review L1: a shared link is shown to
--    residents as an invoice).
-- 4. Reads: vet visits join the programme's activity (jc_cat_activity kind 'vet'; never in a station's list — a vet
--    visit has no station). The cat JSON gains, for everyone: 'vaccinated' (rabies on record and not overdue: next
--    dose due today or later, or no due date and given 365 days ago or less — the latest rabies entry decides) and
--    'invoices' (shared invoices only); for the programme: 'vaccines' (the latest entry per vaccine: rabies, core, each named other). A merged cat's
--    vet visits count for the cat it was merged into.
-- 5. Rate limit: the CC-4 bucket 'cat_log' (60 / hour per person) also covers vet visits.
-- 6. Kill switch: the module flag off → MODULE_OFF.
-- +1 authenticated fn: jc_cat_vet_add. Replaced (signatures unchanged): jc_cat_json, jc_cat_log_json,
--   jc_cat_activity, jc_cat_log_hide.
-- Rollback (pre-launch, test data only — dropping the tables deletes every vet record), in this order:
--   (1) re-create, with CREATE OR REPLACE, jc_cat_json from 20261118180000_cc3_cat_register and jc_cat_log_json,
--   jc_cat_activity, jc_cat_log_hide from 20261118220000_cc4_cat_visits_sightings (their files say plain CREATE);
--   (2) drop function jc_cat_vet_add(jsonb); (3) drop table jc_cat_vet_cats, then jc_cat_vet_visits; (4) revert the
--   tests (00_grants allowlist, s34 resident keys, drop s37). 'cat_vet_add' rows stay in jc_admin_log (harmless).

-- ---------- 1. schema ----------
create table public.jc_cat_vet_visits (
  id           uuid primary key default gen_random_uuid(),
  community_id text not null references public.jc_communities(id),
  visited_on   date not null,
  clinic       text check (clinic is null or char_length(clinic) between 1 and 120),
  done         text[] not null check (cardinality(done) between 1 and 9 and done <@ array['checkup', 'sterilisation',
                 'vaccination', 'deworming', 'parasites', 'treatment', 'surgery', 'microchip', 'other']),
  vaccine      text check (vaccine in ('rabies', 'core', 'other')),
  vaccine_name text check (vaccine_name is null or char_length(vaccine_name) between 1 and 80),
  next_due     date,
  invoice_no   text check (invoice_no is null or char_length(invoice_no) between 1 and 60),
  doc_url      text check (doc_url is null or (char_length(doc_url) <= 500
                 and doc_url ~ '^https://(drive\.google\.com/(file/d/|open\?id=|drive/(u/[0-9]+/)?folders/)|docs\.google\.com/(document|spreadsheets|presentation)/d/)[^[:space:]<>"''\\]*$')),
  shared       boolean not null default false,
  note         text check (note is null or char_length(note) between 1 and 500),
  logged_at    timestamptz not null default now(),
  logged_by    uuid references auth.users(id) on delete set null,
  logged_name  text check (logged_name is null or char_length(logged_name) <= 80),
  hidden_at    timestamptz,
  hidden_by    uuid references auth.users(id) on delete set null,
  check ((vaccine is not null) = ('vaccination' = any (done))),
  check (vaccine_name is null or vaccine is not null),
  check (next_due is null or (next_due > visited_on and next_due <= visited_on + interval '5 years')),
  check (not shared or invoice_no is not null or doc_url is not null)
);
create index jc_cat_vet_visits_comm_idx on public.jc_cat_vet_visits (community_id, visited_on desc, logged_at desc);

create table public.jc_cat_vet_cats (
  visit_id uuid not null references public.jc_cat_vet_visits(id) on delete cascade,
  cat_id   uuid not null references public.jc_cats(id),
  primary key (visit_id, cat_id)
);
create index jc_cat_vet_cats_cat_idx on public.jc_cat_vet_cats (cat_id);

alter table public.jc_cat_vet_visits enable row level security;
alter table public.jc_cat_vet_cats enable row level security;
revoke all on table public.jc_cat_vet_visits, public.jc_cat_vet_cats from public, anon, authenticated;

-- ---------- 2. the cat JSON: + vaccinated, invoices (everyone), vaccines (programme) ----------
create or replace function public.jc_cat_json(k public.jc_cats, p_full boolean) returns jsonb
language sql stable security definer set search_path = public, pg_temp
as $$
  with vv as (                                                   -- CC-5: this cat's vet visits (+ cats merged into it)
    select w.*, (now() at time zone coalesce((select tz from jc_communities where id = k.community_id), 'Asia/Dubai'))::date as today
      from jc_cat_vet_visits w
     where w.hidden_at is null
       and w.id in (select vc.visit_id from jc_cat_vet_cats vc
                     where vc.cat_id = any (array(select k.id union all select m.id from jc_cats m where m.merged_into = k.id)))
  )
  select jsonb_build_object(
    'id', k.id, 'code', 'C-' || lpad(k.num::text, 3, '0'), 'name', k.name, 'sex', k.sex, 'life_stage', k.life_stage,
    'coat', k.coat, 'confirmed', k.confirmed, 'story', k.story, 'status', k.status, 'ear_tip', k.ear_tip,
    'sterilised', k.sterilised,
    'area', (select a.name from jc_cat_areas a where a.id = k.area_id),
    'photos', coalesce((select jsonb_agg(ph.path order by ph.created_at, ph.path) from jc_pet_photos ph
                         -- db / security review M2: = any(array) keeps jc_pet_photos_cat usable (an OR + subquery can't)
                         where ph.state = 'current'
                           and ph.cat_id = any (array(select k.id union all select m.id from jc_cats m where m.merged_into = k.id))),
                       '[]'::jsonb),
    -- CC-5: rabies on record and not overdue (the latest rabies entry decides)
    'vaccinated', coalesce((select case when r.next_due is not null then r.next_due >= r.today
                                        else r.visited_on >= r.today - 365 end
                              from vv r where r.vaccine = 'rabies'
                             order by r.visited_on desc, r.logged_at desc limit 1), false),
    -- CC-5: invoices a coordinator shared with everyone (no clinic, no note, no names)
    'invoices', coalesce((select jsonb_agg(jsonb_build_object('on', i.visited_on, 'done', to_jsonb(i.done),
                                                              'invoice_no', i.invoice_no, 'doc_url', i.doc_url)
                                           order by i.visited_on desc, i.logged_at desc)
                            from vv i where i.shared), '[]'::jsonb))
  || case when p_full then jsonb_build_object(
       'old_id', k.old_id, 'area_id', k.area_id, 'station_id', k.station_id,
       'status_on', k.status_on, 'status_source', k.status_source, 'ear_side', k.ear_side,
       'sterilised_source', k.sterilised_source, 'tnvr', k.tnvr, 'tnvr_on', k.tnvr_on, 'tnvr_place', k.tnvr_place,
       'created_at', k.created_at, 'updated_at', k.updated_at,
       'own_photos', coalesce((select jsonb_agg(ph.path order by ph.created_at, ph.path) from jc_pet_photos ph
                                where ph.state = 'current' and ph.cat_id = k.id), '[]'::jsonb),
       'merged_into', (select jsonb_build_object('id', t.id, 'code', 'C-' || lpad(t.num::text, 3, '0'), 'name', t.name)
                         from jc_cats t where t.id = k.merged_into),
       'merged_at', k.merged_at,
       'merged_from', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'code', 'C-' || lpad(m.num::text, 3, '0'),
                                                                    'name', m.name, 'old_id', m.old_id)
                                                 order by m.num)
                                  from jc_cats m where m.merged_into = k.id), '[]'::jsonb),
       'status_log', coalesce((select jsonb_agg(jsonb_build_object('status', l.status, 'on', l.status_on,
                                                                   'source', l.source, 'at', l.logged_at,
                                                                   'code', 'C-' || lpad(c2.num::text, 3, '0'))
                                                order by l.logged_at desc, l.id)
                                 from (select l0.* from jc_cat_status_log l0
                                        where l0.cat_id = any (array(select k.id union all select m.id from jc_cats m where m.merged_into = k.id))
                                        order by l0.logged_at desc, l0.id limit 10) l
                                 join jc_cats c2 on c2.id = l.cat_id), '[]'::jsonb),
       -- CC-5: the latest entry per vaccine: rabies, core, and each "other" by its name (db review M1)
       'vaccines', coalesce((select jsonb_agg(jsonb_build_object('vaccine', x.vaccine, 'name', x.vaccine_name,
                                                                 'given', x.visited_on, 'next_due', x.next_due,
                                                                 'overdue', x.next_due is not null and x.next_due < x.today)
                                              order by array_position(array['rabies', 'core', 'other'], x.vaccine), x.visited_on desc)
                               from (select distinct on (v.vaccine, case when v.vaccine = 'other' then lower(coalesce(v.vaccine_name, '')) end) v.*
                                       from vv v where v.vaccine is not null
                                      order by v.vaccine, case when v.vaccine = 'other' then lower(coalesce(v.vaccine_name, '')) end,
                                               v.visited_on desc, v.logged_at desc) x), '[]'::jsonb))
     else '{}'::jsonb end
    from (select 1) one;
$$;

-- ---------- 3. one entry as JSON: + kind 'vet' ----------
-- p_kind 'visit' | 'sighting' | 'vet'; p_coord: the reader is a coordinator; p_me: the reader's user id.
create or replace function public.jc_cat_log_json(p_kind text, p_id uuid, p_coord boolean, p_me uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v public.jc_cat_visits%rowtype; s public.jc_cat_sightings%rowtype; w public.jc_cat_vet_visits%rowtype; v_tz text; r jsonb;
begin
  if p_kind = 'vet' then                                             -- CC-5
    select * into w from jc_cat_vet_visits where id = p_id;
    select coalesce(tz, 'Asia/Dubai') into v_tz from jc_communities where id = w.community_id;
    return jsonb_build_object(
      'kind', 'vet', 'id', w.id,
      'at', case when w.visited_on = (w.logged_at at time zone v_tz)::date then w.logged_at
                 else (w.visited_on + time '12:00') at time zone v_tz end,
      'visited_on', w.visited_on, 'logged_at', w.logged_at,
      'clinic', w.clinic, 'done', to_jsonb(w.done), 'vaccine', w.vaccine, 'vaccine_name', w.vaccine_name,
      'next_due', w.next_due, 'overdue', w.next_due is not null and w.next_due < (now() at time zone v_tz)::date,
      'shared', w.shared,
      -- invoice number + Drive link: coordinators, or everyone once shared
      'invoice_no', case when p_coord or w.shared then w.invoice_no end,
      'doc_url', case when p_coord or w.shared then w.doc_url end,
      'note', w.note, 'by', w.logged_name,
      'mine', w.logged_by is not distinct from p_me and p_me is not null,
      'hidden', w.hidden_at is not null,
      'can_hide', p_coord,
      'cats', coalesce((
        select jsonb_agg(jsonb_build_object('id', k.id, 'code', 'C-' || lpad(k.num::text, 3, '0'), 'name', k.name)
                         order by k.num)
          from (select distinct coalesce(k0.merged_into, k0.id) as cid
                  from jc_cat_vet_cats vc join jc_cats k0 on k0.id = vc.cat_id
                 where vc.visit_id = w.id) x
          join jc_cats k on k.id = x.cid), '[]'::jsonb));
  end if;
  if p_kind = 'visit' then
    select * into v from jc_cat_visits where id = p_id;
    select coalesce(tz, 'Asia/Dubai') into v_tz from jc_communities where id = v.community_id;
    select jsonb_build_object(
      'kind', 'visit', 'id', v.id,
      'at', case when v.visited_on = (v.logged_at at time zone v_tz)::date then v.logged_at
                 else (v.visited_on + time '12:00') at time zone v_tz end,
      'visited_on', v.visited_on, 'logged_at', v.logged_at,
      'station', jsonb_build_object('id', st.id, 'code', 'S-' || lpad(st.num::text, 3, '0'), 'landmark', st.landmark,
                                    'area_id', st.area_id),
      'food', v.food, 'water', v.water, 'cleaned', v.cleaned,
      'headcount', v.headcount, 'unfamiliar', v.unfamiliar, 'kittens', v.kittens,
      'problem', v.problem, 'note', v.note, 'by', v.logged_name,
      'mine', v.logged_by is not distinct from p_me and p_me is not null,
      'hidden', v.hidden_at is not null,
      'can_hide', p_coord or (v.logged_by = p_me and v.logged_at > now() - interval '24 hours'
                              and (v.hidden_at is null or v.hidden_by = p_me)),
      'cats', coalesce((
        select jsonb_agg(jsonb_build_object('id', k.id, 'code', 'C-' || lpad(k.num::text, 3, '0'), 'name', k.name)
                         order by k.num)
          from (select distinct coalesce(k0.merged_into, k0.id) as cid
                  from jc_cat_visit_cats vc join jc_cats k0 on k0.id = vc.cat_id
                 where vc.visit_id = v.id) x
          join jc_cats k on k.id = x.cid), '[]'::jsonb))
      into r
      from jc_cat_stations st where st.id = v.station_id;
    return r;
  end if;
  select * into s from jc_cat_sightings where id = p_id;
  return jsonb_build_object(
    'kind', 'sighting', 'id', s.id, 'at', s.seen_at, 'seen_at', s.seen_at, 'logged_at', s.logged_at,
    'cat', (select jsonb_build_object('id', k.id, 'code', 'C-' || lpad(k.num::text, 3, '0'), 'name', k.name)
              from jc_cats k0 join jc_cats k on k.id = coalesce(k0.merged_into, k0.id) where k0.id = s.cat_id),
    'description', s.description,
    'station', (select jsonb_build_object('id', st.id, 'code', 'S-' || lpad(st.num::text, 3, '0'), 'landmark', st.landmark,
                                          'area_id', st.area_id)
                  from jc_cat_stations st where st.id = s.station_id),
    'area_id', s.area_id, 'lat', s.lat, 'lng', s.lng, 'note', s.note, 'by', s.logged_name,
    'linked', s.linked_at is not null,
    'mine', s.logged_by is not distinct from p_me and p_me is not null,
    'hidden', s.hidden_at is not null,
    'can_hide', p_coord or (s.logged_by = p_me and s.logged_at > now() - interval '24 hours'
                            and (s.hidden_at is null or s.hidden_by = p_me)));
end;
$$;

-- ---------- 4. log a vet visit (coordinators + community admins) ----------
-- p_fields keys: visited_on ('YYYY-MM-DD', default today in the community's time zone; not future, not before
--   2000-01-01), clinic (≤ 120), done (array of 1–9 distinct keys: checkup sterilisation vaccination deworming parasites
--   treatment surgery microchip other), vaccine ('rabies' | 'core' | 'other' — required with vaccination, refused
--   without), vaccine_name (≤ 80, only with a vaccine), next_due ('YYYY-MM-DD', after the visit, ≤ 5 years on),
--   invoice_no (≤ 60), doc_url (a Drive file / folder or a Docs / Sheets / Slides document, see 3.; ≤ 500), shared (bool; needs an
--   invoice number or link), note (≤ 500), cats (array of 1–60 cat ids of this community, not merged).
--   Returns { vet }.
create function public.jc_cat_vet_add(p_fields jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_comm text; v_tz text; v_today date; v_on date; v_due date; v_id uuid; v_cats uuid[]; v_done text[];
        v_clinic text; v_vname text; v_inv text; v_url text; v_note text; v_vac text; v_shared boolean;
begin
  perform jc_cat_reader();                                           -- module first, like the other Cats writes
  v_comm := jc_assert_admin('cats');
  if jsonb_typeof(p_fields) is distinct from 'object'
     or exists (select 1 from jsonb_object_keys(case when jsonb_typeof(p_fields) = 'object' then p_fields else '{}' end) x
                 where x not in ('visited_on', 'clinic', 'done', 'vaccine', 'vaccine_name', 'next_due', 'invoice_no',
                                 'doc_url', 'shared', 'note', 'cats'))
     or exists (select 1 from unnest(array['visited_on', 'clinic', 'vaccine', 'vaccine_name', 'next_due', 'invoice_no',
                                           'doc_url', 'note']) t
                 where p_fields ? t and jsonb_typeof(p_fields -> t) not in ('string', 'null'))
     or (p_fields ? 'shared' and jsonb_typeof(p_fields -> 'shared') not in ('boolean', 'null'))
     or jsonb_typeof(p_fields -> 'done') is distinct from 'array'
     or jsonb_typeof(p_fields -> 'cats') is distinct from 'array'
     or char_length(p_fields ->> 'note') > 2000 or char_length(p_fields ->> 'clinic') > 1000
     or char_length(p_fields ->> 'vaccine_name') > 1000 or char_length(p_fields ->> 'invoice_no') > 1000
     or char_length(p_fields ->> 'doc_url') > 2000 then
    raise exception 'BAD_FIELDS';
  end if;
  -- only now are both known to be arrays (OR doesn't short-circuit reliably)
  if jsonb_array_length(p_fields -> 'cats') > 200 or jsonb_array_length(p_fields -> 'done') > 20
     or exists (select 1 from jsonb_array_elements(p_fields -> 'done') d where jsonb_typeof(d) <> 'string') then
    raise exception 'BAD_FIELDS';
  end if;
  -- what was done: known keys, at least one
  select coalesce(array_agg(distinct d order by d), '{}') into v_done from jsonb_array_elements_text(p_fields -> 'done') d;
  if cardinality(v_done) = 0 or not v_done <@ array['checkup', 'sterilisation', 'vaccination', 'deworming', 'parasites',
                                                     'treatment', 'surgery', 'microchip', 'other'] then
    raise exception 'BAD_DONE';
  end if;
  v_vac := nullif(p_fields ->> 'vaccine', '');
  if v_vac is not null and v_vac not in ('rabies', 'core', 'other') then raise exception 'BAD_VACCINE'; end if;
  if (v_vac is not null) <> ('vaccination' = any (v_done)) then raise exception 'BAD_VACCINE'; end if;
  v_vname := jc_clean_line(p_fields ->> 'vaccine_name');
  if v_vname is not null and v_vac is null then raise exception 'BAD_VACCINE'; end if;
  -- dates
  select coalesce(tz, 'Asia/Dubai') into v_tz from jc_communities where id = v_comm;
  v_today := (now() at time zone v_tz)::date;
  if coalesce(p_fields ->> 'visited_on', '') = '' then v_on := v_today;
  elsif (p_fields ->> 'visited_on') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'BAD_DATE';
  else
    begin v_on := (p_fields ->> 'visited_on')::date; exception when others then raise exception 'BAD_DATE'; end;
  end if;
  if v_on > v_today or v_on < date '2000-01-01' then raise exception 'BAD_DATE'; end if;
  if coalesce(p_fields ->> 'next_due', '') <> '' then
    if (p_fields ->> 'next_due') !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'BAD_DUE'; end if;
    begin v_due := (p_fields ->> 'next_due')::date; exception when others then raise exception 'BAD_DUE'; end;
    if v_due <= v_on or v_due > v_on + interval '5 years' then raise exception 'BAD_DUE'; end if;
  end if;
  -- the Drive link
  v_url := nullif(btrim(p_fields ->> 'doc_url'), '');
  if v_url is not null and (char_length(v_url) > 500
                            or v_url !~ '^https://(drive\.google\.com/(file/d/|open\?id=|drive/(u/[0-9]+/)?folders/)|docs\.google\.com/(document|spreadsheets|presentation)/d/)[^[:space:]<>"''\\]*$') then
    raise exception 'BAD_LINK';
  end if;
  v_clinic := jc_clean_line(p_fields ->> 'clinic');
  v_inv := jc_clean_line(p_fields ->> 'invoice_no');
  v_note := jc_clean_text(p_fields ->> 'note');
  if char_length(v_clinic) > 120 or char_length(v_vname) > 80 or char_length(v_inv) > 60 or char_length(v_note) > 500 then
    raise exception 'BAD_FIELDS';
  end if;
  v_shared := coalesce((p_fields ->> 'shared')::boolean, false);
  if v_shared and v_inv is null and v_url is null then raise exception 'NO_INVOICE'; end if;
  -- cats: 1–60 distinct uuids of this community, not merged
  begin
    select coalesce(array_agg(distinct x::uuid), '{}') into v_cats from jsonb_array_elements_text(p_fields -> 'cats') x;
  exception when others then raise exception 'BAD_CAT';
  end;
  if cardinality(v_cats) = 0 then raise exception 'NO_CAT'; end if;
  if cardinality(v_cats) > 60
     -- security L2: lock the cats so a merge can't land between this check and the insert
     or (select count(*) from (select 1 from jc_cats where id = any (v_cats) and community_id = v_comm and merged_into is null
                                 for share) x) <> cardinality(v_cats) then
    raise exception 'BAD_CAT';
  end if;
  perform jc_rate_take(auth.uid(), 'cat_log', 60, interval '1 hour');
  insert into jc_cat_vet_visits (community_id, visited_on, clinic, done, vaccine, vaccine_name, next_due, invoice_no,
                                 doc_url, shared, note, logged_by, logged_name)
  values (v_comm, v_on, v_clinic, v_done, v_vac, v_vname, v_due, v_inv, v_url, v_shared, v_note, auth.uid(),
          left((select display_name from jc_accounts where user_id = auth.uid()), 80))
  returning id into v_id;
  insert into jc_cat_vet_cats (visit_id, cat_id) select v_id, c from unnest(v_cats) c;
  perform jc_admin_log_add(v_comm, 'cat_vet_add', jsonb_build_object('id', v_id, 'cats', cardinality(v_cats)));
  return jsonb_build_object('vet', jc_cat_log_json('vet', v_id, true, auth.uid()));
end;
$$;

-- ---------- 5. read: the programme's activity (+ kind 'vet') ----------
-- p_kind: null | 'visit' | 'sighting' | 'problem' | 'unidentified' | 'vet' (CC-5). A station's list never holds vet
-- visits (they have no station).
create or replace function public.jc_cat_activity(p_station uuid, p_cat uuid, p_kind text, p_before timestamptz, p_before_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp
as $$
declare v_comm text; v_coord boolean; v_me uuid := auth.uid(); v_tz text; v_cats uuid[]; v_items jsonb; v_n int;
begin
  v_comm := jc_cat_reader();
  v_coord := jc_admin_has('cats');
  if p_kind is not null and p_kind not in ('visit', 'sighting', 'problem', 'unidentified', 'vet') then raise exception 'BAD_FIELDS'; end if;
  if p_station is not null and not exists (select 1 from jc_cat_stations where id = p_station and community_id = v_comm) then
    raise exception 'NOT_FOUND';
  end if;
  if p_cat is not null then
    if not exists (select 1 from jc_cats where id = p_cat and community_id = v_comm) then raise exception 'NOT_FOUND'; end if;
    select array_agg(id) into v_cats from jc_cats where community_id = v_comm and (id = p_cat or merged_into = p_cat);
  end if;
  select coalesce(tz, 'Asia/Dubai') into v_tz from jc_communities where id = v_comm;
  with e as (
    select 'visit' as kind, v.id,
           case when v.visited_on = (v.logged_at at time zone v_tz)::date then v.logged_at
                else (v.visited_on + time '12:00') at time zone v_tz end as at
      from jc_cat_visits v
     where v.community_id = v_comm and (v_coord or v.hidden_at is null or v.logged_by = v_me)
       and coalesce(p_kind, 'visit') in ('visit', 'problem') and (p_kind is distinct from 'problem' or v.problem is not null)
       and (p_station is null or v.station_id = p_station)
       and (p_cat is null or exists (select 1 from jc_cat_visit_cats vc where vc.visit_id = v.id and vc.cat_id = any (v_cats)))
    union all
    select 'sighting', s.id, s.seen_at
      from jc_cat_sightings s
     where s.community_id = v_comm and (v_coord or s.hidden_at is null or s.logged_by = v_me)
       and coalesce(p_kind, 'sighting') in ('sighting', 'unidentified') and (p_kind is distinct from 'unidentified' or s.cat_id is null)
       and (p_station is null or s.station_id = p_station)
       and (p_cat is null or s.cat_id = any (v_cats))
    union all                                                        -- CC-5: vet visits (never in a station's list)
    select 'vet', w.id,
           case when w.visited_on = (w.logged_at at time zone v_tz)::date then w.logged_at
                else (w.visited_on + time '12:00') at time zone v_tz end
      from jc_cat_vet_visits w
     where w.community_id = v_comm and (v_coord or w.hidden_at is null)
       and coalesce(p_kind, 'vet') = 'vet' and p_station is null
       and (p_cat is null or exists (select 1 from jc_cat_vet_cats vc where vc.visit_id = w.id and vc.cat_id = any (v_cats)))
  ), page as (
    select * from e
     where p_before is null or (e.at, e.id) < (p_before, coalesce(p_before_id, 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid))
     order by e.at desc, e.id desc limit 51
  )
  select coalesce(jsonb_agg(jc_cat_log_json(kind, id, v_coord, v_me) order by at desc, id desc) filter (where rn <= 50), '[]'::jsonb),
         count(*)
    into v_items, v_n
    from (select page.*, row_number() over (order by at desc, id desc) rn from page) x;
  return jsonb_build_object('items', v_items, 'more', v_n > 50, 'can_edit', v_coord);
end;
$$;

-- ---------- 6. hide / show again (+ kind 'vet': coordinators only) ----------
create or replace function public.jc_cat_log_hide(p_kind text, p_id uuid, p_hidden boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp
as $$
declare v_comm text; v_coord boolean; v_by uuid; v_at timestamptz; v_hidden timestamptz; v_hid_by uuid;
begin
  v_comm := jc_cat_reader();
  v_coord := jc_admin_has('cats');
  if p_kind is null or p_kind not in ('visit', 'sighting', 'vet') or p_hidden is null then raise exception 'BAD_FIELDS'; end if;  -- security L4
  if p_kind = 'vet' and not v_coord then raise exception 'NOT_ADMIN'; end if;  -- CC-5: coordinators only (db L3: before the lock)
  if p_kind = 'visit' then
    select logged_by, logged_at, hidden_at, hidden_by into v_by, v_at, v_hidden, v_hid_by from jc_cat_visits where id = p_id and community_id = v_comm for update;
  elsif p_kind = 'vet' then                                          -- CC-5
    select logged_by, logged_at, hidden_at, hidden_by into v_by, v_at, v_hidden, v_hid_by from jc_cat_vet_visits where id = p_id and community_id = v_comm for update;
  else
    select logged_by, logged_at, hidden_at, hidden_by into v_by, v_at, v_hidden, v_hid_by from jc_cat_sightings where id = p_id and community_id = v_comm for update;
  end if;
  if not found then raise exception 'NOT_FOUND'; end if;
  if not (v_coord or (v_by = auth.uid() and v_at > now() - interval '24 hours')) then raise exception 'NOT_ADMIN'; end if;
  -- security M1: an author never undoes a coordinator's hide
  if not v_coord and not p_hidden and v_hidden is not null and v_hid_by is distinct from auth.uid() then raise exception 'NOT_ADMIN'; end if;
  if p_kind = 'visit' then
    update jc_cat_visits set hidden_at = case when p_hidden then coalesce(hidden_at, now()) end,
                             hidden_by = case when p_hidden then coalesce(hidden_by, auth.uid()) end where id = p_id;
  elsif p_kind = 'vet' then                                          -- CC-5
    update jc_cat_vet_visits set hidden_at = case when p_hidden then coalesce(hidden_at, now()) end,
                                 hidden_by = case when p_hidden then coalesce(hidden_by, auth.uid()) end where id = p_id;
  else
    update jc_cat_sightings set hidden_at = case when p_hidden then coalesce(hidden_at, now()) end,
                                hidden_by = case when p_hidden then coalesce(hidden_by, auth.uid()) end where id = p_id;
  end if;
  if (v_hidden is not null) <> p_hidden then
    perform jc_admin_log_add(v_comm, 'cat_log_hide', jsonb_build_object('kind', p_kind, 'id', p_id, 'hidden', p_hidden));
  end if;
  return jsonb_build_object(p_kind, jc_cat_log_json(p_kind, p_id, v_coord, auth.uid()));
end;
$$;

-- ---------- 7. grants ----------
revoke execute on function public.jc_cat_vet_add(jsonb) from public, anon;
grant execute on function public.jc_cat_vet_add(jsonb) to authenticated;
