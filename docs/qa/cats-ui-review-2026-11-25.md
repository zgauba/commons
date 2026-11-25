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

**Round 2 additions (after evaluator round 1):** the shared `.notice.warn` (app.css + design.md State boxes) replaces the Cats-only `.caProblem` colour rules (code-reviewer LOW 1); the `#caSoon` check now waits for the tab body (`#rpOpen`), so it fails on main; specs write proof pictures under `SHOT_DIR`. After round 2: the #4 + #8 test waits for Add a cat before measuring, and the dot check reads the raw text. Final local run: 121 / 121 (cats, cats-reports, strings-parity, a11y); 5 / 5 repeats of the #4 + #8 test; with only the old joiner restored, the #8 assertion fails.

## Code review (code-reviewer, HEAD ff0c7c7)
Verdict APPROVE · CRITICAL 0 · HIGH 0 · MEDIUM 0 · LOW 2. Plan conformance: findings 1–8 all FOLLOWED (log.js:84/91–93, cats.js:216/335/448/487, report.js:185, vet.js:19, strings.js EN + AR).

| Finding | Severity | Disposition |
|---|---|---|
| Amber heads-up declared in two modules (`cats.css .caProblem` vs `pets.css .seenbox b`) | LOW | **Fixed**: shared `.notice.warn` in `app.css`, recorded in design.md State boxes; Cats rules removed. `.seenbox` (2px state box) left as is |
| Add-a-cat test asserts width < half the viewport: a proxy for "compact" | LOW | **Accepted**: it fails on main (354 px vs < 195) and the picture shows the button matches Add a station |

## Evaluator

### Round 1 (interim), HEAD ff0c7c7, contract 20fe926d — NOT READY
| # | Verdict | Evidence (short) |
|---|---|---|
| 1 | PASS | test ✓; fails on main (`rgb(242, 179, 60)` vs `rgb(62, 155, 118)`); picture amber |
| 2 | PASS | test ✓ + parity; fails on main ("1 active stations") |
| 3 | FAIL | test ✓ and fails on main, but no picture exists |
| 4 | FAIL | test ✓ and fails on main, but no picture exists |
| 5 | PASS | test ✓; fails on main (`mini`) |
| 6 | FAIL | named test passes on main's code too: the check ran before the body drew |
| 7 | FAIL | test ✓, but no picture of a hidden sighting |
| 8 | PASS | the volunteer test's tightened regex fails on main |
| 9 | CI-LATER | local 121 passed; design guard OK |
`EVALUATOR: NOT READY head=ff0c7c7cb005d580fda005724148160ffff76e15 contract=20fe926d`

### Round 2 (interim), HEAD d69fa0d, contract 20fe926d — NOT READY
| # | Verdict | Evidence (short) |
|---|---|---|
| 1 | PASS | test ✓; fails on main; picture cats-problem-amber |
| 2 | PASS | test ✓ + parity; fails on main |
| 3 | PASS | test ✓; fails on main (gap 0); picture cats-my-reports |
| 4 | FAIL | `TypeError: Cannot read properties of null (reading 'width')`: boundingBox() before #caAddCat drew |
| 5 | PASS | test ✓; fails on main |
| 6 | PASS | test ✓; fails on main (`#caSoon` 1); grep clean; picture cats-resident-list |
| 7 | PASS | test ✓; fails on main (chips 1 vs 2); picture cats-hidden-chips |
| 8 | FAIL | same test as row 4 stopped before its Status assertions |
| 9 | FAIL | local 1 failed, 120 passed (the row 4/8 test) |
`EVALUATOR: NOT READY head=d69fa0d2f866ccbab7d25fb721fd987740bce3c4 contract=20fe926d`

