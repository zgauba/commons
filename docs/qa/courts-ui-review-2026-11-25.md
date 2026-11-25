# Courts UI review (2026-11-25)

**How:** `/shot sweep courts` (`courts.spec` + `admin-court*`, 96 tests, all passed, 96 pictures, Chromium iPhone 13,
stubbed backend), about 20 pictures looked at across every screen group, EN + AR, plus one `/shot bookings/ anon`
for the signed-out view (no Courts test covers it). Reviewed as a product designer would (`ui-design-review` lens).
Earlier Courts reviews checked so nothing already decided is reopened: `courts-consistency-review-2026-11-09.md`,
`slot-colors-review-2026-11-09.md`, `b1-bookings-app-review-2026-11-17.md`.

Zeeshan's call: fix all, then merge.

## Findings and disposition

| # | Severity | Screen | Finding | Disposition |
|---|---|---|---|---|
| 1 | High | List, resident with no home | "Claim your home first to book." appears twice (green notice, then red after a tap). Court cards still offer **See times**; the server refuses the day (`NO_HOME`) and bounces back to the list. Dead-end tap. | **Fixed.** No See times without a home; the notice and Go to My Home are the way forward. One message. |
| 2 | High | Court day (resident) | Each free slot is a tall card: time + "Free" chip on one line, Book button on the next. A 07:00–22:00 day is ~15 cards, 4–5 screens of scroll; the organizer day view is about half the height. | **Fixed.** Book sits at the end of the time row; free slots are one line. The word "Free" stays (colour is never the only signal). |
| 3 | Medium | Organizer Tools › Bookings, after a save | The message line, the "switched off" notice and the rules line touch (Organizer Tools has no shared 12px stack). Breaks "nothing touches". | **Fixed.** 12px between the message line and the tab panel (every Organizer tab), and the Courts tab's top blocks stacked with the shared `.jcstack`. |
| 4 | Medium | Across the module | (a) The permanent precedence notice and one-off success messages are both green-bordered boxes. (b) Amber means "someone else's booking", "draft court" and "cancelled by organizers". | **(a) Fixed** with #8. **(b) Partly.** Booked = amber was Zeeshan's call on the iPhone review (`slot-colors-review-2026-11-09.md`) and the draft chip is a heads-up, which is what amber means in `design.md` §1. Kept. The cancelled booking no longer uses amber (#5). |
| 5 | Medium | My Bookings | An upcoming booking and an organizer-cancelled one are two unrelated card shapes (blue slot card vs. amber outline). | **Fixed.** A cancelled booking uses the same card as a cancelled row in Past: muted, "Cancelled" chip, the reason. It stays under Upcoming so the resident sees it before the time. |
| 6 | Low | Arabic day view | Arabic-Indic and Western digits mixed in one line ("ملعب ١" next to "10 نوفمبر 12:00"). | **No change.** "ملعب ١" is the test court's Arabic name as an admin typed it (`courts.spec.js` fixture); the app's own numbers are consistent. |
| 7 | Low | Organizer Tools › Bookings | The list of places is headed "Bookings"; it lists places, not bookings. | **Fixed.** Heading reads "Places" / "الملاعب", matching the New Place button. |
| 8 | Low | Every resident Courts screen | The precedence notice takes ~60pt on the list, the map, My Bookings and the court page. | **Fixed.** A quiet one-line note on the List / Map / My Bookings tabs; the full notice stays on the court page, where booking happens (MCD §15.10 wants it on the booking screen). |

## Seen and fine

Signed out → Sign In. Courts switched off → plain page. Map tab matches the event map. Refused bookings, empty Past,
failed Past each say so. Organizer block and cancel forms. Arabic layout mirrors.

## Not findings

- Map tiles are blank: the tile CDN is stubbed in tests.
- The tab bar mid-picture: full-page screenshots draw the fixed bar at the first screen's bottom.
- Organizer Tools' tab row cut off at "Annou…": every module's Organizer tab, so a cross-module pass, not Courts.

## Verification

(filled in on the PR branch: specs run, screenshots looked at, code review)
