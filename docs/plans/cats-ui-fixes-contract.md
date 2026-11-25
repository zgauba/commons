# cats-ui-fixes — contract
Status: written by the builder under /ship-pr step 2 (no /plan-change: fixes from the Cats UI review, Zeeshan: "fix all, delete the #6 notice", 2026-11-25)
Plan: `docs/qa/cats-ui-review-2026-11-25.md` (findings 1–8 and their dispositions)

| # | Check | Proof | Pass/Fail |
|---|---|---|---|
| 1 | A feeding visit's Problem line is amber (`--jc-warn`), not the accent green used for success and the role line | `cats.spec` "Cats UI review #1 + #7" compares the computed border colour with `--jc-warn` and `--jc-accent`; fails on main; picture | PASS (evaluator round 3, 249565a) |
| 2 | One of something reads singular: "1 active station", "1 cat seen", "1 kitten" (EN + AR keys) | `cats.spec` "Cats UI review #2"; `strings-parity` spec; fails on main | PASS (evaluator round 3, 249565a) |
| 3 | My reports: the "deleted 30 days" line never touches the card above it | `cats-reports.spec` "the form: a place is enough…" asserts ≥ 8px gap (bounding boxes); fails on main; picture | PASS (evaluator round 3, 249565a) |
| 4 | Add a cat is the compact primary button, like Add a station and Log activity | `cats.spec` "Cats UI review #4 + #8" asserts width < half the viewport; fails on main; picture | PASS (evaluator round 3, 249565a) |
| 5 | A vet entry's "Open the document (Google Drive)" is a plain link like "Open in Google Maps", not a button-bordered link | `cats.spec` CC-5 vet entries test asserts the link has no `mini` class | PASS (evaluator round 3, 249565a) |
| 6 | The "The cat programme is moving here step by step." notice is gone (markup and both EN/AR strings) | `cats.spec` "Cats on, a resident…" asserts `#caSoon` count 0; fails on main; picture | PASS (evaluator round 3, 249565a) |
| 7 | A hidden sighting's Hidden and Not identified yet chips sit in one row | `cats.spec` "Cats UI review #1 + #7" asserts both chips in one `.head` with equal top; fails on main; picture | PASS (evaluator round 3, 249565a) |
| 8 | A wrapped Status / fact line never starts with "·" (the dot is held to the word before it) | `cats.spec` "Cats UI review #4 + #8" asserts every " · " in the Status value is " · "; fails on main | PASS (evaluator round 3, 249565a) |
| 9 | Regression: all Cats specs (cats, cats-reports) + strings-parity + a11y pass; design guard clean; PR CI green | Local mobile run; CI on the PR | PASS (evaluator round 3, 249565a) |
