# DS-4 — rebuild Cats on the shared pieces (plan, 2026-11-19)

Parent: `docs/plans/DS-design-system.md` (step DS-4). Sources: `docs/qa/cats-design-review-2026-11-19.md` (D1–D14),
`docs/qa/plan-conformance-retro-cats-review-2026-11-19.md` (map REUSE row, dated-entry list), DS-3 carry-ins
(`.care .note` in Arabic, DEPART A `.alarm`/`.acts`, "Open in Google Maps" wording). **Approved by Zee 2026-11-19** (all four decisions as recommended; merge pre-authorized for all three PRs).

## Scope
**Tier: cross-layer.** It touches shared CSS (`app.css`, which 7 pages load), shared markup (`blocks.js`, `map.js`),
Pets (pieces move out of `pets.css` / `pets.js`) and the CI baseline. **No database, RPC, auth, storage or paid layer.**
Manifest LAST VERIFIED 2026-11-19 (fresh). No `[live]` layer is touched, so no re-query is needed.

Already done elsewhere: D7 dropdown height/chevron and D13 accent checkboxes (DS-3a), D12 zoom (DS-3c).

## Split: three PRs, run one after another (they share `cats.js` / `log.js` / `app.css`)
| PR | What | Findings | Est. LOC (app, excl. specs) |
|---|---|---|---|
| **4a** | Cats list + cat page | D1, D2, D3, D5, D6, `.care .note` Arabic, missing = red alarm | ~250 (mostly replacing code; cats.css shrinks) |
| **4b** | Activity + forms | D4, D8, D9, D10, D11, D14, D7 pills, sighting mini maps, one map-link wording | ~300 (log.js card/list/forms rewritten; justify: one screen family, splitting further leaves half-converted forms) |
| **4c** | Stations: nearest-first + Map tab | CC plan map REUSE row (retro) | ~120 |

## Inventory (layers from `docs/architecture.md`)
| Layer | Touched? | Check |
|---|---|---|
| Commons frontend | **Yes**: `cats/cats.js`, `cats/log.js`, `cats/cats.css`, `assets/app.css`, `assets/blocks.js`, `assets/map.js`, `pets/pets.css`, `pets/pets.js` (helpers moved), `assets/strings.js` (new / removed keys, EN + AR) | read all four Cats files + pets.js 395–550, 780–840 |
| Database / API | Not touched | every field drawn already arrives from `jc_cat_register` / `jc_cats_public` / `jc_cat_programme` / `jc_cat_places` / `jc_cat_activity` (cats.js 371–416, log.js 70–103). The forms send the same RPC payloads (asserted, Done-when 3/5) |
| Auth & sessions | Not touched | role checks `inProgramme` / `canEdit` / `canEditCats` (cats.js 28–36, 367) stay as they are. Residents' data is filtered by the server (`jc_cats_public`), so the page can't show what it never receives |
| Storage | Not touched | photos use `jcPetPhotoHtml` / `jcPetPhotoUpload` as now |
| Scheduled jobs / Edge Functions | Not touched | the Cats page calls neither (grep `functions/v1` in cats/: none) |
| Hosting (Pages + commons.ae) | Deploy only | static files |
| CI | Baseline shrinks | `design-guard-baseline.txt` lines 30, 32 name `cats.css`; both go when the copies are removed. `plan-followed.yml` / `review-saved.yml`: PR bodies + review notes |
| Tests | Yes | `cats.spec.js` (29 tests, ~35 selector hits on old classes), `pets.spec.js` (shared moves), `photo-viewer.spec.js` |

