# Review: pets quick log — Fed / Vet visit without a note (2026-11-15)

**Tier:** data → rehearse, database + security reviews, apply only on Zee's "apply".
**Migration:** `supabase/commons/migrations/20261115100000_pets_quick_log.sql` · **Slice:** `tests/sql/s27_pets_quick_log.test.sql`
**Source:** stray-care UX review 2026-11-15, fix 2.

## What changes
- `jc_pet_care_log.note`: NULL allowed only for kind fed / vet (CHECK: `case when note is null then kind in ('fed','vet') else char_length(note) between 1 and 280 end`).
- `jc_admin_pet_care_add`: empty / blank note for fed / vet → stored NULL (never ''); note / state without text → BAD_FIELDS. Signature + grants unchanged.
- Organizer Tools: Add to Log works without a note for Fed and Vet visit (sends null); the label says "Note (optional for Fed and Vet visit)" (EN + AR draft).

## Rehearsal
Full dry run 1318 → **1337 checks**, rolled back; live checked after: column still NOT NULL, old CHECK, old body, no testville27 fixture.
e2e (mobile): admin-pets + pets 104 passed; the quick-log assertions (vet with no note → p_note null) are new.

## Database review — APPROVE (no HIGH / MEDIUM)
| # | Finding | Disposition |
|---|---|---|
| L1 | jc_clean_text doesn't strip tab / newline: a tabs-only note is stored as blank text (pre-existing, all kinds) | **Deferred** — fix in jc_clean_text itself (shared by events etc.), not here |
| L2 | Rollback order wording | **Fixed** — step 3 only after 1–2 |
| L3 | Tests: vet with NULL; 281–400 truncation | **Fixed** — both added (QL01, QL03c) |
Verified: CHECK is NULL-safe; lock impact negligible (tiny table); only reader jc_pet_get passes null through; both clients guard `c.note ?`.

## Security review — APPROVE (no HIGH / MEDIUM)
| # | Finding | Disposition |
|---|---|---|
| L1 | No rate limit on jc_admin_pet_care_add; note-less entries make log spam cheaper (newest 20 shown publicly) | **Deferred, tracked** — joins the R5d rate-limit follow-ups (same pattern as 20261114200000); text spam was already possible; admins only |
| L2 | Client still rejected empty notes | **Fixed** — admin.js pmLogAdd |
| L3 | Confirm s27 coverage | **Confirmed** — QL01–QL05 cover null / '' / blank, note & state refused, CHECK on direct insert, non-admin refused |
Verified: jc_assert_admin('pets') first; definer + pinned search_path kept; null notes render nothing (esc + guard); no PII added.
