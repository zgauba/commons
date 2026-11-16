# Review: stray reports PR 2, the organizer queue (2026-11-16)

Organizer Tools → Pets → **Reported strays**. Files: `commons/admin/admin.js` (`loadPets` 3rd read, `paGroupRow`,
`VIEWS.petreports`, `pr*` helpers, `peSave` / `peDone` / `peLeave` report branch), `commons/assets/strings.js`
(`pr_*`, EN + AR), `tests/e2e/specs/backends.js` (default stub), `tests/e2e/specs/admin-pet-reports.spec.js` (new, 14 tests).
Plan `docs/plans/report-a-stray.md`. Tier 2 (screen logic): affected specs locally, full suite in CI, `code-reviewer`.
No DB change (server: 20261116100000 + 20261116140000, live).

**Result:** APPROVE, no Critical or High findings. Local: admin-pet-reports + admin-pets + admin **226 passed**; a11y +
section-names **92 passed** (mobile + webkit).

| # | Finding | Disposition |
|---|---|---|
| M1 | A failed photo upload hid a failed report close (a second "Add" would duplicate the stray) | **Fixed:** the photo message now adds the report message |
| M2 | A close refused because another organizer handled it said "still open" | **Fixed:** ALREADY_CLOSED / NOT_FOUND → "was added; another organizer had already handled the report" (`pr_add_handled`, test) |
| M3 | After "Add as a stray", the organizer landed on Home, not the queue | **Fixed:** `peDone` goes back to Reported strays, re-read; the message is said after the read (`pr.say`) (test updated) |
| L1 | Focus lost after a close / Cancel | **Fixed:** next report's first action or the "none waiting" line; Cancel → that card's Already known button |
| L2 | A stale closed list could overwrite a fresh one; repeated loads | **Fixed:** `closedSeq` + `closedLoading`; reset on every close path |
| L3 | Chips switch mid-close | **Fixed:** chips ignore taps while busy |
| L4 | Local-format numbers make a dead wa.me link | **Partly fixed:** `00971…` → `971…` here (test). **PR 3:** the resident form must take an international number (+971…) |
| L5 | Test gaps | **Added:** Already known + ALREADY_CLOSED, Add + ALREADY_CLOSED, hostile note / place rendered as text, `00` number. **Not added:** photo + close both failing (needs a real photo pick in the editor; logic is a string join), RTL smoke (strings checked by hand), closed empty / retry |

Verified fine by the reviewer: escaping (notes, place, ids, map link, photo path), the number never rendered as text
(href set as an attribute, link removed if invalid), busy locks + doubled taps, save → photo → close order with the
stray never lost, stale-answer guards, Pets tab unchanged when the queue can't be read (tested), EN + AR keys.
