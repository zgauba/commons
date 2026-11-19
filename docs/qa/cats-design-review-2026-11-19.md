# Cats look and feel — design review (2026-11-19)

Trigger: Zee, after CC-4 shipped: "I don't think it's uniform with the rest of the site." Method: every Cats screen
screenshotted (stubbed backend, iPhone 13, `SHOT_DIR` hooks in `cats.spec.js`) beside the matching Pets screen.

## Root cause
Cats was built screen by screen with its own markup and its own CSS (`cats.css` styles bare `select`, `input[type=date]`,
`input[type=number]` for the whole page) instead of reusing the Pets pieces. The "inventory sibling modules first" rule
existed (memory: cross-module consistency, missed on Pets 2026-11-11) and was missed again: it lives in memory, not in a
gate.

## Findings
| # | Screen | What's wrong | Pets / shared piece to use | Sev |
|---|---|---|---|---|
| D1 | Cats tab | "The cats" / "Feeding stations" headings repeat the tab name (lowercase "cats") | Pets: no heading inside a tab; group labels only (`h2.group`) | M |
| D2 | Cats tab | Cat cards touch (no gap); thumbnail 44px list, not cards | Pets `.ptgrid` photo cards (2 columns) | H |
| D3 | Cat page | Huge photo + second photo below, then a bulleted fact list | Pets `.pthero` (photo beside name) + About / Sightings tabs + label-value facts (Lives at / Microchipped) grouped: About · Health (ear tip, sterilised, TNVR) · Where (area, station) | H |
| D4 | Cat page | "Seen this cat" + "Sightings and visits" are a different component from Pets' "Report seeing Luna" + SIGHTINGS list | One sightings block: Pets' button + list layout; Cats keeps its own data (programme only) | M |
| D5 | Cat page | Status history is a bulleted list | Pets care log rows (`.care li`) | M |
| D6 | Stations | "Private location" chip floats top-right, small and grey | Chip inline after the title, as Pets cards' chips (Wanderer / Yours) | M |
| D7 | Forms | Native dropdowns are thin (≈30px) beside 46px inputs; chevrons differ | One shared `select` style in `app.css` (46px, own chevron); short choice lists (sex, life stage, ear tip, sterilisation, TNVR, status) become Pets-style `.opts` pills | H |
| D8 | Cat editor | Doubled labels: "Status / Status", "Ear tip / Ear tip", "TNVR stage / TNVR stage", "Sterilisation / Sterilisation confirmed" | Legend only, or label only | M |
| D9 | Sighting form | Dropdown doesn't close after picking (Zee) | Which cat / At a station redraw the whole form on change then re-focus the new select — on a phone that can re-open the picker. Fix: change only the part that depends on it, no re-focus. Area doesn't redraw: not reproduced yet. Zee was on the iPhone (2026-11-19), not the desktop extension — fix the redraw and test Area on WebKit | H |
| D10 | Activity | Only "Log a sighting"; visits only from a station card, so "log several things at once" (the visit form) can't be found | One "Log activity" button → choose Feeding visit (pick station) or Sighting | H |
| D11 | Activity | Entry cards: Hide / Link buttons stacked loosely; "This is" select + Link squeezed | `.row` actions at the card foot, as Organizer Tools rows | L |
| D12 | Photo viewer | Zee: picture small, needs pinch | Measured: shared viewer (same as Pets) shows a 1280px photo at full phone width (374 of 390 px). Add double-tap / button zoom in the shared viewer — fixes Pets too | M |
| D13 | Visit form | Checkboxes are browser-blue | Accent-coloured checks (shared) | L |
| D14 | Cat editor | One long form; Photos and Merge as separate boxes below Save | Sections as Pets editor; Save at the bottom of everything | L |

## Process gaps (for the skills)
- No gate checks a new screen against its sibling. Proposal: `/plan-change` Prior Art gets a "screens to match"
  table (new screen → existing screen it must look like); `/ship-pr` cosmetic + screen tiers screenshot both side by side.
- Module CSS may restyle bare elements: add a CI grep (module `*.css` may not style `select`, `input`, `textarea`,
  `label`, `button` without a class) so drift fails the build.
- New `/visual-fix` command: screen + what looks wrong → screenshot it and its sibling → fix in the shared piece →
  add the rule to the UI standards list.
