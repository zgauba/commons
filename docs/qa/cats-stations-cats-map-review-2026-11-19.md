# Cats: cats and stations on one map (programme) — review (2026-11-19)

Plan: `/plan-change` (Localized) in session, approved by Zee 2026-11-19. ROADMAP entry "Cats: cats and stations on
one map" (programme version decided). Branch `cats-stations-cats-map`. Tier 2 (screen logic; no RPC, schema, auth or
PII change). Reviewer: `code-reviewer`: APPROVE, 0 critical / 0 high / 0 medium / 2 low.

## What changed
- `commons/cats/cats.js` (`drawStations`, new `homeCats`): programme users only (coordinators, volunteers, community
  admins). A station pin's label adds "· N cats" (cats whose home station it is, from the register; merged, adopted,
  transferred and deceased cats don't count; clinic / foster do). The pin is red (`--jc-danger`, the reserved
  "missing" signal) when one of them is missing. The popup keeps History · Directions and lists the cats as `.mini`
  buttons below them: missing first in `.mini.danger` ("Luna · Missing"), then A–Z. A long list scrolls inside the
  popup (maxHeight 240). Tapping a cat leaves full screen and opens its page.
- `commons/assets/map.js`: `jcMapColors()` gains `danger` (additive; callers read named keys only).
- Strings `ca_pin_cat` / `ca_pin_cats` (EN + AR).
- Residents: unchanged; their data carries no station link (`jc_cats_public` / `jc_cat_places`).

## Findings and disposition
| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | L | No test that a popup still works after close and reopen | **Accepted**: Leaflet rebuilds popup content on each open, so the buttons are new nodes each time (no listener stacking) |
| 2 | L | Test picks pins by position | **Accepted**: stub station order is fixed; the popup's contents assert which station it is |
| — | — | Found in the busy-station screenshot: 11 cats pushed History / Directions below the map | **Fixed** before review: cats moved after History · Directions, popup maxHeight 240 (`stations-busy.jpg`) |

## Plan conformance
| Plan row | Plan said | Verdict |
|---|---|---|
| Pin + label | REUSE `.bklabel`, add the count | FOLLOWED |
| Red for missing | REUSE `--jc-danger`; EXTRACT `danger` into `jcMapColors` | FOLLOWED |
| Popup | REUSE `jcPopHtml`, History + Directions stay | FOLLOWED; cats sit after them (`after`), not before — the busy-station fix |
| Cat list | REUSE `.mini` / `.mini.danger` in `.popacts` | FOLLOWED |
| Open a cat | REUSE `catId` + `show("cat")` | FOLLOWED |
| Which cats count | not merged / adopted / transferred / deceased | FOLLOWED (test: 5 at the station → "3 cats") |

## Evidence
- `docs/qa/cats-stations-map/stations-en.jpg` / `stations-ar.jpg` — Stations popup beside Pets Strays popup (reference)
- `docs/qa/cats-stations-map/stations-busy.jpg` — 11 cats vs 3: History / Directions stay in reach, the list scrolls
- Specs: cats / pets / events / event-day / courts / home **279/279** (mobile Chromium); the new + DS-4c tests ×5 under
  6 workers **15/15**; WebKit **3/3**; design-guard OK.
