# cats-960-flake — review (2026-11-24)

Change: `jcFitPins` fits without animation (all 4 maps open already framed); Cats stations-map cat buttons use one
delegated click listener on the map box instead of per-button listeners added on `popupopen`.
Tier: screen logic (map / pin tapping) → `code-reviewer`.

## Reviewer: code-reviewer — approve, nothing material
| Finding | Severity | Disposition |
|---|---|---|
| Delegated listener correct: DOM `click` bubbles out of Leaflet popups (`disableClickPropagation` stops only mousedown/touchstart/dblclick/contextmenu); `#caMap` is a fresh element per render so no duplicate listeners; `smap !== m` guard is a backstop | — | No change |
| `animate:false`: `_resetView` still fires `zoomend` (when zoom changes) and `moveend` synchronously; Events `numbers` is registered before the fit; Pets/where.js `moveend` handlers are on pin-picker maps, not `jcFitPins` maps | — | No change |
| `.DS_Store` modified in the working tree | Low | Not staged |
| Same per-open listener pattern in `jcMapPopups` `[data-popopen]` (shared, all 4 maps) and Events `[data-report]` | Follow-up | Logged in `docs/plans/backlog.md` (2026-11-24 item); kept out of this PR's scope as planned |

## Evidence (also in the contract)
- Line 986 (pin tapped mid-zoom): 300/300 after the fix (baseline 9/300).
- Line 992 cause, forced: re-rendering the open popup's content → old code 5/5 fail with the CI symptom (tap does
  nothing, h1 stays "Community Cats"); fixed code 20/20 pass. Map redrawn while open (c): impossible (Leaflet throws;
  real redraws rebuild the page). Map panning during the tap (a): 5/5 pass (Playwright waits for stable).
- Pictures: map tests on Cats / Events / Courts / Pets before and after (`/shot sweep … --grep map`) + AR shots of an
  event map and Pets. Where they differ, the "before" picture was caught mid-zoom (Courts pin off-centre, Events
  house number not yet shown); "after" is the intended final framing. AR pair identical.
- Full suite 799/799 locally (verify gate green).
