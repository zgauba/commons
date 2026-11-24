# cats-960-flake — contract
Status: agreed 2026-11-24 (Zeeshan: "approved, go ahead … complete it and merge it as well")
Plan: /plan-change in session, 2026-11-24 (from the harness session's diagnosis of probe PR #207's failure)

| # | Check | Proof | Pass/Fail |
|---|---|---|---|
| 1 | The stations-map popup opens on every run (the pin is tapped where it is, not mid-zoom) | `npx playwright test specs/cats.spec.js:960 --project=mobile --repeat-each=300 --workers=8`, 1 run: 0 failures at line 986 (baseline 9/300 = 3%; if still broken, 0 in 300 has a 0.97³⁰⁰ ≈ 0.01% chance) | |
| 2 | Tapping a cat in the popup opens its page on every run, and the cause of the 1-in-400 miss is named | Logging run that shows which of (a) popup auto-pan moves the button, (b) popup content re-rendered after the listener was added, (c) the stations map redrawn while its popup is open, explains each line-992 failure; then the same log with the fix shows that mechanism gone (forced if possible, as the cats-reports #210 proof was), plus the check-1 command with 0 failures at line 992 | |
| 3 | The 4 maps (Cats Stations, Events, Courts, Pets) open framed on their pins as before, with no zoom-in animation and nothing else changed | `/shot sweep` with a `map` grep on cats, events, courts, pets before and after, compared side by side; `/shot events/` and `/shot pets/` in AR before and after | |
| 4 | Events house numbers still appear and hide by zoom, and a refresh still doesn't move a map the user zoomed | `events.spec.js` house-number test (the `nolabels` checks, ~line 232) and `event-day.spec.js:171` pass, 20 repeats each | |
| 5 | Regression: the full suite stays green | Full Playwright suite once locally + CI (Chromium and WebKit) | |
