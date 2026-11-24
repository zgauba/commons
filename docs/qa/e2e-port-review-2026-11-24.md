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
| E1 | Evaluator round 1, row 3 FAIL | A port held by something that isn't our test server: Python died with "Address already in use" and the port wasn't named; a holder that never answers made Playwright's HTTP check wait for as long as it held the port (reproduced: 200 s, then the run went ahead) | **Fixed** (5d58ea6): `webServer.port` instead of `url`, so Playwright checks with a plain connect. All three holder types now stop in under a second with `http://localhost:<port> is already used`; the command also names the port if Python can't bind. Row 3's proof re-agreed with Zeeshan for the new message (Check unchanged) |
| E2 | Evaluator round 1, row 4 FAIL | `e2e-webkit` cancelled at 2314971 | **Not a code problem**: the 15-min job timeout hit during "Install WebKit", before any test ran. The next push (5d58ea6) ran both jobs green. **Deferred**: the WebKit suite takes 11.7–12.9 min of its 15-min limit (5d58ea6 finished 30 s before the cutoff); raising `timeout-minutes` is a separate one-line PR |

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
| Contract rewritten without agreement | Check cells unchanged since 9b503b6 | FOLLOWED | `git diff 9b503b6..HEAD -- docs/plans/e2e-port-contract.md`: Check cells unchanged; "Ran" notes and Pass/Fail added; row 3's Proof reworded with a `Re-agreed 2026-11-24: #3 … (Zeeshan)` line |

## Tests

- Mobile suite: 799 passed in this worktree and in a second worktree **at the same time** (ports 4888 / 4961), e858f15.
- `bash .claude/verify.sh`: green, 799 passed, at e858f15 and again at fba5e8e (after the fix).
- Port unit test: 6/6 at e858f15, 8/8 at fba5e8e.
- `/shot sweep home`: 31/31 in both worktrees at the same time (ports 5588 / 5661).
- app-check: 28/28 PASS (14 steps × EN/AR), every picture checked against its `expect`.
- After the evaluator fix (5d58ea6): verify.sh green (799), sweep home 31/31, port unit test 8/8, app-check 28/28 with all pictures byte-identical to the checked set; three port-holder types each stop in under a second naming the port.
- CI at 5d58ea6 (run 45358437014): `e2e` 799 passed (4.3m), `e2e-webkit` 794 passed (12.9m), all 8 checks green.
- Not re-reviewed by `code-reviewer` after 5d58ea6 (a two-line config change: `url` → `port`, plus the error echo); the evaluator round 2 re-runs every proof on it.

## Evaluator

### Round 1 — HEAD 2314971 — NOT READY

| # | Check (short) | Verdict | Evidence |
|---|---|---|---|
| 1 | Two checkouts run the full mobile suite at once, both green, each on its own port | PASS | A = this worktree (4888), B = a scratch clone of 2314971 (4611); `npm test` together → A "799 passed (2.9m)" exit 0, B "799 passed (2.9m)" exit 0; `already used` 0× in each log |
| 2 | Port fixed per checkout, differs between checkouts, `E2E_PORT` overrides | PASS | `node --test tests/ci/e2e-port.test.mjs` → 8 pass, 0 fail; read the test: root vs tests/e2e, port.js location not cwd, two roots → two ports in range, overrides, bad values throw, 5000/5060/5061 skipped; row 1's 5-worker runs found their server |
| 3 | Port taken → run stops with an error naming the port; never moves port | FAIL | Holder serving an empty folder: exit 1, 0 tests, only "OSError: [Errno 48] Address already in use / Process from config.webServer was not able to start" — "4888" 0× in the log. B's verify.sh (4611 held) exit 1, "verify: red … port 4611 …". Literal proof (holder serving the checkout root): "Error: http://localhost:4888/commons/ is already used", exit 1, 0 tests. To pass: bare Playwright must name the port whatever holds it, or re-agree the Check |
| 4 | CI as before: full suite on both projects passes | FAIL | At 2314971 (run 45354520531): `e2e` success "799 passed (5.5m)"; `e2e-webkit` cancelled ("The operation was canceled.") during "Install WebKit", 08:15:25 → 08:30:41. fba5e8e had both green and the code is unchanged since, but the Check names the PR's checks and they aren't green at HEAD |
| 5 | Regression: /shot, sweep, verify gate, app-check still work | PASS | /shot hub member en → picture "Jubail Commons, Welcome, Villa 12, See Events, Bookings COMING SOON"; sweep home "31 passed", index "31 with a picture · 0 not passed"; `bash .claude/verify.sh` in B (no cache) exit 0 "799 passed (1.5m)" "verify: green"; app-check 28/28, all 28 pictures opened and matched their `expect`, AR right-to-left |
| 6 | No 4173 hard-coded; five URL assertions use baseURL | PASS | grep printed nothing (exit 1); diff shows the five assertions on `baseURL`; not weakened (`toHaveURL(baseURL)` is exact) |
| 7 | Two sweeps at once, own ports 5000–5699, `SWEEP_PORT` overrides | PASS | Sweep ports A 5588, B 5311; together → A "31 passed (7.5s)" exit 0, B "31 passed (7.4s)" exit 0; `already used` 0× |
| 8 | Live-backend smoke test still works on the new port | HUMAN | Creates a real user on the live project; Zeeshan runs it once on the new port or accepts the inference |

