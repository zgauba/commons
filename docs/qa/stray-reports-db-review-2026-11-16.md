# Review: stray reports DB (PR 1a): 2026-11-16

Migration `supabase/commons/migrations/20261116100000_stray_reports.sql`; tests `tests/sql/s29_stray_reports.test.sql`
(+ `00_grants` list, `s13_hardening` H07 allowlist). Plan `docs/plans/report-a-stray.md`.
Reviewers: `database-reviewer`, `security-reviewer` (read-only, both against the pre-fix draft). Tier 3 (data / PII).

**Result:** neither review found anything Critical or High. Dry run (rolled back) **1441 checks** passed twice. A query
after the dry run confirmed nothing persisted: 0 new functions, no table, retention body unchanged, no fixtures.

## Database review

| # | Finding | Disposition |
|---|---|---|
| M1 | The community cap could be overshot (only the per-account lock was held) | **Fixed:** a second advisory lock per community, taken after the per-account lock (fixed order) |
| M2 | When the PR 1b photo FK lands, the plain report delete would abort the whole nightly job, including the sightings purge | **Deferred to PR 1b, required:** recorded in the plan premortem. Retire photos first; delete only reports with no photo rows; FK NO ACTION |
| M3 | Organizer lists unbounded; closed ordering had no tiebreak | **Fixed:** closed list = newest 200, `closed_at desc, id desc`; open ordered `created_at, id` |
| L1 | `closed_by` FK not indexed | **Fixed:** partial index |
| L2 | No exact index for the community cap | **Fixed:** `(community_id, created_at)` |
| L3 | Racing replay of another user's id raised a raw 23505 | **Fixed:** `unique_violation` → BAD_FIELDS |
| L4 | Retrying a close after the linked stray was deleted gave ALREADY_CLOSED | **Fixed:** a nulled `pet_id` matches |
| L5 | `place` accepted 400 characters raw, but the column is 120 after cleaning | **Accepted:** over-long input gives BAD_FIELDS; the PR 3 form caps at 120 |
| L6 | Unused `v_home` | **Accepted:** `jc_me` convention; now used by the per-home cap |
| L7 | Expired reports can't be actioned | **Deferred to PR 2:** hide outcome buttons on closed / expired (in plan) |
| L8 | No error capture in retention | **Accepted:** existing pattern |
| — | Plan said a `jc_rate` bucket | **Fixed:** plan updated (caps counted on the table) |

## Security review

| # | Finding | Disposition |
|---|---|---|
| M1 | A departed reporter's number stayed visible to organizers until the nightly job | **Fixed:** the helper hides `contact` once the reporter's account is gone (test SR16g); the nightly clear stays as the stored-data cleanup |
| M2 | Several accounts could exhaust the 50 / day community cap or flood the queue | **Fixed:** 5 / day per home (all its accounts together), 10 open per account, community cap raised to 100 (tests SR18, SR19, SR07). Organizer notice on RATE_LIMITED: **deferred** (no notification channel; App Health open-report count is PR 2) |
| L1 | A reporter couldn't withdraw their number | **Fixed:** `jc_stray_report_contact_clear(p_id)` (own report only; works with Pets off) (SR20) |
| L2 | SR17 guard only caught a literal `true` | **Fixed:** every client-callable call of the helper must pass a literal `true` / `false`; `true` only from the two organizer RPCs (SR17a/b) |
| L3 | Pin not bounded to the community | **Accepted:** organizer-only noise |
| L4 | Racing replay raised a raw 23505 | **Fixed** (= db L3) |
| L5 | Retry after pet deleted | **Fixed** (= db L4) |
| Info | Home is shown to organizers whether or not a number is given | **PR 3:** the form must say "Pets organizers see which home you're in" |

### PR 1b carry-overs (photos)
- Retention replacement (db M2). Photo FK **NO ACTION**: security suggested `on delete cascade`, but db review is right that cascade orphans storage objects before the T4 sweep queues them.
- Report photos readable only by the reporter and Pets admins, keyed to the report; never the active-pet predicate.
- On Add: the photo becomes the pet's under the close row lock, without re-referencing a row the 30-day delete removes; the retry must not move it again.
- EXIF: security asks for server-side stripping. Today it is stripped on the phone (`assets/pet-photo.js` canvas re-encode, the accepted pattern for all pet photos); server-side would need an Edge Function. Decide in 1b.
- Per-report photo maximum (1), existing 20 / day per user upload cap, size / mime checks as `jc_pet_photo_commit`.
- Extend the SR17 guard to photo paths.
