# OT-3: Pets in Organizer Tools (chips, search, WhatsApp group screen) + residents' Pets search: review (2026-11-14)

Plan: `docs/plans/OT-organizer-tools-ia.md` (approved 2026-11-14; decisions now recorded at the top). Tier: **screen logic**, so `code-reviewer`. No database change. The WhatsApp link's rights and RPCs are unchanged (members-only read, pets/community admins write).

## What changed

- **Organizer Tools → Pets:**
  - **Chips** All · Strays · Homes' pets · Missing · Archived, with counts; `?show=` is kept in the address.
  - **Search** by name, home, area or village. It narrows every count, and nothing new is sent to the server.
  - **Archived** sits under its own chip, names only (Zee Q3).
  - An animal's **Admin button** always shows that animal, overriding the chip or search.
- **The pets WhatsApp group link** is now a settings row ("Set: …" / "Not set yet: …"). It opens its own screen, in plain words:
  - **What it does:** the "Tell the pets group" button on the Sightings tab copies a ready message and opens the group.
  - **How to get the link:** 5 click-by-click steps, plus a note that only WhatsApp group admins see the invite option.
  - **Who sees it.**
  - The field, Save Link, Remove Link, and **Test It: Open the Group**.
- **Residents' Pets:**
  - **Search by name** over the list already loaded. It works together with the species chips.
  - Missing pets stay on top and are never searched away.
- **Shared:**
  - `jcWaGroupOk()` in `assets/api.js` is the one WhatsApp-link check. Pets, the Organizer save and the Test It link use it.
  - `.setrows` (from OT-2) is reused.
- **Docs:**
  - The plan doc records Zee's D1–D6.
  - ROADMAP R7 has the Halloween-site retirement inventory. Zee: a pre-launch step.

## Findings and disposition (`code-reviewer`: APPROVE; 0 critical / 0 high)

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | MEDIUM | The Test It `href` took the stored link unchecked. A legacy or hand-written `javascript:` value would be clickable in the admin's origin. | **Fixed.** `jcWaGroupOk` gates it (a shared constant, replacing 2 copies). Test: a `javascript:` value shows as text only, with no link. |
| 2 | LOW | The copy said the button is on "a missing pet's or a stray's page". It is on the Sightings tab, when reporting. | **Fixed** in EN and AR. |
| 3 | LOW | Missing pets ignore the residents' search | **Intended.** A missing pet is never hidden. The test asserts it. |
| 4 | LOW | `loadPets` not deduplicated | **No change.** It already has an in-flight guard (`paLoading`). |
| 5 | LOW | Reopening the group screen after a failed load showed only Retry | **Fixed** (the error is said). In practice this can't be reached: with a failed load, the tab offers only Retry, not the row. |

## Verification

- **New tests:**
  - `admin-pets.spec.js`: chips and counts per chip, focus, URL over a reload; empty-chip words; search (area, home, village, archived, no match, no server calls); the Admin button overriding chip and search; the group row's set / not-set wording; the screen's three sections and 5 steps; save staying on the screen; Test It href and target; Back; Arabic; a `javascript:` link never clickable.
  - `pets.spec.js`: residents' name search (with chips, missing kept, no match, hostile text, opening a found card, no server calls).
- **Migrated:** the group-link tests open the new screen. The headings assertion moved to chips; Archived is checked under its chip.
- **Full suite, both browsers:** 1302 passed (before the review fixes). Pets specs after the fixes: 164 passed in both browsers.
- **Screenshots:** Organizer Tools → Pets EN and AR (notice, group row, chips, search; the notice spacing was fixed after the first shot), residents' Pets EN (search under the chips).
