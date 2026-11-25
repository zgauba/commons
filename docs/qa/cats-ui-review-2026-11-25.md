# Cats UI review — 2026-11-25

**Scope:** Commons Cats module (`commons/cats/`): Cats, Activity, Reports, Stations and Areas tabs, the cat page, the report form and My reports, as resident, volunteer and coordinator, EN + AR.
**Method:** `/shot sweep cats` (86 tests, 86 pictures, all passed) → 22 pictures read (one or more per screen group, every Arabic screen group) → `ui-design-review:ui-review` against `docs/design.md` → each finding confirmed in code.
**Reviewer:** Claude (builder). Code review + evaluator below.

## Findings

| # | Severity | Where | Finding | Disposition |
|---|---|---|---|---|
| 1 | Should fix | Activity → feeding visit with a problem (`cats/log.js`) | "Problem: Bowl broken" used `.notice` (accent green): looks like success and like the role line. A broken bowl is a heads-up (design.md: `--jc-warn` heads-up/due) | **Fixed**: `.caProblem` border + label in `--jc-warn` (`cats/cats.css`) |
| 2 | Should fix | Areas tab; feeding-visit counts | "1 active stations" seen; "1 cats seen" / "1 kittens" by the same code | **Fixed**: `_1` keys (EN + AR) like `ca_pin_cat`; "unfamiliar" has no plural form, unchanged |
| 3 | Should fix | My reports (`cats/report.js`) | "Reports are deleted 30 days…" touched the card above (nothing-touches rule); the Reports tab's same line was spaced | **Fixed**: `#rpMineBox` joins the shared `.jcstack` (12px gap) |
| 4 | Should fix | Cats tab, coordinator | Add a cat was full width; Add a station and Log activity are compact — two styles for one job | **Fixed**: `.acts` like Add a station |
| 5 | Should fix | Vet entry (`cats/vet.js`) | "Open the document (Google Drive)" was an underlined link in a button border; "Open in Google Maps" beside it is a plain link | **Fixed**: plain link |
| 6 | Zeeshan's call | Cats tab, residents | "The cat programme is moving here step by step." panel sat between the cats and the stray report, looking like content | **Fixed**: deleted (Zeeshan, 2026-11-25), markup + EN/AR strings |
| 7 | Nice to have | Activity entry | Hidden and Not identified yet chips stacked one per line | **Fixed**: one `.head` row for a sighting |
| 8 | Nice to have | Cat page Status / fact lines | A wrap could start a line with "· Lead feeder" | **Fixed**: the joiner holds the dot to the word before it (` · `) |

**Checked, not findings:** the Stations sort row has no "By Number" for Cats: by design (strings.js: By Number is Events only; residents never see station IDs). Errors at the top of the page (Areas archive, location off) follow design.md "Message line: one per screen, under the title". The Edit pill beside a cat's name is the shared hero `afterNameHtml` pattern Pets uses too. The coordinator's 5-tab row fits at iPhone 13 width.

**Screens the sweep did not reach** (tests end after Save): the open station editor, cat editor, sighting form, EN vet form, photo viewer; the 5-tab row at 320px. Not covered by this PR; the 320px tab row belongs with the Organizer Tools clipping item (cross-module).

## Tests
- Cats specs (`cats`, mobile): 89 / 89 passed (86 before + 3 new). `strings-parity` + `a11y`: 32 / 32. Design guard: OK.
- Every new or changed assertion was run against main's `commons/` and failed there (3 new tests, the `#caSoon` check, the My reports gap), then passed on the branch.
- After-pictures (re-sweep, 89 pictures): amber problem line, chips in one row, My reports spaced, compact Add a cat, notice gone.
