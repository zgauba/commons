# pets-ui-fixes — contract
Status: written by the builder under /ship-pr step 2 (no /plan-change: fixes from the Pets UI review, Zeeshan: "fix all and merge", 2026-11-25)
Plan: `docs/qa/pets-ui-review-2026-11-25.md` (findings P1–P5 and their dispositions)

| # | Check | Proof | Pass/Fail |
|---|---|---|---|
| 1 | A pet's Sightings tab has no heading repeating "Sightings" (D1) | `pets.spec` asserts no `h2.group` with that text inside the Sightings tab panel; EN + AR pictures | |
| 2 | On a missing pet's page, Report seeing ⟨name⟩ is the filled primary button; on a pet at home, Seen ⟨name⟩ out on their own? stays outlined | `pets.spec` asserts `#ptSight` has class `btn` without `ghost` when missing, and `ghost` when at home; picture | |
| 3 | Organizer › Pets › Manage: the help line never touches the sightings list under it | `admin-pets` spec asserts ≥ 11.5px between the help line and the list (bounding boxes); picture | |
| 4 | After reporting a pet at home seen out, the page says it was reported instead of offering the report button again (for the rest of the visit) | `pets.spec` asserts `#ptSight` count 0 and the "reported" line after the send; a missing pet still offers Report seeing again | |
| 5 | Add / Edit a Pet: one short privacy line on screen + "What happens to the photo" that opens the full text (the disclosure stays on the screen that collects the photo) | `pets.spec` asserts the short line, the `details` closed by default, and the full text inside after opening; EN + AR picture | |
| 6 | Regression: pets, admin-pets, admin-pet-reports, home (shared CSS) pass incl. EN + AR axe; design guard clean; PR CI green | Local mobile run; CI on the PR | |
