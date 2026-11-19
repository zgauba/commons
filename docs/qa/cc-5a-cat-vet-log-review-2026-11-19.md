# CC-5a — Cats vet log (DB) — review 2026-11-19

Migration `supabase/commons/migrations/20261119180000_cc5_cat_vet_log.sql` (JubailCommons `qrpxfssdeeuzmsmlbtbu`), test
slice `tests/sql/s37_cat_vet_log.test.sql`. Plan: `docs/plans/CC-community-cats.md` → "CC-5 plan" (Zee approved
2026-11-19; apply + merge pre-authorised for CC-5).

## What it does
- New `jc_cat_vet_visits` + `jc_cat_vet_cats` (RLS on, no policies, RPC-only, kept forever).
- New `jc_cat_vet_add` (Cats coordinators + community admins; rate bucket `cat_log`; logged to `jc_admin_log` as ids only).
- `jc_cat_activity`, `jc_cat_log_hide`, `jc_cat_log_json` gain kind `vet` (never in a station's list; hide = coordinators).
- `jc_cat_json` gains `vaccinated` + `invoices` (everyone, residents included) and `vaccines` (programme).
- Replaced bodies were md5-checked against live before editing (all four matched the repo files).

## Dry run (always rolled back)
- 3 sequential chunks (the single run exceeds the API gateway's ~2 min limit): 614 + 689 + 561 = **1864 checks** (was 1792;
  s37 adds 72). Persistence check after: no `jc_cat_vet_add`, no `jc_cat_vet_*` tables, no `testville3*` communities,
  `jc_cat_json` md5 unchanged, last migration still `20261119140000`.
- Test edits outside s37: `00_grants` allowlist + `jc_cat_vet_add`; `s34` resident key list + `vaccinated`, `invoices`.

## Done when → tests
| # | Check | Test |
|---|---|---|
| 1 | Coordinator logs a vet visit for 2 cats; it shows in Activity (Vet) and on both cats, vaccines show given + next due | s37 VT01 |
| 2 | Residents' ✓ only while rabies is current (due today ✓, yesterday ✗, no due date 365 days ✓ / 366 ✗, hidden ✗, latest decides, core only ✗, merged counts); resident keys exact; shared invoices only | s37 VT02 |
| 3 | Volunteers: facts yes, unshared invoice / link no, can't log or hide; only Drive file / folder and Docs / Sheets / Slides links | s37 VT03 |
| 4 | Module off → MODULE_OFF | s37 VT04 |
| 5 | Bad input, rate limit, admin log ids only; paging 55+ entries without loss or repeats | s37 VT05, VT06 |
| — | Regression: visits + sightings unchanged | s35 green, unchanged |

## database-reviewer — no High
| Finding | Disposition |
|---|---|
| M1 `vaccines` kept one row per class, so two different "other" vaccines (FeLV, FIV) collapsed | **Fixed**: distinct per class, and per name for `other`; test VT01j |
| M2 Test gaps: keyset paging with vet entries, hidden visibility, merged-cat activity / dedupe / vaccines, community admin hide | **Fixed**: VT06 (paging), VT02o2–o4, VT02q–s |
| L1 365-day boundary unpinned; tests used the same tz lookup as the code | **Fixed**: day 365 counts (`>=`), VT02h2; test community on `Pacific/Kiritimati` (UTC+14), today stated not looked up |
| L2 Rollback header incomplete | **Fixed**: CREATE OR REPLACE note, test reverts, admin-log rows stay, tables drop = records gone |
| L3 Hide locked the row before the vet coordinator check | **Fixed**: check moved before the select |
| L4 `jc_cat_json` cost; `invoices` unbounded per cat | **Accepted**: ~40 cats, a few visits each; cap if payloads grow |
| L5 Non-short-circuit OR | Checked by reviewer, no failing path (array checks already split out) |
| L6 `logged_name` survives account deletion; unindexed `logged_by` / `hidden_by` | **Accepted**: same as CC-4 tables (plan decision 3); scrub list if names are ever scrubbed |

## security-reviewer — no High, no Medium
| Finding | Disposition |
|---|---|
| L1 Any Google-hosted path (viewer proxy, Forms) could be shared to residents as an "invoice" | **Fixed**: links limited to `drive.google.com/file/d/`, `/open?id=`, `/drive/(u/N/)folders/` and `docs.google.com/(document\|spreadsheets\|presentation)/d/`; VT03h adds viewer, Forms, `@evil`, no path, trailing newline, `/uc`. App side (CC-5b): `rel="noopener noreferrer"`, opens in a new tab, labelled as Google Drive |
| L2 A merge could land between the cat check and the insert | **Fixed**: `for share` on the cat check |
| Note: residents see `done` (e.g. sterilisation) on shared invoices | **Accepted** (Zee's decision); CC-5b says so beside the Shared tick |
| Note: `logged_name` retained | Accepted (as CC-4) |

## Apply (Zee pre-authorised apply + merge for CC-5, 2026-11-19)
- Applied in one transaction with its history row: `20261119180000 cc5_cat_vet_log`.
- Live suite after apply (no migration argument, 3 rolled-back chunks): 614 + 689 + 561 = **1864 checks** green — s37
  VT01–VT06 all ran against the live schema.
- Live: 2 `jc_cat_vet_*` tables; `jc_cat_vet_add` executable by `authenticated`, not `anon`; no `testville3*` left.
- Advisors: no new lint kinds (new rows only under existing kinds: `rls_enabled_no_policy` ×2 — RPC-only by design,
  `authenticated_security_definer_function_executable` ×1, `unindexed_foreign_keys` ×2 `logged_by` / `hidden_by`,
  `unused_index` ×1 — no traffic yet).
