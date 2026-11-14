# R5d-2b — Organizer Tools → Pets: strays editor: reviews (2026-11-14)

**Tier:** screen logic + security review (CSP change) · **Plan:** `docs/plans/R5d-2-strays-editor.md` · **Builds on:** #121 (R5d-2a)

## Change

- Organizer Tools → Pets: **Add an Animal**, and **Edit** on active stray rows (a household's pet keeps only View).
- The editor covers name, kind, how they're doing, description, usual area, map spot and photo.
  - Only changed fields are sent to `jc_admin_stray_save`, and a cleared text is sent as null.
  - The spot goes as a lat/lng pair, and only when it was moved or cleared.
  - The photo uploads after the details; if it fails, the details are kept and the message says so.
  - After a save, the list re-reads and focuses the animal.
- Organizer Tools CSP `img-src` gets the signed `pet-photos` origin (same as Pets) and loads `assets/pet-photo.js`.
- `pet-photo.js` uses the shared `jcObj` instead of the per-page `hObj` alias.
- Strings: EN + draft AR (for Zee's review).

## Security review (security-reviewer agent)

**No Critical / High / Medium.**

| # | Finding | Disposition |
|---|---|---|
| CSP | The new `img-src` entry is a path prefix for signed pet-photo GETs only, identical to Pets; it adds no exfiltration channel (connect-src already allows the host; `data:` and tile hosts are broader) | No change |
| XSS | Every dynamic value is `esc()`'d; inputs are set via `.value`; the data-URL `<img>` comes only from canvas JPEG output | No change |
| Auth | The client gates are UX only. `jc_admin_stray_save` → `jc_assert_admin('pets')` then `jc_pet_manage`; an owned / other-community / archived pet → `NOT_FOUND` | Verified `jc_assert_admin(p_scope)` (S1): a pets or community grant only; community from `jc_me()`, never the client |
| L1 | Photos can still show people or plates; only the copy (`pt_photo_who`) asks otherwise | Accepted (free-form photo); admins can remove |
| L2 | A spot dropped on a house could identify a household | **Fixed:** area / spot help now says "an area, never someone's home or doorstep" (EN + AR) |
| L3 | Free text could hold personal data | Accepted, unchanged from before this PR |
| L4 | `hObj` → `jcObj` | Informational, correct |

## Code review (code-reviewer agent)

**Verdict: approve. No Critical / High.** Server contract, null vs "" description, pin compare, duplicate submit, shrink race, Back while saving, the delegated listener and message-keeping were all checked clean.

| # | Finding | Disposition |
|---|---|---|
| M1 | Language switch during a save, then a failed save → photo controls stay disabled | **Fixed:** the error path redraws the form (`peRedraw`); e2e "review M1" holds the save, switches language, fails it, and asserts every control is enabled |
| L2 | A row the list lost would open "Add" (null = new) | **Fixed:** opens only for a found card |
| L3 | A finished photo shrink redrew and stole focus mid-typing; an unconfirmed map pan reset | **Fixed:** `peRedraw` keeps focus where it was and the map view; the file input gets focus back only if it had it |
| L4 | `paFocus` survived a failed list re-read | **Fixed:** cleared in the `loadPets` error branch |
| L5 | A saved card with no id would drop the photo silently | **Fixed:** reported as a photo error |
| Note | With Pets switched off, a photo fails (`jc_module_on`) while the details save; the message says so | Accepted: matches the server's kill switch |
| Note | An existing stray with an unknown species must pick one before saving | Accepted: the server's check allows only the five |

## Tests

- `admin-pets.spec.js`: 8 new tests covering:
  - Edit only on active strays; Add opens an empty form
  - Add with the exact fields, then photo begin → upload → commit, focused on the list
  - Edit sends only what changed, a cleared area is null, a cleared spot is a pair of nulls, an unchanged form sends nothing
  - The photo renders in Organizer Tools (CSP) and Remove confirms
  - A photo failure keeps the details; a double tap sends one save
  - `NOT_FOUND` goes back to the list; a bad field stays on the form
  - A language switch keeps the draft (AR)
  - Review M1
- Local (Chromium mobile): admin-pets, pets, admin, admin-courts, a11y: **196 passed**. Full suite in both browsers: CI.
- Screenshots: the Add form in EN and AR (phone size) were checked. It has the court editor's shape and the My Pets pill and photo blocks; RTL is correct.
