# R5d moderation rate limit (migration `20261114200000_r5d_moderation_rate_limit`): reviews (2026-11-14)

**Target:** JubailCommons (`qrpxfssdeeuzmsmlbtbu`) · **Status: rehearsed, NOT applied.** Waiting for Zee's "apply".
**Why:** R5d-3b security review L2. Archive and hide can't be undone, and nothing limited them.

## What it does

- **Per account:** 20 archives an hour and 20 sighting hides an hour, via the T3 counter (`jc_rate_take`, two new buckets).
- **Per community:** 60 archives an hour and 60 hides an hour, counted from `jc_admin_log` (existing index `jc_admin_log_recent`).
- **Only successes count:** every refusal raises and rolls back.
- Signatures are unchanged, so grants carry over. The bodies are the live bodies plus the marked lines.
- **App:** `pm_err_RATE_LIMITED` in plain words (EN + AR), with an e2e test. The reason stays typed.

## Rehearsal

- **Dry run** (migration + full suite, always rolled back): **`ALL_TESTS_PASSED (1318 checks)`**, up from 1291 live. `s26_moderation_rate` adds 27 checks:
  - refusals aren't counted
  - the 21st archive and hide are refused and change nothing
  - the cap is per account and per bucket
  - the window expires
  - the community ceiling holds whatever the number of accounts, and a ceiling refusal isn't counted
  - residents can't read, insert, update or delete the counter, or call `jc_rate_take`
- **Nothing persisted:**
  - the live bucket check is still `join, admin_unlock, feedback`
  - both functions are unchanged (no `jc_rate_take` in them)
  - no s26 users, community or counter rows; no history row
- **Pre-apply live checks:** the only `jc_rate` bucket in use is `admin_unlock`, so the new check validates. `jc_rate_take` is not executable by `authenticated`.
- **First dry run failed P04b:** slices run in name order, so s26 ran before s4 and left strays in jubail. Fixed: s26 now uses its own community `testville26`.

## Database review (database-reviewer)

**No Critical / High.**

| # | Finding | Disposition |
|---|---|---|
| M1 | The header claimed a mirrored double tap gets RATE_LIMITED. In fact it queues on `jc_assert_admin`'s own grant-row update, then gets NOT_FOUND. | **Fixed:** header corrected; no behavior change |
| M2 | The per-account cap doesn't bound a leaked code spread over many accounts | **Fixed:** community ceiling of 60/h from `jc_admin_log` (shared with the security review) |
| L1 | Other paths retire pets unthrottled (a community admin removing members → the home is vacated) | **Named in the header; follow-up** |
| L2 | Fixed window, not sliding (as T3) | Accepted; named in the header |
| L3 | Rollback note vague on order | **Fixed:** explicit three steps |
| L4 | s26 used jubail and relied on name order | **Fixed:** own community `testville26` |

Checked clean by the reviewer: constraint swap (tiny table, existing rows valid, name matches); placement; no deadlock risk; counting correct at the limit; grants; test logic.

## Security review (security-reviewer)

**No Critical / High.**

| # | Finding | Disposition |
|---|---|---|
| M | Per-account only: more accounts buy more quota | **Fixed:** community ceiling (as db M2) |
| L | Fixed window | Accepted (as T3) |
| L | `jc_admin_member_remove` → vacate → retires pets, uncapped (community scope only; heavy, visible, logged) | **Follow-up:** cap destructive community-admin acts |
| L | Test gaps: counter writes untested | **Fixed:** MR07 covers insert, update, delete and `jc_rate_take` |
| L | `drop constraint` without `if exists`; check live buckets first | **Fixed** / **checked** (`admin_unlock` only) |

Verified by the reviewer:
- `jc_rate_take` is revoked from clients.
- The advisory lock is keyed per account, with no denial of service to other organizers.
- RATE_LIMITED leaks nothing.
- The counter has RLS on and no grants.
- The household path (`jc_pet_archive`) can't touch someone else's pet.

## Follow-ups (not blocking)

1. A restore path or soft-archive window for archived pets and hidden sightings. This is the real remedy for "can't be undone"; archive also purges photos.
2. A nightly alert when `pet_archive` / `sighting_hide` log counts pass a threshold.
3. Caps on destructive community-admin acts (`jc_admin_member_remove`).

## After "apply"

Apply in one transaction with its history row, then:
- re-run the dry run with no migration (expect 1318)
- confirm the history row
- `has_function_privilege('authenticated', 'public.jc_rate_take(uuid,text,int,interval)', 'execute')` = false
- run the advisors
- edit the manifest
