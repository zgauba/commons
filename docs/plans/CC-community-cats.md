# CC — Community Cats (Phase 1) — `/plan-change` 2026-11-17

> Status: **approved 2026-11-17** (Zee answered the four questions — see Decisions). Build order: Desktop layout →
> Photo viewer → CC-1 … CC-7 (CC-6 import before CC-7 Pets just for pets; re-ordered 2026-11-17, see "Overlap" below), each with its own `/ship-pr` (and `/db-rehearse` for DB).
> Source of requirements: ROADMAP → "Community Cats" (decisions 2026-11-17). This file is the build plan;
> ROADMAP stays the plan of record for *what*, this file for *how and in what order*.

## Step 0 — Scope + manifest

- **Tier: cross-layer — full protocol.** New tables, new roles (auth boundary), storage rules, a scheduled-job body
  (sighting retention), a data move out of Pets, shared module lists, new PII.
- Manifest LAST VERIFIED **2026-11-17** (fresh). Live layer re-queried today (JubailCommons):
  - 36 `jc_` tables; 109 functions callable by `authenticated`.
  - `jc_pets`: 16 rows, **all test data** (Jubail has no residents): 9 owned, 7 strays (4 under_care, 1 known_fine,
    1 needs_help, 1 rehomed). `jc_pet_sightings` 4, `jc_pet_care_log` 3, `jc_stray_reports` 2, `jc_pet_photos` 6,
    `jc_module_admins` 2.
  - Modules: Jubail all off; `e2e` events / bookings / pets on.
  - Scope CHECK on `jc_module_admins` / `jc_admin_grants`: `community | events | bookings | pets` (no `cats`).

## Step 1 — Inventory (every layer)

| Layer | Touched? | Check that ran |
|---|---|---|
| Frontend `commons/` | **Yes.** New `commons/cats/` page; bar entry in `assets/nav.js:15` (module list); `JC_MOD_NAME` in `assets/api.js`; strings EN/AR; Admins screen scopes (`admin/admin.js`); Pets' Strays tab (`pets/pets.js:29` `TABS`, 81 stray references) loses cats; Organizer Tools Pets section (55 stray references in `admin.js`) | grep `stray` → `pets.js`, `admin.js`, `app.css`, `admin.css`, `pet-photo.js`, `strings.js` |
| Database / API | **Yes.** New `jc_cat_*` tables + RPCs; scope CHECKs widened; module-key allow-lists (`jc_admin_module_label_set` in `20261117120000_b1_reason_codes.sql:111`, scope lists in `20261108200000_r4a3_unified_admins.sql:81,84,213,319,343,433`); `jc_snapshot_run` module list; stray rows move | live query above; grep `'events', 'bookings', 'pets'` over migrations |
| Auth & sessions | **Yes.** Two new grant levels (coordinator, volunteer) through the existing invite → grant model | `jc_admin_has` scope chain (manifest AUTH layer) |
| Storage | **Yes.** `pet-photos` bucket predicates `jc_private.pet_photo_can_read/_write` need a cat branch; `jc_pet_photos` ledger needs a cat owner column (several photos per cat) | manifest STORAGE; `20261116140000_stray_report_photos.sql` (same pattern added a report owner) |
| Scheduled jobs | **Yes.** `jc_pets_retention` (30-day sighting purge) must not touch cat sightings; `jc-photo-purge` reads the ledger only (no change expected — verify at CC-3); `jc-hourly-snapshot` gains a module | manifest JOBS layer |
| Observability | **Yes, small.** `jc_admin_log` kinds, App Health notices (moderation spike pattern) | manifest OBSERVABILITY |
| Tests | **Yes.** New SQL slices (`s32+`), `00_grants` allowlists + counts, e2e specs + stubs for the Cats page | `ls tests/sql`, `tests/e2e/specs` |
| Hosting (Pages + commons.ae) | **Yes, small.** New page path; per-page CSP in `commons/_headers` + `<meta>` like `pets/index.html` | `pets/index.html` CSP (manifest R5c) |
| CI / CD | Not touched. `review-saved.yml` applies as usual | workflow list in manifest CI layer |
| Secrets / env | **Not touched**: no new keys; Drive links are plain URLs, no Google API | ROADMAP decision "Invoices … Commons stores a link" |
| External APIs / paid layers | **Not touched.** No Apify, no Claude API, no Resend | same |
| Personal page, Halloween site | **Not touched**: every change is under `commons/` and `supabase/commons/` | path scope of the PR list below |

