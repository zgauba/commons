# Pets care wording — review note (2026-11-15)

**Tier:** cosmetic (copy only). No reviewer agent, per tiered verification.
**Source:** stray-care UX review 2026-11-15 (fixes 1 and 5; fix 2 "Fed without a note" needs a migration — separate, via /db-rehearse).

**Changes (Organizer Tools → Pets):**
1. Edit Details, under "How they're doing": "Rehomed keeps them listed but off the map. To remove them for good, use Archive on Manage." (EN + AR draft)
2. Manage, under the log's note box: "Residents see the log on the animal's page." — linked to the box with aria-describedby. (EN + AR draft)

**Checks:** admin-pets.spec.js asserts both lines (+ aria-describedby). Local: admin-pets + pets + a11y specs, mobile: 131 passed. Full suite (both browsers) in CI. Arabic drafts ship as is (Zee).
