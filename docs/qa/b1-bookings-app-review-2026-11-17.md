# B-1 app review — Courts → Bookings, "place" wording, Football kind (2026-11-17)

Branch `feat/b-1-bookings-app`. Tier 2 (screen logic): `code-reviewer`, affected specs locally, full suite in CI.
DB side already live: `20261117100000_b1_football_kind` (PR #145, applied 2026-11-17, live suite 1552).

## Verification
- Affected specs locally, Chromium: 285 passed (courts, admin-courts, admin-courtday, admin-admins, section-names, admin,
  admin-pets, shell, a11y). courts + admin-courts on Chromium + WebKit: 152 passed.
- New tests fail on the old code (old rule: anything not basketball → "Tennis"): football + unknown kind labels (EN),
  football (AR), 3-kind picker, save as `football`, pre-select on edit, unknown kind pre-selects nothing.
- `/shot` hub, Arabic, member: the "الحجوزات" card title fits; no clipping.

## code-reviewer: APPROVE (0 critical, 0 high; confidence 0.8)
| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | LOW | A cached old page labels a football row "Tennis"; an old admin page can't pre-select it (Save → "Choose the kind") until reload. | **Accepted.** No data risk; pages auto-update. Create the first football place only after the deploy has propagated (~10 min). |
| 2 | LOW | `JC_FAC_KINDS` / `jcKindText` sit between `jcModName` and `jcModTitle` in api.js. | **Accepted.** Cosmetic. |
| 3 | INFO | `ct_confirm_cancels_*` still quote "Court temporarily unavailable" / "Court no longer available". | **Deferred.** They must match the server's cancel reasons, which are written by DB functions (follow-up F1 in the plan). |
| — | INFO | Load order (strings → api → page script) correct on both pages; no stray user-visible "court" in EN; EN/AR key parity clean for this diff. | — |
| — | Suggestion | A general "every EN key has an AR key" test (today only some prefixes are checked in shell.spec.js). | **Deferred** (follow-up F2 in the plan). |
