-- TARGET PROJECT: JubailCommons (qrpxfssdeeuzmsmlbtbu) — NEVER SignalPost.
-- Pets quick log (stray-care review fix 2, Zee 2026-11-15): a pets admin logs "Fed" or "Vet visit" with one tap —
-- the note becomes optional for those two kinds. "Note" and "Status change" still need text (they ARE the text).
--
--   jc_pet_care_log.note   NOT NULL + 1..280  →  null allowed only when kind is fed / vet; otherwise 1..280 as before
--   jc_admin_pet_care_add  an empty / blank note for fed / vet is stored as null (never ''); note / state → BAD_FIELDS
--
-- Readers: jc_pet_get is the only function that reads the log; it returns note as-is (null for a quick log). Both
-- clients already skip an empty note (admin.js Manage log, pets.js animal page). Signature unchanged: grants carry over.
-- Body = the live body (pg_get_functiondef, 2026-11-15) + the marked lines.
--
-- Rollback, in this order:
--   1. delete from jc_pet_care_log where note is null;   (or update them to a text such as 'Fed')
--   2. drop constraint jc_pet_care_log_note_check; alter column note set not null;
--      add constraint jc_pet_care_log_note_check check (char_length(note) between 1 and 280);
--   3. restore the jc_admin_pet_care_add body from 20261104000000_s4_pets.sql — only after 1–2 (db review L2).

alter table public.jc_pet_care_log drop constraint if exists jc_pet_care_log_note_check;
alter table public.jc_pet_care_log alter column note drop not null;
alter table public.jc_pet_care_log add constraint jc_pet_care_log_note_check
  check (case when note is null then kind in ('fed', 'vet') else char_length(note) between 1 and 280 end);

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
  if not exists (select 1 from jc_pets where id = p_pet and community_id = v_comm and kind = 'stray' and status = 'active') then
    raise exception 'NOT_FOUND';
  end if;
  insert into jc_pet_care_log (community_id, pet_id, author, kind, note)
  values (v_comm, p_pet, auth.uid(), p_kind, v_note);
  perform jc_admin_log_add(v_comm, 'pet_care_add', jsonb_build_object('pet_id', p_pet, 'kind', p_kind));
  return jsonb_build_object('pet_id', p_pet, 'logged', true);
end;
$$;
