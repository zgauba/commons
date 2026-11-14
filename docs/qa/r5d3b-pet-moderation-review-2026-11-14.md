# R5d-3b — Organizer Tools → Pets: moderation: reviews (2026-11-14)

**Tier:** screen logic + security review (moderation powers) · **Plan:** `docs/plans/R5d-3-care-moderation.md` · **Builds on:** #123 (R5d-3a)

## Change

- **Manage for every active animal.** Households' pets get it too. Care and Edit Details stay strays-only.
- **Sightings** (read via `jc_pet_get` while Pets is on), each with **Hide**.
  - The confirm says the sighting can't be shown again.
  - An already-hidden sighting counts as hidden, then the list is read again.
- **Archive** with a typed reason of 3–200 characters (the court-cancel pattern). The text is chosen by kind:
  - **Stray:** when to archive.
  - **Household's pet:** names the home; says it leaves their My Pets, any missing alert ends, they aren't told, and it can't be undone.
  - The server returns the whole list, so the Archived count updates.
- **The Pets page Admin button** opens Manage for any animal, and Back always finds its row.
- **Danger styles** (`.btn.danger-fill`, `.btn.ghost.danger`, `.danger-zone`) move to `app.css`. This also fixes the unstyled Remove Photo in Organizer Tools.
- Strings: EN + draft AR.

## Security review (security-reviewer agent)

**No Critical / High / Medium.**

- **Authorization is server-side.** `jc_assert_admin('pets')` takes the community from `jc_me()`.
  - Hide is scoped by `community_id`, and archive by `community_id` + `active`.
  - `jc_pet_retire` is not callable directly.
- **XSS:** clean. Everything is `esc()`'d. The Maps link has a fixed host and an encoded, finite lat/lng. Sighting ids are safe integers.
- **PII:** sightings carry no reporter identity (`by_me` only). The archive text shows a home label only. The reason sits in the admin log, which only community-scope admins can read.

| # | Finding | Disposition |
|---|---|---|
| L1 | The admin log keeps free-text reasons indefinitely; an organizer could type a name | **Fixed (copy):** the reason help says "without anyone's name … and is kept" (EN + AR) |
| L2 | No rate limit on archive / hide, and no restore: a rogue pets admin could archive every animal | **Design gap, raised to Zee:** recommend a server-side cap (for example 20 archives per organizer per hour) via `/db-rehearse` as a pre-launch backlog item. Archived rows stay in the DB, so a manual restore is possible. |
| L3 | A pets-only admin can't read the admin log | By design |

## Code review (code-reviewer agent)

**Verdict: approve. No Critical / High.**

| # | Finding | Disposition |
|---|---|---|
| M1 | Typing the archive reason lost focus (phone keyboard closed) if a re-read landed | **Fixed:** `pmWhy` added to the fields `pmKeep` puts focus back in |
| L1 | A tap on Archive while a Hide is in flight is ignored (the button isn't re-rendered disabled) | Accepted: rare, and harmless |
| L2 | A re-render mid-archive shows "Archive X" (disabled) instead of "Working…" | Accepted: cosmetic |

Checked clean by the reviewer:
- Hide vs read races (sequence numbers; busy is cleared on every path)
- The archive success path and chip counts
- The language switch and Keep
- Pets off: no read, and Hide / Archive still work, matching the server
- The client sends exactly what the server accepts
- The CSS move: cascade and specificity unchanged, and only the intended elements gain styles (Home already used the same classes and colors)

## Tests

- `admin-pets.spec.js`: 5 new tests covering:
  - A household's pet on Manage
  - Hide: confirm, exact call, re-read, already hidden
  - Archive: reason required, Keep, exact call, list and counts
  - Archive `NOT_FOUND`
  - Arabic keeps the reason
- 3 updated tests: the Admin button opens Manage for households' pets, and Back finds the row.
- Local Chromium mobile (admin-pets, pets, a11y, admin, admin-courts, home): **239 passed**. Full suite in both browsers: CI.
- Screenshots: a household's pet with Archive open; a stray with sightings after a Hide. The red styles render.
