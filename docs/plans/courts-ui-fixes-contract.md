# courts-ui-fixes — contract
Status: written by the builder under /ship-pr step 2 (no /plan-change: fixes from the Courts UI review, Zeeshan: "fix all and merge", 2026-11-25)
Plan: `docs/qa/courts-ui-review-2026-11-25.md` (findings 1–8 and their dispositions)

| # | Check | Proof | Pass/Fail |
|---|---|---|---|
| 1 | A resident with no home sees no See times button, and "Claim your home first to book." once | `courts.spec` "no home" test asserts 0 `[data-open]` and one visible copy of the sentence; `/shot` picture of the List as `member-no-home` | |
| 2 | A free slot on the court's day is one row: time, "Free", Book | `courts.spec` test asserts Book's row top equals the time's row top (same line); free slot card height ≤ 64px at iPhone 13; sweep picture of the day | |
| 3 | In Organizer Tools › Bookings, after Save as Draft with Bookings off, the message, the off notice and the rules line don't touch | `admin-courts.spec` test asserts ≥ 12px between each pair (bounding boxes); sweep picture | |
| 4 | The precedence text is a quiet line (not a bordered box) on List / Map / My Bookings, and still a `.notice` on the court page | `courts.spec` precedence test asserts `#bkPrecedence` has class `help`, and the court page's `.notice` text is the precedence line | |
| 5 | An organizer-cancelled booking under Upcoming uses the Past cancelled card (slot-past + "Cancelled" chip + reason), no amber border | `courts.spec` asserts the row has class `slot-past`, chip text "Cancelled", border colour ≠ `--jc-warn`; sweep picture | |
| 6 | Organizer Tools › Bookings heads its list "Places" (AR "الملاعب") | `admin-courts.spec` `h2.group` → `["Places", "Retired"]`; AR test checks the Arabic | |
| 7 | Regression: every Courts and Organizer test still passes, EN + AR axe included, design-guard clean | `courts.spec admin-court` locally once; PR CI green (e2e, design-guard, review-saved, plan-followed) | |
