# Soft archive + nightly moderation alert — plan (2026-11-16)

> Source: R5d moderation rate-limit review follow-ups 1 + 2 (`docs/qa/r5d-moderation-rate-limit-review-2026-11-14.md`),
> plus the deferred G20 item (`docs/qa/stray-reports-list-volatile-review-2026-11-16.md` D2).
> Zee's decisions 2026-11-16: **30-day restore window**, then archived for good. **In-app alert** (no email).
> Target: JubailCommons (`qrpxfssdeeuzmsmlbtbu`). Plan only. Nothing built.

## Step 0 — Scope

**Cross-layer, so the full protocol applies.** The change touches the schema (new columns, a widened CHECK), new RPCs, the
bodies of 6 live functions, the nightly retention job, a storage-adjacent photo lifecycle, and two screens.
Manifest LAST VERIFIED: 2026-11-16 (today). The `[live]` layers it touches were re-queried today (below).

## Step 1 — Inventory (verified live 2026-11-16 unless marked [repo])

| Layer | Touched? | What / the check that ran |
|---|---|---|
| `jc_pets` | **Yes** | `status` is `active`/`archived` only. CHECK `jc_pets_check4` forces `photo_path`, `pending_photo_path`, `last_seen_note` to null and `missing` to false once the pet is not active. There is no archived-at column. **0 archived rows live** (`count(*)`), so no backfill. |
| `jc_pet_retire(p_pet)` | **Yes** | Internal (not client-callable). It retires **every** photo ledger row **at once** and then nulls the photo. It has 3 callers (`pg_proc.prosrc ~ 'jc_pet_retire\('`): `jc_admin_pet_archive` (organizer), `jc_pet_archive` (household), `jc_home_vacated` (family left or removed). |
| Photo ledger + purge | **Yes** | `jc_pet_photos.state` is `current` / `retired`. The nightly `jc-photo-purge` (03:35) deletes the objects of `retired` rows. `jc_pets_retention` (03:50) **also** retires `current` photos of archived pets, to close the db 1b M1 race. **So today an archive deletes the photo for good that same night.** That is why soft archive needs DB work, not only a button. |
| Storage read rule | Read only | `jc_private.pet_photo_can_read` serves a pet photo only while `p.status = 'active'` and `photo_path` matches. An archived pet's photo is unreadable. This must stay true during the window. |
| `jc_pet_sightings.hidden` | **Yes** | `jc_admin_sighting_hide` sets it, and there is no un-hide. Sightings are deleted at 30 days and the reporter is cleared at 24 h (retention). `jc_pet_get` / `jc_admin_pets_list` / `jc_pets_alerts` / `jc_pet_card` all filter `not hidden`. **0 hidden live.** |
| `jc_admin_notices` | **Yes** | The in-app notices on App Health. kind CHECK = `departure, over_cap, pin_flag, event_ended, autoclose_failed`. Unique `(home_id, kind)` among open notices, but `home_id` is null for a community-wide notice, and Postgres treats nulls as distinct, **so it won't dedupe**. Read and resolve are **community-admin only** (`jc_assert_admin('community')`). Writer: `jc_notice()`. |
| `jc_admin_log` | Read + new actions | Actions `pet_archive`, `sighting_hide` already exist (the hourly caps count them). New: `pet_restore`, `sighting_unhide`. |
| Cron | Body only | `jc-pets-purge` 03:50 → `jc_pets_retention()`. No new job (avoids config drift, #2b). |
| Rate limits (T3) | Maybe | Restore and unhide are not destructive. **No cap proposed**, but they are logged and counted in the alert. |
| `00_grants` G20 | **Yes** | Made transitive (deferred D2). |
| Organizer Tools → Pets | **Yes** [repo] | `admin.js:2098` Archived chip shows "names only, no restore" (Zee Q3, 2026-11-14). `pmArchive` / `pmHide` (`admin.js:2470-2510`). Copy `pm_arch_help_*`: "It can't be undone." (`strings.js:536-537`). |
| Pets (household) | **Yes** [repo] | `pets.js:815-872` archive confirm `pt_archive_q` / `pt_archive_help`. |
| App Health notices | **Yes** [repo] | `NOTICE_KINDS` (`admin.js:286`) + `adm_h_n_<kind>` strings. |
| Events / Courts / Community | Not touched | `prosrc ~ 'archived'` hits in events functions are **event** status, not pets (checked by name: `event_close_core`, `jc_events_list` …). |
| Edge Functions | Not touched | `jc-photo-purge` only reads `retired` rows. The plan keeps the photo `current` during the window, so it is untouched. |
| SignalPost | Not touched | Different project. |

## Step 1b — Prior art

| Building block | Existing version | Decision |
|---|---|---|
| Restore action + confirm | Organizer acts with a confirm naming the subject (R1.1 pin Undo, R2b-1) | **REUSE** the pattern: a button on the Archived row, and a confirm that names the animal |
| Archived list | `paShow === "archived"` names list (`admin.js:2099`) | **REUSE**: add "Restore · n days left" to rows in the window, plain names after |
| Hidden-sightings list | none. Hidden sightings just disappear (`grep -n hidden admin.js` → only the hide path) | **NEW**: a "Hidden sightings (n)" fold on the pet's Manage page, same `sulist` rows as New sightings, with Unhide |
| Moderation alert | `jc_admin_notices` + App Health "Notices" (`jc_notice`, `NOTICE_KINDS`) | **REUSE**: new kind `moderation_spike` |
| Error codes | `NOT_FOUND`, `NOT_ADMIN`, `pm_err_*` | **REUSE**, plus one new code `RESTORE_EXPIRED` (past the window, or the family left) |
| Days-left text | `jcDaysSince` (`api.js`, care v2) | **REUSE** |
| Retention step | `jc_pets_retention` | **REUSE** (extend it, no new cron) |

## Step 2 — Impact map

| Change | Who else uses it | Could break | Assumption → how verified |
|---|---|---|---|
| **A. Archive keeps the photo for 30 days.** `jc_pet_retire(p_pet, p_how)` sets `archived_at`, `archived_how` (`organizer` / `household` / `vacated`) and moves `photo_path` → new `archived_photo_path`. The ledger row stays `current`. **Vacated still retires at once** (the family left, so nothing is kept for them). | 3 callers, retention, storage rule, purge | (1) the photo becomes readable while archived; (2) the purge deletes it early; (3) the retention race line retires it the same night | (1) The rule checks `status='active'` and `photo_path`; the archived path lives in another column, so it stays unreadable (test). (2) The purge reads `retired` only. (3) **Retention line changes** to `archived_at < now() - 30 days` (test both sides of 30 days). |
| **B. Restore** `jc_admin_pet_restore(p_pet)`: pets admin, within 30 days, not `vacated`. **Owned pets: refused if the home's members changed since the archive, or the home is empty.** The photo comes back only if its ledger row is still `current`. Missing is not revived. | `jc_admin_pets_list`, residents' lists | An old family's pet showing up in a new family's My Pets | Vacate sets `archived_how='vacated'` on that home's already-archived pets too (A), so they become unrestorable. The membership check is belt and braces. Test: archive → family leaves → new family joins → restore = `RESTORE_EXPIRED`. |
| **C. Window end** (retention): pets archived over 30 days ago → retire the ledger row, null `archived_photo_path`. They stay archived (names only), as today. | purge | Nothing new; it's the same purge, 30 days later | Test |
| **D. Unhide** `jc_admin_sighting_unhide(p_sighting)` + `jc_admin_pet_hidden_sightings(p_pet)` (read). Works while the sighting still exists (they are deleted at 30 days anyway). | `jc_pet_get` etc. filter `not hidden` | none (the flag flips back) | Test: hidden → unhide → it appears in `jc_pet_get` again |
| **E. Nightly alert** inside `jc_pets_retention`: per community, if in the last 24 h **organizer** `pet_archive` ≥ **10** or `sighting_hide` ≥ **20** (Q2), add **one** `moderation_spike` notice with counts. Skip if one is already open (an explicit `not exists`, since the unique index won't dedupe a null home). | App Health notices (community admins) | (1) A notice kind the app doesn't know shows as `adm_h_n_other`. (2) An error in the alert kills the purge. | (1) PR 2 adds the kind, and old clients fall back already. (2) The alert step runs **last**, inside its own `begin … exception when others → maintenance_log` block, so the purge's work is never rolled back by it. Test: forced failure leaves the purge counts intact. |
| **F. Copy** | Archive confirms (organizer + household) | Residents told "can't be undone" | `pm_arch_help_*` / `pt_archive_*` → "an organizer can restore … for 30 days". EN + AR. |
| **G. G20 transitive** | `00_grants` | False positives on read-only volatile helpers (e.g. `jc_me`) | Flag a STABLE/IMMUTABLE `jc_` function that calls any `jc_` function that **itself matches the writer pattern** (one hop, by name). Run it live first. If something new trips, triage before shipping. |

## Step 3 — Regression surface (must still work)

1. Organizer archives a stray with a reason → gone for residents at once (list, map, alerts, pet page), the log says why, and the hourly caps (20 per account, 60 per community) still apply.
2. A household archives its own pet → gone from My Pets and from Pets, and any missing alert ends.
3. A household leaves, or a community admin removes the last member → that home's pets are gone, **and their photos are deleted that night** (unchanged).
4. An archived pet's photo URL is unreadable to everyone, including organizers.
5. A stray report closed as "Add" / "Already known" moves its photo to the stray (db 1b race path still sound).
6. The nightly purge still deletes retired photos. Sightings older than 30 days are still deleted, and reporters are still cleared at 24 h.
7. App Health notices list and resolve work for every existing kind.
8. Hiding a sighting removes it from the pet page, the map and the alerts.

## Step 4 — Proposal (split into 2 PRs)

**PR 1 (DB, tier 3).** One migration:
- `jc_pets` + `archived_at timestamptz`, `archived_how text CHECK in (organizer, household, vacated)`, `archived_photo_path text`. A CHECK ties the columns to status.
- The bodies of `jc_pet_retire` (new 2-arg internal; the old 1-arg one is dropped, since it's internal and has 3 callers updated in the same migration), `jc_admin_pet_archive`, `jc_pet_archive`, `jc_home_vacated`, and `jc_pets_retention` (window end + alert).
- New RPCs: `jc_admin_pet_restore`, `jc_admin_sighting_unhide`, `jc_admin_pet_hidden_sightings`. All VOLATILE (G20 lesson).
- `jc_admin_notices` kind CHECK + `moderation_spike`. `jc_admin_pets_list` adds `archived_at` / `restorable_until` to archived rows.
- G20 transitive. New slice `s31_soft_archive`.
- ~250 SQL + ~200 test lines. Over the 200 budget because tests are most of it.

**PR 2 (app, tier 2).** Restore button + days left on Archived rows; Hidden sightings fold + Unhide on Manage; the
`moderation_spike` notice text; archive confirm copy (organizer + household); log action strings. EN + AR. E2E for
restore / unhide / expired / notice. ~150 lines.

**Cost:** $0. No paid layer. The photos kept 30 days longer are negligible storage on the Free tier.
**Migration:** additive columns, no backfill (0 archived rows). No cache or Edge Function redeploy needed (the purge
function's query is unchanged).

## Step 5 — Premortem

| # | Mode | Exposure | Mitigation |
|---|---|---|---|
| 1 | Data loss / corruption | The window-end or vacate path retires the wrong photo, or never retires it | Tests on both sides of 30 days; vacate retires at once; a ledger-vs-pets consistency check in the slice |
| 2 | Privacy / auth | **An archived pet's photo becomes readable**, or a **restore lands an old family's pet on a new family** | Storage rule unchanged (status-gated, separate column), with a test that reads it as a member and as an admin. Vacated = never restorable, plus a membership-change check. Restore is pets-admin only. |
| 2b | Config drift | A new cron job / notice kind not mirrored | No new cron. The notice kind is in the migration and the app in the same plan. Old app → `adm_h_n_other`. |
| 3 | Partial failure | The alert errors and rolls back the purge | Alert runs last in its own exception block, logged to `jc_maintenance_log` |
| 4 | Abuse | Restore used to flip-flop moderation | Every restore and unhide is logged with the actor. Restores count toward the alert (Q3). |
| 5 | UX surprise | Residents told "can't be undone" in old cached copy | Copy ships in PR 2. A stale page only under-promises. |
| 6 | Migration | Dropping the 1-arg `jc_pet_retire` while a caller still uses it | All 3 callers replaced in the same transaction. Dry run + G-checks prove it. |
| 7 | Rollback | Need to undo | Header down-script: restore the 6 bodies (captured), drop 3 RPCs + 3 columns + the CHECK value (after deleting any `moderation_spike` rows). |
| UX | "Behaves differently from…" | Restore exists for pets but not for other organizer acts (event withdraw has no Undo, R2b-1 Q2) | Accepted. Pets archive deletes photos and is the one the review flagged. |

## Questions for Zee

1. **Who can restore?** Recommend **Pets organizers only**, for both strays and household pets. A household that archived by mistake asks an organizer. A self-restore button on My Pets is a small follow-up if it's ever wanted.
2. **Alert thresholds.** Recommend **≥ 10 organizer archives or ≥ 20 hides in 24 h** in one community. Today's hourly caps are 20 per account and 60 per community, so this catches a slow drip the caps don't.
3. **Should restores count toward the alert?** Recommend **yes**, at the same threshold. Rapid archive/restore flipping is the same abuse.
4. **Who sees the alert?** Recommend **community admins only** (the existing Notices). It's oversight of Pets organizers, so they shouldn't be the only ones who see it.
