# Pets admins mark missing — app review (2026-11-19)

App half; the DB half (#180, `20261119140000_pets_admin_missing`) is applied live and merged
(`docs/qa/pets-admin-missing-db-review-2026-11-19.md`). Tier 2 (screen logic; the RPC it calls is reviewed and live).
Reviewer: `code-reviewer`: APPROVE, 0 critical / 0 high / 0 medium / 3 low.

## What changed
- `commons/pets/pets.js`: a Pets / community admin looking at a neighbour's owned pet gets the household's panel, headed
  "Pets team", with only Report as missing (same sheet, team help text) and "{n} is back home" in the alarm; both call
  `jc_admin_pet_missing_set` (`teamMiss` / `missRpc`). An admin's own pet keeps the household path. The household sees
  "Marked missing by the Pets team." in the alarm while `missing_by_team` is true.
- Strings `pt_team`, `pt_miss_help_team`, `pt_missing_by_team`, `pt_err_NOT_ADMIN` (EN + AR).
- Test stub `jc_admin_pet_missing_set` + card `missing_by_team`; 4 specs.

## Findings and disposition
| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | L | NOT_ADMIN fell back to the Organizer-code wording | **Fixed**: `pt_err_NOT_ADMIN` "Only the Pets team can change this." (EN + AR) |
| 2 | L | No test that an admin's own pet still uses the household's call | **Fixed**: spec "an admin's own pet keeps the household's panel and the household's server call" |
| 3 | L | `admin_scopes` stale until reload after a role is removed | **Accepted**: the server refuses (NOT_ADMIN, now worded) |

## Evidence
- `docs/qa/pets-admin-missing/panel-en.jpg` / `panel-ar.jpg` — Pets team panel (neighbour's pet) beside Your pet panel
- `docs/qa/pets-admin-missing/alarm-en.jpg` — the household's alarm, marked by the team beside their own report
- Specs: pets / admin-pets / pets-report / home **167/167** (mobile Chromium); the 4 new on WebKit **4/4**; design-guard OK.