## Prior art (final decisions)
| Building block | Existing | Decision | PR |
|---|---|---|---|
| Tabs, no repeated heading (D1) | `jcTabsHtml`; `h2.group` | REUSE. Residents get tabs too (Cats · Stations), as Pets | 4a |
| Cat cards (D2) | `ul.ptgrid` + `jcCardHtml` | REUSE; `.caCat*` CSS deleted | 4a |
| Search | `jcSearchHtml` | REUSE (already) | — |
| Hero (D3) | `jcHeroHtml` | REUSE: first photo as the tile (opens the viewer with all photos), name, meta "code · area", status / provisional chips | 4a |
| Edit button on the cat page | Pets / Courts `a.adminbtn` beside the name | REUSE (`afterNameHtml`, label "Edit") | 4a |
| Story | `.desc` (pets.css, module-only) | **EXTRACT** → app.css (2nd use) | 4a |
| Facts (D3) | `jcFactsHtml` | REUSE, three groups under `h2.group`: About (coat, sex, life stage, old ID) · Health (ear tip, sterilised, TNVR) · Where (area, station) | 4a |
| Status history (D5) | `ul.care` rows | REUSE (`.nm` status, `.st` date, `.note` source) + fix `.care .note` Latin text in Arabic (app.css) | 4a |
| Missing cat | Pets `.alarm` (module-only) + `.acts` | **EXTRACT** `.alarm` + `.acts` → app.css (2nd use; closes DS-3 DEPART A). `.seenbox` stays in Pets (no 2nd use) | 4a |
| Missing = red | design.md §1: `--jc-danger` = missing; Cats uses amber `.warn` today | **change:** card `li.missing` + `.chip.miss` + alarm, as Pets | 4a |
| Private-location chip (D6) | `.head` chip row in cards / `.evtop` | REUSE: chip inline after the title | 4a |
| Activity / cat history list (D4) | `jcEntriesHtml` | REUSE: meta = "Feeding visit · date · place · by", body, actions in `.acts` at the foot; "Show older" in `afterHtml` | 4b |
| "Seen this cat" (D4) | Pets "Report seeing ⟨name⟩" ghost `.btn` above the list | REUSE placement + wording | 4b |
| Card actions (D11) | `.bklist .acts` | REUSE: Link dropdown full width, then Link · Hide at the foot | 4b |
| Mini maps on sightings | `.ptmini` CSS (pets.css) + `drawMinis` (pets.js, lazy via IntersectionObserver) | **EXTRACT** → app.css + `jcMinisDraw()` in map.js; Pets calls it | 4b |
| Map link wording | Pets inline "Open in Google Maps"; Cats `jcDirLink` "Directions" | **EXTRACT** `jcMapLink(lat,lng)` ("Open in Google Maps") for *where something was seen*; `jcDirLink` ("Directions") stays for *places you go* (stations) | 4b |
| One "Log activity" (D10) | design.md Never #10 | NEW screen made only of shared pieces: `.opts` pills "Feeding visit · Sighting", then that form. A visit asks for the station (dropdown) unless opened from one. Station cards' "Log a visit" and the cat page's "Report seeing" open the same screen, already filled in | 4b |
| Dropdown redraw (D9) | design.md §5 Dropdown rule | Change only the dependent part (`hidden` toggle / rebuild the station options), never redraw + re-focus. Applies to the sighting form (cat, station) **and** the cat editor (area → stations, ear tip → side) | 4b |
| Pills for short lists (D7) | `.opts` | REUSE: sex (3), life stage (4), ear tip (3), sterilisation (3). TNVR (6) and status (8) stay dropdowns | 4b |
| One caption per control (D8) | design.md §5 | the fieldset legend names the group; the controls inside get distinct labels ("Since", "Source") or `aria-labelledby` the legend | 4b |
| Editor sections + Save last (D14) | Edit pet | Photos first (inside the form), then About · Where · Health · Status · Record, then Merge, then **one Save at the bottom**. Photos still upload at once (as today) | 4b |
| Visit cat picker `.caPick` | module-only tap-to-pick grid | Stays module-only (no 2nd use) | — |
| Number / date fields | app.css field rule | REUSE (already) | — |
| Station list nearest-first | `jcSortedHtml` / `jcSortedWire` | REUSE | 4c |
| Station map | `jcMapHtml` / `jcBigMap` / `jcPopHtml` / `jcFitPins` | REUSE: a Map tab (stations as pins; private pins only for the programme, which only it receives) | 4c |
| Cat page Map tab | Pets has one | **DEPART**: a cat belongs to a station (Where facts + Directions), and located sightings get mini maps. No map tab | — |

## Screens to match
| New / changed screen | Must look like | Decision |
|---|---|---|
| Cats tab (programme + residents) | Pets list `design/pets-list.jpg` | MATCH |
| Cat page, About | Stray page `design/pet-stray.jpg` · AR `pet-stray-ar.jpg` | MATCH (no Map tab: DEPART above) |
| Cat page, Activity · Activity tab · station history | Pet Sightings `design/pet-sightings.jpg` | MATCH |
| Cat editor · visit form · sighting form · Log activity | Edit pet `design/pet-edit.jpg` | MATCH (layout + controls) |
| Activity cards with Hide / Link | Organizer Tools rows `design/admin.jpg` | MATCH (actions at the foot) |
| Stations list + Map tab | Pets Strays list + Map | MATCH |
| Pets list / stray / sightings / edit (shared moves) | themselves before | MATCH, 0 px pixel diff |

