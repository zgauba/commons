# Jubail Commons — roadmap to launch

> **The plan of record (2026-11-06).** Synthesized from: Zee's ideas summary (Oct 4 – Nov 6 planning
> conversations, `commons-ideas-summary.md`, shared 2026-11-06), `docs/plans/backlog.md`, the T2–T5 plans,
> `docs/qa/SYNTHESIS-2026-11-03.md` (T6 launch gate) and Zee's decisions in session. **When this file and
> another plan disagree, this file wins; when this file and live infra disagree, live wins — fix this file.**
> The private Ops Reference still holds community context, contacts and codes (never this repo).
> Deferred review findings + Known Gaps folded in by `docs/qa/SYNTHESIS-2026-11-06.md` (marked "synthesis" below).
> Rule from that pass: a deferred finding ships with the phase that already touches its code.

## The launch rule

**No launch to residents until the full app is built** — Events, Courts, Pets, The Community, the
pre-launch phases below — and the launch gate (R8) passes. The launch gate is the **last** step.
The `e2e` test community stays the place to try everything; Jubail's modules stay OFF until R8.

## Done (as of 2026-11-10)

| Phase | What shipped |
|---|---|
| T1–T4 | Halloween close-out + baseline (124 homes); Commons schema for every module (identity/homes, events, courts, pets) — RPC-only, RLS deny-all; rate limits; snapshots, state-change log, visit counter, health probe, cleanup jobs, canary |
| T5.0–T5.1 | Accounts (email + password + reset), join code, home claim + required pin, household invites, tab bar, hub, auto-update; Events for residents with Halloween parity |
| T5.2 | Organizer Tools (templates, question builder, kinds homes / one place, looks, sign-ups tab, pin moves, banner, CSV, per-event admins), event looks + pins, **event day** (two-sided switch, supply gauge, crowd reports + "We're Not Out", 2-min refresh), App Health & Notices, page help "?", Organizer Tools sub-menu, event Admin button, DB hardening |
| T5.3–T5.4 | Feedback to the platform owner (email via Resend); Coming Soon stage |
| R0 | WebKit e2e lane in CI (non-blocking until green ×2); its first catch fixed (map buttons over pin popups) — PR #62 |
| R1 | Organizer Tools → Community → **Households**: list by village, invite Approve / Decline, home edit, directory hide, member remove, admin log, notice → home — PR #63 |
| R2a | Events audit fixes: events end + auto-close 24 h later (stats always taken), vacated homes start clean, treat-night templates, homes events need a date, hidden households told, banners go with their event — PR #64 (DB `r2a_events_audit`) |
| R1.1 | Households: fix / set a home's pin (map + confirm naming the home + Undo) — PR #67 |
| R2b-1 | Organizer event-night acts (mark a home done / open, set or clear its supply, remove a no-show; household told, never who) + event page polish (Admin button on the title line, full-screen map) — PR #68 (DB `r2b_1_organizer_acts`) |
| R2b-2 | Per-event safety box (security line + lost-child meeting point), holiday lights look + template, clean event text on write — PR #69 (DB `r2b_2_safety_lights`). **R2 complete.** |
| R3 | App shell: "Save as an app" (R3b), your bar + start page + Settings (R3a), accessibility pass with shared WAI-ARIA tabs (R3c). **R3 complete.** |
| R4 | Courts: schema to spec + module / unified per-person admins (R4a–R4a-3), Admins screen + court editor (R4b-1), admin Day view (R4b-2), residents book (R4c), My Bookings → Past (R4d) — PRs #71–#85. **R4 complete** (Courts stays off for Jubail until R8). |
| R5a | Pets DB to spec (known & fine, territory, care record, sightings rules + retention, missing-pet show-home opt-in, members-only WhatsApp group link) — DB `r5a_pets`, applied 2026-11-10. Clients next: R5b / R5c / R5d (`docs/plans/R5-pets.md`) |
| B-1 | Courts → **Bookings** (section name, "Book a Court or Pitch", "place" wording EN/AR) + **Football** kind (never soccer; DB CHECK widened) — PR #145 (DB `b1_football_kind`, applied 2026-11-17) + PR #146 (app). Follow-ups F1 (server cancel reasons say "Court", English-only) and F2 (EN/AR key-parity test) in `docs/plans/B-1-bookings-football.md`. |
| Sign-up name | Sign-up asks for an optional **display name** (Zee 2026-11-17: buried in My Home → Account, nobody filled it — 1 of 5 live accounts), who-sees-it text under the field; saved after joining, never blocks it; disclosure copy fixed (organizers see it too; Account help no longer says "never your name"). Backlog: someone already signed in who then enters a join code skips the account step, so is not asked (My Home only). **Backlog (security review M1, DB):** harden `jc_display_name_set` — `jc_clean_line(left(p_name, 200))` + strip bidi overrides, BAD_NAME if nothing is left; show the masked email beside names in organizer rows (impersonation). |
| Link Done | A **Done** button beside Copy / Share on every one-time link box (Admins screen, per-event admins, household invite) closes it so another can be made; asks first only if the link was never copied or shared (it can't be shown again) — Zee 2026-11-17. |
| DL-1 | **Desktop layout** (Zee 2026-11-17): at ≥ 900 px resident pages are a 600 px column; Organizer Tools (`<body class="wide">`) goes up to 1200 px with forms kept at 600 px and card lists (events, sign-ups, households, pets, stray reports) in columns (`.jcgrid`); timelines stay one column; tab bar centred; `.jcsplit` (list beside map) ready for Community Cats. Phones unchanged. Tables deferred to the Cats register. |
| PV-1 | **Photo viewer** (Zee 2026-11-17): tap a saved photo (pet page, My Reports, Organizer Tools stray reports + stray editor) → full screen; Close / Escape / tap outside (never the end of a swipe); several photos: "n of t", previous / next, arrow keys, swipe, mirrored in Arabic. List cards keep opening the pet. Shared `jcPhotoView` in `pet-photo.js`, same signed URLs (no extra downloads). Plan `docs/plans/PV-photo-viewer.md` |

Detail: `docs/architecture.md` (Stack Manifest) and the reviews in `docs/qa/`.

## Pre-launch phases (in order)

Each phase ships as one or more PRs through `/plan-change` → `/ship-pr` (and `/db-rehearse` when it has a
migration). "DB" = needs a migration.

### R0 — WebKit test lane (synthesis S1, KG 17)  ·  tests only  ·  ✓ done 2026-11-06 (PR #62)
- Add a Playwright `webkit` project to the e2e suite and CI — three shipped bugs were iPhone-Safari-only and
  Chromium CI passed them. Non-blocking until green twice, then blocking. Flakes beyond one PR → their own
  test-only PR. Real-iPhone checks stay in R8.

### R1 — Households (Organizer Tools → Community)  ·  app only  ·  ✓ done 2026-11-06 (PR #63)
Community admins have database functions for homes but **no screen** — and invite requests over a
household's member limit currently have nowhere to go.
- Households list by village: home label, pin status, members (display name or masked email — never the
  full address), hidden-from-directory flag, pin flags; per-village counts (adoption).
- **Pending invites over the limit → Approve / Decline** (`jc_admin_invite_decide`).
- Fix a home's village / type / number (`jc_admin_home_edit`); ~~hide / show in the directory~~ (removed by HH,
  2026-11-12); remove a member, optionally deleting the account (`jc_admin_member_remove`).
