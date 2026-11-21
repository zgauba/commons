# Cats UI review — 2026-11-20

**Scope:** every Community Cats screen (`commons/cats/`), iPhone 13 size, stubbed backend, resident / volunteer /
coordinator, EN + AR. **How:** the Cats specs re-run with a full-page screenshot at the end of each test (110 pictures, about
15 looked at closely) plus the specs' own `SHOT_DIR` pictures; findings checked in code. Not seen: an empty cat list, a
42-cat list, light theme (Commons has one theme). Grey map tiles = offline stub, not a finding.

**Tier:** screen logic → affected specs once (Chromium) + CI + `code-reviewer`. No database change.

## Findings and disposition

| # | Severity | Where | Finding | Disposition |
|---|---|---|---|---|
| 1 | Must | Cat page, missing cat, resident | Red "C-002 is missing" banner with nothing to tap: a dead end | **Fixed.** "I've seen ⟨name⟩" in the banner → the stray report form in a "seen" mode (title, a line naming the cat, no "stray dog" line). The note goes out as "Seen: C-002 · Name (listed as missing). …"; the coordinator links it with Already known. No new server field (the RPC rejects unknown keys). Back returns to the cat |
| 2 | Must | Help sheet | Said "Feeding visits and the vet log come next" — both live | **Fixed** (EN + AR): describes today's roles, reports and the missing-cat step |
| 3 | Should | Cat page, missing cat, programme | "Report seeing" only on the Activity tab | **Fixed.** In the banner on About too (opens the sighting with the cat chosen) |
| 4 | Should | Cat page (and Pets) | Label column width jumped between About / Health / Where | **Fixed.** Shared `.facts` label column 9.5em (`app.css`) |
| 5 | Should | Reports tab | Three buttons wrapped to two lines each; Not a stray was a 36px `.mini` beside 44px buttons | **Fixed.** Add as new cat on its own row; Already known + Not a stray share the next, same size |
| 6 | Should | Cat editor | Ear tip / sterilisation / TNVR / status looked like part of "Where" | **Fixed.** Headings Where · Health · Status and record |
| 7 | Should | Cat editor | Merge one tap above Save | **Fixed.** Merge is its own heading + panel below the form |
| 8 | Nice | Report form | ~10 lines of privacy text before Send | **Fixed** (EN + AR): same facts, shorter (what coordinators see, number deletion, 30-day deletion, photo may become public) |
| 9 | Nice | Activity tab | "invoices you choose to show" shown to volunteers, who can't log vet visits | **Fixed.** That sentence for coordinators only |

Out of scope (app-wide, for the cross-module pass): error message at the top of long forms (`jcSay`), "neighbor" /
"neighbour" spelling.

## Proof

- New tests: `cats.spec.js` "UI review #3 / #4 / #9 (×2)", editor test updated for #6 / #7; `cats-reports.spec.js`
  "UI review #1 (×2) / #5". Each fails on the old code (no `#caSeenRep` / `#caAlarmSeen`, unequal `dd` left edges, three
  buttons on one row, help text with the coordinator sentence, Merge inside the form).
- `npx playwright test --project=mobile specs/cats.spec.js specs/cats-reports.spec.js specs/pets.spec.js` → 153 passed (154 after the review's tests).
- Design guard: OK (baseline only).
- Screenshots after the fix looked at: seen-mode form, Reports tab, cat page (EN), cat editor incl. Merge panel.

## Code review

`code-reviewer` (2026-11-20): **approve — no High / Medium.** Checked: `rep.seen` can't leak (rebuilt on every open;
the click event no longer reaches `openReport`), busy / disabled, Back from the seen form, the Merge box wired by id outside
the form, no seen button on a merged cat, every user string through `esc()`, the isolates, no bare-element CSS, the cascade
(`cats.css` after `app.css`), EN ↔ AR parity, privacy copy still complete.

| # | Sev | Finding | Disposition |
|---|---|---|---|
| L1 | Low | `maxlength` doesn't trim text already typed; a language switch changes the prefix length, so prefix + note could pass 280 and the server would cut it | **Fixed:** the note is capped at 280 before sending |
| L2 | Low | `Math.max(40, …)` floor unreachable today (names ≤ 40) | **Kept** — harmless |
| L3 | Low | "public photo" could read as open to the internet | **Fixed** (EN + AR): "seen by every neighbour on Commons" |
| L4 | Low | No test for the seen-mode `maxlength`, nor an empty-note seen report | **Fixed:** both asserted in `cats-reports.spec.js` |

After the fixes: 154 passed (Chromium; Cats, Reports, Pets specs).

## Follow-up 2026-11-21: #5 on WebKit

CI's WebKit job on #192 failed "UI review #5": with the Linux runner's wider fallback font, "Already known" wrapped onto
two lines (74 px). It passed on macOS WebKit and Chromium. **Fix:** the two buttons never wrap their text
(`.row .rqSub{flex:1 1 auto; white-space:nowrap}`); when both don't fit, the second takes its own row. The #5 test now
accepts side-by-side or stacked, never two-line; a new test forces a wide font (24 px, letter-spacing) and fails on the
old CSS (102 px) — passes after on Chromium and WebKit. Cosmetic tier: no reviewer agent. (Unrelated: "CC-5 … logs a vet
visit" fails `toBeFocused` on local macOS WebKit only — Safari doesn't focus a clicked checkbox; it passes in CI.)
