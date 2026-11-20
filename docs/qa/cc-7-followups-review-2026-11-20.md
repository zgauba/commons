# CC-7 follow-ups — review note (2026-11-20)

**Tier:** screen logic (widens the `jcSafeNext` sign-in allowlist) → affected specs + `code-reviewer`.

## What changed
1. `commons/assets/app.css` — `html[dir="rtl"] .bklist li > [dir="auto"]{text-align:right}` joins the existing typed-text RTL rule: Latin notes / places in dated-entry cards (Cats Activity + Reports, Pets sightings, bookings) line up right in Arabic.
2. `commons/assets/strings.js` — Organizer Tools → Pets: "No animals yet." → "No pets yet."; "No animals here match…" → "No pets here match…" (EN + AR).
3. `commons/assets/api.js` `jcSafeNext` admits exactly `../cats/?report=1` and `../cats/?tab=reports`; `commons/cats/cats.js` passes that query through sign-in / join. A signed-out `admin/?open=reports` now ends on the Reports tab, not the Cats home.

## Tests
- New: `home.spec` "jcSafeNext admits exactly the Cats report form / Reports queue links"; `admin-pet-reports.spec` signed-out redirect keeps `?tab=reports`; `cats-reports.spec` Arabic Latin-text alignment (verified to FAIL with the CSS fix stashed, pass with it).
- Updated copy assertions in `admin.spec`, `admin-pets.spec`.
- Local (mobile/Chromium): home, admin, admin-pets, admin-pet-reports, cats, cats-reports — 194 passed before the alignment test was added; alignment test + Arabic report test 2 passed.
- Screenshot looked at: Cats → Reports tab, Arabic, coordinator — "Ginger, thin" and "Behind the souk" right-aligned with the card.

## code-reviewer — APPROVE (0 critical / high / medium / low)
- RTL selector only hits direct `dir="auto"` children of `.bklist li` (Cats reports/activity, My reports, Pets sightings, bookings); right-align intended everywhere; no buttons or `.acts` rows matched.
- `jcSafeNext` regex fully anchored, literal prefix, two fixed tails — no off-site, extra-param or fragment form admitted; `back` built from literals; `?tab=reports` still gated by `canEdit()`.
- Noted, not a defect: other keys (`pa_filter` "Which animals", error strings) still say "animal" — out of scope, left as is.

**Disposition:** no findings to fix.
