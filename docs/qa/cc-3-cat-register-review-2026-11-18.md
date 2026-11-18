# CC-3 Cats register — reviews (2026-11-18)

Migration `supabase/commons/migrations/20261118180000_cc3_cat_register.sql`, test slice `tests/sql/s34_cat_register.test.sql`,
app `commons/cats/`, `commons/assets/pet-photo.js`, `commons/assets/strings.js`, e2e `tests/e2e/specs/cats.spec.js`.
Plan: `docs/plans/CC-community-cats.md` (CC-3 row). Tier: **data / PII**: full rigor (rehearse, database + security + code review).

## Done-when checks → proof

| # | Check | Proof |
|---|---|---|
| D1 | Coordinators add cats: Cat ID C-001… never reused (merges included), every register field saved; a new cat needs a name or coat | s34 CR01, CR03h |
| D2 | Provisional → confirmed; usual station inside usual area; ear side only with an ear tip; every status change kept with date + source | s34 CR02, CR09m–o |
| D3 | Merge keeps history (pointer; photos + status entries show on the survivor; chains; undo restores) | s34 CR03, CR09a–b |
| D4 | Up to 4 photos per cat; begin → upload → commit, remove; storage read / write rules | s34 CR04, CR09c–k |
| D5 | Residents get the resident view only (no old ID, station, TNVR, dates, sources, history, merged cats) | s34 CR05; e2e "a resident sees the cats …" |
| D6 | Volunteers read the register, can't edit; residents / Pets admins can't read it | s34 CR06; e2e "a volunteer reads the full record …" |
| D7 | Module off = MODULE_OFF everywhere; photos unreadable | s34 CR07, CR09g |
| D8 | Bad input refused; admin log holds no content; hourly snapshot counts cats | s34 CR08 |
| D9 | Coordinator UI: add (name or coat required), edit, photos, merge, undo; refusals in words (EN / AR) | e2e cats.spec.js CC-3 block (5 tests) |

Dry run (rolled back): **ALL_TESTS_PASSED (1691 checks)** (was 1627). Nothing persisted (functions, tables, ledger
column, fixtures, snapshot CHECK all checked absent / unchanged afterwards).

## database-reviewer — no High

| Finding | Disposition |
|---|---|
| M1 unmerge re-points a moved cat that was unmerged and merged again since (wrong survivor) | **Fixed**: re-point only cats with no later open merge of their own; `merged_at` defaults to `clock_timestamp()`; test CR09a (the exact sequence) |
| L1 `OR` + subquery in jc_cat_json defeats the ledger / status-log indexes | **Fixed**: `cat_id = any (array(select … union all …))` |
| L2 cat_save takes no locks on area / station; archived station blocks unrelated edits; station with no area | **Fixed**: `for share` on a changed area / station; only a *changed* area / station must be active; the station-in-area rule is checked when either changes; a station with no area takes the station's area (CR09m–o). **Accepted**: CC-2 `jc_cat_station_save` can still move a station to another area or archive it under cats; cats keep their own area; revisit in CC-4 when visits read stations |
| L3 unindexed FKs (created_by, updated_by, logged_by, merged_by, undone_by, merges.community_id) | **Partly fixed**: `jc_cat_merges (community_id)` indexed. **Accepted**: the auth.users columns (same as CC-2; only user deletes scan them, tiny tables) |
| L4 merge integrity only in the RPC; uncapped survivor photos | **Fixed**: `check (from_id <> into_id)`. **Accepted**: single-column FKs (every write path is the RPC, checked per community); a survivor may show more than 4 photos after merges (display only; the cap is per own record) |
| L5 stale open merge rows | No change (consistent: unmerge takes the latest open row) |
| Missing tests | **Added** CR09: the M1 sequence, merged cat on the from side, retention leaves cat photos alone, stale pending photo in the purge queue, PHOTO_EXPIRED, commit onto another cat, cross-community merge / unmerge / photo refusals, storage write after merge / 15 min / module off, clearing a station, archived station rules, the ledger's one-owner CHECK. Not added: TOO_MANY_UPLOADS (same shared rule as pets, tested in s23/s30), the 2000-cat cap (too heavy) |

## security-reviewer — no High (confidence 0.85)

| Finding | Disposition |
|---|---|
| M1 jc_cats_public unpaginated, no rate limit | **Accepted pre-launch** (≈40 cats; same pattern as jc_cat_places / pets list). Revisit with a throttle or cached list if the register grows past a few hundred |
| M2 OR + subquery likely a scan per cat | **Fixed** (= db L1) |
| L1 merged cats' uuids reach residents in the survivor's photo paths | **Accepted** (reveals only that a merge happened; no resident RPC takes a cat id); CR05a asserts on cat entries |
| L2 merged_from goes to volunteers too; header said coordinators | **Fixed** header (volunteers seeing which records were merged is intended) |
| L3 free text has no PII guard (story shown to residents) | **Fixed in the UI**: "No residents' names, phone numbers or villa numbers here." on the form and next to the story |
| L4 survivor photos can exceed 4 after merges | Accepted (= db L4) |
| Missing tests | **Added** (CR09c–k): Pets admin can't write, another admin can't read a pending photo, write refused after merge / 15 min / module off, cross-community refusals |

## code-reviewer (app) — no High

| Finding | Disposition |
|---|---|
| M1 photo errors (unreadable file, upload failed, daily cap, expired) fell back to "Something went wrong" | **Fixed**: `ca_err_*` for the six photo codes (EN / AR, same words as Pets); e2e "a photo the phone can't read is said in words" |
| M2 an area rename / station change left the cat register stale until reload | **Fixed**: station / area writes re-read `jc_cat_register` quietly; e2e asserts the re-read |
| M3 the cat card's aria-label hid its status / provisional / area from screen readers | **Fixed**: label removed (the button's text is its name + chips + area) |
| L4 Undo merge shown to anyone who receives merged rows | **Fixed**: also gated on `can_edit` |
| L5 dialog-accepting test couldn't catch a removed confirm | **Fixed**: dialogs counted, a dismissed unmerge sends nothing, merge lands on the surviving cat |
| L6 two "never shows" assertions used fixtures that never had the value | **Fixed**: the resident fixture now carries an old ID, source and history the page must ignore |
| L7 focus / grouping | **Fixed**: sterilisation in its own fieldset; focus back on the photo picker after an add. **Accepted**: legend + label both say "Status" (kept for the select's own label) |
| L8 a late upload after leaving the editor doesn't redraw | Accepted (the register is updated; the next view shows it) |
| L9 date input forced dark | Accepted: every Commons page is dark-only (`<meta name="color-scheme" content="dark">`) |
| L10 a null resident list hides the section silently | Accepted (server contract always returns an object; load errors already show `caErr`) |

## Tests

- SQL: dry run **1691 checks** (s34 new: CR01–CR09; s6 + 00_grants updated); after apply the live run gives the same **1691**.
- e2e (mobile project, local): cats.spec.js **21 passed**; pets.spec.js + pets-report.spec.js + a11y.spec.js **108 passed**
  (pet-photo.js gained the "cat" upload mode).
- Screens looked at (mobile, stubbed): resident cat list + cat page, volunteer cat page (full record + history), coordinator
  editor after create. Fixed from the pictures: the card stacked centred (now a row), chips one per line, bare date inputs.

## Apply

Applied 2026-11-18 with its history row (`20261118180000 cc3_cat_register`) in one transaction; live suite 1691 green;
advisors: no new lint kinds (new entries are the 8 authenticated RPCs and 3 RPC-only tables, as designed; `jc_cat_json`
not executable by anyone; no Cats function executable by anon).