## Impact map
| Change | Also used by | Could break | Assumption → check |
|---|---|---|---|
| `.alarm`, `.acts`, `.desc`, `.ptmini` → app.css | Pets (alarm, seen-out box, share block, sightings) | Pets spacing if a body differs | Bodies identical → pixel diff Pets 0 px; a global `.acts` must not restyle the Cats report form / Organizer Tools (DS-3 DEPART A reason) → grep `.acts` users first; scope to `.alarm .acts, .seenbox .acts, .share .acts, .bklist .acts` if needed |
| `jcMinisDraw` in map.js | Pets Sightings tab | Pets minis not drawn | pets.spec mini-map test passes |
| `jcMapLink` | Pets sightings link | Wording / URL changes | same string key `pt_on_map` → moved to a shared key, same EN/AR text |
| Cat page rebuilt | residents + programme | Programme-only facts shown to residents | residents' payload lacks them; spec asserts no Health TNVR / old ID / history for residents |
| Forms rewired (D9, D10, D14) | `jc_cat_save`, `jc_cat_visit_add`, `jc_cat_sighting_add` | a field dropped from the payload (silent) | spec captures each payload and compares to today's shape field by field |
| Activity list on `jcEntriesHtml` | Activity tab, station history, cat page | "Show older" / Retry / in-place repaint after Hide / Link (`logPaint` keys by `.caLogBox`) | keep `.caLogBox` wrapper; specs for paging, retry, hide in place stay green |
| Log activity entry point | station cards, Activity tab, cat page | testers can't find "Log a sighting" | tester note in the CC-4 message (still unsent: send after 4b) |

## Regression surface (must keep working)
- Residents: cats list + search, cat page, public stations, Directions links. Module flag off → "off" screen, no RPCs.
- Programme: station add / edit / archive / restore, areas add / rename / archive; cat add (→ editor reopens on the new cat), edit, photos add / remove (max 4), merge / unmerge.
- Visits: date window (14 days), counts validation, recognised cats + "show all", problem flag. Sightings: cat or description, station / pin / area, 14-day window.
- Activity: kind chips, 50 a page + Show older, Retry, Hide / Show in place, Link / Unlink, focus kept after write.
- Pets: list, stray page, alarm, seen-out box, share block, sightings with mini maps, edit — unchanged.
- Arabic: every screen mirrors; Latin names right-aligned.

## Done when
| # | Check | Proof | PR |
|---|---|---|---|
| 1 | The Cats tab looks like the Pets list: two-column photo cards with gaps, no "The cats" heading; residents get Cats · Stations tabs | side by side vs `pets-list.jpg`, EN + AR | 4a |
| 2 | A cat's page looks like a stray's page: photo beside the name, facts as label–value under About / Health / Where, status history as record rows; a Latin note lines up right in Arabic; a missing cat shows the red alarm | side by side vs `pet-stray.jpg` + `-ar.jpg`; e2e computed `text-align` on `.care .note` | 4a |
| 3 | One "Log activity" button → pick Feeding visit or Sighting; a visit asks for its station; saving sends exactly today's payload | e2e payload assertions (visit + sighting) | 4b |
| 4 | Picking from any dropdown in the sighting form or cat editor doesn't redraw the form or move focus (the iPhone "won't close" bug) | e2e Chromium **and WebKit**: the same `select` element survives the change, `activeElement` unchanged; **Zee on the iPhone** | 4b |
| 5 | Cat editor: pills for sex / life stage / ear tip / sterilisation, one caption per control, Photos first, Merge above one Save at the bottom; Save sends today's payload | side by side vs `pet-edit.jpg`; e2e payload | 4b |
| 6 | Activity entries and a cat's sightings use the shared dated list: actions at the foot, mini map + "Open in Google Maps" on located sightings; paging / hide / link still work in place | side by side vs `pet-sightings.jpg` + `admin.jpg`; existing activity specs | 4b |
| 7 | Stations nearest-first + a Map tab with pins; residents never get a private station | e2e (resident stub with no private rows → no private pin; programme sees chip + pin) + screenshot | 4c |
| 8 | Pets is unchanged by the shared moves | pixel diff Pets list / stray / missing / sightings / edit = 0 px; pets.spec green | 4a, 4b |

