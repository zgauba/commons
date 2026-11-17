# Strays map: names at every zoom + Hide / Show Names (2026-11-17)

Cosmetic / small screen change (Zee 2026-11-17). Pets → Strays map: pin names show at every zoom (was: only from zoom 17);
a **Hide Names / Show Names** button beside Map Labels toggles them (`aria-pressed`), remembered on the phone
(localStorage `jc_pt_names`, works without storage). EN + AR. No DB change.

Verification (per Zee: no full-app testing for small changes): `pets.spec.js` on Chromium once — 65 passed, incl. the
updated map test (names on by default, toggle, remembered after reload). No reviewer agent (tier: cosmetic).
New AR strings (pt_names_hide / pt_names_show) join the pending native Arabic review.