- Admin log (`jc_admin_log_list`); links from App Health notices ("household left", "pin far away") to the home.
- Verify each RPC's live shape before building (they date from S1, never exercised by a screen).

### R1.1 — Households: fix a home's pin  ·  app only  ·  ✓ done 2026-11-06 (PR #67)
- Zee 2026-11-06: "Fix pin" / "Set pin" per home in Households, reusing the Sign-ups tab pin move (map +
  confirm naming the home + Undo) and the existing `jc_admin_home_pin_set` (clears pin flags, resolves the
  "pin far away" notice).

### Event page polish  ·  app only  ·  ✓ done 2026-11-07 (shipped inside R2b-1, PR #68)
- **Admin button on the title line**, not its own row (Zee 2026-11-06 screenshot: it pushes the title down).
- **Full-screen map button** — a CSS expand with a close ✕ (iOS Safari has no element Fullscreen API);
  Leaflet `invalidateSize` after resize; pins, popups, Find Me, Map Labels / Street keep working.
- Check the thin horizontal line across the map in iOS Safari (likely a tile seam); fix if it reproduces.

### R2 — Event-night extras + Events audit fixes  ·  DB  ·  ✓ done 2026-11-07 (R2a PR #64, R2b-1 PR #68, R2b-2 PR #69)
**R2a — Events audit fixes** (`docs/qa/events-qa-2026-11-06.md`; Zee 2026-11-06: fix all of them). Ships first:
it changes existing behaviour, and R2b builds on the same functions.
- **D1 + L1** — when a household leaves a home, its sign-ups lose the organizer's "hidden" flag and their spot,
  so the next family starts clean. The same household withdrawing + re-joining stays hidden.
- **D2** — at an event's end time sign-ups stop and the event moves to Past; a scheduled job closes it
  24 h after the end time, so its stats snapshot is always taken. Undated events are exempt. Needs a
  test that fails today (the live `e2e/halloween-test` row is the example).
- **F1** — the Halloween + Haq al Laila templates turn on switch, supply and crowd reports.
- **F2** — publishing a homes event asks for a start date (event day needs one).
- **U1** — a hidden or directory-hidden household sees "Your home isn't shown on the map" on My Sign-Up.
- **U3** — closing an event clears any banner about it; revoking an event admin clears their banner.

