# B-1 follow-ups review — F1 server cancel codes + F2 strings parity test (2026-11-17)

Branch `feat/b-1-followups`. Tier 3 (DB): migration `20261117120000_b1_reason_codes` + app + tests.

## Verification
- Dry run against live, rolled back: **1558 checks** (was 1552: +2 s3 C15c/d, +4 s22 L13g–j), run twice (before and after
  review fixes). Nothing persisted (new bodies 0, label list unchanged, test fixtures 0, history row 0).
- Pre-apply live checks: no non-Bookings section labelled Bookings/Courts/الحجوزات/الملاعب; `jc_bookings` has 0 triggers;
  0 live bookings carry a cancel_reason.
- E2E (Chromium + WebKit): courts, admin-courts, section-names, strings-parity — 199 passed.
- Not yet applied. **Order: merge → Pages live → apply** (db M1).

## database-reviewer — SHIP (0 critical / 0 high; confidence 0.9)
| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | MED | Deploy order: an old cached page shows raw codes if the DB goes first | **Fixed** — order written in the migration header; apply only after Pages serves `jcCancelText`. |
| 2 | LOW | Rollback note vague; no reverse UPDATE | **Fixed** — exact previous migrations named + reverse UPDATE in the header. |
| 3 | LOW | UPDATE also converts organizer text that equals an old system sentence | **Accepted** — 0 live rows; cosmetic. |
| 4 | LOW | No lock_timeout | **Fixed** — `set local lock_timeout = '3s'`. |
| 5 | LOW | No explicit check that the 185 block-reason cap holds | **Accepted** — the cap is unchanged; s18 RC01d asserts the 194-char whole reason. |
| 6 | LOW | Plan docs / manifest still quote the old sentences | **Fixed at closeout** — manifest edit after apply; old plan docs are history. |
| 7 | LOW | Check live labels before apply | **Done** — 0 clashing labels. |
Body diffs vs previous definitions: only the marked literals changed; DEFINER, search_path, signatures, grants preserved.

## security-reviewer — no blocking findings (confidence 0.85)
| # | Sev | Finding | Disposition |
|---|---|---|---|
| b | LOW | An organizer can type a code (e.g. `PLACE_RETIRED`) as a free-text reason and residents see system wording | **Accepted** — organizers can already write any text residents see; no new access; the admin log keeps the real text. |
| c | — | XSS: both render paths esc() the helper's output; jcFmt uses a replacer function (no re-scan) | — |
| d | INFO | Reserved names: accented / punctuated lookalikes ("Bóokings", "Book-ings") pass | **Accepted** — pre-existing, community-admin only, not a regression. |
| d | INFO | New reserved names don't re-check stored labels | **Done** — live checked, 0 clashes. |
| e | — | No new PII | — |

## code-reviewer — APPROVE (0 critical / 0 high)
| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | MED | F2 key scan missed ternary branches (~106 calls) and mis-modelled jcShowErr/jcShowOk | **Fixed** — scans the whole first argument: start + each ternary result; skips "+"-built keys and compared values; ShowErr/ShowOk dropped. 1239 keys checked (was 1117), 0 missing. The scanner has its own self-test. |
| 2 | LOW | Confirm text quoted a line residents don't see verbatim | **Fixed** — EN/AR reworded without quotes ("those homes are told the place is…"). |
| 3 | LOW | AR "وقت محجوب" reads as hidden / censored | **Fixed** — "الوقت غير متاح". |
| 4 | LOW | F1 tests cover Upcoming only; no case for a literal-code organizer reason | **Accepted** — Past uses the same helper (covered for BLOCKED: in EN). |

AR strings changed in this PR (bk_cx_*, ct_confirm_cancels_draft/retire) join the pending native Arabic review.
