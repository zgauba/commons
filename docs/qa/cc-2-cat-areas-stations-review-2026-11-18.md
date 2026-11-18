# CC-2 Cats areas + feeding stations — reviews (2026-11-18)

Scope: `supabase/commons/migrations/20261118140000_cc2_cat_areas_stations.sql`, `tests/sql/s33_cat_areas_stations.test.sql`,
`tests/sql/00_grants.test.sql` (+4 functions), and the app side (`commons/cats/`, `assets/where.js`, strings, admin log keys).
Plan: `docs/plans/CC-community-cats.md` (CC-2). Tier: data / auth / PII: full rigor.

## Dry run

- With the migration: `ALL_TESTS_PASSED (1627 checks)` (live baseline 1591; s33 adds 36).
- Without it (the live schema): fails at G02 (the four `jc_cat_*` functions don't exist), so the slice tests the change.
- Nothing persisted: no `jc_cat_*` functions or tables, no testville33 fixtures, `e2e` modules unchanged.

## Done when → proof

| Check | Test |
|---|---|
| D1 Coordinators create, rename, archive / restore areas; names unique; in-use areas can't be archived | CS01, CS02f |
| D2 Coordinators add + edit stations: Station ID S-001… never reused, area, pin required, landmark, access notes, private flag (a required choice), archive / restore | CS02 |
| D3 Moving a station keeps the earlier spot (landmark + dates) | CS03, CS08e |
| D4 Lead + feeders + backups: current Cats role holders only, one lead; removed (or removed and re-invited) volunteers drop off | CS04 |
| D5 Residents see public stations only: no private station, Station ID, access notes, people or history | CS05 |
| D6 Volunteers read the programme view (private pins too), can't edit, never see emails or user ids; residents / Pets admins can't read it | CS05d, CS06 |
| D7 Module off = MODULE_OFF from every Cats RPC | CS07 |
| D8 Bad input refused; the admin log never holds a station's content | CS08 |

## security-reviewer: no CRITICAL / HIGH

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | MED | `private` defaulted to false: a station saved without the flag would publish a homeowner's villa pin | **Fixed**: a new station must send `private` (BAD_FIELDS otherwise); the editor asks it as a required choice. Test CS02h |
| 2 | LOW | Number gaps (S-001, S-003) hint at a private station; an area holding only private stations still listed | **Fixed**: residents get no Station ID, and only areas with a public station. Test CS05b/c |
| 3 | LOW | Volunteers received `user_id` of station people | **Fixed**: user ids to coordinators only. Test CS06b |
| 4 | LOW | A removed volunteer invited again would silently reappear on old stations | **Fixed**: `assigned_at`; a row counts only while its person's role was granted before it. Test CS04f |
| 5 | LOW | OR-chain order: `jsonb_object_keys` / `jsonb_array_length` on the wrong type could raise a raw error | **Fixed**: guarded with `case when jsonb_typeof(..)` |
| 6 | LOW | Move history unbounded in every read | **Fixed**: latest 10 per station returned (all kept) |

## database-reviewer: no CRITICAL / HIGH

| # | Sev | Finding | Disposition |
|---|---|---|---|
| M1 | MED | A restore / edit without `area_id` took no lock on the station's area: could race an area archive | **Fixed**: the station's current area is share-locked after the station row lock |
| M2 | MED | Number gaps reveal private stations | **Fixed** (= security 2) |
| L1 | LOW | OR-chain evaluation order | **Fixed** (= security 5) |
| L2 | LOW | Archived rows count toward the 50-area / 200-station caps | **Fixed**: caps count active rows; numbers still use max(num) over all |
| L3 | LOW | FKs to auth.users (`created_by`, `updated_by`, `moved_by`) unindexed | Accepted: tiny tables (≈20 stations) |
| L4 | LOW | Inner join on `jc_accounts` | Accepted: a role holder is always a member (accept requires `jc_me`) |
| L5 | LOW | `e2e` modules could be null | Checked live: a non-null object (events / bookings / pets) |
| — | info | `can_edit` (jc_admin_has) vs writes (jc_assert_admin) must accept the same grants | Checked live 2026-11-18: both accept the scope or `community`, code or invite |

## code-reviewer (app side): APPROVE, no CRITICAL / HIGH

No XSS (every server string escaped, attributes too); the resident view renders only what `jc_cat_places` returns; editors gated
on the server's `can_edit`.

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | MED | A Find Me failure arriving after leaving the editor mid-pick showed an error on the Stations list | **Fixed**: `where.js` onError is alive-gated; `takeMap` clears the draft's map. New e2e test |
| 2 | LOW | "Move pin" redrew without moving focus | **Fixed**: focus goes to the picker's help line on both paths (asserted in the same test) |
| 3 | LOW | Area rows repeated the same accessible names | **Fixed**: each row is a group named "Area {name}" |
| 4 | LOW | `by[p.role]` could hit the object prototype | **Fixed**: own-property check |
| — | LOW | Unsaved rename text in other area rows lost on a save redraw | Accepted: one row at a time is the normal use |

Screens looked at (stubbed, phone width): coordinator Stations list (private chip, people line, notes, Edit) and the station
editor (area select, Where, landmark, notes, visibility radios, who feeds here, earlier locations). The first look showed
unstyled selects / textarea / radios (Pets' and Organizer Tools' form rules live in their own page CSS) → `cats/cats.css`.

Local e2e (mobile project): cats (16), admin, strings-parity, help, shell, landing, section-names, admin-admins, pets — all pass.
