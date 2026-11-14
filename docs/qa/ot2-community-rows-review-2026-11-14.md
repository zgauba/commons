# OT-2: Community as settings rows, Codes + Your Access screens, Households search: review (2026-11-14)

Plan: `docs/plans/OT-organizer-tools-ia.md`, shipped with this PR (Zee 2026-11-14: D1 settings rows for Community, D2 search on Households). Tier: **screen logic**, so `code-reviewer`. No database change. Who may see codes is unchanged (community admins; the server enforces it).

## What changed

- **Organizer Tools → Community** is a list of settings-style rows. Each row has a name, one line saying what it's for, and a chevron, mirrored in Arabic. The rows are Admins, Households, App Health & Notices, Section Names, Codes, Feedback Inbox (the owner) and Your Access.
- **Codes** is its own screen. A new code shows there once and is gone after leaving the screen.
- **Your Access** is its own screen with Enter Another Code and Lock. Event admins without a code see "You run your own events. A code gives you more." and no Lock button. Back from the code box returns to Your Access.
- **Households search:** by house number, building, village or member name, over the list already loaded (nothing new is sent). Villages with no match drop out. The box keeps focus. Typing while an edit is open closes the edit.
- **Shared CSS:** `.setrows` / `.setrow` in `assets/app.css`, for reuse in OT-3 (Pets → Settings).
- **Plan doc** `docs/plans/OT-organizer-tools-ia.md` ships here (it was on `plan/ot-organizer-tools`).

## Findings and disposition (`code-reviewer`: WARNING → fixed; 0 critical / 0 high)

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | MEDIUM | `fbButton()` replaced the Feedback row's content when the unread count landed late (no chevron, no second line) | **Fixed.** It updates only the row's second line and the `hot` class. Test added (late count, no tab switch). The unused `adm_fb_open` string was removed. |
| 2 | LOW | Typing a search while a home's edit is open redrew the form empty | **Fixed.** A search change closes the edit. Test added. |
| 3 | LOW | Focus isn't returned to the search box after a Cancel / write re-render | **Kept.** The shared `jcFocusKeep` deliberately skips inputs, and the h1 gets focus, as on other screens. |
| 4 | LOW | A rotate redraw doesn't keep focus | **Kept.** Same as before (not a regression). |
| — | gap | No test for the `show("codes")` guard without community | **Kept.** It can't be reached from the page without a code. The server refuses the rotate in any case. |

The reviewer confirmed: who sees Codes and Lock; the exit flow; `wireHouseholds(root)` callers (no double wiring); XSS through `esc`; `hh.q` resetting on entry and on a notice deep link; row a11y (real buttons, `aria-hidden` chevron).

## Verification

- **New tests:**
  - Community rows open their screens and Back returns (with Arabic chevron mirroring).
  - A code shows once on the Codes screen.
  - Households search: member name, building, village, number, no match, focus, no server calls.
  - The search survives an edit and cancel; Arabic placeholder; search closes an open edit.
  - The late unread count updates the row in place.
- **Migrated:**
  - Codes, Lock and Enter Another Code are now reached through their rows (admin, admin-admins, admin-households, feedback).
  - Feedback row assertions now target the count line.
  - Row order asserted.
- **Full suite, both browsers:** 1284 passed (before the review fixes). Affected specs after the fixes: 184 passed.
- **Screenshots:** Community rows in EN and AR (chevrons point the reading way).
