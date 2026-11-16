# Review: stray report photos (PR 1b), 2026-11-16

Migration `supabase/commons/migrations/20261116140000_stray_report_photos.sql`; tests `tests/sql/s30_stray_report_photos.test.sql`
(P01–P15) + edits to `00_grants`, `s13_hardening` (H07 allowlist), `s29_stray_reports` (log target). Plan `docs/plans/report-a-stray.md`.
Reviewers: `database-reviewer`, `security-reviewer` (read-only). Tier 3 (data / PII / storage).

**Result:** neither review found anything Critical or High, and security found no cross-user or cross-community read or
write path. The dry run (rolled back) passed **1495 checks** twice. A query after it confirmed nothing persisted: no new
functions or columns, storage rules unchanged, no fixtures, no storage objects.

## PR 1a carry-overs

| Carry-over | Status |
|---|---|
| Retention replaced before the photo FK; FK NO ACTION | Done. A report is deleted only after its photo rows are purged (P12) |
| Report photos: reporter + Pets admins only, never the active-pet predicate | Done (P04). Organizers only while the reporter is still a member (P14) |
| Move under the close lock; a retry doesn't move again | Done (P08, P09) |
| EXIF | **Decided: stripped on the phone only.** `jcPetPhotoShrink` fails closed (no raw-file fallback). Only a hand-crafted Storage call skips it, and that exposes only its sender's own data. Server-side stripping would need an Edge Function, for little gain |
| One photo per report, shared 20 / day cap, size / mime check | Done (P05, P11). 2 MB is the bucket's limit, as for pets |
| SR17 guard extended | The `true` callers of the helper are still only the two organizer RPCs (s29 SR17b, passing). There is no column-level guard on `photo_path`: **accepted** (residual) |

## Security review

| # | Finding | Disposition |
|---|---|---|
| M1 | A moved photo becomes public to members and the reporter can't take it back | **PR 3 must disclose before upload** (added to the plan). An explicit "share if added" flag is not done; copy first, per the reviewer |
| M2 | A departed reporter's photo stayed readable by organizers and could still be moved | **Fixed.** Read rule (organizers only while the reporter is a member), helper hides `photo_path`, close never moves it (retires instead), nightly retires it (P14a–d) |
| L1 | Community isolation of the admin read branch rests on `jc_accounts.user_id` being the PK | **Documented** in the read rule. Revisit if accounts ever span communities |
| L2 | Withdraw / close isn't instant (1-hour signed URLs, sweep cadence) | **Accepted.** PR 3 copy must not promise "deleted immediately" |
| L3 | Upload cap not serialized; no index on photo paths | Cap race **accepted** (same as pets). Partial indexes on `photo_path` / `pending_photo_path` **added** |
| Info | A moved photo's path contains the report id | **Accepted.** It grants nothing |
| Tests | Write window, Pets-off read, departed reporter | **Added** P13 (after 15 min, after commit, Pets off) and P14 |

## Database review

| # | Finding | Disposition |
|---|---|---|
| M1 | A close racing an archive could leave a `current` ledger row on an archived pet (never purged) | **Fixed.** Close locks with the full predicate (active stray of this community, no photo). Nightly retires `current` photos of archived pets (P15). `jc_pet_retire` left unchanged (outside this PR) |
| M2 | A report whose photo can't be purged is kept beyond 30 days | **Accepted.** The purge is the gate. A failing purge already alarms through the maintenance canary (`jc_health`). Documented in the migration header |
| L1 | No check that the ledger row actually moved | **Fixed.** The move requires `report_id = r.id and state = 'current'` + found, else retire |
| L2 | Cap not serialized | **Accepted** (= sec L3) |
| L3 | Departed reporter's photo visible to organizers | **Fixed** (= sec M2) |
| L4 | Moved photo public; disclosure | PR 3 copy (= sec M1) |
| L5 | Plain `create function`, apply partially | **Accepted.** Applied as one transaction with its history row (`/db-rehearse` step 6) |
| — | H07a flagged `jc_admin_stray_report_close` (now checks the reporter is a member) | Allowlisted with a note. It returns only the organizer view (SR17b) |
