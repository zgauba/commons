# CC-4 Cats visits + sightings — reviews (2026-11-18)

Migration `supabase/commons/migrations/20261118220000_cc4_cat_visits_sightings.sql` + slice `tests/sql/s35_cat_visits_sightings.test.sql`.
Tier: data / auth / PII (full rigor). Zee pre-authorised apply + merge for CC-4 only (chat, 2026-11-18).

## Dry run
- Before reviews: `ALL_TESTS_PASSED (1753 checks)` (live was 1691).
- After review fixes: **`ALL_TESTS_PASSED (1761 checks)`**. Persistence check after each: no CC-4 tables / functions, no `testville35*`
  communities or `@s35.test` users, `jc_snapshot_run` body hash unchanged (`4c1492b1…`).

## Database review (database-reviewer) — no High
| # | Finding | Disposition |
|---|---|---|
| M1 | Cursor `at < p_before` loses rows tied on `at` (backdated visits all sit at 12:00); JS Date would also cut microseconds | **Fixed**: keyset cursor `(at, id)` via new `p_before_id`; order `at desc, id desc`; the page sends the `at` string back as received. Test CV03o/p (3 tied visits across a page boundary) |
| M2 | Every page scans + sorts the whole history (computed `at`, no index serves the sort) | **Accepted for now**: ~124 homes, a few visits a day → milliseconds for the first year or two. Revisit: stored `at` column + `(community_id, at desc, id desc)` index when history passes a few thousand rows (noted in the plan) |
| L3 | `jc_cat_log_json` per row (~200 point lookups a page) | Accepted |
| L4 | `5.0` counts → raw cast error | **Fixed** (`::numeric::int`) |
| L5 | An author who hides their entry can't see it to show it again | **Fixed**: authors see their own hidden entries |
| L6 | A sighting logged against a cat could be relinked / unlinked | **Fixed**: only sightings logged with a description (not identified then) can be linked / relinked / unlinked (`NO_CAT`); test CV02k |
| L7 | No index on `jc_cat_sightings.area_id` / user FKs | Accepted (small tables) |
| — | Rollback leaves `cat_log_hide` / `cat_sighting_link` admin-log rows | Accepted (harmless; no action allow-list) |

## Security review (security-reviewer) — no High
| # | Finding | Disposition |
|---|---|---|
| M1 | Author could undo a coordinator's hide within 24 h | **Fixed**: a non-coordinator only shows again what they hid themselves; `can_hide` false otherwise. Tests CV03m/n |
| L1 | `jc_cat_sighting_link` checked admin before module | **Fixed**: `jc_cat_reader()` (module, then role) first |
| L2 | `5.0` counts / `1e400` lat → raw errors | **Fixed** (cast + guarded lat/lng → `BAD_FIELDS`); test in CV05a |
| L3 | `cats` array unbounded before the cast | **Fixed**: > 200 entries → `BAD_FIELDS` up front; test in CV05a |
| L4 | `p_kind` null fell through in `jc_cat_log_hide` | **Fixed**; test in CV05a |
| Info | Rate limit taken after validation; failures roll the counter back | No change |

Confirmed fine by both: every RPC gated by module + Cats role (community admins pass), every id scoped to the caller's community (no
existence oracle), no user ids / emails in reads, hidden entries for coordinators (+ author), station JSON is a subset of what
volunteers already see in `jc_cat_programme`, admin log holds ids only, STABLE functions don't write (G20), RLS on + no grants on the
3 tables, merge history gathered one level deep.

## Done-when → tests
| Plan check | Test |
|---|---|
| 1 visit with recognised cats + problem → Activity + cats' history | CV01 |
| 2 unidentified sighting → linked → on the cat (also through a merge) | CV02 |
| 3 residents nothing new; `cats_vol` no other gate; coordinator without `cats_vol` logs | CV03 (+ s32 CF03/CF04 unchanged) |
| 4 module off → `MODULE_OFF`; pets retention leaves cat entries | CV04 |
