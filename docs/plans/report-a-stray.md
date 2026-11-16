# Report a new stray — plan (2026-11-16)

Residents tell the Pets organizers about a stray that isn't listed yet. Organizers review every report before
anything becomes public.

## Decisions (Zee, 2026-11-16)

- **PII posture: data minimization, not zero-PII.** PII only where a feature needs it, opt-in where possible,
  disclosed, deleted when no longer needed.
- **Q1 = B, reporter kept:** organizers need to reach reporters at times. Pets organizers see the reporter's
  **home** (village + number). Never shown to other residents.
- **Reach = opt-in WhatsApp number per report.** "Organizers can WhatsApp me" + a number. Only Pets organizers
  see it, as a wa.me link. It is **cleared when the report is closed**, or when the reporter's account is deleted.
  It is never written to the admin log.
- **Q2 = optional photo** on the report.
- **Q3 = location required:** a map pin, or a written place when the map can't load.

## How it works

1. Strays tab → **Report a new stray**: species, short description, where (pin / place), optional photo, optional
   "Organizers can WhatsApp me" + number. A privacy line says exactly who sees what and for how long.
2. The report goes into an organizer queue. It is **never** in `jc_pets_list` / `jc_pet_get`, so it is never public.
3. Organizer Tools → Pets → **Reported** chip, with a count badge: report card (time, species, note, pin, photo,
   reporter's home, WhatsApp link if given). Outcomes:
   - **Add as a stray**: the stray editor opens filled in; the report photo becomes the stray's photo if it has none
   - **Already known**: link the report to an existing stray
   - **Not a stray**: close it
4. Reporter: **My reports** (any device) shows the status: open / added as <name> (link) / already known as <name> /
   not a stray. After sending: "Tell the pets group" (existing WhatsApp share) to nudge organizers.

## Retention

| Data | Kept until |
|---|---|
| WhatsApp number | report closed, or reporter account deleted (nightly job) |
| Reporter (account → home shown live) | report row deleted |
| Report row + photo | 30 days after close; open reports auto-close as `expired` after 60 days |

## Inventory

| Layer | Touched | Check |
|---|---|---|
| Database / API | New `jc_stray_reports` (row security on, no grants). RPCs `jc_stray_report_add` (idempotent on a phone-made id), `jc_stray_reports_mine`, `jc_admin_stray_reports_list`, `jc_admin_stray_report_close`. Caps counted on the table (reporters are kept, so counts are exact; no `jc_rate` bucket) | R5a / S4 / pets_care_v2 migrations |
| Storage | **Yes:** `jc_pet_photos` gains `report_id` (exactly one of pet / report). Bodies of `jc_private.pet_photo_can_write/_read` replaced (signatures unchanged). Write = reporter's own pending path within 15 min; read = reporter or Pets admin. New `jc_stray_report_photo_begin/commit`. Photo moves to the pet on "Add" | s4:242–284, s4:449–500 |
| Scheduled jobs | `jc_pets_retention()` body: clear numbers, expire / delete reports, retire report photos for the T4 sweep. Same cron + log key | manifest line 130 |
| Frontend | `pets.js` (form, My reports), `admin.js` (Reported chip + queue), `strings.js` (EN + AR) | pets.js 472–660, admin `PA_SHOWS` |
| Auth | Not touched: `jc_me()` / `jc_assert_admin('pets')` | same as `jc_pet_sighting_add` / `jc_admin_stray_save` |
| Edge functions / hosting / CSP / CI | Not touched: the photo purge Edge Function already deletes by path; admin CSP already allows pet-photos | manifest Storage / Hosting |

## Prior art

| Building block | Existing | Decision |
|---|---|---|
| Form (note + pin + privacy line) | sighting form `pets.js:472`, `jcPinPicker` | REUSE; EXTRACT the pin block if a third copy appears |
| Photo pick + shrink, EXIF stripped on the phone | `assets/pet-photo.js:59` | REUSE |
| Photo begin → upload → commit, T4 purge | `jc_pet_photo_begin/commit`, `jc_photo_purge_queue` | REUSE the pattern (report-keyed twins) |
| WhatsApp nudge | `drawShare` `pets.js:552` | REUSE |
| Queue filter | `PA_SHOWS` chips / `jcChipsHtml` | REUSE: + Reported |
| Add as a stray | stray editor + `jc_admin_stray_save` | REUSE (signature unchanged) |
| Close with reason | archive-with-reason (R5d-3b) | REUSE the pattern |
| Rate limits | sighting-style counts on the table + advisory locks (per reporter, then per community) | REUSE |
| Double tap (mirror extension) | busy lock only | NEW: phone-made id makes the insert idempotent |
| Phone number field | none (Commons stores no phones) | NEW: checked `^\+?[0-9]{8,15}$` after removing spaces; the phone may remember it locally to fill it in next time |

## Split (> 2 layers + migration)

1. **PR 1a, DB reports**: table, RPCs, retention, rate bucket (tier 3: rehearse, suite twice, db + security + code review)
2. **PR 1b, DB report photos**: `jc_pet_photos.report_id`, storage-rule bodies, begin / commit, photo carried over on Add (tier 3)
3. **PR 2, Organizer queue**: Reported chip + badge, card, outcomes (tier 2)
4. **PR 3, Resident form + My reports + nudge** (tier 2)

The queue (PR 2) ships before the form (PR 3), so a report never lands where nobody can see it.

## Premortem

| # | Risk | Mitigation |
|---|---|---|
| 1 | "Add" = save stray, then close report; close fails → a stray exists and the report is still open | Close is safe to retry; queue warns "may already be added" when a stray was saved in the same session; SQL test |
| 2 | **Reports pile up unread (no notification channel)** | Count badge on Organizer → Pets; "Tell the pets group" after sending; open-report count in App Health |
| 2b | Pets OFF must stop reports | `jc_module_on` in every RPC + the storage rules; test with the module off |
| 3 | No paid layer | Caps: 5 / day per reporter, 50 / day per community; uploads share the existing 20 / day per user |
| 5 | Double tap creates two reports | Idempotent id; e2e: one row per double tap |
| 6 | **New storage write path for residents + a phone number** | RPC-only access; number returned only by `jc_admin_stray_reports_list` (Pets / community admins); report photos readable only by reporter + Pets admins until adopted; security review on 1a and 1b |
| 6 | Photo shows a person or a house number | Never public until an organizer adopts it into a stray; organizer can add without the photo |
| 7 | Rollback (pre-launch) | Drop the new functions + table; restore the storage-rule and retention bodies; drop `report_id` (after deleting report photo rows); restore the bucket check |
| UX | "Behaves differently from sightings" | Same form shape; the privacy line explains why this one names your home (organizers may need to reach you) |
| Data | Report-photo rows block report deletion (FK) | **PR 1b must replace `jc_pets_retention`**: retire report photos first, delete a report only when it has no photo rows left (else the FK aborts the whole nightly job, sightings purge included — db review M2). Photo FK NO ACTION, never CASCADE (orphans storage objects). Close-with-photo-move under the row lock; the idempotent retry must not move again |
| UX | Expired reports can't be actioned (ALREADY_CLOSED) | PR 2 hides the outcome buttons on closed / expired reports (db review L7) |
