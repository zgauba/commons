# Review — soft archive PR 1 (DB) — 2026-11-17

**Migration:** `20261117090000_soft_archive` · **Target:** JubailCommons (`qrpxfssdeeuzmsmlbtbu`) · **Status:** rehearsed,
NOT applied. Plan: `docs/plans/soft-archive.md`.

## Rehearsal
- Dry run (migration + whole suite, always rolled back): **`ALL_TESTS_PASSED (1549 checks)`** ×2, up from 1496 live.
  New slice `s31_soft_archive` (SA01–SA14) + G21 (two-hop G20 probe).
- Nothing persisted (checked live after the runs): no `archived_*` columns, none of the 5 new functions, the probe
  functions gone, `jc_pet_retire` still 1-arg, notice kind CHECK unchanged, no testville communities, no history row.
- Existing tests changed **on purpose** (they asserted the old "photo deleted at archive" rule): s4 P12c (only the kept
  photo may stay current), s30 P15 and s6 fixtures (archived rows need `archived_at` / `archived_how`).
- First runs caught: H07a (a comment said "reporter" in a client function → reworded); the maintenance-log job CHECK
  (alert failures now go on the `pets_purge` row App Health already shows, no new job name); N09b (SA11's simulated
  failure left the error on the latest row → SA11c runs a clean purge after).
- e2e: `pets.spec` + `admin-pets.spec` locally **224 passed** (copy change below).

## database-reviewer — no Critical / High
| # | Finding | Sev | Disposition |
|---|---|---|---|
| D1 | Restore bypasses the 10-active-pets-per-home cap | M | **Fixed**: `TOO_MANY_PETS` on restore; SA13b. PR 2 needs the message. |
| D2 | Restore racing a household leave → active pet in an empty home | L | **Fixed**: `jc_home_vacated` locks the home's pets first. Concurrency verified by reading only (a one-transaction slice can't race). |
| D3 | Restore vs nightly purge at the exact 30-day instant → active pet pointing at a retired photo | L | **Accepted**: one instant a month per pet, purge runs 03:50; worst case the pet shows no photo (no exposure). |
| D4 | `when others` doesn't catch a statement-timeout cancel in the alert | L | Accepted: the alert is one bounded grouped query. |
| D5 | Same family's new member blocks a restore | info | Intended (conservative). PR 2 copy: ask the community admin. |
| D6 | G20 misses MERGE / `for update` / dynamic SQL; name-based | L | **Fixed** MERGE + row locks added; dynamic SQL and name-collision limits written in the test comment. |
| D7 | G20 filtered to `jc_` names → a STABLE `jc_private` rule calling a writer wouldn't show | L | **Fixed**: both schemas flagged (live: clean). |
| D8 | G20 cost | info | Accepted (seconds). |
| D9 | Test gaps: exact 30 days, empty home, cap | L | **Fixed**: SA13a–c. |

Verified clean by the reviewer: archive vs stray-report close (no lock inversion; M1 line is a correct backstop), ledger
lifecycle, window complement (restore `>` vs purge `<=`), two restores serialize, CHECK shape, exception-block
subtransaction keeps the purge, grants / definer / search_path, volatility, rollback note.

## security-reviewer — no Critical / High
| # | Finding | Sev | Disposition |
|---|---|---|---|
| S8 | **Copy promises broken by the DB change**: `pt_photo_who` "a removed photo is deleted within a day"; `pt_archive_q` "can't be undone" | M | **Fixed in this PR** (EN + AR), so the disclosure is live when the DB is: removing a pet keeps its photo unseen for 30 days, then deletes it; a Pets organizer can bring it back within 30 days. `pets.spec` assertion updated. Organizer copy (`pm_arch_help_*`) stays for PR 2 with the Restore button. |
| S3 | Cap bypass on restore | L | Fixed (= D1) |
| S4 | An open alert froze its counts and masked later spikes | L | **Fixed**: an open notice's counts refresh nightly; SA14b. |
| S5 | Restore / unhide unthrottled; unhide uncounted | L | Accepted unthrottled (organizer-only, logged); **fixed**: unhides count with hides; SA14a. |
| S6 | Hidden sightings readable again by every Pets organizer (note + location, no reporter) | L | Accepted; PR 2 copy on the Hidden list says why it's there. |
| S2 | Restore rule trusts `joined_at` never changes | info | **Checked**: no migration updates `jc_home_members.joined_at`. |
| S9 | Restore ignores the Pets kill switch | info | Accepted: same as archive (organizer acts). |

Verified clean by the reviewer: archived photo unreadable (rule reads only `jc_pets.photo_path` of active pets);
vacate path; no pet lands on a new household; cross-community isolation on the 3 RPCs; alert detail is counts only,
community admins only; internal functions revoked from clients.

Verdict: both approve after fixes.
