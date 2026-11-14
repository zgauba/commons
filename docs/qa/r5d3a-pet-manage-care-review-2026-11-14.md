# R5d-3a — Organizer Tools → Pets: Manage + care: code review (2026-11-14)

**Reviewer:** code-reviewer agent · **Tier:** screen logic · **Plan:** `docs/plans/R5d-3-care-moderation.md` (Zee Q1 = A, Q2 = yes)

## Change

- One **Manage** button per active stray row. It replaces Edit; the Pets page's Admin button now lands on Manage.
- **Manage** shows Edit Details (returns to Manage), the care record and the care log.
  - **Care record:** one item at a time (status pills, date, note ≤ 120). Clear = `unknown`, behind a confirm.
  - **Care log:** add a line, then re-read `jc_pet_get`.
- While Pets is off, `jc_pet_get` raises `MODULE_OFF`, and Manage says when the log will show.
- `.care` CSS → `app.css`. EN + draft AR strings.

## Findings — verdict: approve (no Critical / High)

| # | Finding | Disposition |
|---|---|---|
| M1 | A failed list re-read after an Edit Details save left Manage on "Working…" with no Retry | **Fixed:** `loadPets` error redraws Manage (Retry + why). e2e "review M1" |
| M2 | A redraw after an answer moved focus off the field being typed in (phone keyboard closes) | **Fixed:** `pmKeep` puts focus and caret back in `#pmNote` / `#pmLogNote` / `#pmDate` |
| M3 | A log line added while the first read was in flight was lost when the older read landed | **Fixed:** each read has a sequence number, so only the newest counts. The add starts a fresh read. e2e "review M3" |
| L1 | `pv` left set when an edit went back to the list | **Fixed:** cleared |
| L2 | Log not re-read after Edit Details | No change: `jc_admin_stray_save` writes only the admin log, never the care log |
| L3 | A failed log re-read replaced "Added to the log." | **Fixed:** a success message stays; Retry still shows |

Checked clean by the reviewer:
- `Object.assign` of the returned card onto the admin row keeps status and counts.
- The client sends exactly what `care_set` / `care_add` accept, including dates and nulls.
- Double writes are guarded, and buttons are never left disabled.
- Stale answers are guarded.
- The OPEN_PET early return.
- The delegated list listener.
- The language switch.
- The care record matches the residents' rendering.

## Tests

- `admin-pets.spec.js` adds 9 tests:
  - Manage only on active strays; the Admin button lands on Manage; Back keeps the chip and search
  - Care record: exact args, status required, Clear confirms, focus
  - Care log with Pets on: exact args, re-read, note required, one Add on a double tap
  - Pets off: notice, no read, add still works
  - Edit Details returns to Manage
  - `NOT_FOUND` goes to the list; a bad date stays on the form
  - Arabic keeps the draft
  - Reviews M1 and M3
- The R5d-2 tests now go through Manage.
- Local Chromium mobile (admin-pets, pets, a11y, admin): **177 passed**. Full suite in both browsers: CI.
- Screenshots: Manage with an item open, and the log after an add. I fixed the date field style and the log spacing. No hard-coded dark scheme (Commons has a light theme).
