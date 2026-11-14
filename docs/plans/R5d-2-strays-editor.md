# R5d-2 — Organizer Tools → Pets: strays editor (`/plan-change`, 2026-11-14)

> Status: **approved 2026-11-14** (Zee), including the 2-PR split. Parent plan: `R5d-pets-organizer.md` (row R5d-2).
> Built into the OT-3 structure (#120: chips, search, WhatsApp settings row).

## Step 0 — Scope and freshness

- **Tier: cross-layer, client only.** A new shared photo file (2 callers), the Organizer Tools CSP, the Pets tab.
  No database change.
- **Manifest:** LAST VERIFIED 2026-11-14. No `[live]` layer changes.

## Step 1 — Inventory

| Layer | Touched? | Evidence |
|---|---|---|
| `jc_admin_stray_save` | Used, not changed | R5a body: keys species, name, description, care_state, territory, territory_lat/lng; `p_pet = null` inserts (name + species required); spot = a pair (both numbers or both null); territory 1–120 or null; returns `jc_pet_card`; an owned pet → `NOT_FOUND` |
| Photo RPCs | Used, not changed | `jc_pet_photo_begin` / `_commit` / `_remove` via `jc_pet_manage`: a stray needs `jc_assert_admin('pets')` |
| Card shape | Used, not changed | `jc_pet_card` (R5b-2b-0) carries description, territory, territory_lat/lng: the editor fills from the list row |
| Care states | Used, not changed | R5a check: `known_fine`, `under_care`, `needs_help`, `rehomed`; server default for a new stray `under_care` |
| DB / cron / Storage policies / Edge | Not touched | No migration |
| Organizer Tools Pets tab | **Yes** | `admin.js` `petRow` (View only), `admPetsHtml`; no add / edit |
| Organizer Tools CSP | **Yes** | `admin/index.html` `img-src` lacks the signed `pet-photos` origin (`pets/index.html` has it); `_headers` sets only frame-ancestors |
| Photo code | **Yes (extract)** | `pets.js` photos block + `.ptph` CSS in `pets.css` |
| Tests | **Yes** | `admin-pets.spec.js`, `pets.spec.js` (R5c photo tests); `stub.js` signs Storage at the real origin, so a missing CSP entry fails |
| Paid layers | Not touched | Same small JPEGs |

## Step 1b — Prior art

| Building block | Existing version | Decision |
|---|---|---|
| "Add an animal" button | Courts `#ctNew` | REUSE |
| Edit on a row | `courtRow` acts row | REUSE (strays only; owned pets keep View) |
| Editor screen, only-changed fields, draft survives a language switch | `VIEWS.court` + `saveCourt` | REUSE the pattern |
| Species buttons | Residents' form `.opts` (`app.css`) | REUSE |
| Territory spot | `pinMapHtml` / `initPinMap` / `centerOf` | REUSE |
| Photo shrink / upload / signed URLs / tile | `pets.js` only | **EXTRACT** → `assets/pet-photo.js` (`jcPetPhoto*`), `.ptph` CSS → `app.css` |
| Photo block in the form | Residents' form (add / change / drop / remove + confirm) | REUSE words and behavior |
| Care-state words | `pt_care_*` | REUSE |
| One write at a time | `paBusy` / `ctEd.saving` | REUSE |

## Step 2 — Impact map

| Change | Behavior | Shared with | Could break | Check |
|---|---|---|---|---|
| Photo extract | None (move + rename) | Pets list, pet page, My Pets form | Photos stop; load order | `pets.spec.js` unchanged and green |
| Admin CSP | Organizer Tools may show pet photos | Every Organizer Tools screen | A typo blocks map tiles | e2e photo + tile on the admin page |
| Add / edit a stray | New screen | Pets tab list, `paFocus` | List not refreshed; wrong focus | e2e: re-read + focus the animal |
| Owned pets not editable | Edit on strays only | — | Editing a household's pet | Server `NOT_FOUND`; e2e asserts no Edit |

## Step 3 — Regression surface

- **Pets page:** tiles with photos, pet page photo, My Pets add / change / drop / remove, a failed photo keeps the paw, one signing call per list.
- **Organizer Tools → Pets:** chips + counts, search, Archived, WhatsApp settings, View links, focus from `?tab=pets&pet=`.
- **Organizer Tools elsewhere:** venue / court / pin-move maps (same CSP line); pets-only admins see no other tabs.

## Step 4 — Proposal (2 PRs)

| PR | What | Size | Tier |
|---|---|---|---|
| **R5d-2a — photo extract** | Pure move to `assets/pet-photo.js` + `.ptph` CSS to `app.css`; Pets loads it. Organizer Tools unchanged. | ~100 moved, ~10 new | Screen logic + code-reviewer |
| **R5d-2b — strays editor** | "Add an animal"; Edit on stray rows; editor: name (40, required), species, description (280), care state (4, "Under care" preselected for new), usual area (120), spot (pin picker + clear), photo (add / change / drop / remove). Only changed fields sent; spot as a pair only when moved / cleared; empty text → null. After save the list re-reads and focuses the animal; a failed photo keeps the details. Admin CSP + `pet-photo.js`. | ~190 client + strings, ~150 e2e | Screen logic + **security-reviewer** (CSP) |

- Cost: none. Migration: none. Cache: new same-origin script; `update.js` reloads open pages.
- Out of scope: photo thumbnails in Organizer Tools rows; care / log / hide / archive (R5d-3).

## Step 5 — Premortem (§0.5)

| # | Exposed? | Mitigation |
|---|---|---|
| 1 Silent corruption | Yes: unchanged fields overwrite another carer's edit; half a spot; `""` instead of null | Only changed fields; spot as a pair; empty → null; e2e asserts exact `p_fields` (rename only, spot moved, spot cleared, area cleared, new) |
| 2 Silent zero-output | Yes: the extract kills Pets photos | 2a ships alone; R5c tests unchanged are the gate |
| 2b Config drift | Yes: per-page hand-copied CSP | e2e renders a pet photo in Organizer Tools + a map tile not blocked |
| 3 Cost | No | — |
| 4 Contract drift | Low | Tolerant reads (`hObj`, type checks); fixture from real card keys |
| 4b Behaves differently | Yes | Court editor's Save / Cancel row; My Pets photo words |
| 5 Race | **Yes, accepted gap:** Zee's mirror extension doubles a "Save" on a new stray across two pages → two strays (no server idempotency) | Busy lock + disabled button within a page (e2e: one call on a double tap). Duplicates archivable in R5d-3; a server guard would be a DB change. |
| 6 Auth / RLS | Yes | Server `jc_assert_admin('pets')`, owned → `NOT_FOUND`; e2e personas pets-only, community, events-only |
| 7 Rollback | Client only: `git revert` per PR; Pets off for Jubail | — |

**Unconfirmed:** whether `jc_admin_stray_save` refuses while the Pets module is off; the editor shows the server's message either way.

## Step 6 — Executive summary

**What this change does:** lets the cat-care organizers add and update the community's strays (name, type, description, how they're doing, their usual spot, a photo) from Organizer Tools, after first moving the photo handling into one shared place.
**Biggest risk:** the move could quietly break photos on the residents' Pets page; it ships alone, gated by the existing photo tests. A doubled tap from the mirror extension can create a stray twice.
**Recommended next step:** approved 2026-11-14 → build R5d-2a, then R5d-2b.
