# Review: stray reports PR 3, the resident form (2026-11-16)

Pets → Strays → **Report a stray**, the photo prompt at Send, the thank-you screen, and **My reports**. Files:
`commons/pets/pets.js` (report form, prompt, `repSend`, My reports; `drawShare` split into the shared
`shareLinksHtml` / `wireShareLinks`), `commons/assets/pet-photo.js` (`jcPetPhotoUpload` gets a `report` mode; the
existing two-argument callers are unchanged), `commons/assets/strings.js` (`rp_*`, `pt_err_REP_*`, EN + AR),
`tests/e2e/specs/backends.js` (report stubs), `tests/e2e/specs/pets-report.spec.js` (new, 12 tests × 2 browsers).
Plan `docs/plans/report-a-stray.md`. Tier 2 (screen logic): affected specs locally, full suite in CI, `code-reviewer`.
No DB change.

**Zee's requirement (2026-11-16):** a prompt when the photo is submitted. The disclosure is shown under the picker
and again at Send, as an in-page step: **Send with the photo · Send without the photo · Back**.

**Result:** approve with warnings, no Critical findings. All Mediums fixed. Local: pets-report **24 passed**;
pets + admin-pets + a11y + home + section-names **374 passed** (mobile + webkit).

| # | Finding | Disposition |
|---|---|---|
| M1 | The prompt didn't lock the form: a different photo (or a pin pick) could change what's sent after agreeing | **Fixed:** every field is disabled while the prompt is open; a new photo closes the prompt at once; `repSend` refuses while a photo is shrinking or the picker is open (test: controls disabled) |
| M2 | A photo that fails after the report went in has no recovery | **Wording fixed:** "The organizers have your report, without the photo (why). No need to send it again." (test). An "Add photo" action on My reports is **deferred**: it needs the same prompt again; not worth it for a rare failure |
| M3 | The copy said the photo "becomes" the animal's photo and "stays"; the server uses it only when the stray has none, otherwise discards it | **Fixed (EN + AR):** "may become its photo… If they use it, it stays with the animal; if not, it's discarded." "Remove" → "Withdraw" (it's retired now, purged by the sweep: never promises "deleted immediately") |
| L1 | Back from the prompt lost focus | **Fixed:** focus to Send (test) |
| L2 | The prompt's paragraphs weren't announced | **Fixed:** `aria-describedby` on the three paragraphs (test) |
| L3 | Ticking WhatsApp jumped focus to the number | **Fixed:** focus stays on the box (`aria-controls`) |
| L4 | Stale My reports reads; edits after a lost response dropped silently; Back drops the draft | Read sequence **fixed**. Edits-after-lost-response **accepted** (the server keeps the first report, by design: idempotent id). No draft confirm on Back: **accepted** (short form) |
| Tests | Retry same id, double tap, photo failure after add, RATE_LIMITED, prompt race | **Added** all five. AR/RTL render and an axe pass on the report view: **not added** (strings checked by hand; `a11y.spec` doesn't open this view) |

Verified fine by the reviewer: the four hard requirements (prompt + send-without; international number only;
no "deleted immediately"; the number never shown back), the retry reusing one id, double taps, a failed photo not
re-sending the report, the shared upload helper unchanged for Organizer Tools and My Pets, escaping, EN + AR keys.
