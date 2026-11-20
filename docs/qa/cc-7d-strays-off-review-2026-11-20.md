# CC-7d Strays off in Pets (DB) — reviews 2026-11-20

Migration `supabase/commons/migrations/20261120140000_cc7d_strays_off.sql` (JubailCommons). Plan:
`docs/plans/CC-community-cats.md` "CC-7 plan" (CC-7d). Applied only after CC-7c (no stray screen) is live on the CDN.

Tests: new `tests/sql/s39_strays_off.test.sql` (26 checks: ST01 no active stray + the 5 RPCs gone · ST02 jc_pets_list
owned only, strays / community → BAD_FILTER · ST03 a stray can't be restored, an owned pet still can · ST04 report
photos Cats-only (Pets admin never), stray photos unwritable · ST05 snapshot has no `strays` · ST06 owned-pet regression).
Reworked slices (fixtures that were strays made by the dropped RPCs are now direct inserts; sections testing removed
features deleted, every kept behaviour re-asserted): 00_grants, s4, s6, s13, s21, s23, s24, s26, s27, s28, s29, s30,
s31, s36, s38. Dry run (3 rolled-back chunks): **1857 checks** (was 1928) — 699 + 621 + 537; net −71 = removed
features (quick log, care record / state, stray editor, territory, Organizer Tools queue + its photo moves) + s39 +26.
Persistence check after the dry run: 9 active strays still, 5 old functions still there, no test residue, no history row.

## database-reviewer — no High
| # | Finding | Disposition |
|---|---|---|
| M1 | Apply only once CC-7c is live on the CDN (old code calls the dropped RPCs) | **Planned**: apply after #CC-7c merge + Pages deploy, verified by fetching the deployed `pets.js` / `admin.js` |
| M2 | Count drop verified by sampling; SR13-style isolation on the close path | Checked: s38 RP01h–j (other community: no list, no photo, NOT_FOUND on close) |
| L1 | `jc_pet_retire` writes no admin-log row (also why no moderation spike) | Accepted for test data; the migration header + raise notice record it. Real data would add a log row |
| L2 | Cached clients asking `jc_pets_list('strays')` get BAD_FILTER | Intended; e2e testers only, minutes |
| — | jc_pets_list / restorable / photo rules / snapshot bodies diffed against live: only the marked changes | Clean |

## security-reviewer — no High / Medium
| # | Finding | Disposition |
|---|---|---|
| L1 | `jc_admin_pets_list` still returned archived strays (territory pins, care notes) to Pets admins | **Fixed**: owned pets only (s28 CV09a/b) |
| L2 | Leftover stray branches (manage / photo_begin) reachable only if a stray is re-inserted by SQL | Accepted: no path creates an active stray; storage write is refused (s39 ST04h/i) |
| L3 | Pre-7a non-cat open reports are orphaned PII | Checked live: 3 reports, all cat, all closed — none |
| — | Report photos: reporter + Cats coordinators / community admins, Cats on only; Pets admins never; archived stray photos unreadable | Verified by both reviews; s39 ST04, s38 RP06l/l2, s30 P13c |

Test-rework agent's notes kept for the record: s24 V06 and s28 CV08 pin read paths on directly inserted *active* strays
(unreachable live) — kept as regression pins on code the migration keeps on purpose.
