# Events UI review (2026-11-25)

**How:** `/shot sweep events` (`events.spec`, `events-audit`, `event-day`, `organizer-acts`, `admin-events-chips`,
`admin-signups`: 164 tests, all passed, 164 pictures, Chromium iPhone 13, stubbed backend). Judged with the
`ui-design-review:ui-review` skill (purpose, hierarchy, spacing, consistency, copy, accessibility, touch, states,
platform), against `docs/design.md`. 18 pictures looked at across every screen group (EN, AR, the Halloween look);
4 suspected findings checked in code. Earlier review not reopened: `events-ui-review-2026-11-21.md` (the filled Sign Up
tab stays: Zeeshan's sanctioned exception).

Zeeshan's call (2026-11-25): fix all; sorting = option B (three-way row on Events, two-way on Courts); then merge.

## Findings and disposition

| # | Severity | Where | Finding | Disposition |
|---|---|---|---|---|
| E1 | Should | Event page on event night; Organizer › Sign-ups | The message line touches the block under it (and the "Updated …" line above it). Courts #3 only fixed it inside Organizer tab panels. Breaks "nothing touches". | **Fixed** at the root: one rule in `app.css` keeps a shown message line 12px from its neighbours on the pages without the shared stack (Events, Organizer Tools, My Home, Account). The Organizer-only rule from #216 is removed. |
| E2 | Should | Event-day "Updated 10:58 AM"; organizer-change times | Events prints a 12-hour clock (`fmtTime`, `en-US`); Courts and Organizer Tools use 24-hour (`jcClock`, `h23`). Two time styles in one app. | **Fixed:** 24-hour in the community's time zone, like `jcClock`. |
| E3 | Should | Event page List tab; Courts List; Cats Stations | Sorting took two rows: a By House Number / Nearest First choice, then "Sorted by: …" with a Use Where I Am button. | **Fixed (option B):** one row of choices. Events: By House Number · Nearest My Home · Nearest Me. Courts and Cats Stations: Nearest My Home · Nearest Me (Cats added so the three lists match; Pets keeps its status line, since owners' homes never reach the phone). No home pin → Nearest My Home is disabled and one line says why. |
| E4 | Should | No home: Events vs Courts vs Pets | Events: help text + filled "Claim My Home". Courts and Pets: bordered notice + outlined "Go to My Home". Two patterns for one moment. | **Fixed:** one shared piece (`jcNoHomeHtml`): the module's sentence + a filled **Claim My Home** button, used by all three. Added to `design.md`. |
| E5 | Should | Organizer › Sign-ups card | Answers print as one run-on "treats: candy" line; the resident's My Sign-Up uses the shared label → value list. | **Fixed:** the shared `jcFactsHtml` list on the organizer card. |
| E6 | Nice | The Numbers | Tile "33 / done by the end" doesn't say what was done. | **Fixed:** "out of treats by the end" on treat nights, "done by the end" otherwise. |
| E7 | Nice | Events list, past card | "you're in" is the wrong tense for a past event; "see the numbers" doesn't look tappable (the whole card is the link). | **Fixed:** "you took part"; "See the numbers ›" in link colour. |
| E8 | Nice | Organizer event card | Five buttons in two rows (Sign-ups, Edit, Pause, Close, View). | **Fixed:** the event's title opens it (as on the residents' list); View goes. |

## Seen and fine

Event-day switch and supply: large, two-sided, one-handed. The Halloween look holds contrast. Arabic mirrors (Admin
button, map controls). Empty, error, coming-soon and no-home states each say something useful.

## Not checked

The Haq al-Laila look (no test ends on it). Largest text size (a web app; no iOS Dynamic Type). A map popup cut at the
map's top edge (`093`): auto-pan is configured (`map.js:30`); most likely mid-animation when the test ended. Not
confirmed from a picture, so not a finding. `souk-al-jubail` as a raw ID: a test-config gap (11-21 review).

## Courts review (#216): evaluator tuning

Zeeshan agreed with the evaluator's verdicts on #216 (rounds 1–3), 2026-11-25.

## Verification

**Tier 2 (screen logic):** client only, no schema / RPC / auth / PII change. Shared pieces touched (`app.css`, `map.js`,
`mapui.css`, `api.js`, `strings.js`), so every module that uses them was run.

- **Tests:** events, events-audit, event-day, organizer-acts, every `admin*`, courts, cats, pets, home, account,
  strings-parity on mobile (Chromium), run once locally: **636 passed**. WebKit and the full suite run in CI. Design guard: OK. Two
  baseline lines deleted (`.seg2` is gone).
- **The tests catch the bugs:** the new and changed assertions run against the old `commons/` (13 files): **21
  failed**, 372 passed. Restored: all pass.
- **Caught by a picture, not a test:** the first build showed "sign-ups closed" on the past card (the "closed" branch
  had come loose when "see the numbers" moved). Fixed, and the test now checks the card's line exactly.
- **Screenshots looked at (after):** Events List on event night (message 12px from "Updated" and the search; one
  sort row); the same in Arabic (the row fits on one line); Courts List with no home pin after Nearest Me (Home off +
  the reason); Courts with no home (Claim My Home); Organizer › Sign-ups (message spaced; answers as label → value);
  Events list (past card: "you took part", "See the numbers" in link colour).
- **Labels shortened to fit one line on a phone:** "By Number · Nearest Home · Nearest Me" (the agreed mock-up said
  "By House Number · Nearest My Home"; at iPhone width that wraps to two lines).
- **Design doc:** message-line spacing, the sort choice, and the no-home piece are recorded in `docs/design.md`.

## Code review (code-reviewer, 2026-11-25)

0 high, 1 medium, 3 low. All fixed. Each one has a test that fails without the fix (3 failed on the old code) and
passes with it.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| R1 | MEDIUM | Events: By Number, tap Nearest Me, then a refresh redraws the list before the phone answers. `late()` redrew with By Number still pressed, so the tap was lost. (Before, the button only existed in distance mode.) | **Fixed:** every sort tap is numbered (`jcSortSeq`). A position that arrives after a newer choice is dropped. `late()` sets Nearest Me, because it only runs for a tap that still stands. Test: `event-day` "code review M". |
| R2 | LOW | Courts / Cats: Nearest Home picked while a Nearest Me request was pending. The late position then switched the list to Nearest Me. | **Fixed** by the same numbering. Test: `courts.spec` "code review L". |
| R3 | LOW | `pets.spec` still checked `#sortHereBtn` has count 0. That id no longer exists, so the check passed no matter what. | **Fixed:** it now checks there's no `.sortopts` and that `#ptSorted` is visible. |
| R4 | LOW | Three never-wrapping buttons could clip on a 320px phone (EN / AR). | **Fixed:** equal widths that wrap when the content can't fit (`min-width:fit-content`). Test: `events.spec` 320px, EN + AR, nothing overflows. |

## Evaluator

### Round 1 (HEAD 6683b7f): NOT READY (PASS 7 · FAIL 2)

| # | Check (short) | Verdict | Evidence |
|---|---|---|---|
| 1 | Message line never touches its neighbours | PASS | event-day "We're Not Out" + organizer-acts "mark done / open" ✓ (≥ 11.5px above and below); pictures show clear gaps |
| 2 | 24-hour, community time zone | PASS | event-day + organizer-acts time tests ✓; `fmtTime` under TZ=America/Los_Angeles with cfg.tz Asia/Dubai: 07:43Z → "11:43", 20:05Z → "00:05" |
| 3 | One sort row; sorts as named; no pin → Home off + line; refusal says so | FAIL | (a) The labels are "By Number · Nearest Home · Nearest Me"; the Check says "By House Number · Nearest My Home", and there was no Re-agreed line. (b) Only courts.spec tests refusal; cats.spec has no disabled test. The rest passes. |
| 4 | Same no-home piece in Events, Courts, Pets | PASS | three tests ✓ (href, `btn`, not `ghost`); three pictures |
| 5 | Organizer answers as label → value | PASS | admin-signups `dl.facts` ✓; picture |
| 6 | "out of treats by the end" | PASS | events.spec E6 ✓ |
| 7 | "you took part", "See the numbers ›" in link colour | FAIL | No "›" on screen, in the string or in the test |
| 8 | Title opens a live event; no View | PASS | events.spec #5/#6 ✓; app-check admin picture |
| 9 | Specs, axe EN + AR, design guard, CI | PASS | 805 passed locally (sweep config); design guard OK; PR #218 CI all green on 6683b7f |

**Round 1 → fixes:**
- **Row 7:** "See the numbers ›" (AR "‹", pointing forward in Arabic). The test expects the chevron.
- **Row 3b:** new tests. Events: Nearest Me refused → message, choice back, order unchanged. Cats: no pin → Home disabled + the reason line; refused → message, order unchanged.
- **Row 3a:** Zeeshan chose the short labels (one line on an iPhone). Re-agreed line added to the contract.

