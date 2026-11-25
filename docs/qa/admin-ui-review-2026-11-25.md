# Admin UI review — 2026-11-25

Scope: `commons/admin/` tabs no other module owns (Organizer Tools tab row, Community: Households, App Health, Admin Log;
the event editor's description boxes). Method: `/shot sweep admin` (125 tests, 125 pictures, all passed), ~20 pictures
opened plus a full-page Households picture; single `/shot`s and a filtered sweep for the fixed states.
Tier: **screen logic** (G2 changes the shared tab-row helper every module uses; no RPC, schema or stored data changed) —
affected specs + CI + code-reviewer.

## Findings and dispositions (Zeeshan: "fix all six")

| # | Screen | Finding | Disposition |
|---|---|---|---|
| G1 | Households | Each member drawn as a centred card inside the home card, Remove floating under the name. Cause: the admin card rule `.sulist li` also matched the nested member list | **Fixed**: card rules apply to direct rows only (`.sulist > li`, and the same for the shared `.bklist > li`); members are plain rows, Remove at the end |
| G2 | Organizer Tools tab row (also Cats) | Five tabs overflow at 390px ("Annou…", Arabic "الإع"); the row scrolls but nothing says so | **Fixed (shared)**: `jcTabsOverflow` in `nav.js`: a fade on each edge with more tabs past it (mirrored in Arabic), the selected tab scrolled fully into view (row only, never the page); rows that fit show nothing |
| G3 | Households, App Health | "1 homes · 1 members", "6 thing(s) need a look" | **Fixed**: singular/plural strings (EN + AR): "1 home · 1 pinned · 1 member", "1 thing needs a look" / "6 things need a look"; the page subtitle too |
| G4 | Households | "Waiting for you" card touched the search box | **Fixed**: 12px gap (`.sulist + .jcsearch`) |
| G5 | Event editor | H/B/U/•/1. toolbar sat above the "Description" label | **Fixed**: label → toolbar → box (`div.richfield`); the toolbar stays outside the label, so the box's spoken name is unchanged; the label still focuses the box |
| G6 | Event list, Cats | Hyphenated labels half Title Case ("Sign-ups" beside "Pause Sign-Ups", "Ear-tipped") | **Fixed**: "Sign-Ups", "Ear-Tipped"; `button-case.spec` now checks each part after a hyphen and scans the `b(…)`/`btn(…)` button builders (that is how it missed "Sign-ups"). "Check-up" turned out to be a vet-form checkbox, not a button: left as is |

Left alone: event-card actions wrapping unevenly (owned by the Events review, #218). Not issues: Health showing a
hostile `<b>x</b>` as text (the test feeds it on purpose); the green "Bookings are switched off" box (information).

## Code review (code-reviewer, 2026-11-25) — APPROVE, nothing HIGH/MEDIUM
| # | LOW finding | Disposition |
|---|---|---|
| 1 | The selected tab is scrolled 24px clear of the edge, but the fade is 32px: up to 8px of a tab could sit under it | **Fixed**: 36px |
| 2 | A tab row wired while hidden (`display:none`) never scrolls its selected tab into view | Accepted: no caller does this; the fade still updates when it appears |
| 3 | Re-wiring the same row without redrawing it would stack scroll listeners | Accepted: every caller redraws the row first |
Reviewer verified: no other nested list sits inside a `.sulist`/`.bklist` card and every builder emits direct `<li>`s; the
class-qualified card selectors still match; RTL scroll math uses rect deltas (Chrome + Safari negative `scrollLeft`), only
the row scrolls, the observer disconnects once the row is gone; every caller of the count strings goes through the
singular/plural pick; the description box keeps its accessible name via `for=`, preview placement unchanged.
After the fix: admin, admin-households, admin-health, admin-signups, home, button-case, cats — 217 passed.

## Evidence
- New checks fail on main's `commons/` (6 of 6: G1, G2, G3, G4, G5, Title Case); the My Home no-fade check is a regression guard (passes on both).
- Affected specs: admin, admin-households, admin-health, button-case, home, cats, a11y, courts, pets, events — 138 + 407 passed locally (two runs; home in both). Design guard OK.
- Pictures: Organizer Tools EN (end fade on "Announcement") and AR (fade on the left), last tab selected (start fade, tab fully visible), event editor (label → toolbar → box), Households full page (member rows, singular counts, gap above search).

## Gaps
- No 320px picture (the shot tool is fixed at iPhone 13); the fade logic is width-independent and tested at 390.
- Codes, Section Names screens not pictured.
