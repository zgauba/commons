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

**Tier 2 (screen logic):** client only, no schema / RPC / auth / PII change.

- **Tests:** `courts.spec` + every `admin*` spec, mobile (Chromium) once locally: **287 passed**. WebKit and the full
  suite run in CI. Design guard: OK (baseline only).
- **The tests catch the bugs:** the 7 changed or new assertions were run against the old screen code (new tests, old
  `commons/`): **7 failed, 90 passed**. Put back: all pass.
- **Screenshots looked at (after):** court day (one-row free slots, full precedence notice); My Bookings (cancelled
  booking in the Past card, quiet precedence line); List with no home, EN + AR (sentence once, no See times);
  Organizer Tools › Bookings after a save with Bookings off (12px gaps, "PLACES" heading).
- **`/shot` reaches Courts now:** it always ran with Courts switched off, so it could only show "This section isn't
  open yet". `bookings/` paths now use a small shared `courtsBackend` (`specs/backends.js`); the `/shot` skill lists
  the paths.

## Code review (code-reviewer, 2026-11-25)

Verdict APPROVE: 0 critical, 0 high, 0 medium, 2 low.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| R1 | LOW | Hiding See times removed the only test of the server's NO_HOME path, which a `?court=` link still reaches. | **Fixed.** New test "no home, by a court link": the server's NO_HOME takes it back to the list and says so once. |
| R2 | LOW | The one-row test's 64px / 4px limits assume the iPhone 13 width; a narrow screen or long Arabic chip could wrap Book. | **Accepted.** The suite runs at iPhone 13 width only. Wrapping on a narrower phone is the right fallback (`.head` wraps). |

## Evaluator

### Round 1 (HEAD 14d1f0d): NOT READY (PASS 5 · FAIL 2)

| # | Check (short) | Verdict | Evidence |
|---|---|---|---|
| 1 | No-home resident: no See times, "Claim your home first to book." once | FAIL | Test half passes: `courts.spec.js:495` ✓. The sweep picture 004 shows the List with the sentence once and no See times. But the named proof is a `/shot` picture as `member-no-home`, and that picture shows "This section isn't open yet in your community.", because `shot.spec` sets `bookings: { enabled: false }`. To pass: a `/shot` picture of the Courts List as `member-no-home`, or a re-agreed proof. |
| 2 | Free slot = one row: time, "Free", Book | PASS | `courts.spec.js:250` ✓ (centres within 4px, height ≤ 64, chip "Free"). The sweep picture shows every free row 11:00–22:00 on one line. |
| 3 | Save as Draft with Bookings off: message, off notice and rules line don't touch | PASS | `admin-courts.spec.js:396` ✓ (gaps ≥ 11.5px). The picture courts-draft-saved.png shows clear gaps. |
| 4 | Precedence: quiet line on the tabs, still a `.notice` on the court page | PASS | `courts.spec.js:109` ✓ (`toHaveClass("help")`), `courts.spec.js:250` ✓ (`#view .notice`). Pictures: plain grey text on List / My Bookings, bordered notice on the court page. |
| 5 | Organizer-cancelled booking uses the Past cancelled card, no amber | PASS | `courts.spec.js:230` ✓ (`slot-past`, chip "Cancelled", border ≠ rgb(242,179,60), reason). The picture shows a muted neutral border. |
| 6 | "Places" heading (AR "الملاعب") | PASS | `admin-courts.spec.js:74` ✓ and `:460` ✓. The picture shows "PLACES". |
| 7 | Regression: Courts + Organizer tests, EN + AR axe, design guard; CI green | FAIL | Local: 97 passed, including the axe en/ar tests. CI: no PR yet, so no evidence. To pass: the PR's CI green on this HEAD. |

**Round 1 → fixes:** row 1 fixed at the cause. `/shot` reaches Courts now (see Verification), and its `member-no-home`
picture shows the List. Row 7 waits for the PR's CI. Contract unchanged.

### Round 2 (HEAD 3ccdd2c): READY (PASS 7 · FAIL 0 · DEFERRED 0 · HUMAN 0)

Contract unchanged since abe7010. No test weakened: the no-home NO_HOME path moved to the new "by a court link" test.

