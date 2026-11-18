# Home CTA + Cats areas copy — review note (cosmetic tier) — 2026-11-18

**What changed (copy only, `commons/assets/strings.js`):**
- Hub card buttons: Pets "Add a Pet" → **"See Pets"** (Zee: a resident who already added a pet was still told to add one; the Pets page has its own Add button). Cats "Open Cats" → **"See Cats"** to match "See Events". AR: «عرض الحيوانات الأليفة», «عرض القطط» (pending native review with the rest).
- Cats → Areas help: no longer suggests villages or names Jubail areas — "Areas are yours to set up. Group the stations in whatever way suits the programme." (Zee: the programme decides; Commons is community-agnostic.)
- The invite-accepted button (`inv_go_cats`, "Open Cats") is unchanged.

**Tests:** `landing.spec.js` now asserts the Pets hub button reads "See Pets". landing + cats specs: 38/38 pass (mobile).
**CI catch:** the Pets page reused `cta_pets` for its own Add button + form title — now its own key `pt_add` ("Add a Pet"); pets + landing specs 81/81.
**Reviewer agent:** none (cosmetic tier).
