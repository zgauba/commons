-- TARGET PROJECT: JubailCommons (qrpxfssdeeuzmsmlbtbu) — NEVER SignalPost.
-- B-1 (plan docs/plans/B-1-bookings-football.md, Zee 2026-11-16): Courts → Bookings gains a third kind,
-- **football** (never "soccer"). jc_facilities_kind_check: tennis | basketball → tennis | basketball | football.
-- Widening only: no function lists kinds (live check: pg_proc.prosrc ~* 'tennis|basketball' = 0 functions);
-- jc_admin_facility_save maps the CHECK violation to BAD_FIELDS as before.
-- Versioned after 20261117090000_soft_archive so history stays in order (applied 2026-11-16).
--
-- Rollback (manual): delete football facilities AND their bookings + court hours first (retiring is not enough: the
-- row keeps kind 'football'; the FKs from jc_bookings / jc_court_hours restrict the delete), then
--   alter table public.jc_facilities drop constraint jc_facilities_kind_check,
--     add constraint jc_facilities_kind_check check (kind in ('tennis', 'basketball'));

set local lock_timeout = '3s';   -- ACCESS EXCLUSIVE on a 3-row table: fail fast rather than queue behind a stuck session

do $g$
begin
  if exists (select 1 from public.jc_facilities where kind not in ('tennis', 'basketball', 'football')) then
    raise exception 'B-1: jc_facilities has rows of another kind; migrate them first';
  end if;
end
$g$;
alter table public.jc_facilities
  drop constraint jc_facilities_kind_check,
  add constraint jc_facilities_kind_check check (kind in ('tennis', 'basketball', 'football'));
