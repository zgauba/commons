-- TARGET PROJECT: JubailCommons (qrpxfssdeeuzmsmlbtbu) — NEVER SignalPost.
-- CC-1 Cats foundation (docs/plans/CC-community-cats.md, approved Zee 2026-11-17).
-- 1. A 4th switchable module key 'cats' (off everywhere: jc_communities.modules gets no entry here — no flag set).
-- 2. Two per-person roles, by invite link only (jc_module_admins / jc_module_admin_links):
--      'cats'     = Cats coordinators (everything in Cats, from CC-2 on)
--      'cats_vol' = Cats volunteers (visits / sightings on the Cats page only, from CC-4 on)
--    NOT added to the shared-code tables (jc_codes / jc_admin_grants / jc_admin_unlock / jc_admin_code_rotate):
--    a code can never grant a Cats role. jc_admin_has / jc_assert_admin are unchanged: a scope passes only its own
--    gate or via 'community', so 'cats_vol' passes no other module's gate (tested in s32).
-- 3. Lists widened: the two scope CHECKs, the scope allow-lists of link_create / revoke / admins_list,
--    jc_admin_module_label_set (built-in names Cats / القطط, reserved for other sections), jc_hits page 'cats'.
-- 4. jc_snapshot_run: the accounts.admins count leaves volunteers out.
-- Not here: jc_snapshots module 'cats' (no cat data until CC-3), any jc_cat_* table.
-- Rollback (database review M2): delete the 'cats' / 'cats_vol' rows from jc_module_admins and jc_module_admin_links
-- and the 'cats' rows from jc_hits FIRST (the old CHECKs reject them), then restore the old CHECKs and the function
-- bodies from 20261108200000_r4a3_unified_admins.sql / 20261117120000_b1_reason_codes.sql / the live snapshot body.
-- The module flag off (jc_communities.modules.cats) is the kill switch; rollback is rarely needed.
-- Functions below start from the live bodies (pg_get_functiondef, 2026-11-18); changes marked "CC-1".

alter table jc_module_admins drop constraint jc_module_admins_scope_check;
alter table jc_module_admins add constraint jc_module_admins_scope_check
  check (scope = any (array['community', 'events', 'bookings', 'pets', 'cats', 'cats_vol']));
alter table jc_module_admin_links drop constraint jc_module_admin_links_scope_check;
alter table jc_module_admin_links add constraint jc_module_admin_links_scope_check
  check (scope = any (array['community', 'events', 'bookings', 'pets', 'cats', 'cats_vol']));
alter table jc_hits drop constraint jc_hits_page_check;
alter table jc_hits add constraint jc_hits_page_check
  check (page = any (array['landing', 'events', 'courts', 'pets', 'cats', 'community', 'home', 'admin', 'stats']));

