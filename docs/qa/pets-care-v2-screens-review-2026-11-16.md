# Pets care v2 PR 2 — screens: code review (2026-11-16)

**Tier:** 2 — screen logic (no schema / RPC / auth / PII change; PR 1's `jc_admin_stray_save` and list fields are live).
**Scope:** `commons/admin/admin.js` (Manage state picker, new-sightings section, Needs help chip, Not fed / Not seen row
chips, editor status only when adding), `commons/assets/api.js` (`jcDaysSince`), `commons/assets/strings.js` (EN + AR draft),
`tests/e2e/specs/admin-pets.spec.js`. Plan: `docs/plans/pets-care-v2.md` (Zee Q1–Q5).

## code-reviewer — APPROVE WITH CHANGES

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | M | Day math hand-rolled twice (`paStale`, `pmSights`); `pets.js` has its own `recent()` | **Fixed** — shared `jcDaysSince(iso, now)` in `assets/api.js` (floor; -1 for missing / unreadable / future). `pets.js recent()` left as is (deferred: not touched by this PR) |
| 2 | L | A future `seen_at` (clock skew) counted as new | **Fixed** by 1; test (sighting 43) |
| 3 | L | `opts()` copied in two views; the Manage picker is a third variant (needs ids + disabled) | **Deferred** — one shared option-buttons helper is a separate cleanup |
| 4 | L | Row keeps old `last_contact_at` after a state change | **Not a defect** — a state change is not a contact on the server either (sightings + fed / vet only) |
| 5 | L | AR "أيام" wrong for 2 and 11+ | **Fixed** — plural-neutral: "أيام بلا إطعام: {n}" / "أيام بلا مشاهدة: {n}" |
| 6 | L | "Sightings" heading drops when only new ones exist | **Accepted** — the top section is titled "New sightings (last 7 days)" |
| T | L | No NOT_FOUND test for the state picker | **Added** |

Updated existing tests (intended behaviour changes, reviewer confirmed none weakened): chip lists gain "Needs help";
editor status / Rehomed hint asserted on the add path; a photo-failure edit changes the description instead of the
status; the Arabic heading check follows the new first heading; the hide test pins the clock (sightings > 7 days old).

## Screens looked at

`pm-care-v2.png` (Manage: new sighting on top → How they're doing → care record → log → older sightings → Archive) and
`pa-care-chips.png` (Arabic list: Needs help chip with count; Ginger's amber "not fed" + "not seen" chips). Both fine.

## Tests

- Full browser suite locally (all projects): **1370 passed** (before the review fixes).
- After the fixes: admin-pets + pets (both projects) **224 passed**. CI runs the full suite.
