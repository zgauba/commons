# CC-7a Cats reports queue (DB) — reviews 2026-11-20

Migration `supabase/commons/migrations/20261120100000_cc7a_cat_reports.sql` (JubailCommons). Tests: new
`tests/sql/s38_cat_reports.test.sql` (64 checks); edited `s29`, `s30` (Cats-on fixtures, cat-only reports), `s13` (H07a
allow-list + `jc_cat_report_close`), `00_grants` (+2 RPCs). Plan: `docs/plans/CC-community-cats.md` "CC-7 plan".

Dry run (3 rolled-back chunks): **1928 checks** (was 1864) — 625 + 651 + 652. Persistence check after the dry run:
no new functions, no `cat_id` column, no constraints, no test communities / users, no history row.

## Done-when → tests
| Plan check | Test |
|---|---|
| 1 report reaches the Cats queue; coordinator / community admin yes, volunteer / Pets admin / resident / other community no | s38 RP01a–j, RP06i–l |
| 2 "Add as new cat": photo → cat, one sighting at the pin, My reports shows the cat | s38 RP02a–i, RP06a |
| 3 "Already known": link + one sighting, retry adds nothing | s38 RP03a–j, RP06h, RP06m |
| 4 Cats off → MODULE_OFF; Pets off with Cats on still works | s38 RP04a–g, s29 SR05, s30 P02c / P13c |

## security-reviewer — no High
| # | Finding | Disposition |
|---|---|---|
| M1 | Close copied the resident's `place` text (and the pin) into a permanent sighting volunteers read | **Fixed**: the sighting has no note — nothing the resident typed is copied (s38 RP02d asserts note + description null). The pin stays: it is where the cat was seen, the sighting's purpose |
| M2 | Report privacy / consent copy still says "Pets organizers", and "add or match" (photo moves only on "added" now) | **CC-7b** (app strings, EN + AR) — must ship with the new report screen |
| L1 | Photo move to the public cat profile; EXIF stripped by canvas resize (inferred) | Accepted: unchanged Pets behaviour, disclosed at Send. EXIF: `jcPetPhotoShrink` re-encodes through a canvas (no metadata) — unchanged code |
| L2 | Admin log holds ids only | Fine (s38 RP02e/f) |
| L3 | Older non-cat open reports in the Cats queue | **Fixed** with db M1 below |
| — | Pets admins keep the old queue (home + number) until CC-7d | Accepted: transition, `e2e` only, Organizer Tools screen removed in CC-7c, RPCs dropped in CC-7d |

## database-reviewer — no High
| # | Finding | Disposition |
|---|---|---|
| M1 | Non-cat open reports queueable / closable onto a cat | **Fixed**: list + close filter `species = 'cat'` (s38 RP06d/e) |
| M2 | Legacy Organizer Tools close links a Pets stray on these rows; its retry guard can return a false OK | Accepted for the transition (header note); gone in CC-7c (screen) / CC-7d (RPC) |
| M3 | `place` copied into a permanent sighting | **Fixed** (same as security M1) |
| L1 | Retry with the survivor's id after a merge → ALREADY_CLOSED | **Fixed**: the survivor counts as the same cat (s38 RP06h) |
| L2 | Cached clients sending species dog get BAD_FIELDS | Intended (D1) |
| L3 | Can link a deceased / adopted cat | Accepted (a coordinator's call) |
| L4 | `FOR UPDATE` on the cat for "known" too | Kept: consistent with every other cat write |
| Gaps | cap boundary 3→4, pending upload at close, retention after close, expired, non-cat, archived area, bad show, volunteer "added", one log row per retry, coordinator read with Cats off, Pets-admin transition read | **Added**: s38 RP06a–n |
| Gap | reverse race order (Cats close first, then legacy close) | Not added: the legacy close's behaviour there is the accepted M2 quirk; removed in CC-7d |
