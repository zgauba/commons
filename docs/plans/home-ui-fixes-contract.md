# home-ui-fixes — contract
Status: written by the builder before any code (no /plan-change: fixes from the Home UI review, Zeeshan 2026-11-25: "fix all four, All buttons everywhere should use Title Case, leave B red")
Plan: `docs/qa/home-ui-review-2026-11-25.md` (findings H1–H4, decisions A and B)

| # | Check | Proof | Pass/Fail |
|---|---|---|---|
| 1 | Account tab: Leave This Home and Delete My Account sit in separate boxes; the "This deletes your account…" line and the DELETE box are in the Delete box only (H1) | `home.spec` asserts `#leave` and `#delete` have different closest `.panel`, and the delete help text is inside `#delete`'s panel, not `#leave`'s; EN + AR picture | |
| 2 | Account tab: Sign Out is not in the display-name box (H2) | `home.spec` asserts `#signOut` is not inside the `.panel` that holds `#dname`; picture | |
| 3 | After saving a pin, "Pinned on the map" shows once, not twice (H3) | `home.spec` (pin test) asserts the text appears exactly once on My Home after saving | |
| 4 | Fix House Details: a Cancel button beside Save (as on Pin Your Home), no "Back" text link; Cancel returns to My Home without saving (H4) | `home.spec` asserts `#back` is a `.btn.ghost` in the same row as `#go`, no `.links` box, and tapping it shows My Home with no update RPC; picture | |
| 5 | Every visible button label in English is Title Case, in every module (decision A); design.md states the rule | New `button-case.spec` scans every `<button>` / `.btn` label key in `commons/` and fails on a lowercase major word (fails on main: 53 labels); design.md row under Buttons | |
| 6 | `/shot` can reach the household invite panel (sweep gap) | `jc_invite_create` stub in `specs/backends.js`; `/shot home/?tab=household` with `SHOT_CLICKS='#invite'` passes with no missing-RPC error; picture | |
| 7 | Regression: every spec that asserted an old label is updated; full mobile suite passes locally once; design guard clean; PR CI green | Local mobile run; CI on the PR | |

Out of scope: B (location refused stays a red error box everywhere — Zeeshan). Arabic labels are unaffected (no letter case). Text links (e.g. "Save Commons as an app", "Have an organizer code?") are links, not buttons, and keep sentence case.
