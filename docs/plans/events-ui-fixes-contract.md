# events-ui-fixes — contract
Status: written by the builder under /ship-pr step 2 (no /plan-change: fixes from the Events UI review, Zeeshan: "fix all and merge", option B for sorting, 2026-11-25)
Plan: `docs/qa/events-ui-review-2026-11-25.md` (findings E1–E8 and their dispositions)

| # | Check | Proof | Pass/Fail |
|---|---|---|---|
| 1 | A shown message line never touches the blocks above or below it on Events (event night) and Organizer › Sign-ups | Specs assert ≥ 11.5px between `#msg` and its neighbours (bounding boxes) on both screens; pictures | |
| 2 | Event-day and organizer-change times are 24-hour, in the community's time zone | `event-day` spec asserts `Updated HH:MM` (no AM/PM); `organizer-acts` time line likewise | |
| 3 | Events List: one row By Number · Nearest Home · Nearest Me; Courts List and Cats Stations: Nearest Home · Nearest Me; each sorts as named; no home pin → Nearest Home disabled with one line saying why; a refused location says so and changes nothing | `events.spec`, `courts.spec`, `cats.spec` sort tests (order of cards per choice, `aria-pressed`, disabled state, the refusal message); EN + AR pictures of the Events and Courts rows | |
| 4 | Events, Courts and Pets show the same no-home piece: the module's sentence + a filled Claim My Home button to My Home | Specs assert the button text, class `btn` (not `ghost`), `href` `../home/` in all three; pictures | |
| 5 | Organizer › Sign-ups shows a sign-up's answers as the shared label → value list | `admin-signups` spec asserts the `dl` rows (label, value) instead of the joined line; picture | |
| 6 | The Numbers tile reads "out of treats by the end" on a treat night | `events.spec` archived test asserts the label | |
| 7 | Past card says "you took part" and shows "See the numbers ›" in link colour | `events.spec` list test asserts both | |
| 8 | Organizer event card: the title opens the event; no View button | `admin-events-chips` / `events.spec` asserts the title link `href` and 0 View buttons | |
| 9 | Regression: every affected spec passes (EN + AR axe included), design guard clean, PR CI green | Local: events, events-audit, event-day, organizer-acts, admin*, courts, cats, pets, home, account (mobile); CI on the PR | |

Re-agreed 2026-11-25: #3 — labels "By Number · Nearest Home · Nearest Me" (Zeeshan chose the short labels after evaluator round 1 flagged the change: the agreed "By House Number · Nearest My Home" wraps to two lines at iPhone width). Proof unchanged.
