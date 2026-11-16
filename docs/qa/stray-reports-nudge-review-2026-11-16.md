# Review: stray reports, the "waiting" line for organizers (2026-11-16)

Zee 2026-11-16: organizers get no alert, so the waiting count goes where Pets organizers already are. On the residents'
**Strays** tab, a Pets or community organizer sees "N stray reports waiting for the organizers. Review them →",
linking to `admin/?tab=pets&open=reports`, which opens Reported strays once. Residents never call the organizer RPC.
The Commons home v2 "For you" item is noted in ROADMAP.md.
Files: `commons/pets/pets.js` (`queueHtml` / `loadQueue`), `commons/admin/admin.js` (`OPEN_REPORTS`),
`commons/assets/strings.js` (`rp_queue`, `rp_queue_1`, EN + AR), `docs/plans/ROADMAP.md`, tests
(`pets-report.spec.js` +4, `admin-pet-reports.spec.js` +1, `backends.js`). Tier 2 (screen logic). No DB change.

**Result:** APPROVE, no Critical / High / Medium. Local: pets-report + admin-pet-reports + pets **192 passed**
(earlier run with admin-pets + a11y: 338).

| # | Finding | Disposition |
|---|---|---|
| L1 | The late count redrew the list, rebuilding the Strays map (losing a pan / zoom) | **Fixed:** the line is inserted in place, with no redraw |
| L2 | `?open=reports` on a non-Pets tab leaves the flag set for the session | **Accepted:** harmless; the link always carries `tab=pets` |
| L3 | Tests: lapsed rights; `open=reports` without Pets rights; AR | **Added:** NOT_ADMIN shows no line and no error. The other two **not added** (falls through to the existing tab guard; strings checked by hand) |

Verified fine: no request loop (one read per page load), a count that's stale until the next load is acceptable
(a hint, not a gate), escaping, the EN singular / plural pair, residents never asking.
