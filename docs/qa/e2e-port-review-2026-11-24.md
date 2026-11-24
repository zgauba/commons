# e2e-port review — 2026-11-24

**Scope:** PR #212, branch `chore/e2e-port-per-checkout`. Each checkout runs the browser tests on its own port (`tests/e2e/port.js`), so two worktrees can test at the same time. Test tooling only, no app code.
**Tier:** 2 (screen logic tier: suite once + CI + code-reviewer).
**Reviewer:** `code-reviewer` agent. **Evaluator:** `evaluator` agent (ship-pr step 2b; one of its first five tuning runs).
**Contract:** [docs/plans/e2e-port-contract.md](../plans/e2e-port-contract.md)

## Findings

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | Important | The sweep range 5000–5699 contains 5060/5061, which Chromium refuses (`ERR_UNSAFE_PORT`); a checkout hashing there could never sweep | **Fixed** (fba5e8e). Confirmed first: `SWEEP_PORT=5060` sweep → `ERR_UNSAFE_PORT`, 1 failed. A probe of every port 4300–5699 in Chromium and WebKit found 5060/5061 refused in both, and **5000 taken** on macOS (AirPlay Receiver), which the reviewer hadn't flagged; nothing else. `slot()` steps past all three (5000→5001, 5060/5061→5062); an override of 5060/5061 throws. Unit test added for both |
| 2 | Nit | `tests/ci/e2e-port.test.mjs` runs nowhere automatically | **Fixed**: `verify.sh` runs it with the rule checks (no CI workflow change) |
| 3 | Nit | Test derives its path with `new URL(…).pathname` (breaks on spaces) | **Fixed**: `fileURLToPath` |
| — | Nit (noted) | `docs/plans/R3-app-shell.md:38` still says 4173 | **Accepted**: plan docs are snapshots of their time |

Reviewer's other answers: port derivation is deterministic per checkout and independent of the working directory; inherited `E2E_PORT` is identical in every worker; a hash collision between two worktrees (about 1 in 700) fails loudly; `toHaveURL(baseURL)` is stronger than the old unanchored regex for the open-redirect test; the unit test would fail if port.js used `process.cwd()`.

## Plan conformance

| Plan row | Plan said | FOLLOWED / NOT FOLLOWED | Evidence |
|---|---|---|---|
| Port override by env var | REUSE the SWEEP_PORT pattern as E2E_PORT; sweep keeps its own | FOLLOWED | `tests/e2e/port.js` `pick("E2E_PORT"…)` / `pick("SWEEP_PORT"…)`; sweep config reads `sweepPort` |
| Server command + URL | EXTRACT one `webServer(port)` in port.js, used by both configs | FOLLOWED | port.js `webServer`; playwright.config.js and playwright.sweep.config.js; string-replace removed |
| URL assertions | REUSE Playwright's `baseURL` fixture, not port.js | FOLLOWED | home.spec:117, account.spec:196/:275, admin-admins.spec:112, admin.spec:476; no spec imports port.js |
| Small node tests | REUSE `tests/ci/*.test.mjs` + `node --test` | FOLLOWED | `tests/ci/e2e-port.test.mjs` |
| Port range | DEPART (agreed): 4300–4999 | FOLLOWED | port.js base 4300, `% 700` |
| Agreed: sweep per-checkout port | 5000–5699, SWEEP_PORT overrides | FOLLOWED | port.js base 5000; sweep config header (5000, 5060, 5061 skipped, finding 1) |
| Agreed: hash the root from port.js's location, never cwd | | FOLLOWED | port.js `ROOT` from `__dirname`; no `process.cwd()` |
| Agreed: unit test proves same port from root and tests/e2e | | FOLLOWED | e2e-port.test.mjs first two tests |
| Duplicates of shared code | none | FOLLOWED | reviewer found none |
| Contract rewritten without agreement | Check cells unchanged since 9b503b6 | FOLLOWED | `git diff 9b503b6..HEAD -- docs/plans/e2e-port-contract.md`: only Proof "Ran" notes and Pass/Fail cells added |

## Tests

- Mobile suite: 799 passed in this worktree and in a second worktree **at the same time** (ports 4888 / 4961), e858f15.
- `bash .claude/verify.sh`: green, 799 passed, at e858f15 and again at fba5e8e (after the fix).
- Port unit test: 6/6 at e858f15, 8/8 at fba5e8e.
- `/shot sweep home`: 31/31 in both worktrees at the same time (ports 5588 / 5661).
- app-check: 28/28 PASS (14 steps × EN/AR), every picture checked against its `expect`.
- CI: see the PR checks.

## Evaluator

EVALUATOR_TABLE

Evaluator agreed: _Zeeshan to answer_
