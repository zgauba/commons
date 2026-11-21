# Events UI review — 2026-11-21

**Scope:** the Events module, resident side (`commons/events/`: list, event page Map · List · My Sign-Up, one-place events,
event-day controls, The Numbers) and Organizer Tools → Events (`commons/admin/`: event list, editor, sign-ups). iPhone 13
size, stubbed backend. **How:** the Events, event-day, organizer and admin specs re-run with a full-page screenshot at the
end of each test (215 pictures; 12 looked at closely); 6 suspected findings checked in code. Not seen: Arabic layouts
beyond the specs' own Arabic tests. Grey maps and US-style dates = the test setup; "souk-al-jubail" as a raw ID on The
Numbers = a village missing from the test config, not a finding.

**Tier:** screen logic → affected specs once (Chromium) + CI + `code-reviewer`. No database change.

## Findings and disposition

| # | Severity | Where | Finding | Disposition |
|---|---|---|---|---|
| 1 | Should | Event page tabs | Sign Up tab is a filled button inside the tab row | **Kept (Zee):** from tester feedback that Sign Up wasn't obvious; filled only until the household signs up. Recorded as the one sanctioned exception in `docs/design.md` (Sub-tabs) so it isn't flagged again |
| 2 | Should | My Sign-Up, after saving | "Villa 12 is in." said twice (message + status line) | **Fixed:** the message says "Saved." |
| 3 | Should | My Sign-Up answers | Events-only `.answers` list (value flush right, rules) unlike Pets / Cats; the note had no label | **Fixed:** shared `jcFactsHtml` (`#evAnswers`), note labelled "Note"; `blocks.js` now loaded on the Events page; `.answers` / `.mynote` CSS removed |
| 4 | Should | Events list cards | "View" button on live cards; past cards were whole-card links with nothing else — two patterns | **Fixed:** every card opens from anywhere on it (the title's link stretches over the card); Sign Up is the only button |
| 5 | Should | Event editor (Organizer Tools) | No top-bar back; only Cancel at the foot of a long form | **Fixed:** editor and template picker get the back arrow, same as Cancel |
| 6 | Nice | Organizer event cards | Close Event looked like View (it does require typing the short name) | **Fixed:** red outline (`.btn.ghost.danger`) |
| 7 | Nice | Events list | "· yours" cryptic | **Fixed:** "you're in" (AR "منزلك مشارك") |

## Proof

- Tests: `events.spec.js` list tests updated (no View; `a.evopen` opens the event; "you're in"), save messages now
  "Saved." with the status line still checked, `#evAnswers` labels incl. Note; new "UI review #4" (a tap on the card body
  opens the event, Sign Up still goes to the form) and "UI review #5 / #6" (editor + template picker back; Close Event
  has `danger`, Edit doesn't); `events-audit.spec.js` updated.
- `npx playwright test --project=mobile` on events, events-audit, event-day, organizer-acts, admin, admin-events-chips,
  admin-signups, cats, pets → **342 passed**.
- Design guard: OK (baseline only).
- Screenshots after the fix looked at: events list, My Sign-Up after an update.

## Code review

`code-reviewer` (2026-11-21): **approve — no High / Medium.** Checked: the stretched link sizes against `li.evcard`; the
Admin badge and Sign Up sit above it (z-index); no nested links (archived cards keep their own whole-card `<a>`); tab
order title → badge → Sign Up; nothing else used `.answers` / `.mynote` / the View link; no global-name clash from
loading `blocks.js`; no precache list to update; everything escaped; editor back = Cancel incl. `ed = null`, and a
language switch never re-runs `jcBack` (the draft survives).

| # | Sev | Finding | Disposition |
|---|---|---|---|
| L1 | Low | Focus ring hugs only the title though the whole card is the target | **Fixed:** `.evcard:has(.evopen:focus-visible)` outlines the card |
| L2 | Low | Back (like Cancel before) works mid-save; a failed save would then show on the list with the draft gone | **Fixed:** editor back waits while Save is disabled; test added |
| L3 | Low | A test title still said "'Villa 12 is in'" | **Fixed:** renamed |
| L4 | Low | `ev_view` string unused | **Fixed:** removed (EN + AR) |

After the fixes: 342 passed (Chromium); design guard OK.
