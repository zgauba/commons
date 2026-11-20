# CC-7b Cats reports (app) — review 2026-11-20

Tier 2 (screen logic). PR #185. Plan: `docs/plans/CC-community-cats.md` "CC-7 plan" (CC-7b).

## What changed
- `commons/cats/report.js` (new): Report a stray cat (moved from Pets; cat only; Where on shared `where.js`; photo prompt;
  thank-you; My reports) at the foot of the Cats tab.
- `commons/cats/reports.js` (new): coordinators' Reports tab (Waiting / Closed; Add as new cat via the cat editor;
  Already known via the register picker; Not a stray). Card = shared `jcEntriesHtml` (as Activity).
- `cats.js` wiring (tab for can_edit, `?report=1` / `?tab=reports`, editor hooks); Pets' Strays tab links to the form.
- Strings EN + AR (privacy copy rewritten for Cats coordinators: CC-7a security M2).

## Tests
Locally (Chromium): `cats-reports.spec` 23 (incl. 13 ported from the deleted `pets-report.spec`), `cats.spec`, `pets.spec`,
`photo-viewer`, `desktop`, `a11y`, `strings-parity` — all green (167 + 79 runs); `cats-reports.spec` ×3 repeat green.
`design-guard` OK (baseline only).

## Screens (side by side, `docs/qa/cc-7b/`)
| New | Reference | Result |
|---|---|---|
| `cc7b-reports-tab-en.png` / `-ar.png` | `cats-activity.png` | Match after fix: first pass used Organizer Tools' `sulist` (unstyled on the Cats page: bare bullets, full-width photo) → switched to the shared `jcEntriesHtml` card, photo tile, text links |
| `cc7b-report-form-en.png` / `-ar.png` | `ref-pets-report-form-en.png` (from `main`) | Match (species row gone, D1) |
| `cc7b-known-picker-en.png`, `cc7b-add-from-report-en.png` | Log a visit picker / new-cat editor | Match |

## code-reviewer — no High
| # | Finding | Disposition |
|---|---|---|
| M1 | A known / added close writes a sighting but Activity / cat history stayed cached | **Fixed**: `logReset()` + register re-read; test "code review M1" (fails without the fix — checked) |
| L1 | "Add as new cat" could close against a cat another coordinator added meanwhile | **Fixed**: only the one new cat with this name + coat; otherwise no close, Reports shown with the report still open |
| L2 | Cat saved, close failed → "Add" again would duplicate | **Fixed (wording)**: message says use Already known → ⟨cat⟩; test added |
| L3 | Not a stray confirm shown while busy, then dropped | **Fixed**: busy checked first; double-tap test |
| L4 | A stale queue read could re-add a closed report | **Fixed**: `rq.seq` bumped on close |
| L5 | Cat page briefly disabled after Add | Accepted (cosmetic) |
| L6 | Tab shows no count while the queue is unreadable | Accepted (the tab body says why) |
| L7 | Back from the form goes to Cats, not Pets | Intended (the form lives on Cats, D2) |
| Gaps | rqFrom lifecycle, double tap, close-failure branch | **Added** (3 tests); MERGED path + queue-after-add left to server tests (s38 RP05d) |

## Secondary finding (not fixed here)
Typed Latin text in an Arabic card (`<div dir="auto">`) is left-aligned in Activity and Reports alike — the design.md
"right-align typed text in RTL" rule isn't applied to dated-entry cards. Same on both screens, so Reports matches its
reference; worth one shared fix in `app.css` later.