CREATE OR REPLACE FUNCTION public.jc_module_admin_link_create(p_scope text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_comm text; v_token text; v_exp timestamptz; v_id uuid;                  -- R4a-3: + v_id
begin
  v_comm := jc_assert_admin('community');
  -- R4a-3: + community, events
  if coalesce(p_scope, '') not in ('community', 'events', 'bookings', 'pets', 'cats', 'cats_vol') then raise exception 'BAD_SCOPE'; end if;  -- CC-1: + cats, cats_vol
  -- serializes creators for this community + scope (the open-link cap)
  perform pg_advisory_xact_lock(hashtext('jc_module_admin_link'), hashtext(v_comm || ':' || p_scope));
  -- R4a-3 (security M2): a community link is a root bearer token — at most 3 open, 24 h; other scopes 10, 72 h
  if (select count(*) from jc_module_admin_links
       where community_id = v_comm and scope = p_scope
         and used_at is null and revoked_at is null and expires_at > now())
     >= (case when p_scope = 'community' then 3 else 10 end) then
    raise exception 'TOO_MANY_LINKS';
  end if;
  v_token := translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_');
  insert into jc_module_admin_links (community_id, scope, token_hash, created_by, expires_at)
  values (v_comm, p_scope, encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid(),
          now() + case when p_scope = 'community' then interval '24 hours' else interval '72 hours' end)
  returning id, expires_at into v_id, v_exp;
  perform jc_admin_log_add(v_comm, 'module_admin_link', jsonb_build_object(
    'scope', p_scope, 'link_id', v_id, 'expires_at', v_exp));                    -- R4a-3: + link_id, expires_at
  return jsonb_build_object('token', v_token, 'scope', p_scope, 'expires_at', v_exp);
end;
$function$;

CREATE OR REPLACE FUNCTION public.jc_module_admin_revoke(p_scope text, p_user uuid, p_link uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_comm text; v_me uuid;                                                   -- R4a-3: + v_me
        v_grant boolean := false; v_code boolean := false; v_links int := 0;      -- R4a-3
begin
  -- R4a-3: removing a community admin is serialized per community (the last-admin guard below). The lock is taken
  -- BEFORE jc_assert_admin, which row-locks the caller's own grant: two admins removing each other then queue on
  -- the advisory lock (clean LAST_ADMIN) instead of deadlocking on each other's rows (database review M1).
  select o_user, o_community into v_me, v_comm from jc_me();
  if p_scope = 'community' and p_user is not null then
    perform pg_advisory_xact_lock(hashtext('jc_community_admins'), hashtext(v_comm));
  end if;
  v_comm := jc_assert_admin('community');
  -- R4a-3: + community, events
  if coalesce(p_scope, '') not in ('community', 'events', 'bookings', 'pets', 'cats', 'cats_vol') then raise exception 'BAD_SCOPE'; end if;  -- CC-1: + cats, cats_vol
  if (p_user is null) = (p_link is null) then raise exception 'BAD_FIELDS'; end if;
  if p_user is not null then
    delete from jc_module_admins where user_id = p_user and scope = p_scope and community_id = v_comm;
    v_grant := found;
    -- R4a-3: and their code unlock for this scope (one "Remove" ends both; the shared code itself is untouched)
    delete from jc_admin_grants where user_id = p_user and scope = p_scope and community_id = v_comm;
    v_code := found;
    if not (v_grant or v_code) then raise exception 'NOT_FOUND'; end if;
    if p_scope = 'community' then
      if jc_community_admin_count(v_comm) = 0 then
        raise exception 'LAST_ADMIN';                                             -- rolls the deletes back
      end if;
      v_links := jc_admin_links_cancel_by(p_user, v_comm);                       -- their open links die with them
    end if;
  else
    update jc_module_admin_links set revoked_at = now()
     where id = p_link and scope = p_scope and community_id = v_comm
       and used_at is null and revoked_at is null;
    if not found then raise exception 'NOT_FOUND'; end if;
  end if;
  perform jc_admin_log_add(v_comm, 'module_admin_revoke', jsonb_build_object(
    'scope', p_scope, 'user_id', p_user, 'link_id', p_link,
    'grant_removed', v_grant, 'code_unlock_removed', v_code,                       -- R4a-3
    'links_cancelled', v_links));                                                  -- R4a-3
  -- R4a-3: not via jc_module_admins_list — a community admin who just removed themselves (allowed while another
  -- remains) no longer passes its gate. Same payload either way.
  return jc_admins_payload(v_comm, p_scope);
end;
$function$;

CREATE OR REPLACE FUNCTION public.jc_module_admins_list(p_scope text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_comm text;
begin
  v_comm := jc_assert_admin('community');
  -- R4a-3: + community, events
  if coalesce(p_scope, '') not in ('community', 'events', 'bookings', 'pets', 'cats', 'cats_vol') then raise exception 'BAD_SCOPE'; end if;  -- CC-1: + cats, cats_vol
  return jc_admins_payload(v_comm, p_scope);                                     -- R4a-3 (body moved, + via / idle)
end;
$function$;

CREATE OR REPLACE FUNCTION public.jc_admin_module_label_set(p_module text, p_name_en text, p_name_ar text, p_title_en text, p_title_ar text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  c_lat  constant text := 'A-Za-z0-9À-ÖØ-öø-ɏ';
  c_ara  constant text := 'ء-غف-ي0-9٠-٩';
  c_builtin constant jsonb := '{"events": ["Events", "الفعاليات"], "bookings": ["Bookings", "Courts", "الحجوزات", "الملاعب"],
    "pets": ["Pets", "الحيوانات الأليفة"], "cats": ["Cats", "القطط"], "community": ["The Community", "Community", "المجتمع"]}';
  c_fixed constant text[] := array['Commons', 'Home', 'My Home', 'Admin', 'Organizer', 'Organizer Tools', 'Sign In',
    'Account', 'Settings', 'Help', 'Back', 'كومنز', 'الرئيسية', 'منزلي', 'الإدارة', 'التنظيم', 'أدوات المنظمين',
    'تسجيل الدخول', 'حسابي', 'الإعدادات', 'مساعدة', 'رجوع'];
  v_comm text;
  v_ne text := regexp_replace(jc_clean_line(p_name_en), ' {2,}', ' ', 'g');
  v_na text := regexp_replace(jc_clean_line(p_name_ar), ' {2,}', ' ', 'g');
  v_te text := regexp_replace(jc_clean_line(p_title_en), ' {2,}', ' ', 'g');
  v_ta text := regexp_replace(jc_clean_line(p_title_ar), ' {2,}', ' ', 'g');
  v_reserved text[];
  v_labels jsonb; v_entry jsonb;
begin
  v_comm := jc_assert_admin('community');
  if p_module is null or p_module not in ('events', 'bookings', 'pets', 'cats', 'community') then   -- CC-1: + cats
    raise exception 'BAD_MODULE';
  end if;
  if (v_ne is null) <> (v_na is null) then raise exception 'NAME_BOTH'; end if;
  if coalesce(char_length(v_ne), 0) > 14 or coalesce(char_length(v_na), 0) > 18
     or coalesce(char_length(v_te), 0) > 40 or coalesce(char_length(v_ta), 0) > 40 then
    raise exception 'TOO_LONG';
  end if;
  if v_ne !~ ('^[' || c_lat || '][' || c_lat || ' &''/.-]*$')
     or v_na !~ ('^[' || c_ara || '][' || c_ara || ' &''/.-]*$')
     or v_te !~ ('^[' || c_lat || '][' || c_lat || ' &''/.,:!?()-]*$')
     or v_ta !~ ('^[' || c_ara || c_lat || '][' || c_ara || c_lat || ' &''/.,:!?()،؟-]*$') then
    raise exception 'BAD_CHARS';
  end if;

  if v_ne is not null then
    select array_agg(lower(replace(x, ' ', ''))) into v_reserved
      from (select unnest(c_fixed) as x
            union all
            select jsonb_array_elements_text(b.value) from jsonb_each(c_builtin) b where b.key <> p_module) r;
    if lower(replace(v_ne, ' ', '')) = any(v_reserved) or lower(replace(v_na, ' ', '')) = any(v_reserved) then
      raise exception 'RESERVED_NAME';
    end if;
  end if;

  -- the lock must stay BEFORE the NAME_TAKEN read (two admins naming two modules alike serialize here)
  select module_labels into v_labels from jc_communities where id = v_comm for update;

  if v_ne is not null and exists (
       select 1 from jsonb_each(v_labels) e
        where e.key <> p_module
          and (lower(replace(e.value #>> '{name,en}', ' ', '')) = lower(replace(v_ne, ' ', ''))
               or replace(e.value #>> '{name,ar}', ' ', '') = replace(v_na, ' ', ''))) then
    raise exception 'NAME_TAKEN';
  end if;

  v_entry := jsonb_strip_nulls(jsonb_build_object(
    'name',  case when v_ne is not null then jsonb_build_object('en', v_ne, 'ar', v_na) end,
    'title', case when v_te is not null or v_ta is not null
                  then jsonb_strip_nulls(jsonb_build_object('en', v_te, 'ar', v_ta)) end));

  if v_entry = '{}'::jsonb then v_labels := v_labels - p_module;          -- reset to the built-in labels
  else v_labels := jsonb_set(v_labels, array[p_module], v_entry); end if;

  update jc_communities set module_labels = v_labels where id = v_comm;
  -- never the text; a short fingerprint makes a change traceable (security L2, as pets_group_set)
  perform jc_admin_log_add(v_comm, 'module_label_set',
    jsonb_strip_nulls(jsonb_build_object('module', p_module, 'reset', v_entry = '{}'::jsonb,
                       'ref', case when v_entry <> '{}'::jsonb then left(md5(v_entry::text), 8) end)));
  return v_labels;
end;
$function$;

CREATE OR REPLACE FUNCTION public.jc_snapshot_run(p_at timestamp with time zone DEFAULT now())
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare c record; v_bucket timestamptz := date_trunc('hour', p_at); n int := 0;
begin
  for c in select id, modules from jc_communities loop
    insert into jc_snapshots as s (community_id, module, bucket, metrics)
    values
    (c.id, 'homes', v_bucket, (
       select jsonb_build_object(
         'total', count(*),
         'occupied', count(*) filter (where exists (select 1 from jc_home_members m where m.home_id = h.id)),
         'pinned', count(*) filter (where h.lat is not null),
         'by_village', coalesce((select jsonb_object_agg(village_key, k) from
                (select village_key, count(*) k from jc_homes where community_id = c.id group by village_key) v), '{}'::jsonb))
         from jc_homes h where h.community_id = c.id)),
    (c.id, 'accounts', v_bucket, (
       select jsonb_build_object(
         'total', count(*),
         'joined_24h', count(*) filter (where a.joined_at > p_at - interval '24 hours'),
         'admins', (select count(distinct x.user_id) from (                                -- R4a-2: + module admins
                      select g.user_id from jc_admin_grants g
                       where g.community_id = c.id and g.last_used_at > p_at - interval '60 days'
                      union all
                      select ma.user_id from jc_module_admins ma
                       where ma.community_id = c.id and ma.scope <> 'cats_vol') x))   -- CC-1: volunteers aren't admins
         from jc_accounts a where a.community_id = c.id)),
    (c.id, 'events', v_bucket, jsonb_build_object(
       'enabled', (c.modules -> 'events' ->> 'enabled') is not distinct from 'true',
       'live_events', (select count(*) from jc_events e where e.community_id = c.id and e.status = 'live'),
       'entries_in', (select count(*) from jc_event_entries en join jc_events e on e.id = en.event_id
                       where en.community_id = c.id and e.status = 'live'
                         and en.status = 'in' and en.archived_at is null))),
    (c.id, 'bookings', v_bucket, jsonb_build_object(
       'enabled', (c.modules -> 'bookings' ->> 'enabled') is not distinct from 'true',
       'upcoming', (select count(*) from jc_bookings b where b.community_id = c.id
                     and b.status = 'booked' and b.starts_at > p_at),
       'next_24h', (select count(*) from jc_bookings b where b.community_id = c.id
                     and b.status = 'booked' and b.starts_at > p_at and b.starts_at <= p_at + interval '24 hours'),
       'created_24h', (select count(*) from jc_bookings b where b.community_id = c.id
                        and b.created_at > p_at - interval '24 hours'))),
    (c.id, 'pets', v_bucket, (
       select jsonb_build_object(
         'enabled', (c.modules -> 'pets' ->> 'enabled') is not distinct from 'true',
         'owned', count(*) filter (where p.kind = 'owned'),
         'strays', count(*) filter (where p.kind = 'stray'),
         'missing', count(*) filter (where p.missing))
         from jc_pets p where p.community_id = c.id and p.status = 'active')),
    (c.id, 'traffic', v_bucket, jsonb_build_object(
       'hour', v_bucket - interval '1 hour',
       'pages', coalesce((select jsonb_object_agg(page, count) from jc_hits
                           where community_id = c.id and hour = v_bucket - interval '1 hour'), '{}'::jsonb)))
    on conflict (community_id, module, bucket)
      do update set metrics = excluded.metrics, taken_at = now();
    n := n + 6;
  end loop;
  return n;
end;
$function$;
