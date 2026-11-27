# flaky-admin-admins review: 2026-11-27

**Scope:** PR #8. This fixes the race behind the one-off timeout of `admin-admins.spec.js:348` on PR #3. Only the
test file changed (`tests/e2e/specs/admin-admins.spec.js`), plus the contract and ROADMAP. No app code changed.

**Tier:** 1. There was no reviewer agent; this note stands in for one.

**Root cause:** the `openAdmins` helper waited only for the "Admins" heading. `VIEWS.admins` draws that heading with
"One moment…" before the six `jc_module_admins_list` reads return. Ending the grant right after that raced the reads
still in flight: they came back NOT_ADMIN, the app went to the lock screen, and `[data-admake="events"]` was never drawn.

**Changes:**
- `openAdmins` now waits for "One moment" to go.
- The :348 test holds the `cats_vol` list read back 300 ms. This is a slow-network stub, not a sleep in the test, and
  it makes the race run every time.
- The retry test's `not.toContainText("Working")` became `"One moment"`. The old text never appears in the app, so
  that assertion always passed and checked nothing.

**Tests:**
- Unfixed helper with the delay: 3 of 3 failed (Chromium), at the same line as the CI flake.
- Fixed: 20 of 20 passed (10 runs each in Chromium and WebKit).
- Whole spec: 52 of 52 passed in both browsers.
- CI: 13 of 13 checks passed, including the full e2e suite (2 Chromium shards, 3 WebKit shards).

**Findings:** one, fixed in this PR: the vacuous `"Working"` assertion.

**Screenshots:** none (no screen changes).

## Evaluator

## Evaluator — flaky-admin-admins, round 1 (final), 2026-11-27, HEAD 27c4d3a, contract d6c2e7a6

| # | Check (short) | Verdict | Evidence |
|---|---|---|---|
| 1 | Race can be reproduced on demand: with one list read 300 ms late, the unfixed test fails at the same line as CI | PASS | I made an unfixed copy outside the repo (`git archive HEAD`, then removed the 3 new lines from `openAdmins`); the delayed stub is kept. `--repeat-each=3 --project=mobile` → "3 failed", each a `locator.click` timeout waiting for `[data-admake="events"]` |
| 2 | With the fix, the delayed test passes every time in both browsers | PASS | `--repeat-each=10 --project=mobile --project=webkit` → "20 passed (10.0s)" |
| 3 | Whole spec passes locally in both browsers, and CI is green | PASS | Local: "52 passed (12.8s)". `gh pr checks 8`: all 13 pass. headSha 27c4d3a = HEAD for all 6 runs. Cloudflare Pages: SUCCESS |

PASS 3 · FAIL 0 · DEFERRED 0 · HUMAN 0 · CI-LATER 0 → READY

The evaluator's test-weakening review found nothing weakened: the wait is stronger, the delay is a stub, and the
`"One moment"` assertion checks real text where `"Working"` checked nothing. No assertions were removed, no skips
were added, and no app code changed.

Evaluator agreed: yes (Zeeshan, 2026-11-27)

## Merge evidence
TIER: 1
EVALUATOR: READY head=27c4d3ad7c296fd4f95d1d972d73ef19c177714a contract=d6c2e7a6