PASS 5 · FAIL 2 · DEFERRED 0 · HUMAN 1 → NOT READY. Notes from the evaluator: B was a scratch clone, not `git worktree add` (it avoided writing into the repo's .git); verify.sh was run in B because this worktree had a cached pass for the diff; its first app-check pass on the 4 hub steps was a bug in its own runner and was re-run once correctly.

### Round 2 — HEAD 337b114 — 7 PASS, 0 FAIL, 1 HUMAN

| # | Check (short) | Verdict | Evidence |
|---|---|---|---|
| 1 | Two checkouts run the full mobile suite at once, both green, each on its own port | PASS | A = this worktree (4888), B = scratch clone of 337b114 (4557); `npm test` together → A "799 passed (2.9m)" exit 0, B "799 passed (2.8m)" exit 0; both logs 12:59:12–13:02:05 (overlapped); `already used` 0× |
| 2 | Port fixed per checkout, differs between checkouts, `E2E_PORT` overrides | PASS | `node --test tests/ci/e2e-port.test.mjs` → pass 8, fail 0; test read: root vs tests/e2e, port.js location not cwd, ranges, overrides, bad values throw, 5000/5060/5061 skipped; row 1's 5-worker runs found their server |
| 3 | Port taken → run stops naming the port, never moves (re-agreed proof) | PASS | 4888 held three ways: (a) repo-root server exit 1 in 0.57 s, (b) empty-folder server exit 1 in 0.53 s, (c) silent socket exit 1 in 0.41 s; each "Error: http://localhost:4888 is already used …", 0 tests. verify.sh (no cache, port held) exit 1, "verify: red (browser tests) — test server port 4888 …" |
| 4 | CI as before: full suite on both projects passes | PASS | `gh pr checks 212` at 337b114: all 8 pass. Run 45360663720: `e2e` "799 passed (5.4m)"; `e2e-webkit` "5 skipped, 794 passed (9.6m)" (the 5 skips are the existing Chromium-only skip in strings-parity.spec.js:59, also on main); matches 45358437014; nothing re-run |
| 5 | Regression: /shot, sweep, verify gate, app-check | PASS | /shot hub member en → picture "Jubail Commons", "Welcome, Villa 12", See Events; sweep home 31 passed, index "31 with a picture · 0 not passed"; verify.sh (no cache) "799 passed (1.5m)" "verify: green"; app-check (main's config) 28/28, all 28 pictures opened and matched, AR right-to-left |
| 6 | No 4173 in tests or tooling; five URL assertions use baseURL | PASS | grep printed nothing (exit 1); the five assertions use `baseURL`; literals → `baseURL + same path`, open-redirect regex → exact `toHaveURL(baseURL)` (stricter) |
| 7 | Two sweeps at once, own ports 5000–5699, `SWEEP_PORT` overrides | PASS | Sweep ports 5588 / 5257 (report.json server commands); together → A "31 passed (7.5s)", B "31 passed (7.5s)", both exit 0; override covered by row 2 |
| 8 | Live-backend smoke test still works on the new port | HUMAN | Needs the live Supabase project; Zeeshan runs it once on this branch or confirms "not run, inferred". **Accepted by Zeeshan: not run, inferred** (2026-11-24) |

Re-agreed rows for Zeeshan to confirm: #3 (Check cells identical to 9b503b6). Possible flakes: none. The evaluator moved the verify cache aside for row 3 and the green run in row 5 wrote it back with the same key.

Evaluator agreed: yes (Zeeshan, 2026-11-24)
