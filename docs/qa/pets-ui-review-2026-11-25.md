# Pets UI review (2026-11-25)

**How:** `/shot sweep pets` (`pets.spec`, `admin-pets`, `admin-pet-reports`: 105 tests, all passed, 105 pictures,
Chromium iPhone 13, stubbed backend), judged with `ui-design-review:ui-review` against `docs/design.md`. 15 pictures
looked at (EN, AR) plus two single `/shot`s no test ends on: Add a Pet (full page), the Arabic list. 2 findings
confirmed in code. Earlier Pets reviews checked; none of these were decided before.

Zeeshan's call (2026-11-25): fix all and merge (P2 changes a documented design choice; P5 wording to be checked in the PR).

## Findings and disposition

| # | Severity | Where | Finding | Disposition |
|---|---|---|---|---|
| P1 | Should | A pet's Sightings tab | The tab "Sightings" opens with a "SIGHTINGS" heading: `design.md` §8 "Never" #3 (D1). `pets.js` passed `heading` to `jcEntriesHtml` inside the tab. | **Fixed:** no heading inside the tab (the kit's own rule). |
| P2 | Should | A missing pet's page (a neighbour) | **Report seeing ⟨name⟩** (the module's most important action) was a half-width outlined button under the alarm. `design.md` documented it as ghost. | **Fixed:** filled while the pet is missing; the at-home "Seen ⟨name⟩ out on their own?" stays outlined. `design.md` updated. |
| P3 | Should | Organizer › Pets › Manage | The help line "Hide a sighting that's wrong…" touches the first sighting card (Organizer Tools has no shared stack). | **Fixed:** 12px between a help line and the list under it, in the existing Organizer spacing rule. |
| P4 | Nice | A neighbour's pet at home, after reporting | **Seen Rex out on their own?** was offered again straight after "Thanks…", inviting a duplicate (the server caps it). | **Fixed:** a "Reported just now" line in its place for the rest of the visit. A missing pet still offers Report seeing again (a second sighting elsewhere is useful). |
| P5 | Nice | Add / Edit a Pet | A 6-line photo privacy paragraph sat between Photo and Kind of animal. It's a required disclosure, so it stays on the screen. | **Fixed:** one short line plus **What happens to the photo**, which opens the full text in place (`details`). Wording below, for Zeeshan to check. |

## Seen and fine

Missing pets lead the list (red edge + the word "Missing"). The pet page uses the shared hero / facts / entries, and
Arabic lines up. The share flow says who sees the message first. Organizer moderation asks before archiving and keeps
a reason.

## Not findings

Green photo boxes in Arabic: the test's stand-in image. Blank maps: tiles stubbed. The Home hub's Coming soon cards:
Home, not Pets.

## Verification

**Tier 2 (screen logic):** client only, no schema / RPC / auth / PII change (the photo disclosure's words are unchanged
apart from a split; the PII rule "disclosed on the screen that collects it" still holds: the full text is on the form).

- **Tests:** pets, admin-pets, admin-pet-reports, home (the shared `details` style moved from home.css), strings-parity
  on mobile (Chromium), run once locally: **141 passed**. WebKit in CI. Design guard: OK (the moved rule is one shared rule, not a copy).
- **The tests catch the bugs:** the new assertions run against the old `commons/` (5 files): **4 failed**
  (neighbour pet at home P2 / P4; missing pet P2 → P1; photo P5; Manage P3), 98 passed. Restored: all pass.
- **Screenshots looked at (after):** missing pet Sightings (filled Report seeing Ginger, no repeated heading); a
  neighbour's pet after reporting ("Reported just now." in place of the button); Organizer › Manage (help line 12px
  from the list); Add a Pet in Arabic with What happens to the photo opened.
- **Wording (P5), for Zeeshan to check:** on screen: "Neighbors in your community can see this photo. Keep people,
  faces, house numbers and car plates out of it." Under **What happens to the photo**: "Its location data is removed
  before it's sent. A replaced or removed photo is deleted within a day. If you remove the pet, no one can see its
  photo, but it's kept for 30 days in case the pet is brought back, then deleted." (The same words as before, split.)
- **Design doc:** Sightings markup (P2 filled while missing; P4 line) and a new shared "Tap-to-open line".
