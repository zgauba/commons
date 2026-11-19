# Pets admins mark missing — DB review (2026-11-19)

Migration `supabase/commons/migrations/20261119140000_pets_admin_missing.sql` (JubailCommons `qrpxfssdeeuzmsmlbtbu`),
tests `tests/sql/s36_pets_admin_missing.test.sql` + `00_grants` allow-list. Plan: `/plan-change` in session, approved by
Zee 2026-11-19 with apply + merge pre-authorised for this change only. Reviewers: `database-reviewer` and
`security-reviewer` (both: nothing blocks applying).

## What it does
- `jc_pets.missing_by_team` (not null default false) + CHECK `jc_pets_missing_by_team` (never true unless missing).
- NEW `jc_admin_pet_missing_set(p_pet, p_missing, p_note)`: Pets / community admins (`jc_assert_admin('pets')`), owned +
  active pets of their own community; logged in `jc_admin_log` with the actor; returns the pet card. Raising the alert is
  rate-limited (20 / h per admin, 60 / h per community); clearing it never is.
- `jc_pet_missing_set` (owner, signature unchanged): every household write clears the team flag.
- `jc_pet_retire`: archiving clears it with `missing`. `jc_pet_card`: + `missing_by_team`, only for the pet's household.
- `jc_rate_bucket_check` + `pet_missing`. `set local lock_timeout = '5s'`.

## Findings and disposition
| # | From | Sev | Finding | Disposition |
|---|---|---|---|---|
| M2 | db + security | M | An admin re-mark of a pet the household already reported wiped the household's note and flipped the attribution to "the Pets team" (the one pet missing live was household-marked) | **Fixed**: note kept unless a new one is given; attribution kept (`missing_by_team = p_missing and (not missing or missing_by_team)`). Test AM08a/b; AM04a now asserts it |
| M1 | security | M | No rate limit, unlike the sibling moderation RPCs | **Fixed**: bucket `pet_missing`, 20 / h per admin + 60 / h per community, marking missing only. Test AM09a–c (found still works while limited) |
| L | db | L | ALTER could queue behind a long transaction | **Fixed**: `set local lock_timeout = '5s'` |
| L1 | security | L | A no-op found call still logs and sets `updated_by` | **Accepted**: log noise only |
| L | db | L | Admin path logs to `jc_admin_log`, owner path to `jc_state_log` | **Accepted**: no reader of `jc_state_log` 'pet_missing' exists |
| L | db | L | Admins can't see which pets were team-marked | **Accepted** (product): the household is who needs to know |
| I1 | both | — | Diff replaced bodies against live | **Done**: the three bodies were copied from live `pg_get_functiondef` 2026-11-19, plus the marked lines |
| — | security | — | Client must render `last_seen_note` as text | **Checked**: `pets.js` passes it through `esc()` (`pt_last_seen`), as for the owner's note |

## Rehearsal
- Full suite with the migration: **1792 checks** (was 1761; +31 in s36). Run as 3 rolled-back chunks (each = migration +
  every third slice + finish): 644 + 598 + 550. The single 735 KB run now exceeds the Supabase API gateway's time limit
  (524 at ~2 min, also without the migration).
- After the runs: no column, function, rate rows, widened bucket, test communities / users or history row on live.
