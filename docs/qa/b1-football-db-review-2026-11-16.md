# B-1 DB (football kind) — database + security review, 2026-11-16

Migration `supabase/commons/migrations/20261117100000_b1_football_kind.sql` (JubailCommons `qrpxfssdeeuzmsmlbtbu`):
`jc_facilities_kind_check` tennis | basketball → tennis | basketball | football. Never "soccer" (Zee 2026-11-16).
Plan: `docs/plans/B-1-bookings-football.md`. Tier 3 (schema).

Dry run (whole suite, rolled back): **1552 checks** (was 1549). Persistence check after the first run: CHECK unchanged
live, 0 football rows, 0 `testville%` communities, no history row. Live history order: last applied `20261117090000`.

## database-reviewer — nothing material (confidence 0.85)
| # | Sev | Finding | Disposition |
|---|---|---|---|
| D1 | Low | ACCESS EXCLUSIVE could queue behind a stuck session | **Fixed**: `set local lock_timeout = '3s'` |
| D2 | Low | Rollback note said "retire / delete"; retiring keeps kind 'football', and FKs from `jc_bookings` / `jc_court_hours` restrict the delete | **Fixed**: note now says delete facilities + bookings + hours first |
| D3 | Low | K01e (soccer → BAD_FIELDS) would also pass if refused for another reason | **Fixed**: K01f direct insert of 'soccer' expects check_violation |
| D4 | Info | Version ordering vs soft_archive | **Checked**: live last version `20261117090000` < `20261117100000` |
Confirmed: `jc_admin_facility_save` maps check_violation → BAD_FIELDS (nf1 lines 74-77); no NOT VALID needed (widening, 3 rows).

## security-reviewer — no material findings (confidence 0.9)
No grant, RLS, function or signature change; the save asserts a bookings admin and takes the community from that, not the
payload; kind is bound statically (no dynamic SQL). Test codes are `S17-*` placeholders on synthetic `testville17`
communities. Note for the app PR: render the kind via the strings dictionary / escaped text — **carried to B-1 app PR**.
