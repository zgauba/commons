# Soft archive PR 2 (screens) — code review, 2026-11-16

Tier 2 (screen logic). Reviewer: `code-reviewer` agent, diff `main...feat/soft-archive-screens`.
Plan: `docs/plans/soft-archive.md` Step 4, PR 2. DB half (#142) is live.

Verdict: **APPROVE**. 0 critical, 0 high, 1 medium, 2 low, 1 nit.

| # | Sev | Finding | Disposition |
|---|---|---|---|
| M1 | Medium | After Hide / Show again, `pmSightAct` cleared `detail` but not `pv.hidden`, so the fold kept the old list (with a live "Show again") for one or two round trips. Self-healed on a second tap (NOT_FOUND → re-read). | **Fixed**: `me.hidden = null` in `gone()`. E2E holds the re-read and asserts the shown-again sighting leaves the fold at once. Verified the assertion fails with the fix reverted. |
| L1 | Low | A failed hidden-sightings read dropped a fold that had loaded fine before. | **Fixed**: a failed read keeps what was shown (still left out if nothing ever loaded). |
| L2 | Low | `paBusy` comment stale (now shared by group-link save + Restore); `var paBusy` declared twice. | **Fixed**: comment updated, duplicate removed. |
| N1 | Nit | `aria-controls="pmHidden"` points at no element while collapsed. | **Accepted**: valid for a collapsed disclosure; axe passes. |

Checked and fine (reviewer): seq/pv guards on the hidden read; NOT_ADMIN paths via `fail()`; Restore in-flight handling and
message kept across the list reload; `paDaysLeft` treats bad/null dates as not restorable (server stays authoritative via
RESTORE_EXPIRED); all new HTML escaped, notice counts coerced to safe integers; `moderation_spike` shape matches the
migration and a null home gets no "Open home" button; EN/AR placeholder parity; `pet_restore` / `sighting_unhide` log keys.

Tests: admin-pets + admin-health 134 passed (mobile + webkit); shell, admin-courts, a11y, pets 139 passed (mobile).
Screenshots looked at: Archived list with Restore / "Last day to restore"; Manage with Hidden sightings open.
Open: the Arabic strings are a draft and need native review (same as the existing AR copy).
