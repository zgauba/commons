# CC-1 Cats foundation — reviews (2026-11-18)

Scope: `supabase/commons/migrations/20261118100000_cc1_cats_foundation.sql`, `tests/sql/s32_cats_foundation.test.sql`,
and the app side (`commons/cats/`, `assets/nav.js` / `api.js` / `icons.js` / `strings.js`, `admin/admin.js`, `assets/landing.js`).
Plan: `docs/plans/CC-community-cats.md` (CC-1). Tier: data / auth: full rigor.

## Dry run

- With the migration: `ALL_TESTS_PASSED (1591 checks)` (live baseline: 1558; s32 adds 33).
- Without it (the live schema): s32 fails at CF01 with `BAD_SCOPE`, so the slice tests the change.
- Nothing persisted: the scope / hits CHECKs are unchanged live, there are no `cats` function bodies and no testville / s32 fixtures.

## Done when → proof

| Check | Test |
|---|---|
| D1 Community admins invite, list and remove Cats coordinators and volunteers | CF01, CF02, CF08 |
| D2 Volunteers and coordinators pass no other gate (server) | CF03, CF04 |
| D2 Volunteers and coordinators never see Organizer Tools (app) | e2e `cats.spec.js` |
| D3 No shared code grants a Cats role | CF05 |
| D4 `cats` is in every module-key list | CF06, CF07, CF10 |
| D5 The hourly snapshot doesn't count volunteers as admins | CF09 |

## database-reviewer: safe to apply, no CRITICAL / HIGH

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | MED | `jcIsAdmin` treats any scope as an organizer, so a volunteer would see Organizer Tools | **Fixed** in this PR: `nav.js` `JC_NOT_ORGANIZER`, e2e test |
| 2 | MED | No rollback note | **Fixed**: header comment (delete Cats rows first, then restore the CHECKs and bodies) |
| 3 | LOW | CF03d covers one admin RPC only | Accepted: `jc_admin_has` / `jc_assert_admin` per scope (CF03b/c) is the real proof |
| 4 | LOW | A coordinator's `admin_scopes` isn't tested | **Fixed**: CF02e |
| 5 | LOW | CF05 also passes on the old schema | Accepted: it guards unchanged behaviour on purpose |
| 6 | LOW | Coordinators can't see the volunteer list | Accepted: per plan, only community admins manage roles |

## security-reviewer: no CRITICAL / HIGH server-side

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | MED | Organizer Tools would show for volunteers until the app fix ships | **Fixed** in this PR (same fix as DB #1). Applying first is safe: nobody holds a Cats role until a community admin makes a link, and the Admins screen offers Cats levels only once this app ships |
| 2 | LOW | `jc_module_admin_accept`'s ALREADY_ADMIN check ignores `community_id` (pre-existing, R4a-3) | Deferred: harmless with one account per community; noted for the multi-community work |
| 3 | LOW | `jc_admins_payload` shows a volunteer's name and home to community admins | Accepted: same as every other level, community-admin-only gate |
| 4 | LOW | Coordinator doesn't imply volunteer (`jc_admin_has('cats_vol')` false for `cats`) | Deferred to CC-4: its gates must accept `cats` OR `cats_vol`, with a test; noted in the plan |
