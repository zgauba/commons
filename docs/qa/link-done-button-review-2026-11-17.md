# Done button on one-time link boxes — review (2026-11-17)

Branch `feat/link-done-button`. Tier 2 (screen logic): code-reviewer + affected specs; full suite in CI.

## What changed
Admins screen (community / module admin links), per-event admin links and the household invite get a **Done** button
beside Copy / Share. It closes the shown link so another can be made; it asks first only if the link was never copied or
shared (it can't be shown again). The link stays valid; admin links stay listed as pending with Cancel Link.

## Verification
- E2E (Chromium + WebKit): admin-admins, admin, home, strings-parity — 223 passed.
- Screenshot (phone width, Admins screen): Copy · Done in one row under the link; Share joins on devices that have it.

## code-reviewer — APPROVE (0 critical / 0 high)
| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | MED | Negative assertions threw inside a dialog handler (fails unclearly) | **Fixed** — count dialogs, `expect(asks).toBe(0)`. |
| 2 | LOW | `adSent` not reset when `loadAdmins` reloads without `keep` | **Fixed** — reset with the links. |
| 3 | LOW | No test that Done on one scope keeps another's open link, nor that a cancelled Share counts as not sent | **Fixed** — one new test covers both (stubbed `navigator.share` rejecting). |
| 4 | LOW | AR "حتى ينتهي" ambiguous; Latin ";" | **Fixed** — "حتى تنتهي صلاحيته؛". |
| 5 | LOW | After a redraw the Copy label resets while the flag stays (Done won't ask) | **Accepted** — correct behaviour; label only. |
New AR strings (adm_done, adm_done_confirm) join the pending native Arabic review.
