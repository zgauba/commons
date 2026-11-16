# Pets care v2 PR 1 — database + security review (2026-11-15)

**Tier:** data (schema + 4 function bodies + rate bucket). Full rigor.
**Scope:** `supabase/commons/migrations/20261115120000_pets_care_v2.sql`, `tests/sql/s28_pets_care_v2.test.sql`,
`tests/sql/s4_pets.test.sql` (P07e now expects the auto 'state' row), client log renderers (`admin.js`, `pets.js`),
`pm_log_err_RATE_LIMITED` (EN + AR draft). Plan: `docs/plans/pets-care-v2.md`.
**Dry run (rolled back):** `ALL_TESTS_PASSED (1375 checks)` (1337 live + 38 new). Persistence check after: no `state` column,
bucket CHECK unchanged, live bodies unmarked, no `testville%` fixtures, 2 live log rows.

## database-reviewer — APPROVE WITH CHANGES

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | M | Rollback order: deleting state rows while the new `jc_admin_stray_save` is live can re-insert them | **Fixed** — header now restores bodies first; bucket list spelled out; notes the auto history is lost |
| 2 | M | `jc_rate_take`'s try-advisory-lock raises `RATE_LIMITED` on a concurrent double tap (Zee's mirroring extension) | **Accepted** — same for every bucket today; Manage allows one write at a time per tab |
| 3 | L | A → B → A within 10 min leaves one public "A" row | **Accepted** (true statement); pinned by CV05d |
| 4 | L | `drop constraint jc_rate_bucket_check` lacked `if exists` | **Fixed** |
| 5 | L | Community ceiling unlocked (overshoot by a few); depends on `jc_admin_log` never being pruned | **Accepted** — as R5d; no purge of `jc_admin_log` exists |
| 6 | L | `last_contact_at` ignores the viewer's sighting window | **Accepted** — organizers see every sighting already |
| 7 | — | Test gaps: 10-min boundary, same state + other fields, hidden-only contact, old / other-action ceiling rows, `state` without text | **Added** CV05b/c, CV02, CV09f, CV12c; `state` without text already covered by s27 QL02b |

Live rows (2: fed / note) satisfy the new CHECKs (verified by the dry run applying them).

## security-reviewer — APPROVE WITH CHANGES

| # | Sev | Finding | Disposition |
|---|---|---|---|
| M1 | M | Merge was same-author only: two admin accounts alternating could flood the public log (only the newest 20 rows show) | **Fixed** — any organizer's change within 10 min updates the newest auto row (author = latest); `jc_admin_log` keeps every save + actor. CV05a |
| L1 | L | Community ceiling 200/h needs ≥ 4 rogue accounts; NOT_FOUND probing uncounted (pre-existing) | **Accepted** |
| L2 | L | `greatest(max(seen_at))` if sightings accept client times | **Not applicable** — verified live: `jc_pet_sighting_add` takes no time; `seen_at` defaults to `now()` |

Confirmed: `jc_pet_get` care_log never returns `author`; `last_contact_at` never touches the reporter; all bodies keep
`security definer` + pinned `search_path`, `jc_assert_admin('pets')` first.

## Live apply (Zee "apply", 2026-11-15)

Applied in one transaction with its history row (`20261115120000 pets_care_v2`). Live suite: `ALL_TESTS_PASSED (1375 checks)`.
Advisors: authenticated 98 / anon 3 / RLS-no-policy 35 INFO — unchanged, no new lint kinds.

## code-reviewer (client) — APPROVE WITH CHANGES

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | M | The state-or-note rule was pasted into both `pets.js` and `admin.js` | **Fixed** — extracted `jcCareLogBody` + `JC_CARE_STATES` into `commons/assets/pet-photo.js` (loaded by both pages); `PE_CARE` now points at it |
| 2 | L | The care-state list existed three times | **Fixed** with 1 (pets.js `CARE` is the care-record items, a different list) |
| 3 | L | No test for an unknown `state` falling back to the note, or an AR render | **Accepted** — the fallback is the old note path, already covered |

Escaping, the `pmWrite` per-action error fallback (`jcErrTextFor` would otherwise fall back to the generic text), and
both new tests (fail without the change) confirmed.

## Tests

- Browser, full suite locally (all projects): **1358 passed** (before the extraction); after it, admin-pets + pets
  (both projects) **212 passed**, admin-pets again **82 passed**. CI runs the full suite.
- SQL: dry run 1375 (rehearsal) + 1375 (live, after apply).
