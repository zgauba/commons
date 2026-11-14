# R5d-3 — Organizer Tools → Pets: Manage, care, moderation (`/plan-change`, 2026-11-14)

> Status: **approved 2026-11-14** (Zee). **Q1 = A:** accept that the care log and sightings are unreadable in Organizer
> Tools while Pets is off (`jc_pet_get` checks `jc_module_on`); Manage says so; no DB change. **Q2 = yes:** one
> **Manage** button replaces Edit on rows; Edit details lives inside Manage.
> Parent: `R5d-pets-organizer.md` (Q2 archive households' pets = yes; Q3 archived names only, no restore).

## Server (used, not changed — read from migrations)

| RPC | Rules that shape the client |
|---|---|
| `jc_admin_pet_care_set(pet, item, status, date, note)` | items sterilized / dewormed / vaccination / treatment; status done / due / ongoing, or `unknown` = **removes** the item; date 2000-01-01 … today + 2 y or null; note ≤ 120 (cleaned); strays, active only → else `NOT_FOUND`; returns the card |
| `jc_admin_pet_care_add(pet, kind, note)` | kind fed / vet / note / state; note required (cut to 280); strays only; returns `{logged}` (client re-reads `jc_pet_get`) |
| `jc_admin_sighting_hide(id)` | any sighting in the community; no unhide |
| `jc_admin_pet_archive(pet, reason)` | any active pet; reason 3–200 else `REASON_REQUIRED`; clears photo + missing; returns the whole admin list; logged with the reason |
| `jc_pet_get(pet)` | `MODULE_OFF` while Pets is off (Q1) |

## Prior art

| Building block | Existing | Decision |
|---|---|---|
| One-item admin screen from a row, top Back | Court day view | REUSE the pattern (`petadmin` view) |
| Care record rows | `pets.js careHtml` + `.care` CSS | EXTRACT the CSS to `app.css`; admin rows add Edit per item |
| Care log list | `pets.js logHtml` | REUSE shape + `pt_log_*` words (admin `sulist`) |
| Sightings list | `pets.js sightingsHtml` | REUSE shape + Hide; no minimaps in Organizer Tools (3b) |
| Typed reason confirm | R2b-1 organizer acts | REUSE (3b) |
| Edit details | R5d-2 editor | REUSE; Save / Cancel return to Manage |

## Split

| PR | What |
|---|---|
| **R5d-3a — Manage + care** | Rows: **Manage** (strays; owned pets get it in 3b) + View. Manage: header, Edit details, care record (Edit per item inline: status, date, note; Clear with a confirm), care log (add a line; the last 20). Pets page Admin button → Manage. `.care` CSS → `app.css`. Pets off → the Q1 notice. |
| **R5d-3b — moderation** | On Manage for any active animal: sightings + Hide (says it can't be undone), Archive with a reason (owned: names the home, says the household will no longer see it). |

## Premortem (§0.5) — mitigations

1. **Silent corruption:** Clear is its own button + confirm (never a default status); one item per write; redraw from the returned card.
2. **Zero-output:** re-read the log after an add; `MODULE_OFF` → the notice, never an empty list.
2b. **Config drift:** module flag → notice + test with Pets off.
4b. **Behaves differently:** Admin button now lands on Manage; Back keeps the list's chip and search.
5. **Race:** one write at a time per page; mirrored-page duplicate log lines accepted.
6. **Auth:** server `jc_assert_admin('pets')`; care strays-only on the server; security review on 3b.
7. **Rollback:** `git revert`; archive / hide irreversible by design (confirms say so).