## Step 1b — Prior art

| Building block | Existing version | Decision |
|---|---|---|
| Module on/off, bar entry, renamable name | `jcModuleOn`, `nav.js` DESTS, RM labels (`jc_communities.module_labels`) | **REUSE** — add key `cats` |
| Roles: invite link → named grant → listed → removable | `jc_module_admin_*` + Admins screen (R4a-3) | **REUSE** — new scopes `cats` (coordinator) and `cats_vol` (volunteer) |
| Tabs / sub-menu / back | `jcTabsHtml` / `jcTabsWire` / `jcBack` (`nav.js`) | **REUSE** |
| Maps, pins, pin picker, nearest-first list, mini maps | `map.js` `jcBigMap`, `jcPinPicker`, `jcSortedWire`, `jcMiniMap`, `jcFitPins` | **REUSE** |
| "Where is it?" step in a form | Report a stray's Where fieldset (`pets/pets.js` `repWhereHtml`, `rpPick`) vs the organizer stray editor's optional map + **Pin here** (`admin/admin.js:687-722`) | **EXTRACT** Report a stray's flow into `assets/` and use it in every Cats editor — tester feedback 2026-11-17: the organizer version was missed, the report version was intuitive |
| Photo shrink + upload + signed URLs | `pet-photo.js` + `pet-photos` bucket + `jc_pet_photos` ledger + nightly purge | **REUSE** — extend the ledger with a cat owner (as stray reports did); one bucket |
| Photo viewer (tap → large) | **none** — grep `lightbox`, `showModal`, `<dialog`: only the map key sheet and page help | **NEW shared** — the planned "Photo viewer" phase, on the native `<dialog>` pattern of `jcKeySheet` |
| Desktop layout | **none** — `app.css:12` `main{max-width:480px}`, no `@media` anywhere | **NEW shared** — the planned "Desktop layout" phase |
| Care states | `JC_CARE_STATES` (4 states, `pet-photo.js:109`) + `jc_pet_care_log` free notes | **DEPART** — the programme needs separate facts (status ×8, ear tip, confirmed sterilisation + source, TNVR stage) and a structured vet log. The 4 states map 1:1 on the move (CC-6). Same timeline look on screen |
| Stray report queue | `jc_stray_reports` + Organizer Tools queue | **REUSE** — cat reports route to Cats coordinators (CC-7) |
| Soft archive / restore 30 days | `jc_pet_retire` + restore RPCs | **REUSE pattern** for cats (never a hard delete; merge keeps history) |
| Rate limits, admin log, error codes | `jc_rate` buckets, `jc_admin_log`, `jcErrText` | **REUSE** |
| Search + filter chips | `jcSearchHtml`, `jcChipsHtml` | **REUSE** |
| CSV export | Events sign-ups CSV (`admin.js:1117`) | **REUSE pattern** (Phase 3) |

## Step 2 — Impact map (the parts that touch existing things)

1. **New module key `cats`.** (a) a 4th switchable module; (b) consumers of the module list: scope CHECKs + 6 scope
   lists in RPCs, RM label allow-list, snapshots, `nav.js`, Settings start page, Admins screen; (c) one missed list →
   `BAD_FIELDS` / a grant that can't be made / a bar entry that never shows; (d) assume all lists are found by grepping
   `'pets'` in migrations + `"pets"` in `commons/` — verify with a structural test in `00_grants` that every module
   key appears in each list.
2. **Two new grant scopes.** (a) volunteers can write visits / sightings; coordinators can do everything in Cats;
   (b) `jc_admin_has`, `jc_me_get.admin_scopes`, `jcIsAdmin` (shows Organizer Tools), the last-admin guard;
   (c) **a volunteer must not get Organizer Tools or any Pets / Events power** — `jcIsAdmin` today is "any scope";
   (d) assume volunteer work happens on the Cats page only — verify with tests that `cats_vol` passes no other gate.
