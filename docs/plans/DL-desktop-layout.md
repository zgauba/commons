# DL — Desktop layout (shared, every module) — `/plan-change` 2026-11-17

> Status: **approved 2026-11-17** (Zee: 900 px, 600 px, Organizer Tools wide now). First build step of Community Cats
> (`docs/plans/CC-community-cats.md`): the coordinator works on a computer, so Cats is built wide from the start.
> ROADMAP → "Desktop layout (shared, every module)".

## Step 0 — Scope

- **Tier: cross-layer by the letter (a shared utility, `assets/app.css`, used by every page), but one layer only
  (frontend).** No DB, no auth, no storage, no paid layer. Verification tier: **cosmetic** (layout / CSS) → affected
  specs + CI + screenshots, no reviewer agent; short review note in `docs/qa/`.
- Manifest LAST VERIFIED 2026-11-17. No `[live]` layer touched.

## Step 1 — Inventory

| Layer | Touched? | Check |
|---|---|---|
| Frontend shell | **Yes.** The only page-width rule: `assets/app.css:12` `main{max-width:480px}`. **No `@media` rule anywhere** (grep `@media` over `commons/**/*.css`) | grep `max-width`, `@media` |
| Pages using it | account, home, events, bookings, pets, admin (`<main>` in each `index.html`) | grep `<main` |
| Hub `commons/index.html` | **Not touched**: own inline `<style>`, already `max-width:860px` | `index.html:39` |
| Tab bar | **Yes, small.** `tabbar.css`: fixed full-width bar, `justify-content:space-around`, tabs ≤ 120 px → on a 1440 px screen the 4–5 tabs spread edge to edge | `assets/tabbar.css` |
| Maps | Not touched. `.pinmap` 44vh, full map `.evmapwrap.full` fixed inset 0; Leaflet re-measures on window resize (default `trackResize`) | `app.css`, `mapui.css` |
| Pop-ups | Not touched: `dialog.sheet` is `min(92vw, 420px)` | `app.css` |
| Organizer Tools lists | **Yes (class added).** Card lists: `.aevents` (events, `admin.js:468`), `.sulist` (stray reports 627, sign-ups 1121, households 1601, pets 2114 / 2118). `.sulist` is **also** used for timelines (care log 819, sightings 2509, day view 1381, pending 1404) — those must **not** become grids | grep `<ul class=` in `admin.js` |
| Tests | Every e2e project is an iPhone 13 viewport (`playwright.config.js:15,18`) → nothing exercises desktop today | config |
| DB / auth / storage / jobs / hosting / CI / secrets | **Not touched**: CSS + class names only | path scope `commons/assets/*.css`, `commons/admin/*` |

## Step 1b — Prior art

| Building block | Existing | Decision |
|---|---|---|
| Page frame width | `main{max-width:480px}` (`app.css:12`); hub's own 860 px | **REUSE + extend**: one breakpoint added to the same rule |
| Card grid | `.tpls` 2-column grid (templates, `admin.css:73`) — the only grid | **NEW shared** `.jcgrid` in `app.css` (a card list that becomes columns on desktop); `.tpls` stays |
| Map beside list | none (Events, Pets switch Map / List by tab) | **NEW shared** `.jcsplit`, **not applied** to existing modules in this step; Cats uses it first. Retrofitting Events / Pets is a separate ask |
| Tables | none (`<table` count in `admin.js`: 0) | **Deferred** to the first screen that needs one (Cats register, CC-3), so it's designed against real columns |
| Readable form width | none (everything is 480 px today) | **NEW**: forms and panels on wide pages stay ≤ 600 px |
| Breakpoint | none | **NEW**: one value, `900px`, used everywhere |

## Step 2 — Impact map

1. **Breakpoint `@media (min-width: 900px)`.** (a) Below 900 px nothing changes (phones, iPad portrait 768–834);
   (b) every page; (c) a rule leaking outside the media query would change phones; (d) every new rule sits inside the
   one media block — verified by the phone specs passing unchanged + a screenshot diff of 3 pages at 390 px.
2. **Resident pages 480 → 600 px.** (a) slightly wider column; (b) every resident page; (c) images sized in % grow
   (pet photo `.ptph.big` already caps at 300 px high); (d) assume nothing measures `main` in JS — `nav.js` measures
   tab labels only (checked: `tight` class logic).
3. **`body.wide` (Organizer Tools now, Cats later): main up to 1200 px**, forms / panels ≤ 600 px, card lists in
   `.jcgrid` become columns (`repeat(auto-fill, minmax(320px, 1fr))`). (b) admin screens; (c) a timeline list
   accidentally gridded reads out of order → grid is **opt-in by class**, added to 6 card lists only;
   (d) RTL: grid + logical properties flow right-to-left automatically — checked by an AR screenshot.
4. **Tab bar centred on desktop** (`justify-content:center`, small gap). (b) every page; (c) none on phones (inside
   the media query).

## Step 3 — Regression surface

- Phones (390 px) EN + AR: every page pixel-identical (all phone specs green, 3 before/after screenshots).
- Organizer Tools at desktop: events list, sign-ups by village, households, pets list, stray reports read as card
  grids; care log, sightings, day view, pending list stay single-column timelines.
- Full-screen map still covers the page and the tab bar; pin-drop map still centred under the ring.
- Pop-ups (help, map labels) unchanged.

## Step 4 — Proposal (one PR, DL-1)

- `app.css`: one `@media (min-width:900px)` block — `main` 600 px; `body.wide main` 1200 px; `body.wide form.panel,
  body.wide .panel` ≤ 600 px; `.jcgrid` columns; `.jcsplit` (list | map, map sticky) defined for Cats.
- `tabbar.css`: centred tabs inside the same breakpoint.
- `admin/index.html`: `<body class="wide">`. `admin.js`: add `jcgrid` to the 6 card lists (class only, no logic).
- New spec `desktop.spec.js` in a **desktop project** (1280 × 800, Chromium): main width per page type, no
  horizontal scroll (EN + AR), card lists in ≥ 2 columns, timelines in 1.
- **Cost: $0.** **Diff: ~40 CSS + ~10 JS/HTML + ~80 test lines.** No migration, no cache step (service-worker auto
  update ships it).

## Step 5 — Premortem

| # | Mode | Exposed? | Mitigation |
|---|---|---|---|
| 1, 2, 2b, 6 | data / zero-output / drift / auth | **No**: no data, no auth, no integration | — |
| 3 | Cost | No | — |
| 4 | Contract drift | No | — |
| 5 | Race | No | — |
| 7 | Rollback | Covered | `git revert` of one PR; CSS only |
| UX | Desktop users notice Organizer Tools looks different from the resident pages | Intended | resident pages stay a column; only tool screens go wide (ROADMAP decision) |
| UX | A screen not checked at desktop looks stretched (a panel that isn't `.panel`) | **Yes** | forms capped by rule, not by screen; screenshot pass of every Organizer Tools screen at 1280 px before PR |

## Questions for Zee

1. **Breakpoint 900 px:** laptops and iPad landscape get the desktop layout; iPad portrait stays the phone layout.
   *Recommended.*
2. **Resident pages 600 px** on desktop (from 480). *Recommended* — wider reads oddly for one column of cards.
3. **Organizer Tools goes wide now** (card grids, forms stay 600 px), so the shared piece is proven before Cats.
   *Recommended* — the alternative is building it for Cats alone and finding the gaps there.
