# Plan conformance, run retroactively on Cats (2026-11-19)

Purpose: prove the new `/ship-pr` step 3b (DS-5 E1) would have caught the Cats drift. Reviewer: `code-reviewer`,
given the step-3b instruction verbatim, the plan `docs/plans/CC-community-cats.md` (Prior Art lines 37-54, premortem UX
row line 123, CC-4 Done-when lines 199-207) and Cats as merged on `origin/main`. Line numbers are `origin/main`.

**Verdict: it would have blocked both CC-3 and CC-4.**

## 1. Plan rows

| Plan row | Plan said | Verdict | Evidence |
|---|---|---|---|
| Module on/off, bar, renamable name | REUSE | FOLLOWED | cats.js:579, :561, :109, :114 |
| Roles | REUSE `jc_module_admin_*` | FOLLOWED (client) | cats.js:28-36 |
| Tabs / sub-menu / back | REUSE | FOLLOWED | cats.js:130, :132, :143; log.js:174, :213 |
| Maps, pins, nearest-first, mini maps | REUSE `jcBigMap`, `jcSortedWire`, `jcMiniMap`, `jcFitPins` | **NOT FOLLOWED** (partly) | Only the pin picker (via `where.js`); station list is plain cards (cats.js:86-97, :206-213); sightings use `jcDirLink` (log.js:85) where Pets draws `.ptmini` (pets.js:538). Progress notes say "no map yet" but the row was never changed to DEPART |
| "Where is it?" step | EXTRACT to `assets/` | FOLLOWED | `assets/where.js`; cats.js:153, :183; log.js:315, :332. Pets' own copy (pets.js:953) moves in CC-7 per plan |
| Photo shrink / upload / URLs | REUSE `pet-photo.js` | FOLLOWED | cats.js:327, :382, :482, :531-533; log.js:205 |
| Photo viewer | NEW shared | FOLLOWED | cats.js:382, :482 (`{view: photos}`) |
| Desktop layout | NEW shared | FOLLOWED | no `@media` in cats.css |
| Care states | DEPART data; "same timeline look on screen" | FOLLOWED (data) / **NOT FOLLOWED** (look) | history is `ul.helplist#caHist` (cats.js:402-405) vs Pets `ul.care` (pets.js:462) |
| Soft archive / restore | REUSE pattern | FOLLOWED | cats.js:175, :186-188, :252, :361-364 |
| Rate limits, admin log, error codes | REUSE | FOLLOWED | cats.js:27, :116 |
| Search + filter chips | REUSE | FOLLOWED | cats.js:345, :332; log.js:160, :165 |
| Premortem UX row (line 123) | "cat page reuses the pet page's header, tabs, map tab and photo look" | **NOT FOLLOWED** | cat page = `.caPhotos` + `h1` + `ul.helplist.caFacts` (cats.js:380-399) vs `.pthero` (pets.js:407), `dl.facts` (pets.js:436), About/Sightings/Map tabs |
| CC-4 "Shared pieces only" | `jcTabsHtml`, `jcChipsHtml`, `where.js`, `pet-photo.js`, `.row` / `.mini` | JS FOLLOWED / **CSS NOT FOLLOWED** | new `.caPick`, `.caLog` (cats.css:34-44); `input[type=number]` / `datetime-local` rules (cats.css:45-48) |

## 2. Duplicates (no plan row covered them)

| Cats | Existing | Should have been |
|---|---|---|
| cats.css:2-6 page shell | pets.css:2-6, bookings.css:2, :24-27 | EXTRACT to app.css (3rd copy) |
| cats.css:7-14 `.panel textarea`, `.panel p`, `.check` | pets.css:28-32 | EXTRACT |
| cats.css:11-12 `select{}` | admin.css:48 | EXTRACT |
| cats.css:30-32 `input[type=date]` | app.css:30-35 field look + admin `.pmform` | EXTEND app.css field rule |
| cats.css:45-48 `number`, `datetime-local` | app.css:30-35 (number), admin.css:10-14 (datetime-local) | REUSE miss / EXTRACT |
| cats.js:326 cat card `button.panel.caCat` | `.ptgrid` / `.ptcard` (pets.js:268, pets.css:45-59) | EXTRACT + REUSE |
| cats.js:380-399 cat page header + facts | `.pthero`, `.ptwho`, `dl.facts` (pets.js:407-436) | EXTRACT + REUSE |
| cats.js:402-405 status history | `ul.care` (pets.js:462), `ul.bklist#ptLog` (pets.js:547) | REUSE |
| log.js:64-112 dated-entry list | Pets `sightingsHtml` / `logHtml` (pets.js:530-548) | EXTRACT a shared dated-entry list |

Also noted: Pets builds its Google Maps link inline (pets.js:541) where Cats already uses the shared `jcDirLink`;
the copied `takeMap` / `draw` / save wrappers (cats.js:43-74) are low value, not a finding.

Disposition: everything here is DS-3 / DS-4 scope (added to `docs/plans/DS-design-system.md`).
