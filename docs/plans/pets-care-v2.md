# Pets care v2 — plan (`/plan-change`, 2026-11-15)

> Status: **approved 2026-11-15** — Zee: Q1 = new-sightings section on top of Manage (last 7 days; older stay below),
> Q2 = "Needs help" **filter chip** on the Organizer list, Q3 = "Not fed" after 2 days only once ever fed; "Not seen"
> after 7 days, Q4 = care-log rate limit 60/h per organizer + 200/h per community, Q5 = status in Edit Details only when
> **adding** a stray (existing strays change it on Manage; Edit Details carries a one-line pointer).
> Source: stray-care UX review 2026-11-15 (not saved in repo; items reconciled against live code in this plan).

## Scope

Cross-layer: `jc_pet_care_log` shape, three function bodies, a rate bucket, `admin.js`, `pets.js`, strings. No paid layer.

## Live facts read 2026-11-15 (JubailCommons `qrpxfssdeeuzmsmlbtbu`)

- `jc_pet_get` already returns sightings newest first (≤ 30) and the care log newest first (≤ 20).
- Organizer rows already carry a "Needs help" status chip; the filter chips are All · Strays · Homes' pets · Missing · Archived.
- `jc_admin_stray_save` is the only writer of `care_state` (insert + update); called only by the stray editor's Save.
- `jc_pet_care_log`: kind ∈ fed / vet / note / state; note null only for fed / vet. `jc_rate_bucket_check` = join, admin_unlock, feedback, pet_archive, sighting_hide.
- `pm_err_RATE_LIMITED` hard-codes "20 … 60" and is shared by Archive, Hide and log adds.

## PR 1 — database + log display (data tier)

Migration `pets_care_v2` (signatures unchanged):
1. `jc_pet_care_log.state text` (∈ the four care states) + note CHECK: null allowed for fed / vet, or kind `state` with a state.
2. `jc_admin_stray_save`: on an **existing** stray, when `care_state` actually changes (`is distinct from`), write a
   `state` log row with the new state; if the newest row for that pet is a `state` row by the same author < 10 min old,
   update it instead (mis-tap). No row on create. Auto rows are not rate-limited.
3. `jc_admin_pet_care_add`: `RATE_LIMITED` past 60/h per account (`jc_rate_take`, bucket `pet_care_add`; bucket CHECK widened)
   and 200/h per community (count of `pet_care_add` in `jc_admin_log`).
4. `jc_admin_pets_list`: + `last_fed_at` (newest fed row), `last_seen_at` (newest of sighting / fed / vet row).
5. `jc_pet_get`: care_log rows + `state`.

Client: both log renderers show "Status: <label>" for state rows; rate-limit message per action.
Tests: new `tests/sql/s28_pets_care_v2.test.sql`; e2e for the state row.

## PR 2 — screens (screen-logic tier)

- Manage: "How they're doing" picker at the top (one tap → `jc_admin_stray_save {care_state}` → log re-read) + the Rehomed vs Archive hint.
- Edit Details: status only when adding; existing strays get "Change how they're doing on Manage."
- Manage: "New sightings" (last 7 days, with Hide) on top; older in the existing section.
- Organizer list: "Needs help" chip (active strays, `needs_help`); rows of active, not-rehomed strays: "Not fed in N days"
  (≥ 2 days, only when `last_fed_at` exists, amber) and "Not seen in N days" (≥ 7 days).

## Premortem (summary)

| # | Mode | Mitigation |
|---|---|---|
| 1 | Auto-log on a no-op save | Server compares old vs new; SQL test proves a same-value save writes nothing |
| 2 | Auto-log never fires | SQL test: one change = one row; live check on an e2e stray after apply |
| 2b | Cached clients | Old renderers show "Status change · date" — readable |
| 5 | Two organizers race the 10-min merge | Worst case two rows; row locked by `jc_pet_manage` |
| 6 | New fields' audience | `state` = public label already on the card; last fed / seen only on the admin list; grants re-checked |
| 7 | Rollback | Revert client; delete/annotate state rows with null note; restore CHECK + 3 bodies (captured in header); drop column; shrink bucket CHECK |
| UX | Status moved off Edit Details | One-line pointer on Edit Details |
