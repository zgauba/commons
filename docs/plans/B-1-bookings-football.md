# B-1 — Courts → Bookings, plus a Football kind — plan (2026-11-16)

> Source: `docs/plans/OT-organizer-tools-ia.md` D3 (Zee 2026-11-14: Courts → Bookings now, plus a new kind), ROADMAP R4 + "Bookings (long term)". Zee 2026-11-16: **keep the existing Bookings icon**; the new kind is **Football — never "football"**, in copy, code and the DB value (`football`).
> Target: JubailCommons (`qrpxfssdeeuzmsmlbtbu`). Plan only. Nothing built.

## Step 0 — Scope

**Cross-layer** (a schema CHECK on the live DB + app copy in EN/AR + tests), so the full protocol applies.
Manifest LAST VERIFIED 2026-11-16 (today). The `[live]` layer touched was re-queried today (below).

## Step 1 — Inventory (live checks 2026-11-16 unless marked [repo])

| Layer | Touched? | What / the check that ran |
|---|---|---|
| `jc_facilities.kind` | **Yes** | `jc_facilities_kind_check` = `kind in ('tennis','basketball')` (`pg_constraint`). Live rows: **2 tennis, 1 basketball**. |
| DB functions | **Not touched** | `pg_proc.prosrc ~* 'tennis\|basketball'` in `public` + `jc_private` → **0 functions**. The save (`jc_admin_facility_save`, NF-1) only checks kind is non-empty; the CHECK is the only list. |
| Module switch + rules | Not touched | `jc_communities.modules->'bookings'`: jubail `enabled: false`, e2e `enabled: true`. Caps (`per_home_per_day`, `per_home_active`) are per home, any kind. |
| Section Names (RM) | Read only | `module_labels`: jubail renames **pets only**; e2e `{}`. So the default label (`module_bookings`) is what shows → changing it renames the module everywhere `jcModName("bookings")` is used (bar, hub card, admin tab, help sheet title — `nav.js:296`, `admin.js:1511`). A community that renamed it keeps its name. |
| Residents' Bookings page [repo] | **Yes** | `bookings.js:33` `kindText()` maps **anything not basketball → "Tennis"**. A football pitch would read "Tennis" — must change **before** any football row can exist. |
| Organizer Tools → Courts [repo] | **Yes** | Kind radios hardcoded `["tennis","basketball"]` (`admin.js:1305`), edit pre-select (`admin.js:1338`), list meta has its own copy of the kind→label rule (`admin.js:2752`). Tab key `courts` / `?tab=courts` (`admin.js:106, 2728`). |
| Copy [repo] | **Yes** | `strings.js`: **~60 EN** strings say court/courts (module name, CTA "Book a Court", help sheet, admin scope + tab, editor, errors, log lines), same in AR. |
| URLs / keys [repo] | Not touched (decision) | `/commons/bookings/` folder is already "bookings". Internal keys `courts` (admin tab, help key, `ct_*`/`cd_*` string keys) stay — renaming them breaks saved links and churns tests for no visible gain. |
| Icon [repo] | Not touched | `icons.js:17` `bookings` = a court seen from above (outline + centre line); a pitch has the same shape. Zee: keep. |
| Edge Functions / cron / storage | Not touched | None reads `jc_facilities` (`grep -rn jc_facilities supabase/commons/functions` → none; cron jobs: retention/purge/snapshot only). |
| Halloween site / SignalPost | Not touched | Different site / project. |
| Tests [repo] | **Yes** | SQL `s17_courts_r4` (kind CHECK), e2e `courts` (93 mentions), `admin-courts` (143), `admin-courtday` (36), `admin-admins`, `section-names`, `shell`. |

## Step 1b — Prior art

| Building block | Existing version | Decision |
|---|---|---|
| Module name | `jcModName("bookings")` ← `module_bookings` default + Section Names override (RM) | **REUSE** — change the default only |
| Icon | `JC_ICONS.bookings` | **REUSE** (Zee) |
| Kind → label | `bookings.js:33` and `admin.js:2752` (two copies, both "else tennis") | **EXTRACT** to one `jcKindText(kind)` in `api.js`, with an honest fallback for an unknown kind (no wrong sport) |
| Kind picker | radios from a literal list (`admin.js:1305`) | **REUSE**, list from one shared `JC_FAC_KINDS` |
| Kind chips (All · Tennis · …) | OT table proposed them | **Out of scope** — 3 places don't need filtering (OT D2: "Bookings search only once it grows") |

## Step 2 — Impact map