| # | Check (short) | Verdict | Evidence |
|---|---|---|---|
| 1 | No-home resident: no See times, sentence once | PASS | `courts.spec.js:495` ✓; `/shot bookings/ member-no-home` EN + AR show the Courts List: the sentence once in a notice, Go to My Home, no See times on Court 1 or Hoops. |
| 2 | Free slot = one row | PASS | `courts.spec.js:250` ✓ (centres within 4px, ≤ 64px, "Free"); the sweep picture shows every free row 11:00–22:00 on one line. |
| 3 | Message, off notice, rules line don't touch | PASS | `admin-courts.spec.js:396` ✓ (≥ 11.5px); the picture shows clear gaps. |
| 4 | Quiet precedence on the tabs, `.notice` on the court page | PASS | `courts.spec.js:109` ✓, `:250` ✓; pictures: plain text on List / My Bookings, bordered on the court page. |
| 5 | Cancelled booking = Past cancelled card, no amber | PASS | `courts.spec.js:230` ✓; the picture shows a muted neutral card with the reason. |
| 6 | "Places" / "الملاعب" | PASS | `admin-courts.spec.js:74` ✓, `:460` ✓. |
| 7 | Regression + CI | PASS | Local 98 passed incl. axe en/ar; PR #216 on 3ccdd2c: design-guard, e2e, e2e-webkit, review-saved, plan-followed (+ repo-rules, secret-scan, Pages) all pass. |

Evaluator's notes (proof drift, not a fail): row 2 checks centres within 4px rather than "tops equal"; row 3 allows
11.5px for sub-pixel rounding.

**Tuning record:** round 1 FAIL on row 1 was correct. The named proof couldn't run (`/shot` had Courts off), and fixing
the cause made `/shot` useful for every later Courts review. Evaluator agreed: pending Zeeshan (merged on his
standing "fix all and merge", 2026-11-25).

## CI flake fixed on this branch (Events, not Courts)

- **What:** on 5a4584d (docs only, same code as 3ccdd2c, which passed WebKit 796/796), `e2e-webkit` failed one test:
  `event-day.spec.js:230` "when the event ends, the controls go without a reload": `#live .tog` never appeared.
- **Cause:** a real-time race in the test. The stub event ended 1.5 s after the stub was built. When CI WebKit's
  first draw took longer than that, the event was already over, so the controls the test waits for never rendered.
- **Fix:** the test runs on Playwright's page clock. The event ends 60 s after opening; the test checks the controls,
  fast-forwards 65 s, and checks they're gone. The app is unchanged.
- **Proof:** WebKit `--repeat-each=10` → 10 passed. Chromium, all 20 `event-day` tests pass. With the fast-forward
  cut to 10 s (before the end), the test fails, so it still bites.
- **Evaluator:** the contract rows aren't affected (a test-only change in a spec outside the contract). Not re-run.

### Round 3 (HEAD dcb1c39, after the event-day test fix): READY (PASS 7 · FAIL 0 · DEFERRED 0 · HUMAN 0)

| # | Check (short) | Verdict | Evidence |
|---|---|---|---|
| 1 | No home: no See times, sentence once | PASS | Local `courts.spec admin-court` 98 passed; `courts.spec:495` + the deep-link test `:507`; `/shot bookings/ member-no-home` EN + AR show the List with the sentence once and no See times. |
| 2 | Free slot = one row | PASS | `courts.spec:250` ✓; the sweep picture shows "11:00–12:00 Free Book" on one line. |
| 3 | Message, off notice and rules line don't touch | PASS | `admin-courts.spec:396` ✓ (≥ 11.5px); the picture shows clear gaps. |
| 4 | Quiet precedence on the tabs, `.notice` on the court page | PASS | `courts.spec:109` + `:250` ✓; one shared header for all three tabs (`bookings.js:303`); pictures. |
| 5 | Cancelled booking = Past cancelled card | PASS | `courts.spec:230` ✓; the picture shows a muted, neutral card. |
| 6 | "Places" / "الملاعب" | PASS | `admin-courts.spec:74` + `:460` ✓. |
| 7 | Regression + CI | PASS | Local 98 passed incl. axe en/ar; PR #216 on dcb1c39: e2e, e2e-webkit, design-guard, plan-followed, review-saved, repo-rules, secret-scan all pass. |

Evaluator on the event-day change (outside the contract): a 1.5 s real-time window swapped for the page clock; it
still asserts the controls go without a reload. Not weaker. Passed in both CI jobs.
