-- TARGET PROJECT: JubailCommons (qrpxfssdeeuzmsmlbtbu) — NEVER SignalPost.
-- Hotfix (2026-11-16): jc_admin_stray_reports_list was STABLE, but jc_assert_admin writes
-- last_used_at. PostgREST runs STABLE RPCs read-only, so every organizer load failed with 405
-- ("Couldn't load reports"). Body, grants and definer are unchanged; only volatility.
-- Guard: tests/sql/00_grants.test.sql G20.
alter function public.jc_admin_stray_reports_list(text) volatile;
