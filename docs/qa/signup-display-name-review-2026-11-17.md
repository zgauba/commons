# Sign-up display name — review (2026-11-17)

Branch `feat/signup-display-name`. Tier 3 (collects PII, opt-in): security-reviewer + code-reviewer. App only — uses the
existing `jc_display_name_set`; no DB change.

## Verification
- E2E (Chromium + WebKit): account, help, home, strings-parity — 117 passed; after review fixes account + parity 49 passed.
- New tests: field shown and optional, who-sees-it text, Back keeps the value, trimmed, sent once AFTER jc_join, empty →
  no call, failed save → still in, a name typed before a wrong code is saved after the retry (never on the failed try).

## security-reviewer — PASS (0 critical / 0 high; confidence 0.85)
Audience (from migrations): household (`jc_me_get`) + community admins (Households incl. pending requesters, Admin log,
Admins list, event-admin list). Module/event-only admins do NOT see it; never on bookings (`jc_bookings_no_name`),
pets, events or anything public. The copy "household and the community's organizers" is accurate, slightly broad (safe).
| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | MED | `jc_display_name_set` (pre-existing) does no `jc_clean_line` / bidi stripping, cleans after reading the full text; names not unique → "Admin"-style spoofing in organizer lists | **Deferred — own DB PR** (ROADMAP backlog): `jc_clean_line(left(p_name, 200))` + bidi ranges, BAD_NAME if nothing left; `dir="auto"` / masked email beside names in admin rows. Not caused by this commit; needs `/db-rehearse` + "apply". |
| 2 | LOW | A failed name save is silent | **Accepted** — the only reachable failures are network / rate limits (maxlength = server's 40); joining matters more; the screen says it can be set in My Home. |
| 3 | LOW | "organizers" broader than the real audience | **Accepted** — over-disclosure is the safe direction. |
| 4 | INFO | No rate limit on `jc_display_name_set` | **Accepted** — member-only, once per sign-up. |
XSS: every render path esc()s the name; the sign-up field is set via `.value`. Nothing logged, stored or sent before membership.

## code-reviewer — APPROVE (0 critical / 0 high; confidence 0.85)
| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | MED | Signed in but not yet a member → straight to the code step, never asked | **Backlogged** (ROADMAP row); rare path; My Home still has it. |
| 2 | LOW | `joinName` survives sign-out on a shared phone | **Fixed** — cleared in `doSignOut`. |
| 3 | LOW | Retry test didn't cover a name typed before a wrong code | **Fixed** — asserted saved once, after the retry. |
| 4 | LOW | Language toggle on the account step loses newly typed text | **Accepted** — same as email/password today. |
| — | AR | "لقب" can read as a family name / title | **Fixed** — "الاسم الذي تحب أن تُنادى به". |
New/changed AR strings (join_name_help, mh_name_help, help_home_4) join the pending native Arabic review.
