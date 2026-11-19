# DS-3 — shared pieces (plan, 2026-11-19)

Parent: `docs/plans/DS-design-system.md` (step DS-3). Approved by Zee 2026-11-19 as a **3-PR split** (3a → 3b → 3c,
serial: they share `app.css`, `pets.css`, `cats.css`). Tier: cross-layer (shared stylesheet loaded by 7 pages, shared
markup functions, a CI guard). No database, RPC, auth or paid layer is touched.

## Guard bug found in planning (fixed first, in 3a)
The duplicate-rule guard keyed a baseline line by `hash|file list`. Removing one copy changed the key, so CI called
a legitimate partial cleanup a **new** offender. Fix: match a dup by its body (hash); it is worse only when there are
more copies, or a module file (outside `commons/assets/`) that didn't hold the body now does. Promoting a module copy
into `commons/assets/` passes. Tests cover all four cases (`tests/ci/design-guard.test.mjs`).

## Prior art (final)
| Building block | Existing | Decision | PR |
|---|---|---|---|
| Textarea | 5 module copies | EXTRACT → `app.css`; taller boxes via `rows`, never module CSS | 3a |
| Dropdown | cats.css, admin.css (≈30px on iOS) | EXTRACT, upgraded: field look, 46px, own chevron (end side, left in Arabic) | 3a |
| Date / time / datetime / number | cats.css, admin.css (`.pmform`, `#ctForm`, `#cdBlockForm`) | EXTRACT into the app.css field rule | 3a |
| Courts `.cdbar` date pill | admin.css (invisible input over a pill) | DEPART — deliberate iOS fix; stays in the baseline (`min-height:0` added so the shared rule can't leak) | 3a |
| Checkbox `label.check` | pets, cats, bookings, admin (all different) | EXTRACT + `accent-color` (D13) | 3a |
| Disabled field | admin only | EXTRACT | 3a |
| `.opts` pills | shared; events + home overrides | REUSE (overrides deleted) | 3a |
| Page shell (12px rhythm) | pets, cats, bookings | EXTRACT, opt-in class on `<main>` (a bare `main{}` would restyle Events / My Home / Organizer Tools / Account) | 3b |
| List cards `.bklist` | pets, bookings | EXTRACT (Organizer Tools' `.sulist` etc. later) | 3b |
| `.chip` copy | bookings (exact copy of app.css) | REUSE | 3b |
| Photo card grid | pets.css + `card()` | EXTRACT → app.css + `jcCardHtml` (`assets/blocks.js`) | 3b |
| Hero header | pets.css (two rules, one dead) + pets.js | EXTRACT → `jcHeroHtml` | 3b |
| Facts list | pets.css + pets.js | EXTRACT → `jcFactsHtml` + Arabic alignment fix | 3b |
| Dated-entry list (sightings, care log; Cats activity next) | pets.js `sightingsHtml` / `logHtml` | EXTRACT → `jcEntriesHtml` | 3b |
| Pets "Open in Google Maps" link | pets.js inline | DEPART for now: `jcDirLink` says "Directions" (visible wording change) — decide in DS-4 | — |
| State boxes `.alarm` / `.seenbox` | Pets only | Module-only until a 2nd user (design.md §10) | — |
| Photo viewer zoom | none | NEW in the shared viewer | 3c |
| Cats map REUSE (retro) | already shared | DS-4 (nothing to extract) | — |

## Screens to match
| Changed screen | Must look like | Decision |
|---|---|---|
| Pets list, pet page, Edit pet | themselves before DS-3 (`docs/design/*.jpg`) | MATCH (pixel diff) except checkbox colour, Arabic facts |
| Pet page Arabic | `pet-stray-ar.jpg` | DEPART on purpose: Latin facts line up right |
| Organizer Tools editors | current + `admin.jpg` | MATCH except dropdowns 46px + chevron (D7), accent checks |
| Event sign-up, My Home feedback | current | MATCH (shared `.opts` look) |
| Cats editors / visit form | Edit pet, controls only | MATCH on controls; layout is DS-4 |
| Courts booking + day view | current | MATCH |

**Agreed DEPARTs (Zee, 2026-11-19, from the 3a plan-conformance review):** one shared look wins over the old
per-module look — (1) Edit pet checkbox rows ~3px tighter (no browser margin round the box); (2) Organizer Tools
checkbox text 400 → 600, Pets' weight; (3) Organizer Tools banner box 60 → 80px (the shared minimum); (4) My Home
feedback box ~15px taller (`rows="4"`). Done-when #1 reads with these.

**Agreed DEPARTs (Zee, 2026-11-19, from the 3b plan-conformance review):** (A) Pets keeps its own `.acts` rule for the
button rows in the alarm / seen-out / share boxes (same body as the shared `.bklist .acts`) — it moves with the state
boxes when Cats needs them (DS-4); a global `.acts` now would restyle the Cats report form and Organizer Tools rows.
(B) Organizer Tools' care-log rows (`admin.js` ~830, `ul.sulist`) repeat the `jcEntriesHtml` markup — switched over with
the Organizer Tools cleanup, not in 3b.

## Done when
| # | Check | Proof | PR |
|---|---|---|---|
| 1 | Pets list, pet page, Edit pet look the same apart from the checkbox colour | `/shot` before vs after side by side + pixel diff | 3a, 3b |
| 2 | Arabic: a Latin fact value lines up right | side by side + e2e computed `text-align` | 3b |
| 3 | Every dropdown in Organizer Tools and Cats ≥ 46px, one chevron, flipped in Arabic | e2e (EN + AR) + screenshots | 3a |
| 4 | Checkboxes are the accent colour | e2e computed `accent-color` + screenshot | 3a |
| 5 | Guard shrinks and still catches copies | guard unit tests + CI `design-guard` | 3a |
| 6 | Courts day pill, event sign-up pills, feedback form unchanged in behaviour | existing specs + day-pill size e2e + screenshots | 3a |
| 7 | Photo zooms (double-tap / button), pans; swipe or tap while zoomed doesn't change or close it | `photo-viewer.spec.js`, EN + AR | 3c |

## Premortem (summary)
#1, #3, #5, #6: not exposed (no write path, no paid layer, no auth). #2: a helper returning empty markup → Pets specs
assert cards / facts / sightings by id + pixel diff. #2b: CDN can serve new CSS with old HTML for ~10 min → one commit
per PR, pre-launch, spacing-only failure. #7: `git revert` per PR. #8: the target; every screen in the table above gets
a side-by-side. Extra: loosening the guard by accident → four-case tests before any CSS moved.

## Progress
- **3a** (branch `ds-3a-shared-controls`): guard fix + tests (12/12); shared fields / textarea / select / dates /
  checkbox / disabled in `app.css`; module copies removed; baseline 51 → 23 bare, 19 → 15 dup; 605 affected specs green
  (Chromium); screenshots: pets list + stray page pixel-identical; Edit pet = accent checkbox, rows 3px tighter;
  Organizer Tools = 46px dropdowns with chevron (left in Arabic), accent checks / radios, checkbox text 400 → 600
  (Pets' weight); feedback box ~15px taller (`rows="4"`).
- **3b** (branch `ds-3b-page-pieces`): page shell (`main.jcpage`, `.jcstack`), `.bklist`, `.head`, photo cards, hero,
  facts → `app.css`; `assets/blocks.js` (`jcMetaHtml`, `jcCardHtml`, `jcHeroHtml`, `jcFactsHtml`, `jcEntriesHtml`); Pets
  switched over; Courts / Cats drop their shell + list copies. Pixel diff vs main: Pets list, stray, sightings, missing,
  Rex, Courts list / day / My Bookings, Cats = **0 px**; Arabic stray page = only the facts line (fixed). Dup 15 → 12.
  Found, not in scope: a Latin care note (`.care .note`) sits flush left in Arabic → DS-4 (reworks care rows, D5).
- **3c** (branch `ds-3c-viewer-zoom`): shared viewer zoom — Zoom In / Zoom Out button (EN + AR strings) and double-tap =
  2.5× toward the tapped point; drag pans, clamped to the photo's edge; while zoomed a drag never steps and a tap never
  closes; next / previous starts unzoomed; the browser's own image drag is blocked (it cancelled the pan). Real pinch is
  not built (a second finger still only cancels a swipe). `photo-viewer.spec` zoom test EN + AR passes on Chromium and WebKit.