## Premortem (§0.5)
| # | Mode | Exposed? | Mitigation |
|---|---|---|---|
| 1 | Silent data corruption | **Yes**: rewired forms could drop or rename a field and the server would accept it (most are optional) | Done-when 3/5: field-by-field payload assertions for `jc_cat_save`, `jc_cat_visit_add`, `jc_cat_sighting_add` written **before** the forms change |
| 2 | Silent zero-output | **Yes**: a shared helper returning `''` (for example `jcEntriesHtml` with no `empty`) shows a blank tab | always pass `empty`; specs assert cards / facts / entries by id, and the "none" lines |
| 2b | Out-of-band drift | Low: CDN can pair new CSS with old JS for ~10 min | one commit per PR; Cats is not open to residents yet (testers only) |
| 3 | Cost | Not exposed: Map tab tiles are free OSM/Esri, the same as Pets; mini maps stay lazy and capped at 10 | — |
| 4 | Contract drift | Not exposed: no RPC change | — |
| 5 | Race / ordering | Low: D9 keeps the Where map wired while hidden; the station choice wins over a pin (as today's payload logic) | spec: pick a pin, then a station → payload has the station only |
| 6 | Auth / RLS | Not exposed server-side. Client: residents' view rebuilt | the server never sends programme fields to residents; spec asserts no programme rows for residents |
| 7 | Rollback | `git revert` per PR; module flag off = kill switch | — |
| 8 | Visual drift | **The target** | every row of Screens to match gets a side-by-side; `/ship-pr` 3b plan-conformance review |
| — | "Users notice it behaves differently" | **Yes**: testers lose "Log a sighting" and the station "Log a visit" moves into Log activity | the tester message goes out after 4b with one line on it |

## Open decisions for Zee (recommendation first)
1. **A missing cat = red** (alarm box, red card border), as a missing pet. Today it's an amber chip. Recommend yes: design.md reserves red for missing.
2. **Residents' Cats page gets tabs** (Cats · Stations, then Map in 4c) instead of two headed sections. Recommend yes.
3. **Map link wording:** "Open in Google Maps" where something was *seen*; "Directions" for a place you *go* (stations). Recommend yes.
4. **No Map tab on a cat's page** (DEPART). Recommend yes.

## Progress
- **4a** (branch `ds-4a-cats-list-page`): Cats tab on Pets photo cards + "Missing now" wide group (Pets list order);
  residents Cats · Stations tabs; cat page = hero + alarm + About · Activity + facts (About / Health / Where) + status
  history rows; Private chip inline. Shared: `.alarm` + `jcAlarmHtml`, `.jcpage .acts`, `.jcpage .desc`; Arabic
  `.care .note` / story right-aligned; typed parts in joined values isolated. Pets 0 px (10 screens EN + AR).
  Review: `docs/qa/DS-4a-review-2026-11-19.md`.
- **4b** (branch `ds-4b-cats-activity-forms`): exact payload tests first (cat save / visit / sighting, then the forms changed);
  Activity tab, station history and a cat's Activity on `jcEntriesHtml` (meta kind · when · where · by; actions in one
  `.acts` at the foot; no heading inside a tab); "Report seeing ⟨name⟩"; one "Log activity" screen (Feeding visit ·
  Sighting pills; a visit asks for its station; switching keeps the station); D9: selects update only their dependent
  part (WebKit too); cat editor: Photos first, pills for sex / life stage / ear tip / sterilisation, legends as the only
  caption, Merge above one Save, no Cancel (as Edit pet). Shared: `jcMiniHtml` / `jcMinisDraw` / `jcMinisClear`,
  `.ptmini` CSS, `jcMapLink` (Pets + Organizer Tools switched over; `pt_on_map` → `map_open`), `jcEntriesHtml` optional
  heading + `liAttrs`. Pets 0 px (10 screens EN + AR).
  Review fixes: a visit opened from a station names it (no dropdown), as the plan's D10 row; shared `jcPillsHtml`.
  **DEPARTs recorded at review (4b):** (1) the visit and sighting forms lose their Cancel button — back arrow only, as Edit
  pet (the editor's was covered by D14); a draft is lost on Back, as on Edit pet. (2) Choosing a station while the pin map
  is open redraws the sighting form (a hidden pin map can't stay open) — the one D9 exception, rare. (3) string key
  `pt_on_map` renamed `map_open` (now shared). Review: `docs/qa/DS-4b-review-2026-11-19.md`.
- **4c** (branch `ds-4c-cats-stations-map`): Stations tab (residents + programme) = the Pets Strays layout: the map of the
  stations (the kit: Street / Satellite, Full Screen, Find Me; name labels; popup → Directions, and for the programme
  History) above a nearest-first list (`jcSortedHtml` / `jcSortedWire`, Use Where I Am, distance line); stations as
  `ul.bklist` list cards with Directions · Log a visit · History · Edit in `.acts` at the foot; archived last.
  **DEPART (4c):** the plan said "a Map tab"; the reference screen (Pets Strays) has its map *inside* the tab above the
  list, and coordinators already have four tabs — so the map sits on the Stations tab, no fifth tab. Done-when 7 reads
  "a map with pins" accordingly. Residents get only public stations (the server sends no others; spec counts the pins).
