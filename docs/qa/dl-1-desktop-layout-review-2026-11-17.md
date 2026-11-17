# DL-1 desktop layout — review note (2026-11-17)

Tier: **cosmetic** (CSS + class names, no data / auth / PII) → affected specs + CI + screenshots, no reviewer agent.
Plan: `docs/plans/DL-desktop-layout.md` (approved by Zee 2026-11-17: 900 px breakpoint, 600 px resident pages,
Organizer Tools wide now).

## What changed
- `commons/assets/app.css`: one `@media (min-width:900px)` block — `main` 600 px; `body.wide main` 1200 px; forms,
  panels, settings rows, text ≤ 600 px on wide pages; `.jcgrid.jcgrid` card columns; `.jcsplit` (list | map) for Cats.
- `commons/assets/tabbar.css`: tabs centred at ≥ 900 px.
- `commons/admin/index.html`: `<body class="wide">`. `commons/admin/admin.js`: `jcgrid` on 6 card lists (events,
  stray reports, sign-ups by village, households, pets, archived pets). Timelines (care log, sightings, court day,
  pending) untouched.

## Found and fixed during verification
- **The grid never applied:** `admin.css` (loaded after `app.css`) sets `display:flex` on `.sulist` / `.aevents` with
  equal specificity. Fixed with the doubled class `.jcgrid.jcgrid`.
- **The first test was a tautology:** it counted tokens in `grid-template-columns` (the CSS text), so it passed while
  the layout was broken. Now it counts distinct left edges of the cards. Confirmed: **fails without the fix (2 tests),
  passes with it.**

## Screenshots looked at (1280 × 800, stubbed backend)
EN: Organizer Tools events (all), pets, bookings, community → Admins, event sign-ups, event editor; AR: events,
pets, bookings. Cards in 3 columns (2 when fewer cards), right-to-left in Arabic; forms and buttons at 600 px; no
sideways scroll. (Admins showed "Something went wrong" only because the screenshot stub lacked that RPC.)

## Tests
- `desktop.spec.js` (new, 7 tests): resident 600 px EN/AR, Organizer Tools 1200 px + events in columns EN/AR, pets in
  columns + form ≤ 600 px, timeline stays one column, phone 390 px unchanged.
- Affected phone specs on Chromium: `admin*.spec.js`, `a11y.spec.js`, `organizer-acts.spec.js`, `desktop.spec.js` —
  **319 passed**. WebKit left to CI (Zee 2026-11-17: don't wait on it for small changes).
