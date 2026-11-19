# Events map: house-number labels — review (2026-11-19)

Plan: `/plan-change` (Localized) in session, approved by Zee 2026-11-19 ("approve it and test once it's done, then we
can adjust if needed"). ROADMAP entry "Events map: house-number labels when zoomed in". Branch
`events-house-number-labels`. Tier 2 (screen logic; no RPC, schema, auth or PII change). Reviewer: `code-reviewer`:
APPROVE, 0 critical / 0 high / 1 medium / 1 low.

## What changed
- `commons/events/events.js`: on a homes event's map, each home pin carries a permanent label with its house number
  ("206"; an apartment keeps its building, "Apt 5, B2"), styled with the shared `.bklabel` (as Courts / Strays / Cats).
  Labels show from zoom 18 in (`EV_NUMBER_ZOOM`); further out the map box gets the shared `.nolabels`. Labels made
  while hidden (the event-night refresh while zoomed out) are measured 0×0 by Leaflet and sat on the pin, so they are
  placed again (`tooltip.update()`) when they become visible.
- `commons/assets/mapui.css` (**scope addition, shared**): `.leaflet-tooltip{left:0; top:0}`. Leaflet's CSS never
  sets left / top on tooltips, so in Arabic (dir=rtl) every pin label sat to the left of its pin: the new house
  numbers, and also the existing Courts, Strays, Cats station and venue labels (found in the AR side-by-side; the
  Courts reference had the same shift). No change in English (the default is already 0).
- Tests (`events.spec.js`): zoom 17 / 16 hide, 18 shows, the label is centred above its own pin, a pin under labels
  still taps, a redraw while zoomed out then zoom in is placed right, apartments keep their building; Arabic label
  centred above its pin; the hostile-number test also checks the label renders text.

## Findings and disposition
| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | M | The `update()` fix had no test for the case it exists for: a redraw (event-night refresh) while zoomed out | **Fixed**: the house-number spec redraws at zoom 16, zooms to 18 and checks placement. Fails without `update()` (437.8 > 420.6), passes with |
| 2 | L | Geometry check compares one pin / one label by order | **Accepted**: fixture order = DOM order; the Arabic spec checks the same for its pin |
| 3 | — | Found while testing: right after a redraw, old and new labels both exist for 200 ms | **Checked, not a bug**: Leaflet fades a removed tooltip for 200 ms; after 400 ms one label per pin (5 redraws → 1). The spec waits for the count |

## Spacing check (the zoom-18 choice)
Planned to confirm against real home pins. JubailCommons has only 10 pinned homes (test data, nearest neighbour
≥ 55.6 m); the SignalPost project (2026 Halloween pins) did not answer. **Not confirmed on real data.** A synthetic
street (villas 28 m apart, rows 40 m) fits at 18 with no overlap (`labels-en.jpg`); at 17 the pins themselves touch
(`labels-zoom.jpg`). Zee tests on the phone before merge and we adjust `EV_NUMBER_ZOOM` if needed.

## Evidence
- `docs/qa/events-labels/labels-en.jpg` — Events map at 18 beside Courts (reference), EN
- `docs/qa/events-labels/labels-ar.jpg` — same in Arabic, after the RTL fix (Courts label now over its pin too)
- `docs/qa/events-labels/labels-zoom.jpg` — zoom 17 (no numbers; pins already touch) vs 19
- Specs: events / event-day / events-audit / courts / pets / cats **273/273** (mobile Chromium); the 3 new or extended
  tests ×10 under 6 workers **30/30**; on WebKit **3/3**; design-guard OK (baseline unchanged).