**R2b — Event-night extras** (plan: `docs/plans/R2-event-night.md` — R2b-1 = organizer acts → household told,
R2b-2 = safety block, holiday lights, clean text)
- **Organizer marks a home out** (Zee 2026-11-06: yes) — organizers + that event's admins set a home's
  live state / supply on event night; admin-logged; the household sees it on My Sign-Up. New RPC (never
  change `jc_entry_live_set`'s signature).
- **Per-event safety block** — community security number + agreed lost-child meeting point, set in the
  editor (`jc_events.safety` + the `safety` feature flag already exist); shown on the event page.
  Stores nothing about people; children are never named or matched to homes.
- **Holiday lights template** (Zee 2026-11-06: "just another event template") — a homes event: each
  decorated home is a stop; its own look (needs `holiday_lights` added to the `jc_events.look` CHECK — same
  migration) + template questions (e.g. best viewed from: street / garden; lights on until …).
- **Free a no-show's place** (synthesis; T5.2 3b #9 / PR 4, deferred by Zee to a DB PR) — organizers / that
  event's admins withdraw a sign-up; admin-logged. New RPC.
- **The household is told** (synthesis; 3a) — when an organizer moves its pin or marks it out, My Sign-Up says
  "adjusted by an organizer" (no organizer named).
- **Clear a supply level** (Zee 2026-11-06; R2b-1) — tapping the selected "How much is left" level again clears it.
  New RPC; `jc_entry_live_set`'s signature unchanged (its null means "leave as is").
- **Clean event text on write** (synthesis; KG 16) — `jc_clean_text` on event title / description in the save
  path; stored text left as is.

### R3 — App shell: your navigation, your start page, "Save as an app"  ·  app only
Plan: `docs/plans/R3-app-shell.md` (approved 2026-11-08). Three PRs: **R3b** "Save as an app" (static: manifest,
icons, head tags; installed name "Commons"; no service worker) → **R3a** bar + start page + Settings → **R3c**
accessibility.
- **Settings (My Home → Account):** choose which buttons appear in the bottom bar and their order
  (My Home always stays — Settings lives there); choose the **start page** the app opens on. Saved to the
  account (`jc_accounts.prefs` via `jc_prefs_set`, ≤ 2 KB — exists, unused), so it follows the person
  across phones. Modules that are off for the community never appear.
- **"Save as an app":** web manifest + icons + iOS meta. Gotcha: iOS home-screen apps keep separate
  storage from Safari (sign in again once) and bake in the name at install.
- **Accessibility pass** (synthesis S3) — first a11y audit (`design:accessibility-review`: hub, events, My Home,
  Organizer Tools); fix the tab rows (role=tab without tabpanel / arrow keys, focus lost on re-render — T5.2
  polish #6) as part of the nav rebuild, not before it.

### News on the Commons home  ·  sequenced after R3a
- Zee 2026-11-08 (R3 Decision 2): a **News** section on the Commons home (hub) for community and household
  information. Needs its own `/plan-change` (who may post, how long items stay, EN + AR, zero-PII default).

### R4 — Courts: tennis + basketball  ·  DB
Zee 2026-11-06: **no padel**; households book; **no outside coaches** for now; **community admins add the
courts and their location**.
- Migration: `jc_facilities.kind` → `tennis | basketball` (today `padel | tennis | other`; no rows yet).
- Organizer Tools → Courts: add / edit a court (name EN/AR, kind, pin on the map, open–close hours, slot
  length 30–120 min), publish / unpublish, block slots (maintenance, official events, known official
  bookings).
- Residents: per-court day grid, book, one-tap cancel, My bookings; **"Official community-management
  bookings take precedence."** on the booking screen (Master Community Declaration §15.10).
- Anti-squatting (mandatory): advance window (~7 days), max slot length, per-home cap
  (`modules.bookings.per_home_per_day`, default 1) — **values to confirm with Zee**.
- Module flag = kill switch (off the same day if official management ships its own system or asks).
- **Prerequisite: facility inventory (Zee is compiling)** — which courts, where, walk-on vs booked, fees.
  If any court charges, Commons coordinates intent only; payment stays with management.
- Open: no-show handling — wait for real data (booking accountability is a candidate opt-in PII slot).

### RM — Renamable modules (platform)  ·  DB + app  ·  RM-a ✓ applied 2026-11-10 (PR #88); RM-b client in review (`docs/plans/RM-renamable-modules.md`)
Every module has a **fixed internal key** (code, URLs, flag — never changes), a **display name per community**
(EN + AR, in community config) and an optional **brand name** shown as the section title. Applies to events,
bookings, pets now and `directory` (The Neighbourhood Edit) later; **today's labels become the defaults**, so
nothing changes on screen until an admin renames. Names are public-safe → `modules.<key>` config (read via
`jc_config_get`). Needs its own `/plan-change`: where names show (bar, page titles, hub cards, Settings, app
install), length caps for the bar, AR required or falling back, who renames (community admins).

### R5 — Pets of Jubail  ·  R5a ✓ applied 2026-11-10 (PR #86); R5b-1 ✓ (#90, #92)
**Order (Zee 2026-11-11):** remove home hiding (`HH-remove-home-hiding.md`) → **R5c photos** (a photo matters more
than a map for finding a missing pet) → R5b-2a shared map kit → R5b-2b Pets maps / tabs / badges
(`R5b-2-pets-maps.md`) → R5d Organizer Tools. (`docs/plans/R5-pets.md`)
**Re-plan 2026-11-13:** R5b-2b = R5b-2b-0 DB ✓ (#102, applied) → R5b-2b-2a Pets · Strays · My Pets → R5b-2b-2b pet
page (Map tab, mini maps, Add Location Pin, out-alone reports + disclosure) → **scoped `/structural-audit`**
(duplication + cross-module consistency, `commons/` client only, ~4–5 agents; Zee 2026-11-13: once all four modules
are stable, so it compares settled code) ✓ SA-1 #105, SA-2 #106, NF-1 #107, NF-2 #108, NF-3 #109 → R5d; SA-3–SA-5 slot in between.
Schema exists (S4: pets, photos, care log, sightings, missing). Concept: canvas "Jubail Pets Concept" + PDF.
- Directory: **owned** · **community "known & fine"** · **stray under care** (care record: sterilized,
  dewormed, vaccination, under treatment — kept by the carer group).
- Photo, name, species, home. No owner names or phones. Members only (accounts replaced the old
  "viewing passcode" idea).
- **Missing** toggle: card turns red, tops the list.
- Never collects money.
- **Discuss in detail at the start of R5 (Zee 2026-11-06):** the ideas say "report a sighting only
  pre-fills a WhatsApp message — nothing stored", but the schema **stores** sightings (`jc_pet_sightings`:
  reporter, note, location).
- Carer-group access: "one shared link" in the ideas → in Commons terms a per-group admin grant (like
  per-event admins). Confirm.
- **Split decided 2026-11-17:** Pets stays the residents' module (owned pets, missing / found, Report a stray). Strays
  and the volunteer feeding work move to a new module: **Community Cats** below.

### Community Cats  ·  new module  ·  DB + app  ·  needs `/plan-change` (Zee 2026-11-17)
**Purpose (Zee 2026-11-17): visibility for residents, working records for volunteers.** Residents see which cats live
here and how they're cared for; volunteers and coordinators get the detailed records. Test every later request
against this.

**Why:** feedback from the person who runs Jubail's stray-cat feeding and TNVR (trap, neuter, vaccinate, return)
programme. Her sources (private, not in this repo): the working Google Doc "Jubail Cat Community Information" (about 40
cats, about 20 stations, ID cards), the "Locations & volunteer coverage" slide and "Programme Software Data
Requirements (draft)". She needs **colony and case management**, not a directory. Today's Pets module can't hold it:
- sightings are deleted after 30 days and the reporter is removed after 24 h, but she needs full dated history per cat;
- one photo per pet, but she needs several ID photos per cat (before and after summer, both sides);
- no permanent cat ID: her doc already has two different "Caramel"s (Souk, Maha) and "Gwen" filed twice;
- no stations, areas or volunteers; care states are too coarse (status, ear tip, sterilisation and TNVR stage are
  separate facts).

**Decisions (Zee 2026-11-17):**
- A separate module from Pets (named Community Cats: see "Name" below; the display name is renamable per community via RM).
- **Areas are created by coordinators** inside the module, not fixed in config. Jubail starts with Souk, Seef, Nad Al
  Dhabi (East / West as she chooses), Maha, Ain Al Maha. Not the same thing as villages.
- **PII is OK here, where the programme needs it:** volunteer names and contacts, microchip numbers, clinic and
  patient IDs, vet documents, private feeding locations. It's still **restricted to coordinators** (her own rule:
  "restrict private contacts, chip numbers, clinic documents and sensitive locations to authorised users") and
  disclosed on the screen that collects it. Exception to the "PII only when necessary" default, recorded here.
- **Desktop matters:** the coordinator works on a computer (see "Desktop layout" below).
- **No money in the app.** No appeals, contributions, invoice amounts, payments or reconciliation. Bill appeals stay
  in WhatsApp, as today, and people pay the vet directly. The programme does this on purpose: "we don't collect money
  exactly because of the UAE laws" (programme lead, 2026-11-17). Commons must not become the soliciting channel. Revisit
  only after a legal check on UAE donation rules, and then with contributors anonymous by default (most announce
  their contribution publicly, some don't).
  **Giving through the app is not at this stage at all** (Zee 2026-11-17: "baby steps"). A volunteer proposed per-cat
  vet bills, an "I want to help!" button, uploaded payment screenshots and a countdown of what's still owed: declined.
  It would be public solicitation from Zee's app, store bank screenshots, and show unverified amounts. Exploring it
  later needs, first: legal advice on UAE donation rules, Jubail management's approval, and possibly a licensed
  charity to handle it. Told to the volunteers' group the same day.
- **Invoices and vet documents live in the programme's own Google Drive folder**, not in Commons. Commons stores a
  link to the file on the vet visit. Proposed to the programme: a programme-owned Google account (not a volunteer's
  personal one), sharing restricted to specific people (never "anyone with the link"), and a file-naming rule (cat
  ID, date, clinic, what was done). Not a storage-cost decision: about 50 MB a year would fit the free tier; the
  reasons are liability for financial and medical paperwork, their control, and zero build.
- **Two views of a cat.** Residents: name, photos, area, ear-tipped / sterilised, "vaccinated ✓" (no dates), current
  status. Volunteers and coordinators: everything else (vet detail, dates, private locations, document links,
  contacts).

**Open: Jubail management.** The programme runs with Jubail management's approval (they review its plans and meet
with the programme). Community Cats puts that programme into a resident app, so management should see it before it is
turned on for Jubail. Not yet decided how or when; at the latest, part of R8.

**Roles (new):** *volunteer* (log feeding visits, sightings, incidents) and *coordinator* (create areas and stations,
verify or merge cats, edit, see private fields). Same invite-link → named grant → listed → removable model as every
other admin level (R4a-3). Maybe scoped to an area later.

**Phase 1: replaces her Google Doc**
- Cat register: permanent Cat ID, several photos, name, sex, age or life stage, coat and markings, usual area and
  station, provisional / confirmed ID, **merge duplicates while keeping their history**.
- **Story / personality** per cat (for example "very gentle, loves cuddles, bullied by the other males"), shown to
  residents: cats as individuals, not statistics (volunteer feedback 2026-11-17; promised in the group reply).
- Status (community, clinic or recovery, foster, adopted, transferred, missing, deceased, unknown) with date and source.
- Ear tip (present / absent / unclear, side) kept separate from **confirmed sterilisation** (with its source).
- TNVR stage: needs it, booked, captured, at clinic, returned (date and place).
- Areas (coordinator-created) and **feeding stations**: Station ID, area, pin, landmark, access notes, private
  location flag (for example Upper Terraces, a homeowner's villa: never a public pin), lead, regular feeders and
  backups. Keep old locations when a station moves.
- **Feeding visit form:** checkboxes for routine checks (food, water, cleaned), a headcount, photo thumbnails to tag
  recognised cats, unfamiliar cats or kittens, "flag a problem" opens the issue fields.
- Sightings kept as dated history (no 30-day purge for programme cats); a sighting allowed before a cat is
  identified.
- **Vet log** (moved up from Phase 2, 2026-11-17): per visit, date, clinic, what was done, vaccine, date given, next
  dose due, invoice number, link to the document in the programme's Drive. Medical facts only, no amounts. Use case:
  after a scratch or bite, check the cat's vaccine status in seconds (only as good as the cat's identification; a
  record never replaces seeing a doctor).
- One-time **import** of her doc's cats, stations and volunteers.
- Today's strays (`jc_pets` kind `stray`, care log, stray reports) move into the programme. Report a stray keeps
  feeding it.

**Phase 2:** vet follow-ups and next-dose reminders, welfare cases with urgency, owner
and due date, mother and kitten links, **incidents from anywhere** (road strikes, near misses, complaints, feeding
outside stations; station link optional), volunteer shifts (scheduled / done / missed), area dashboards (filter by
area, date and station; resident figures use the usual area, activity figures use the sighting location).

**Phase 3 (decide later):** printable monthly report for Jubail management (care figures only), stock, partners.
Start with **CSV export** of the figures. **Invoices, payments and contributions are out** (see "No money in the
app" above), not merely deferred.

**Counting rules from her doc** (Phase 2 reports must follow them): count a recognised cat once community-wide;
unidentified headcounts stay visit observations; clinic visits counted apart from cats treated; road deaths once in
total deaths; visit coverage measured against scheduled visits; sterilised residents shown against known residents
plus the unknown count.

**Name (Zee 2026-11-17): Community Cats.** Bar label "Cats"; module key `cats`; Arabic «قطط المجتمع» pending native review. Display name renamable per community (RM).

**Build plan: `docs/plans/CC-community-cats.md`** (`/plan-change` 2026-11-17, approved): Desktop layout → Photo viewer →
CC-1 foundation (module key + coordinator / volunteer roles) → CC-2 areas + stations → CC-3 cat register → CC-4
visits + sightings → CC-5 vet log → CC-6 import → CC-7 Pets just for pets (strays removed, **no data move**: today's
strays are test data; Pets is left as is until then — Zee 2026-11-17). Testers told at CC-4 that Cats is the place for
strays and Pets test strays won't carry over. Decisions recorded there (Zee
2026-11-17): volunteers are an invite-link role on the Cats page only (no Organizer Tools); **no non-cat strays are
cared for, so strays leave Pets entirely** (Report a stray stays in Pets and feeds the Cats queue); volunteers see
each other's names, coordinators see contacts, a removed volunteer's contacts are deleted; Cat IDs are Commons-issued
C-001… (old programme IDs kept as a searchable field). **Tester feedback 2026-11-17** (in the plan): up to 4 photos per
cat (look-alike orange cats); no per-cat "fed" button (one log per station visit); the organizer's optional
"Pin here" step was missed while Report a stray's "Where" was intuitive → every Cats editor reuses the Where flow.

### Pets profile v2  ·  DB + app  ·  after CC-7  (Zee 2026-11-18 — needs `/plan-change`)
Make residents' pet pages richer and more fun now that strays leave Pets. Sequenced **after CC-7** (both touch
`pets.js`; no parallel work in the same area). All new fields optional; pet data only, so no new personal data.
- **New fields:** breed (free text with per-species suggestions incl. "Mixed", Arabian Mau, Saluki); sex
  female / male / unknown and **neutered / spayed** yes / no / unknown (same choices as the Cats register `jc_cats`,
  so a roaming owned cat that's neutered isn't trapped again); age = birthday **or** "about N years old" (store year +
  optional month / day; rescues often don't know the date); **size** instead of weight (weight goes stale), with
  guidance per species — dog: small < 10 kg, medium 10–25 kg, large > 25 kg; cat: small < 3.5 kg, medium 3.5–5.5 kg,
  large > 5.5 kg (rules of thumb); no size for bird / rabbit / other.
- **Description → prompts:** owner picks up to 2 short fill-ins (~80 chars): "Known for…", "Favourite spot in
  Jubail…", "Will do anything for…".
- **Badges = standard emoji in chips** (no artwork). Stored as fixed keys; labels in the EN/AR strings dictionary;
  emoji hidden from screen readers (the label carries the meaning). Use widely supported emoji only — **one exception:
  🛟 Proud Rescue** (2021 emoji; label still reads fine where it doesn't render). Display chips, not buttons; in the
  editor they are toggles.
  - **Good to know** (amber tint, shown first; contrast checked in both themes): 🧭 Wanderer (today's `wanderer`
    flag, restyled — must be clearly visible), 🚫 Please don't feed me, ✋ Ask before petting, 🏃 Escape artist,
    🐕 Good with dogs, 🐈 Good with cats, 🧒 Good with kids.
  - **Personality** (neutral chips, **up to 4**, hidden when they don't fit the species): 🦋 Social Butterfly,
    🎾 Playful, 💨 Zoomies, 🏖️ Beach Bum, 🐦 Bird Watcher, 💞 Velcro, 🦉 Night Owl, 🛟 Proud Rescue, 🛋️ Couch
    Potato, 🍗 Foodie, 💬 Chatterbox, ☀️ Sun Seeker, 🥏 Fetch Pro, 👑 Boss of the House, 🌊 Water Lover, 🧸 Gentle
    Giant.
- **Missing pets:** Good to know chips show on the missing banner / poster (finders need "Ask before petting",
  "Escape artist", "Please don't feed me") — **except Wanderer**, which is hidden while a pet is missing (it says
  "don't worry", missing says "worry").
- **Later, not v1:** automatic badges (🎂 birthday this week, Golden Oldie from age, New to Jubail for 30 days) and an
  opt-in birthday shout-out on the Commons home.

### Desktop layout (shared, every module)  ·  app only  (Zee 2026-11-17)  ·  ✓ DL-1 done (`docs/plans/DL-desktop-layout.md`)
- Today every page is a phone-width strip on a computer (`main{max-width:480px}` in `app.css`, no breakpoints
  anywhere). The coordinator uses a computer.
- One shared layout change: organizer / coordinator screens go wide on desktop (tables, map beside list, filters);
  resident screens stay a centred column, a little wider. Built once in `assets/`, used by every module.
- Before the Community Cats UI, so it's built wide from the start.

### Photo viewer (shared)  ·  app only  (Zee 2026-11-17)  ·  ✓ PV-1 done (`docs/plans/PV-photo-viewer.md`)
- Tap any pet / cat / stray-report photo → it opens large in a modal (close button, Escape, swipe or tap outside;
  next / previous when there are several photos). One shared component in `assets/`, reused by Events and Bookings
  wherever they show photos (cross-module consistency rule).

### Events: village-only events + sign-up limits  ·  DB + app  (idea, Zee 2026-11-11 — needs `/plan-change`)
- An event open to selected villages only. Default: **only those villages see it**; optional "everyone sees it, only
  these villages can sign up" (the page says why you can't join). Enforced on the server in `jc_event_signup` (body
  only — frozen signature); new refusal code.
- Sign-up limit for every event kind (today only one-place events have a capacity).

### Events: per-event organizers draft, admin approves  ·  idea (2026-11-17)
- Per-event organizers already exist (T5.2b: invite link, then they run that one event). They can't **create** or
  publish. Idea: an organizer drafts an event → it waits in Organizer Tools → a community admin publishes it.
  Not decided; needs `/plan-change` if wanted.

### R6 — The Community: map + directory  ·  app (+ DB if needed)
- Find any villa on the island and get directions (`jc_directory_list` exists; hidden homes stay hidden).
- Optional per-home extras stay opt-in (zero-PII default).
- **Community information** (Zee 2026-11-10): bus routes / timetables, waste collection, other practical info as
  editor-maintained static content in this section (`docs/plans/neighbourhood-edit-brief.md` → follow-on).
- **Meetups** (Zee 2026-11-11: "maybe they should live in The Community … a sub-section called Meet ups? I don't want
  to create another module"): a tab inside The Community — regular gatherings (what · weekly day + time · place pin ·
  how to join, e.g. a WhatsApp group link). No sign-ups, no capacity. Residents **suggest** a meetup (or an event) →
  it lands in Organizer Tools → an admin approves with one tap → published. Direct resident posting later, once
  moderation and the contact-person (PII) question are settled. Needs its own `/plan-change`.
- **Parcel notice** (resident suggestion, 2026-11-16): a resident tells a household a parcel is at Villa X — one-way,
  in-app, no contact details shared; joins the digest only if that household opted in. Needs its own `/plan-change`
  (abuse limits, who can send to whom).
- **"Hidden homes stay hidden" above is void** — home hiding was removed 2026-11-12 (`docs/plans/HH-remove-home-hiding.md`).

### "See it as a resident" for admins  ·  app only  ·  idea (Zee 2026-11-18)
Anyone holding an admin role (community, events, bookings, pets, Cats coordinator or volunteer) wants a button that shows
the app as a plain resident sees it, without signing out. Proposed shape: a **"See as a resident" switch in Settings**
(and a one-line banner "You're seeing what residents see · Back" on every page while it's on). Display only: the page
behaves as if `admin_scopes` were empty, so it calls the resident RPCs (Cats already has two families: `jc_cats_public`
vs `jc_cat_register`), hides Organizer Tools and every editor. The server is unchanged and still trusts the real role,
so nothing is weakened; per-session (`sessionStorage`), off on a new visit. Needs a short `/plan-change` (touches
`nav.js` / `api.js` shared state; every module's role checks read through one helper).

### Light mode  ·  fast follower (Zee 2026-11-11)
- The light palette already exists in `tokens.css` (`[data-theme="light"]`, contrast-checked); every page pins
  `color-scheme: dark` today. Follow the phone's setting (`prefers-color-scheme`), every screen checked in both, map
  tiles and event looks included. After R5b-2.
- Kept on purpose: the blue "you are here" dot (Zee 2026-11-11 — the convention people recognise), tokenised in R5b-2a.

### Nearest first — one distance rule for every list  ·  DB + app  (planned 2026-11-14, `docs/plans/nearest-first.md`)
- Zee 2026-11-14: one unified way of showing distance and one set of buttons. Default origin = **your household pin**;
  the phone only after **Use Where I Am** (lists) or **Find Me** (maps), for that visit; never sent or stored.
- One control everywhere: "Sorted by: nearest your home [Use Where I Am]" ↔ "nearest where you are now [Use My Home]";
  "≈ 300 m" on rows. Courts list, Events List (your village first; By House Number kept), Strays cards. Owned pets:
  server order from your home pin, no phone re-sort (their homes never reach the phone).
- Organizer Tools never by distance: A–Z by village, then name (events stay by date).
- PRs: **NF-1** courts get an optional village (where it is, not who may book; none = Whole community) ✓ #107 → **NF-2** the
  shared control on Courts / Events / Strays ✓ #108 → **NF-3** Organizer A–Z ✓ #109 (Pets organizer lists come with R5d).

### Bookings (long term, Zee 2026-11-14)
- Courts grow into general **Bookings** for any community's shared spaces (rooms, BBQ areas, halls). The code is
  already "bookings" (module flag, folder) and a court is a facility with a `kind`, so it is mostly new kinds + labels.
  First step done in B-1 (2026-11-17): Bookings name, "place" wording, Football kind. Rooms / BBQ / halls not scheduled.

### Commons home v2  ·  app (+ DB only if "For you" needs one read)  ·  LAST feature before launch planning (Zee 2026-11-15)
The hub today is one column of big module cards and "Welcome, Villa 12" — nothing tells a resident what needs them,
so the Commons button feels wasted. Needs `/plan-change`, and a clickable mockup first (Zee wants to see it).
- **For you** (top): from data the app already has — events open for sign-up your home hasn't joined, your next court
  booking, a missing pet nearby, an organizer's to-dos. Check the hub's load cost (3–4 reads → maybe one RPC).
  Organizer to-dos include **stray reports waiting** (Zee 2026-11-16: no notifications yet, so the count must reach
  organizers without opening Pets; interim: a line on the residents' Strays tab for Pets organizers).
- **Modules in 2 columns**: compact tiles (icon, name, one line).
- **What you can do here** (below the tiles): short explainer, doubles as onboarding.
- Decide with the mockup: a small fixed Commons icon at the far left of the bottom bar (6 buttons for organizers;
  Apple's guidance is 3–5; Arabic / renamed labels get tight; Commons icon vs My Home icon confusion).
- **News** (organizer posts) stays its own track ("News on the Commons home" above) — DB + posting rules.

### Email — provider + minimization rules  ·  decision of record (Zee 2026-11-17)  ·  nothing built yet
**Provider: stay on Resend, Free plan** (3,000 / month, 100 / day). Already integrated (the feedback job; key in Vault).
No switch.
- Rejected, for the record:
  - **Brevo Free** (300 / day): its branding on resident emails can't be removed on Free; marketing-first product.
  - **Resend Pro** ($20 / month) / **Amazon SES** (~$0.10 per 1,000): only if all-resident email is ever wanted. Pro = no
    new work; SES = cheapest, but AWS setup and a sandbox-to-production approval.
  - **WhatsApp Business API**: needs every resident's phone number (PII that isn't necessary for this purpose), Meta
    business verification, pre-approved templates, per-message fees. Not for Commons.
- **Trigger to revisit:** only if all-resident email is ever wanted; then choose between Resend Pro and Amazon SES.
- Prices and Free-plan limits are time-sensitive: re-check them at the R8 setup.

**Email is the last resort, by design:**
1. **In-app first, always.** Every notice lands in the app (notice → home, Commons home "For you", banner). Email only
   ever repeats an in-app notice.
2. **Only two emails are immediate:** password reset and household invite. Everything else is digest-only.
3. **One digest per person per day, max** (e.g. 07:00 Dubai), bundling everything for that person in sections:
   organizer to-dos (stray reports waiting, moderation), household notices, booking changes. Empty digest = nothing sent.
4. **Skip if already seen:** if the person opened the app after the item appeared, drop it; if all items were seen,
   no email. Needs a per-person "last seen" time (small, first-party behavioural data, disclosed in the privacy
   policy). If this rule is dropped instead, the digest plan says so.
5. **Coalesce:** several changes to one thing collapse to one line (book then cancel the same slot = nothing; three
   new stray reports = "3 new stray reports").
6. **Opt-in per kind, default OFF**, except account email (rule 2). Residents choose digest sections in Settings;
   organizers' to-do section defaults ON for organizers only. Weekly instead of daily is a per-person choice.
7. **No email for what the app already shows:** booking confirmations (My Bookings), event sign-up confirmations
   (event page), "your home was marked out" (My Sign-Up). Offer **Add to calendar** (.ics download) instead.
8. **Community-wide = never email.** In-app (banner, Commons home / News) + an organizer **Share to WhatsApp** button
   that pre-fills the announcement (EN + AR) for the community group. Free, no phone numbers, no daily-cap risk.
9. **Daily budget guard:** a send counter keeps total email under 80 / day (Free cap 100, leaving room for resets).
   Over budget → digests roll to the next day; password resets and invites are never held.
10. **Measure it:** App Health shows emails sent per day by kind, plus any roll-over.

**Built from these rules (each its own `/plan-change`):**
- **Daily digest email** (rules 3, 5, 6, 9, 10): with Commons home v2's organizer to-dos, or its own PR. Needs
  `/db-rehearse` (digest queue, budget counter, per-person email preferences + confirmed address).
- **Organizer "Share to WhatsApp"** on event and news screens (rule 8). Prior art: Pets' WhatsApp button (copy the
  message + open the group link, `jcWaGroupOk`).
- **Add to calendar (.ics)** on bookings and event sign-ups (rule 7).

**Answers (Zee 2026-11-17, on Claude's review) — these amend the rules above:**
- **Invites stay links, not emails.** A member copies a one-time link and sends it themselves (`mh_invite_help`).
  So rule 2's only immediate email is the **password reset**; rule 9's "never held" applies to resets alone.
- **Confirm the address when someone opts in** to any digest (not at sign-up, which stays friction-free with email
  confirmation OFF). No digest goes to an unconfirmed address.
- **Rule 4 dropped for the first version:** no "last seen" time; the digest is opt-in, so its readers asked for it.
  Revisit only if people complain of repeats. Nothing extra to disclose.
- **Daily only for the first version** (rule 6's weekly option later).

### R7 — Launch prep (not features)
- **Join: wrong-community help**  ·  app (+ maybe one RPC)  ·  incident-driven 2026-11-17; **pre-launch item, not
  now** (Zee 2026-11-17). From `docs/incidents/2026-11-17-join-code-wrong-community.md`: a tester entered the test
  community's code on Jubail (the only community listed) and got "That code didn't work". Needs a short `/plan-change`:
  - BAD_CODE that is a valid join code elsewhere → "This code is for a different community — open the exact link you
    were sent" (never name it; keep the 10 / hour join limit).
  - Remember the chosen community beyond one tab (localStorage), so new tabs and the saved app keep it.
  - While Jubail has no join code (until R8), its Join button says the community opens soon.
  - Until then: send testers the join link with `?community=e2e`, opened in the tab they sign up in.
- **Organizer guide** (Zee 2026-11-17): what organizers can do at each level (community, module, per-event,
  programme coordinator / volunteer) and what to do in specific scenarios. Written after development is finished.
- **Retire the shared `events` organizer code** (Step C, parked until testing is done) → per-event admins only.
- **Retire the Halloween site** into Commons (Zee 2026-11-14: a pre-launch step, not before). Inventory 2026-11-14:
  - **The page:** `jubail-halloween/` stays at its URL forever as a pointer page ("Halloween 2026 is over, events live on
    Jubail Commons", a button to commons.ae). Old QR codes and installed app icons keep working. Its service worker
    caches nothing (network-only), so the replacement reaches installed copies at once. `dashboard.html` goes too.
  - **The data:** the site promised "Data deleted after the season". Keep totals only, then delete the `jh_` rows and
    RPCs in SignalPost (`/db-rehearse`, live only on Zee's "apply"). Check first: the SignalPost DB didn't answer on
    2026-11-14 (possibly paused).
  - **Leftovers:** `jc_communities.links.halloween_archive` (unread since #111), the `admin.js` wording comment, test
    stubs, and the /jubail/ page copy that mentions it.
- **Re-review all help copy** (Zee 2026-11-16) — every page help "?" panel and in-screen help/explainer text across
  every module (Events, Courts, Pets incl. stray reports, The Community, My Home, Organizer Tools), EN + AR, against
  what the screens actually do at launch. Help was written feature by feature, so expect stale steps and drift.
  After the last feature (Commons home v2) so it's reviewed once, against the final app.
- Per-community split of App Health's platform numbers (needed before a second community admin exists).
- **Display names, before any real resident joins** (Zee 2026-11-17: not now, while testing). One small migration
  (`/db-rehearse`) + Households screen:
  - **Clean names on the server:** `jc_display_name_set` cleans like other text (`jc_clean_line(left(p_name, 200))`
    + strip bidi overrides; BAD_NAME if nothing is left). Security review M1, `docs/qa/signup-display-name-review-2026-11-17.md`.
  - **Block reserved names:** the same reserved list Section Names uses (Admin, Organizer, Commons, Settings, …, EN + AR).
  - **Community admins can clear a name** (clear only, never edit, so an admin can't put words in a resident's
    mouth): a button beside Remove on Households, written to the admin log; the resident sees their name is blank
    again. Today only the resident can change their own name; an admin's only lever is removing the member.
  - Show the masked email beside the name in organizer rows (lookalike names: "Zee G.").
- Teardown of `e2e` test data when Zee says testing is done.
- **Commons into its own private repo** (Zee 2026-11-14), done with the commons.ae move (a custom domain means its own
  repo anyway); Cloudflare Pages deploys from private repos. Why: this repo is public, and `docs/qa/` reviews plus the
  manifest's "Known gaps" list accepted / deferred weaknesses; the plans show product direction. A history scan
  (2026-11-14, 345 commits) found no secrets: publishable keys only, and none of the 84 test codes matches a live code.
  Making it private later doesn't erase what was public, so nothing secret goes in meanwhile. `zgauba.github.io`
  stays public (personal pages, Halloween site).
- **Structural audit of the grant model** (synthesis S4, KG 14) — `/structural-audit` over `supabase/commons/`
  after the last migration (R6), then one hardening migration via `/db-rehearse`.
- **Free-tier decision** (synthesis S5, KG 8) — pricing checked 2026-11-06: egress is fine on Free (5 GB vs
  ≈ 0.5 GB per event night); the reasons to upgrade are **no automatic backups on Free**, Pro-only leaked-password
  protection, and the 1-week auto-pause. Plan: **Pro at R8** ($25/month, spend cap on) — retire or move SignalPost
  out of the org first, or it adds $10/month. Same sitting: choose the tile provider, set the Resend key, plan for
  the canary's 60-day auto-disable.

### R8 — Launch gate (last)
From `docs/qa/SYNTHESIS-2026-11-03.md` T6, plus items found since:
- Privacy policy + the promise rewritten everywhere it appears (never silent).
- Native Arabic review (strings; **Haq al Laila wording + design by an Emirati speaker**).
- Fresh Jubail codes (join, community admin) — never the Halloween code; rotate at invite time.
- Password-reset email tested end to end.
- **Email (decision 2026-11-17, see "Email" above):**
  - Verify **commons.ae in Resend** (SPF + DKIM records at the registrar). Replace the test sender
    `onboarding@resend.dev`, which only delivers to the account owner.
  - **Supabase Auth → custom SMTP pointed at Resend** (the built-in sender is test-only).
  - **Raise Supabase Auth's email rate limit** above the invite-burst peak (custom SMTP defaults to roughly
    30 / hour — confirm in the dashboard and write the chosen number here).
  - **Reconcile with "email confirmation OFF"** (below): if it stays off, joining sends no email and launch-day
    volume is mostly password resets. State which.
  - **Privacy policy:** residents' email addresses are processed by Resend (and Supabase), so the "first-party only,
    no third parties" wording is amended per the PII-only-when-necessary rule: per purpose, minimal, never silent.
    Account email only; every other email kind is opt-in (address confirmed at opt-in). Name each processor and where
    it is (cross-border: check the UAE data protection law). No "last seen" (rule 4 dropped for v1).
- Free-tier auto-pause resolved.
- **Map tile provider** chosen for event-night load (OSM's volunteer tiles have no SLA; Esri imagery date
  over Jubail unverified).
- **Upgrade JubailCommons to Supabase Pro** (backups; KG 8) before any resident data, spend cap on.
- Supabase dashboard: **email confirmation OFF** (drift: still on), **leaked-password protection ON** (Pro-only —
  after the upgrade),
  Auth rate limits raised for the invite burst, Site URL + redirect allowlist for commons.ae.
- **Manual verification run** (synthesis S6, KG 11 + KG 15) — two-tab concurrency (rate-limit lock, event-admin
  link cap + accept vs close, capacity at the last place — **this one before the first capacity event**),
  Storage smoke test with a real sign-in, real-iPhone pass (editor dates, Save as an app), `curl -sI` framing
  headers on commons.ae, every Arabic string still marked DRAFT reviewed. Each line ticked with date + who.
- Jubail modules switched on one at a time; invites go out.

## After launch

- **The Neighbourhood Edit — FAST FOLLOWER, first after launch** (Zee 2026-11-10: "launch without it, fast
  follower"). Module key `directory`, tab "Services" / «الخدمات», brand "The Neighbourhood Edit". Curated local
  vendors: categories + subcategories, Call / WhatsApp / Website / Instagram / Flyer buttons, the curator's
  phone editor (scoped `directory` admin), resident submissions → moderation queue, household "used by N ≥ 3"
  signal, no negative path, one-tap hide. Brief: `docs/plans/neighbourhood-edit-brief.md`.
  - **Vendor consent to be listed** (many vendors are individuals with personal numbers) — required before any
    listing goes live; **how** is designed at its `/plan-change` (Zee: details later).
  - **Start now, in parallel:** ask the curator whether her Wix content is a CMS collection (CSV export → import)
    or hand-built pages (manual transcription) — that sets the size of the import.
  - Depends on RM (renamable modules).
- **Find a Game — "looking for players" (Bookings)** (Zee 2026-11-04, feedback item 9; re-raised 2026-11-16 — it had
  dropped out of the plan). A resident posts "Tennis, Thu evenings, need 1, intermediate"; others tap "I'm in". Lives
  **inside Bookings** as a "Find a game" tab (sport = the court `kind`; a match ends in a booking; reuses the Bookings flag
  and admins), not in Events (organizer-run, community-wide) and not a new bar module. Zee's 2026-11-04 shape: sport,
  usual availability, contact — **PII opt-in, posts auto-expire, number tap-to-reveal**. Contact model decided at its
  `/plan-change`: home label only → opt-in WhatsApp number (stray-report pattern); **no in-app chat** (moderation +
  data). Needs real court traffic first, so after launch; depends on B-1.
- **Suggested walking route** (nearest-neighbor + 2-opt loop over stocked homes; `route` flag off) and
  **kilometers walked** (on-device only, "at least X km", nothing sent).
- **Second community / B2B** — trigger: a second community asks. Needs the platform console + per-community
  numbers (R7), and the sign-up community picker as a dropdown / search instead of a long list (Zee 2026-11-04, item 1).
- **Print maps** — parked on community privacy consensus; never re-enable without Zee.

## Event calendar

**Haq al Laila ≈ Sat 23 Jan 2027** (15 Sha'ban 1448, ±1 day on moon sighting) — **Zee 2026-11-06: dev work
will be done well before then**, so it runs on the launched Commons. Working back: the Emirati native review
of its wording + design (R8) and the event itself need to be ready by early January.

## Decisions (2026-11-06)

- Launch only when the full app is built; launch gate last.
- Recovery PIN: **dropped** (accounts use email + password + reset email).
- Organizers / event admins **can mark a home out** on event night (R2).
- Recommendations directory: **not before launch**.
- Walking route + km walked: **after launch**.
- Courts: tennis + basketball, no padel; households book; no outside coaches; community admins add courts
  + locations.
- Navigation: users choose bottom-bar buttons + start page (R3).
- Holiday lights = an event template (R2), not a separate feature.
- Recommendations directory (after launch): Google Sheet + an "Update Commons" Apps Script menu that pushes
  to Commons.
- Haq al Laila runs on the launched Commons — dev done well before 23 Jan 2027.
- Pet sightings (stored vs WhatsApp-only): discuss at the start of R5.
- Events audit (all four answered yes): treat-night templates turn on supply + crowd reports; events stop
  sign-ups at their end time and auto-close 24 h later; hidden households are told; the hidden flag resets
  when a new family moves in. Every audit finding is fixed in R2a.
- Order: R0 → R1 → R2 as listed; R2 is planned (`/plan-change`) while R1 is built, and built after R1 merges.
- **Verification is tiered** (2026-11-06): cosmetic → suite once + CI + screenshots, a short review note, no
  reviewer agent; screen logic → + `code-reviewer`; data / auth / PII → rehearse, suite twice, database +
  security + code review (`/ship-pr` step 1b).
- **No two build agents on overlapping files** (2026-11-06) — `admin.js`, `strings.js`, `events.js` are shared
  by almost every phase, so builds run one at a time; planning, reviews and audits may run alongside.

## Decisions (2026-11-10)

- **Renamable modules (RM) next, then R5b** — fixed keys, per-community display names (EN + AR), optional brand.
- **The Neighbourhood Edit: launch without it, fast follower** (first after launch); in-app phone editor +
  moderation queue (supersedes the 2026-11-06 Google Sheet sync decision).
- **Vendor consent** to be listed is a requirement of the Edit; its mechanics are planned later.
- Pets: sightings stored only for missing pets / strays (reporter erased within 48 h, rows gone after 30 days);
  map secondary; My Pets inside Pets **and** in My Home; WhatsApp button = copy message + open the group.

## Decisions (2026-11-17)

- **Split Pets:** residents' Pets stays; strays and volunteer feeding / TNVR work move to a new module named
  **Community Cats** (key `cats`). Supersedes the 2026-11-10 30-day sighting purge **for programme cats**.
- **Areas are coordinator-created** in the programme, not fixed config.
- **PII is allowed in the programme where it needs it** (volunteer contacts, chip numbers, clinic IDs and documents,
  private locations), restricted to coordinators and disclosed where collected.
- **Desktop layout** is a shared change for every module; **photo viewer** is one shared component.
- **Community Cats: no money in the app** (appeals and contributions stay in WhatsApp; people pay the vet directly).
  Invoices live in the programme's Google Drive; Commons links to them from the vet log, which moves into Phase 1.
  Purpose: visibility for residents, working records for volunteers. Jubail management to see it before it's on.
- **Organizer guide** (what organizers can do, what to do in specific scenarios): written once development is
  finished, before launch (R7).
- **Email:** stay on Resend Free; email is the last resort (in-app first, one digest per person per day at most,
  opt-in per kind, community-wide never by email, under 80 / day). Brevo, Resend Pro / SES and the WhatsApp Business
  API rejected for now. Invites stay links; addresses confirmed at digest opt-in; no "last seen"; daily only at
  first. Full rules: "Email" above; launch setup in R8.
- **Display names:** clean + reserved-name block + admin "clear name" before any real resident joins (R7), not during
  testing.

## Superseded ideas (from the Oct–Nov planning conversations)

| Earlier idea | What we do instead |
|---|---|
| Serve Commons from Vercel | Cloudflare Pages serves commons.ae from `commons/` |
| Crowd reports auto-flip a home at 3 | Never auto-flip: 3+ → "?" on the map; the household confirms or clears (30-min lock) |
| One giant switch; pin fill drains with supply | Two-sided switch (all values visible) + four supply levels; supply is a 4-bar gauge in the popup / list, not on the pin |
| An "Organizer" tab inside the event | Event **Admin** button → Organizer Tools (Sign-ups tab) |
| Courts: padel first | Tennis + basketball only |
| Haq al Laila lantern / bag icon, teal bag | 🌙 mark; nut-free = 🧡 tinted teal |
| Per-cat vet bills + "I want to help!" + payment screenshots in Community Cats (volunteer, 2026-11-17) | No giving in the app at this stage; appeals stay in WhatsApp, people pay the vet directly; legal advice + management approval first if ever explored |
| Pets behind a viewing passcode | Members only (accounts) |
| Recovery PIN | Dropped |
| Organizer copies a home's control link | Obsolete — accounts replaced edit links |
| Halloween baseline "125 homes" | 124 (127 entries, 3 removed) — `docs/halloween-2026-final.md` |
| Recommendations via Google Sheet + "Update Commons" script (2026-11-06) | The Neighbourhood Edit: in-app phone editor + moderation queue (2026-11-10) |

## Recommendations: where the data lives (options for the post-launch directory)

> **Superseded 2026-11-10** by the in-app editor (option C) — see `docs/plans/neighbourhood-edit-brief.md`.
> Kept for the record.

Zee's question: could the database be a Google Sheet she edits?

| Option | For | Against |
|---|---|---|
| **A. Google Sheet → Commons sync** (she edits a Sheet; a scheduled job copies it, validated, into a `jc_` table; the app reads only Commons) | She already knows spreadsheets; Google's sharing + version history; the app stays members-only and escapes / validates everything | Needs a sync job (pg_cron + pg_net, like the feedback email) and a published-CSV or service-account read; a bad edit shows up after the next sync; "who can edit" lives in Google, outside Commons' admin log |
| B. App reads the Sheet directly (published to web) | Simplest | **The list becomes public to anyone with the link** (not members-only); no validation; Google outages / rate limits hit residents directly — not recommended |
| C. In-app editor + a "directory editor" grant (like per-event admins) | Members-only, validated, logged, one system | Most work; she learns a new tool |
| D. Wix stays the source, Commons mirrors it | No change for her | Needs her content in a Wix CMS collection + API access on her plan (unverified); the access problems residents have today stay |

**Recommendation:** start with **A** (her comfort, Commons controls what residents see), keep the table
shape compatible with **C** so it can become an in-app editor later.

**Zee 2026-11-06 — the trigger is hers:** a Google Apps Script on the Sheet adds an **"Update Commons"**
menu; choosing it sends the rows to Commons. Shape (to plan when this phase starts):
- A dedicated endpoint (an Edge Function or a narrow RPC) that does exactly one thing: **replace the
  directory's rows** in one transaction — validated (lengths, https-only links, no HTML), never touching
  anything else.
- Authenticated by a **scoped, rotatable token** kept in the script's Script Properties (not in a cell);
  rotating it is a Community-tab action. Rate-limited; every update logged (when, how many rows) and the
  previous version kept so a bad update can be undone.
- The menu shows the result ("Updated: 42 listings" / what was rejected and why), so she never wonders.
- Members-only on the Commons side; the Sheet's own sharing stays hers. Zero-PII: no "which resident
recommended this" column unless deliberately opted in; vendor business contacts are fine.
