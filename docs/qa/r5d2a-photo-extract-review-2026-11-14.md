# R5d-2a — pet photo extract: code review (2026-11-14)

**Reviewer:** code-reviewer agent · **Tier:** screen logic (pure move, no behavior change) · **Plan:** `docs/plans/R5d-2-strays-editor.md`

## Change

- The photo block of `commons/pets/pets.js` (shrink to ≤ 1280 px JPEG, begin → upload → commit, signed-URL cache + one retry,
  the paw tile) moved to `commons/assets/pet-photo.js` with `jcPetPhoto*` / `JC_PET_PHOTO_*` names. `shrinkSeq` (form state) stays in `pets.js`.
- `.ptph` / `.ptphotoedit` base CSS moved from `pets/pets.css` to the end of `assets/app.css`; layout rules (`.ptph.tile` in context) stay.
- `pets/index.html` loads `../assets/pet-photo.js` after `nav.js`, before `pets.js`.

## Findings

**None (no Critical / High / Medium / Low).**

Verified by the reviewer:
1. The moved code is identical to the old block with the renames applied (diffed). Only the header comment and the retained `shrinkSeq` differ. Error codes (`PHOTO_UNREADABLE`, `PHOTO_UPLOAD_FAILED`), RPC names, bucket, `data-photo` and class names are unchanged.
2. No stale references to old names in `pets.js`.
3. Load order is correct: dependencies (`rpc`, `jcDb`, `jcErr`, `JC_URL`, `esc`, `hObj`, `jcIcon`) are used only inside function bodies.
4. The cascade is unchanged on Pets: the moved base rules still precede the higher-specificity layout rules in `pets.css`.
5. No global collisions. No other page uses `.ptph`.

**Note carried to R5d-2b:** `commons/admin/index.html` CSP `img-src` lacks the signed `pet-photos` origin. Photos there would silently fall back to the paw. This is in the R5d-2b scope, and an e2e test there will render a photo.

## Tests

- `pets.spec.js` + `a11y.spec.js` + `admin-pets.spec.js` (mobile): **108 passed**, no test file edited. Full suite: CI.
