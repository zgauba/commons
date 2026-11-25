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