3. **Cat sightings kept forever.** (a) no 30-day purge for cats; (b) `jc_pets_retention`; (c) the purge deleting cat
   history (mode #1, silent); (d) separate table `jc_cat_sightings` so the Pets purge can't reach it — verify by test.
4. **Strays leave Pets (CC-7) — no data move** (Zee 2026-11-17: build Cats beside Pets, then make Pets just for pets).
   (a) strays stop being created / shown in Pets; (b) Pets Strays tab, Organizer Tools Pets, stray reports,
   photos ledger, sightings, care log; read **and** write paths; (c) orphaned photos, reports pointing at a moved
   pet, residents' bookmarked `?pet=` links; (d) only 7 test rows today — verify counts before and after.
5. **PII in a resident app.** (a) volunteer contacts, chip numbers, clinic IDs, private station pins, Drive links;
   (b) every resident-facing cat RPC; (c) a private field leaking into the resident view (mode #6);
   (d) **two separate RPC families** (resident vs programme), never one RPC filtered in the browser — verify with
   SQL tests asserting the resident JSON has none of the private keys, and that a private station never returns a pin
   to a resident.

## Step 3 — Regression surface (must keep working)

- Pets → Pets / My Pets: owned pets, missing alarm, sightings for missing pets, photos, archive / restore.
- Pets → Report a stray: still opens, still sends; the reporter still sees "My reports" and the decision.
- Organizer Tools → Pets: owned-pet moderation, hidden sightings, restore, moderation-spike notice.
- Organizer Tools → Admins: inviting community / events / bookings / pets admins unchanged; last-admin guard.
- Bar + Settings: existing modules keep order and labels; a 4th module doesn't push Organizer Tools off the bar
  (`jcBarMax`).
- Nightly jobs: `jc_pets_retention`, `jc-photo-purge`, snapshots all still green in App Health.

## Step 4 — Proposal: split into small PRs (required: >2 layers, data migration, shared contracts)

**Before any Cats screen:** the two shared app-only phases already on the ROADMAP — **Desktop layout**, then
**Photo viewer** — each its own short `/plan-change`.

| # | PR | Layers | Ships |
|---|---|---|---|
| CC-1 | **Foundation** (DB → app) | DB, auth, app | module key `cats` in every list (+ structural test), scopes `cats` / `cats_vol`, empty Cats page behind the flag, Admins screen can invite coordinators and volunteers |
| CC-2 | **Areas + stations** (DB → app) | DB, app | coordinator-made areas; stations with Station ID, area, pin, landmark, access notes, **private-location flag** (pin never sent to residents), lead + feeders, location history on move |
| CC-3 | **Cat register** (DB → app) | DB, storage, app | permanent Cat ID, several photos, name, sex, life stage, coat, usual area + station, provisional / confirmed, story, status + date + source, ear tip, sterilisation + source, TNVR stage; resident view vs programme view; **merge keeps history** (the merged cat becomes a pointer, reversible) |
| CC-4 | **Visits + sightings** (DB → app) | DB, app | feeding visit form (checks, headcount, tap register thumbnails, "flag a problem"); sightings as dated history, allowed before a cat is identified |
| CC-5 | **Vet log** (DB → app) | DB, app | per visit: date, clinic, what was done, vaccine, given, next due, invoice number, Drive link (allow-listed `drive.google.com` / `docs.google.com` only). No amounts |
| CC-6 | **Import her doc** | data only | one-time load of ~40 cats, ~20 stations, volunteers, run by Zee in the SQL editor from a local file; **never committed** (PII). Comes **before** strays leave Pets so the real records are in Cats first |
| CC-7 | **Pets just for pets** (app → DB) | app, DB | Pets' Strays tab, stray editor and per-cat "fed" quick log removed; every stray report routes to Cats (decision 2); the stray-only Pets functions switched off; **Report a stray's Where step moves onto the shared `assets/where.js`** (CC-2 carry-over: pets.js `repWhereHtml` is still its own copy). **No data move:** the 7 strays in Pets are test data and are archived, not converted (Zee 2026-11-17); the real cats come from the import |

- **Cost impact: $0.** No paid layer. Storage: Phase 1 photos are cat ID photos only (~40 cats × ~4 photos ×
  ~300 KB ≈ **48 MB**) against the 1 GB free tier; visit forms tag existing thumbnails and upload nothing.
- **Diff budget:** app PRs ≤ ~250 lines each; DB PRs exceed 200 lines (SQL + test slice) as every DB PR here has —
  each goes through `/db-rehearse` with database + security reviews.
- **Migrations:** CC-1…CC-5 and CC-7 each have one; CC-6 (import) is the only data load and there is **no data move** out of Pets. Nothing re-seeded, no cache invalidation; the
  service worker auto-update covers the new page.

## Step 5 — Premortem (§0.5)

| # | Mode | Exposed? | Mitigation |
|---|---|---|---|
| 1 | Silent data corruption | **Yes**: merge of two cats; CC-6 import | merge = pointer row + history re-pointed in one transaction, undo RPC; CC-6 import counts before/after in the test slice, live counts compared after apply |
| 2 | Silent zero-output | **Yes**: import (CC-6) loads nothing; resident view empty because every cat is "provisional" | import ends with a count check that raises if rows ≠ file; resident view shows provisional cats too (marked), so an empty list means no data |
| 2b | Out-of-band config drift | **Yes**: her Google Doc keeps being edited after import; module flag set by hand | a **cutover date** agreed with her: after import the doc is read-only and Commons is the record; flag change recorded in the manifest like `pets` |
| 3 | Cost blowout | Low | 48 MB estimate above; the existing storage ≥ 80 % alert in App Health |
| 4 | Contract drift | Low | Drive links are links only; allow-listed hosts |
| 5 | Race / ordering | **Yes**: two volunteers log the same station visit; two coordinators merge at once | visits are append-only (duplicates harmless, coordinator can hide); merge takes a per-cat advisory lock |
| 6 | Auth / RLS regression | **Yes, highest**: PII to residents; volunteer gaining Organizer Tools | separate resident / programme RPC families; SQL tests on resident JSON keys + private station pins; test that `cats_vol` passes no other gate and `jcIsAdmin` ignores it; security review on every DB PR |
| 7 | Rollback | Covered | module flag off = kill switch (every Cats RPC → `MODULE_OFF`); migrations additive until CC-7; CC-7 archives the old test strays in `jc_pets` (not deleted) for 30 days |
| UX | "Behaves differently from Pets" | **Yes** | cat page reuses the pet page's header, tabs, map tab and photo look; deliberate differences (status vs care state) explained in the page help "?" |

## Progress

- **CC-1 done 2026-11-18**: `20261118100000_cc1_cats_foundation` applied; `commons/cats/` page; Admins screen invites
  Cats coordinators and volunteers while Cats is on. Review: `docs/qa/cc-1-cats-foundation-review-2026-11-18.md`.
  - Decision taken in CC-1: Cats coordinators **and** volunteers never show Organizer Tools (`nav.js`
    `JC_NOT_ORGANIZER`); coordinators work on the Cats page. Revisit at CC-7 if the stray report queue lands in
    Organizer Tools.
  - Cats stays **off** on every community (including `e2e`) until it is usable: switch it on for `e2e` at CC-2.
  - **Carry into CC-4 (security review L4):** a coordinator doesn't hold `cats_vol`; every volunteer gate must accept
    `cats` OR `cats_vol` (OR community), with a test.
  - Carry into CC-3: add `cats` to `jc_snapshots_module_check` + `jc_snapshot_run` once there is cat data.
- **CC-2 done 2026-11-18**: `20261118140000_cc2_cat_areas_stations` applied; Cats page Stations + Areas tabs; Cats **on for `e2e`**.
  Review: `docs/qa/cc-2-cat-areas-stations-review-2026-11-18.md`.
  - Decisions taken in CC-2: residents see public stations as a list (no map yet, no Station ID: number gaps would hint at private
    ones); a new station must choose public / private (no default); lead / feeders / backups are Cats role holders only
    (CC-6 import: volunteers must accept an invite before they can be put on a station).
  - Shared `assets/where.js` = Report a stray's Where flow, used by the station editor. **Carry into CC-7 (or sooner):** move
    Pets' Report a stray onto it (pets.js `repWhereHtml` is still its own copy).
  - Carry into CC-3/CC-4: a resident map of public stations if the list proves hard to use.
- **CC-3 done 2026-11-18**: `20261118180000_cc3_cat_register` applied; Cats page cat register (residents: list + search + cat page;
  programme: full record + status history; coordinators: editor, up to 4 photos, merge / undo). Review:
  `docs/qa/cc-3-cat-register-review-2026-11-18.md`.
  - Decisions taken in CC-3: residents see each cat's name, photos, area, status, ear tip, sterilisation and story (never the old ID,
    station, TNVR, dates or sources); provisional cats are shown to residents, marked; a merge keeps the merged record as a pointer
    (its photos + status history show on the survivor; cats inside it follow; undo restores); a station with no area gives the cat
    the station's area; the photo path keeps the original cat's folder after a merge (accepted, security L1).
  - Accepted for later: the resident list is unpaginated with no rate limit (≈40 cats; revisit past a few hundred); CC-2 can still
    move or archive a station under cats (cats keep their own area; revisit at CC-4); a survivor can show more than 4 photos after
    merges. "Vaccinated ✓" in the resident view comes with the vet log (CC-5).
  - The desktop register **table** (DL-1 deferred it to CC-3) is deferred again: ~40 cats fit the card list + search on the
    600 px column; build it when the coordinator asks for columns (sort by status / area).

- **CC-4 done 2026-11-18**: `20261118220000_cc4_cat_visits_sightings` applied (live suite 1761); Cats page Activity tab (chips All ·
  Visits · Sightings · Problems · Not identified), station History + Log a visit, cat page history + Seen this cat, Log a sighting
  (a register cat or a described one; station, pin or area). Review: `docs/qa/cc-4-cat-visits-sightings-review-2026-11-18.md`.
  - Decisions taken in CC-4: an author sees their own hidden entries and shows again only what they hid; only a sighting logged with
    a description can be linked / relinked / unlinked; visits backdate up to 14 days; residents see nothing of visits or sightings yet.
  - Accepted for later (db M2): every Activity page scans the community's history (computed "at"); add a stored `at` + index past a
    few thousand rows. Per-row JSON (N+1) accepted at 50 a page.
  - Sample data on `e2e` (Zee 2026-11-18): old_id `SAMPLE-n` cats, `(sample)` stations; remove before any real import there.
  - **Tester message (draft, plan "Overlap"):** "Community Cats is now the place for strays on the test community: log feeding
    visits at a station (tap the cats you recognise) and sightings, even of a cat you can't name yet. Strays logged in Pets are test
    entries and won't carry over."

## CC-4 plan — visits + sightings (2026-11-18; Zee pre-authorised apply + merge for CC-4 only)

**Ships:** a volunteer at a station logs one **feeding visit** (date, food / water / cleaned, headcount, taps the cats they
recognised, counts of unfamiliar cats and kittens, "flag a problem" + what's wrong); anyone in the programme logs a
**sighting** of a known cat *or* of a cat not yet in the register (described), with where (station, or a pin via the shared
Where flow) and when. Both are kept **forever** as dated history. Coordinators link an unidentified sighting to a cat and
hide duplicates. Programme-only: residents see none of it in CC-4.

**DB (CC-4a, one migration, `/db-rehearse`):**
- `jc_cat_visits` (station required, `visited_on` not future and ≤ 14 days back, 3 checks, headcount 0–200, unfamiliar
  0–50, kittens 0–50, `problem` text ≤ 500 = the flag, note ≤ 500, `logged_by` + **`logged_name` snapshot** (decision 3:
  a removed volunteer's visits keep their name), `hidden_at` / `hidden_by`) + `jc_cat_visit_cats` (the cats tapped).
- `jc_cat_sightings` (`cat_id` **nullable** = not identified yet → then `description` required; place = station *or*
  lat/lng (in the community's map box) *or* neither + area; `seen_at` not future; note; `logged_name`; hidden; `linked_by`).
- RPCs (authenticated): `jc_cat_visit_add`, `jc_cat_sighting_add` (gate: `cats` OR `cats_vol` OR community — the CC-1 L4
  carry-over, tested for a coordinator without `cats_vol`), `jc_cat_activity(p_station, p_cat, p_before)` (programme
  read, newest first, 50 a page; a cat's history includes the records merged into it), `jc_cat_log_hide(p_kind, p_id,
  p_hidden)` (coordinators; an author may hide their own within 24 h), `jc_cat_sighting_link(p_sighting, p_cat)`
  (coordinators; null unlinks). Rate limit: new bucket `cat_log`, 60 / h per person across visits + sightings.
- Merge: nothing re-pointed — reads gather the survivor + its merged records (same as status history in CC-3).
- Kill switch: module off → `MODULE_OFF` from all five. `jc_pets_retention` untouched (separate tables, test proves it).
- Snapshots: `cats` row gains `visits_7d`, `sightings_7d`, `problems_7d`.
- Residents: `jc_cats_public` unchanged (test: its JSON has no visit / sighting keys).

**App (CC-4b, then CC-4c if over ~250 lines):** station card → **Log a visit** (form above; recognised cats = thumbnails
of cats whose usual station / area is this one, then search); cat page → **Seen today** (sighting, Where flow) +
**History** (sightings + visits that recognised it); a new **Activity** tab (programme): chips All · Visits · Sightings
· Problems, Hide / Show again, "Not identified" sightings with **Link to a cat** (coordinators). Shared pieces only:
`jcTabsHtml`, `jcChipsHtml`, `where.js`, `pet-photo.js` thumbnails, `.row` / `.mini` building blocks.

**Done when:**
| # | Check | Proof |
|---|---|---|
| 1 | Volunteer logs a visit with 2 recognised cats + a problem; it shows in Activity and on both cats' History | e2e `cats.spec.js` + SQL slice s35 |
| 2 | Sighting of an unknown cat saved with a description, later linked by a coordinator, then appears on that cat | SQL s35 + e2e |
| 3 | Residents get nothing new; `cats_vol` passes no other gate; coordinator without `cats_vol` can log | SQL s35 + 00_grants |
| 4 | Module off → every new RPC `MODULE_OFF`; pets retention never touches cat rows | SQL s35 |
| 5 | Migration applied live with history row, live suite green, advisors no new kinds | live run output in review doc |
| 6 | PRs merged after Chromium CI green; Pages deploy success | `gh` run ids |

## Decisions (Zee 2026-11-17, answering this plan)

1. **Volunteers = a role by invite link** (named, listed, removable, like admins), working on the Cats page only, no
   Organizer Tools. **Yes.**
2. **Non-cat strays:** "There are no stray dogs and birds in the neighborhood that are being taken care of."
   ⇒ **Strays leave Pets entirely in CC-7** (the Pets Strays tab and the Organizer Tools stray editor go; Pets = owned
   pets, missing / found, Report a stray). Report a stray keeps its species choice; every report lands in the Cats
   coordinators' queue, and a non-cat report is closed there ("not a programme cat"). No non-cat stray register.
3. **Volunteer data:** coordinators see contacts; volunteers see each other's names only; a removed volunteer's
   contact details are deleted, their logged visits keep their name. **Agreed.**
4. **Cat ID format:** Zee unsure → recommendation taken: **Commons issues short per-community numbers (C-001, C-002 …),
   never reused, kept through merges.** If the programme's ID cards already carry IDs, CC-6 imports them as a
   searchable "old ID" on the cat.
5. **Jubail management** (still open on the ROADMAP): unchanged by this plan; Cats stays off for Jubail until then.

## Tester feedback (programme volunteer, 2026-11-17, after trying today's Pets → Strays)

- **"Very intuitive and easy to use."**
- **Photos:** wants 1–3 photos per stray: "some (especially the orange ones) look so much alike it's hard to identify
  them." ⇒ confirms CC-3's several ID photos per cat. **Cap: 4** (both sides, face, before / after summer), shown in
  the shared photo viewer.
- **The per-cat "fed" button won't be used:** "Spinneys have so many cats it's going to take a long time to add it in
  each individual cat … you'll use in the beginning and later end up not using." ⇒ confirms CC-4: feeding is logged
  **once per station visit** (checks, headcount, tap the cats recognised). Cats get **no per-cat "fed" log**; the
  Pets quick-log "fed" goes with the strays in CC-7.
- **Map location when an organizer adds a stray:** the stray didn't show on the map. Confirmed by her follow-up: she
  missed the "pin here" step ("the 'report stray' option was more intuitive than the organisers when it comes to map
  location"). Today's organizer editor saves a spot only after **Pin here**; Report a stray asks **Where** as a
  required step with its own pin flow. ⇒ Cats editors (stations CC-2, cats CC-3, sightings CC-4) **reuse Report a
  stray's Where flow** (required where the record needs a place; the pin is saved when confirmed, no separate button).
  Today's Pets organizer editor is **not** fixed: it is removed in CC-7, so a fix would be thrown away (organizers
  meanwhile: press Pin here, or Zee says if testers need it sooner).

## Overlap: Cats and Pets side by side (Zee 2026-11-17)

Pets is left as is while Cats is built (CC-1…CC-5). From CC-4, strays can be logged in two places.
- **Tell testers when Cats is usable on the test community (CC-4):** Cats is now the place for strays; strays logged
  in Pets are test entries and **will not carry over**. Draft the message at CC-4.
- **Keep the overlap short:** CC-6 import, then CC-7 straight after.
- Until CC-7, organizers adding a stray in Pets must press **Pin here** for it to show on the map.