| Change | Who else uses it | Could break | Assumption → verified by |
|---|---|---|---|
| **A. CHECK gains `football`** | save RPC, every read of facilities | Nothing existing (widening) | No function lists kinds (`prosrc` grep = 0). Rows keep their kinds. SQL test: football saves; `padel` still refused. |
| **B. App knows football** (picker, label, shared helper) | residents' list/map/day grid, admin list/editor | An old cached page reading a football row labels it "Tennis" | Ship order: **app first, DB second** (below). Old pages also auto-update (update.js). |
| **C. Copy: Courts → Bookings** | bar, hub, CTA, admin tab + scope names, help, errors, log | A community that renamed the section; Arabic length in the bar | RM override wins (section-names spec). Check the AR bar label at phone width with `/shot`. |
| **D. The word for "a place"** (Q2) | ~45 strings | Mixed wording ("court" next to "pitch") | Decide once (Q2), then a grep shows no stray "court" outside kind names and the Tennis/Basketball court sense. |

## Step 3 — Regression surface

1. Residents: list (nearest first), map pins, a place's day grid, book, one-tap cancel, My bookings, past bookings.
2. "Official community-management bookings take precedence." still on the booking screen.
3. Caps: 1 a day / 2 active per home, advance window, walk-on places show "no booking needed".
4. Organizer: new / edit / publish / unpublish / retire, block slots, see who booked, cancel a booking, `?tab=courts` deep link and Back.
5. Bookings admins (scope `bookings`) see only their tab; the invite link names the scope correctly.
6. Section Names: a renamed Bookings section keeps its name everywhere; the help sheet title follows it.
7. Module off → the off notice; the module flag is still the kill switch.

## Step 4 — Proposal (split: 2 PRs, because >2 layers + a migration)

**PR 1 — app (tier 2, screen logic), ships FIRST.** Copy sweep Courts → Bookings (EN + AR); shared `JC_FAC_KINDS` +
`jcKindText` in `api.js` used by both screens (fixes the "else Tennis" fallback); Football in the picker **behind the
server** — the radio shows only when the save would be accepted. Simplest: PR 1 lists Football, and PR 2's DB change is
applied **before PR 1 merges** (one `/db-rehearse` inside this PR's window), so there's never a page offering a kind the
DB refuses. E2E: rename assertions, football label on list / day grid / admin, unknown-kind fallback. ~120 app lines +
~60×2 string edits + test edits.

**PR 2 — DB (tier 3), applied before PR 1 merges.** One migration: drop + re-add `jc_facilities_kind_check` with
`football`. Down-script: refuse if any football row exists, else restore the 2-kind CHECK. SQL test in `s17`.
~15 SQL + ~15 test lines. Rehearse → database + security review → apply on "apply".

(Merge order: PR 2 applied live → PR 1 merged. PR 2 itself can merge any time after apply.)

**Cost:** $0 — no paid layer. **Migration:** a constraint swap on a 3-row table, no backfill, no cache or Edge Function
redeploy. **Diff budget:** over 200 lines only because of the EN/AR copy sweep; logic is ~150.

## Step 5 — Premortem

| # | Mode | Exposure | Mitigation |
|---|---|---|---|
| 1 | Data loss / corruption | Swapping the CHECK on live rows | Widening only; the migration asserts every row's kind is in the new list before re-adding it. |
| 2 | Privacy / auth | None — no RLS, grant or RPC change | Grants checks (`00_grants`) still pass in the rehearsal. |
| 2b | Config drift | App and DB disagree on the kind list | DB applied before the app offers Football; one shared list in the app; SQL + e2e tests name the same three kinds. |
| 3 | Partial failure | Save with an unknown kind | Already refused by the CHECK → the existing error message. |
| 4 | Abuse | — | Unchanged caps; Football is just a label. |
| 5 | UX surprise | (a) "Bookings" is vaguer than "Courts" for residents. (b) A football pitch called a "court" in copy. (c) Arabic bar label length. | (a) CTA + help say what you can book. (b) Q2 picks one neutral word. (c) `/shot` AR at phone width. |
| 6 | Migration | Wrong order (app offers Football before the DB accepts it) | Merge order written above; PR 1's CI can't catch it (stubbed) — the apply step is a checklist gate before "merge". |
| 7 | Rollback | Need to undo | App: revert PR 1 (copy only + helper). DB: down-script (refuses if football rows exist — delete or retire them first). |
| UX | "Behaves differently from…" | Section Names: a community that renamed Courts keeps "Courts" | Accepted — that's what Section Names is for. |

## Questions for Zee

1. **One word for "a place you book"** (today "court", ~45 strings: "New Court", "This court has no slots", "No courts to
   book yet"). **Recommend "place"** ("New Place", "This place has no slots on this day", "No places to book yet"):
   plain, fits tennis, basketball and football, and still fits rooms / BBQ areas if Bookings grows. Alternatives:
   "court or pitch" (clunky ×45), "facility" (jargon).
2. **The CTA** "Book a Court" → **"Book a Place"**? Or name the sports: **"Book a Court or Pitch"** (recommend this one —
   residents know exactly what's on offer).
