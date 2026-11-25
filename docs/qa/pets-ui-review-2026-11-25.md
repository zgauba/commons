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

## Code review (code-reviewer, 2026-11-25)

APPROVE: 0 high, 0 medium, 2 low.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| R1 | LOW | "What happens to the photo" closes again when the edit form redraws (a photo picked or dropped, a language switch). | **Accepted:** the full disclosure stays on the form, just collapsed. Nothing is lost. |
| R2 | LOW | `.help + .sulist{margin-top:12px}` also reaches the household-pending list and the hidden-sightings list in Organizer Tools. | **Accepted as intended:** both are a help line touching a list, the same "nothing touches" break. |

## Evaluator

### Round 1 (HEAD 9eb9b98): NOT READY (PASS 5 · FAIL 1)

| # | Check (short) | Verdict | Evidence |
|---|---|---|---|
| 1 | No repeated Sightings heading | PASS | pets.spec:316 ✓ (0 `h2.group` "Sightings" in the real `role=tabpanel`); Luna pictures EN + AR (app-check flow) |
| 2 | Filled while missing, outlined at home | PASS | pets.spec:316 + :180 ✓; Luna and Rex pictures |
| 3 | Manage help line 12px from the list | PASS | admin-pets:526 ✓; sweep picture |
| 4 | Reported line at home; a missing pet still offers Report seeing | FAIL | The first half is proven (pets.spec:180). No test checks `#ptSight` after a send on a missing pet. |
| 5 | Short line + What happens to the photo | PASS | R5c spec:982 ✓; Mochi edit pictures EN / AR, closed and opened |
| 6 | Regression + CI | PASS | 136 passed locally incl. axe en/ar; design guard OK; PR #219 CI green on 9eb9b98 |

**Round 1 → fix:** the missing-pet send test (location + note) now checks that Report seeing Luna is still offered (filled) and that there's no "reported" line.

### Round 2 (HEAD a3fc101): READY (PASS 6 · FAIL 0 · DEFERRED 0 · HUMAN 0)

| # | Check (short) | Verdict | Evidence |
|---|---|---|---|
| 1 | No repeated Sightings heading | PASS | pets.spec:320 ✓; Ginger + Luna Sightings pictures EN / AR |
| 2 | Filled while missing, outlined at home | PASS | pets.spec:320 + :180 ✓; Luna / Ginger / Rex pictures |
| 3 | Manage help line 12px from the list | PASS | admin-pets:526 ✓ (≥ 11.5px); sweep picture (older list, same rule) |
| 4 | Reported line at home; a missing pet still offers Report seeing | PASS | pets.spec:180 ✓ (reported line, no button) and :243 ✓ (Report seeing Luna still offered, filled, no reported line) |
| 5 | Short line + What happens to the photo | PASS | pets.spec:986 ✓; Mochi edit pictures EN opened, AR closed |
| 6 | Regression + CI | PASS | 136 passed locally incl. axe en/ar; design guard OK; PR #219 CI green on a3fc101 |

Contract unchanged since d8961bb; no test weakened. **Tuning record:** round 1 FAIL #4 was correct (the second half of
the proof had no assertion). Evaluator agreed: pending Zeeshan (merged on his "fix all and merge", 2026-11-25).

