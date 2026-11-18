# PV-1 photo viewer — code review (2026-11-18)

Plan: `docs/plans/PV-photo-viewer.md`. Tier: screen logic → affected specs + CI + `code-reviewer`.
Reviewer: `code-reviewer` agent on the uncommitted diff + `tests/e2e/specs/photo-viewer.spec.js`. **Verdict: APPROVE.**

## Findings and disposition

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | Medium | Pinch: a second finger's `pointerdown` overwrote the swipe start, so a two-finger pinch spread > 40 px could change photo (`pet-photo.js` pointer handlers) | **Fixed**: only the primary pointer swipes; a second finger cancels the swipe and is never a closing tap; `pointercancel` resets. Test: synthetic two-finger gesture toward "next" (mirrored in AR) must not move or close. Mutation-checked: removing the guard fails EN + AR |
| 2 | Low | Tapping the dark header / arrow row didn't close it (close only matched the stage) | **Fixed**: any tap not on the photo or a button closes. Test: header-strip tap closes |
| 3 | Low | iOS: page behind could scroll while open | **Fixed**: `overscroll-behavior:contain` + `html:has(dialog.photoview[open]){overflow:hidden}` |
| 4 | Info | No-`showModal` fallback has no Escape / focus trap and no test | **Kept, accepted**: every supported browser (iOS 15.4+, current Chromium) has `showModal`; the branch only avoids a dead button. Same pattern as help / Map Labels |
| — | — | XSS (`data-view` JSON via `esc`, try/catch parse, paths re-escaped), nested-interactive (list cards excluded), admin `#prList` delegated handler ignores `.ptview`, RTL mirroring, focus return | **Checked, no issue** |

## Caught while building

- Focus landed on the dialog itself on first open (the "keep focus on the same button" lookup matched the dialog's own id). Fixed; test asserts Close is focused.
- The swipe-guard test passed with the guard removed (a full swipe redraws mid-gesture, so no stray click fires). Added a short-drag case. Mutation-checked: removing the guard now fails.

## Tests

- `photo-viewer.spec.js`: 5 tests (EN + AR for multi-photo), **10 passed on Chromium (mobile) + WebKit**.
- Affected specs (photo-viewer, pets, pets-report, admin-pets, admin-pet-reports, strings-parity, a11y, desktop): **191 passed** (Chromium).
- Screenshots looked at: viewer open (EN), two photos EN + AR (counter, mirrored arrows, Close placement). Stub photos are 1×1 px, so real-photo sizing is by rule (fit to screen, no upscaling).