### Round 3 (final), HEAD 249565a, contract 20fe926d — READY
| # | Check (short) | Verdict | Evidence |
|---|---|---|---|
| 1 | Feeding visit's Problem line is amber (`--jc-warn`), not accent green | PASS | Branch: `cats.spec.js:1337` ✓ (121 passed). Computed border equals `--jc-warn`, differs from `--jc-accent`. Main: `Expected: "rgb(242, 179, 60)" Received: "rgb(62, 155, 118)"`. Picture cats-problem-amber.png: amber border and amber "Problem:" |
| 2 | Singulars "1 active station / 1 cat seen / 1 kitten" (EN + AR) | PASS | Branch: `cats.spec.js:1323` ✓ + 5 strings-parity ✓; `_1` keys in EN and AR. Main: "1 active stations"; probe of the visit line on main: "1 cats seen · 1 unfamiliar · 1 kittens" |
| 3 | My reports: the "deleted 30 days" line never touches the card above | PASS | Branch: `cats-reports.spec.js:289` ✓ (gap ≥ 8px). Main: `Expected >= 8, Received 0`. Picture cats-my-reports.png: clear gap |
| 4 | Add a cat is the compact primary button | PASS | Branch: `cats.spec.js:1361` ✓. Main: `Expected < 195, Received 354`. Picture cats-add-cat-compact.png: compact green button, about a third of the width |
| 5 | Vet "Open the document (Google Drive)" is a plain link, no `mini` | PASS | Branch: `cats.spec.js:1091` ✓. Main: `Received string: "mini"` |
| 6 | "Moving here step by step" notice gone (markup + EN/AR strings) | PASS | Branch: `cats.spec.js:84` ✓. Main: `#caSoon Expected 0 Received 1`. grep for `ca_soon`/"moving here"/AR text in commons: none. Picture cats-resident-list.png: no notice |
| 7 | A hidden sighting's Hidden + Not identified yet chips sit in one row | PASS | Branch: `cats.spec.js:1337` ✓. Main probe of the #7 assertion alone: `.head .chip Expected 2 Received 1`. Picture cats-hidden-chips.png: both chips on one line |
| 8 | A wrapped Status line never starts with "·" | PASS | Branch: `cats.spec.js:1361` ✓ (raw-text regex: no plain space before a dot, at least one no-break space). Main probe of the #8 assertion alone: `Received "In the community · 15 Nov 2026 · ⁨Lead feeder⁩"` (plain spaces) |
| 9 | Regression: cats, cats-reports, strings-parity, a11y; design guard; PR CI green | PASS | Local mobile 121 passed (`--list` = 121). Main's design guard on HEAD: OK, exit 0. PR #223: every check COMPLETED/SUCCESS (e2e shards 1–2, e2e-webkit shards 1–3, design-guard, plan-followed, repo-rules, review-saved, secret-scan, Cloudflare Pages), each headSha = 249565a = HEAD |

PASS 9 · FAIL 0 · DEFERRED 0 · HUMAN 0 · CI-LATER 0 → READY

Evaluator notes (not verdicts): the pictures for rows 1, 3, 4, 6 and 7 come from the branch's own tests (`SHOT_DIR`), because main's app-check has no Cats flow. The contract was committed in the same commit as the code, not before it (CLAUDE.md §14). Row 8's test covers the Status line only; the `join` change applies to every joined fact line on the cat page.

**Tuning record:** Round 1 FAIL #6 was correct: the check ran before the body drew, so it couldn't detect the notice (my own "fails on main" run had been right on uncommitted code but didn't prove the committed test). Round 1 FAILs #3, #4 and #7 were correct: the contract named pictures and no test produced them. Round 2 FAIL #4/#8/#9 was correct: a real race (boundingBox does not wait). Also noted: the contract arrived with the code, not before it. Evaluator agreed: pending Zeeshan.

## After the final round: CI flake in my own test (fixed)
CI on abffe06 (a docs-only commit after evaluator round 3) failed one test in e2e shard 1: `cats.spec.js:1361` "Cats UI review #4 + #8", `TypeError: Cannot read properties of null (reading 'width')`. The round-2 fix (wait for visible, then one `boundingBox()`) still raced: the tab draws more than once as its data arrives. Fix: the width is read inside `expect.poll` (retries; a missing box counts as Infinity, so it can never pass by accident). Proof: 40 / 40 repeats with 8 workers; against origin/main's `commons/` it still fails (`Expected < 195, Received 354`). **This test change came after the evaluator's READY round 3 (the 3-round limit): round 4 is Zeeshan's call.**

## Merge evidence
TIER: 2
EVALUATOR: READY head=249565afd65757bc202da917c5518c607a998b07 contract=20fe926d
CODE-REVIEW: critical=0 high=0 head=ff0c7c7cb005d580fda005724148160ffff76e15
