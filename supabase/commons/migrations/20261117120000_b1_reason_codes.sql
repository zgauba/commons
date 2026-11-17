-- TARGET PROJECT: JubailCommons (qrpxfssdeeuzmsmlbtbu) — NEVER SignalPost.
-- B-1 follow-up F1 (docs/plans/B-1-bookings-football.md, Zee 2026-11-17).
-- 1. Cancel reasons the SERVER writes become codes the app words in EN/AR (they were English sentences saying
--    "Court", shown raw to residents even in Arabic):
--      jc_admin_facility_status: 'Court no longer available'     -> 'PLACE_RETIRED'
--                                'Court temporarily unavailable' -> 'PLACE_UNPUBLISHED'
--      jc_admin_block_create:    'Court blocked: ' || reason     -> 'BLOCKED: ' || reason (organizer's own words kept)
--    Organizer-typed reasons (jc_admin_booking_cancel) stay free text. jc_home_vacated keeps 'Household left'
--    (its home has no bookings list any more; the app words the legacy text too).
--    Existing rows: live had 0 bookings with a cancel_reason on 2026-11-17; the UPDATE below converts any anyway.
-- 2. jc_admin_module_label_set: Bookings' built-in names are now Bookings / الحجوزات (B-1 renamed the section);
--    the old Courts / الملاعب stay reserved too, so no OTHER section can take either (two equal names in the bar).
-- Bodies are the live ones (pg_get_functiondef, 2026-11-17) with only the marked literals changed.
-- CREATE OR REPLACE keeps owners, grants and SECURITY DEFINER; signatures unchanged.
-- Rollback: re-create the three functions from their previous migration bodies (git history of this repo);
--   the UPDATE is reversible by the same mapping.

CREATE OR REPLACE FUNCTION public.jc_admin_facility_status(p_facility uuid, p_status text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_comm text; v_from text; v_ids uuid[] := '{}';
begin
  v_comm := jc_assert_admin('bookings');
  select status into v_from from jc_facilities where id = p_facility and community_id = v_comm for update;
  if v_from is null then raise exception 'NOT_FOUND'; end if;
  if not ((v_from = 'draft' and p_status in ('published', 'retired'))
          or (v_from = 'published' and p_status in ('draft', 'retired'))) then          -- R4a: + draft
    raise exception 'BAD_STATE';
  end if;
  update jc_facilities set status = p_status where id = p_facility;
  if p_status = 'retired' then
    v_ids := jc_bookings_cancel_range(p_facility, null, now(), 'infinity', 'PLACE_RETIRED'      /* B-1 F1: was 'Court no longer available' */);
  elsif v_from = 'published' and p_status = 'draft' then                             -- R4a
    v_ids := jc_bookings_cancel_range(p_facility, null, now(), 'infinity', 'PLACE_UNPUBLISHED'  /* B-1 F1: was 'Court temporarily unavailable' */);
  end if;
  perform jc_admin_log_add(v_comm, 'facility_status', jsonb_build_object(
    'facility_id', p_facility, 'status', p_status, 'bookings_cancelled', to_jsonb(v_ids)));
  return jc_admin_facilities_list();
end;
$function$;

CREATE OR REPLACE FUNCTION public.jc_admin_block_create(p_facility uuid, p_starts timestamp with time zone, p_ends timestamp with time zone, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_comm text; v_reason text; v_id uuid; v_ids uuid[];
begin
  v_comm := jc_assert_admin('bookings');
  if char_length(p_reason) > 400 then raise exception 'REASON_REQUIRED'; end if;
  v_reason := jc_clean_line(p_reason);
  -- R4a-2: 185, not 200 — the copied cancel reason adds a prefix (B-1 F1: 'BLOCKED: ', 9 chars; was 15)
  if v_reason is null or char_length(v_reason) not between 3 and 185 then raise exception 'REASON_REQUIRED'; end if;
  if p_starts is null or p_ends is null or not isfinite(p_starts) or not isfinite(p_ends)
     or p_ends <= p_starts or p_ends <= now() or p_ends - p_starts > interval '31 days' then
    raise exception 'BAD_FIELDS';
  end if;
  -- FOR UPDATE (not SHARE): waits for in-flight bookings to commit so the cancel below
  -- sees them, and makes later bookings wait until this block is visible
  perform 1 from jc_facilities where id = p_facility and community_id = v_comm and status <> 'retired' for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  insert into jc_booking_blocks (community_id, facility_id, starts_at, ends_at, reason, created_by)
  values (v_comm, p_facility, p_starts, p_ends, v_reason, auth.uid())
  returning id into v_id;
  v_ids := jc_bookings_cancel_range(p_facility, null, greatest(p_starts, now()), p_ends, 'BLOCKED: ' || v_reason   /* B-1 F1: a code the app words in EN/AR */);
  perform jc_admin_log_add(v_comm, 'block_create', jsonb_build_object(
    'block_id', v_id, 'facility_id', p_facility, 'starts_at', p_starts, 'ends_at', p_ends,
    'bookings_cancelled', to_jsonb(v_ids)));
  return jsonb_build_object('block_id', v_id, 'bookings_cancelled', cardinality(v_ids));
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
    "pets": ["Pets", "الحيوانات الأليفة"], "community": ["The Community", "Community", "المجتمع"]}';
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
  if p_module is null or p_module not in ('events', 'bookings', 'pets', 'community') then
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

update jc_bookings set cancel_reason = case
    when cancel_reason = 'Court no longer available' then 'PLACE_RETIRED'
    when cancel_reason = 'Court temporarily unavailable' then 'PLACE_UNPUBLISHED'
    else 'BLOCKED: ' || substr(cancel_reason, 16) end
 where cancel_reason in ('Court no longer available', 'Court temporarily unavailable')
    or cancel_reason like 'Court blocked: %';
