# ci-shard — review (2026-11-25)

**Scope:** `.github/workflows/commons-e2e.yml` (each e2e lane runs as parallel shards; summary jobs keep the `e2e` /
`e2e-webkit` check names; WebKit drops `continue-on-error`; `concurrency` cancels superseded runs) and the Stack
Manifest's CI / CD line + Known Gap 17. Contract: `docs/plans/ci-shard-contract.md`. PR #220.
**Tier:** 3 (CI gate: code + security review, should-fail probe).
**Reviewers:** `code-reviewer`, `security-reviewer` (in parallel, read-only, on 177cc55).

## Why

Commons sessions spent most of their wall time waiting on CI. Measured on run 45586853074: the five gates take
8–22 s; `e2e` (Chromium) ~4.3 min; `e2e-webkit` ~12.5 min (24.1 min of test time on 2 workers, ~2.7× Chromium per
test, no single slow test). Install is 13 s / 27 s, so the lever is parallelism, not tooling.

## Findings and dispositions

| # | Reviewer | Severity | Finding | Disposition |
|---|---|---|---|---|
| C1 | code-reviewer | Medium | Manifest said a WebKit failure "stops the merge", but `e2e-webkit` (like `e2e`) is not a branch-protection required check | **Fixed** (314f27a): "red: `/ship-pr` stops on it and merge-check refuses auto-merge; not a branch-protection required check" |
| C2 | code-reviewer | Low | KG 17 edit left a lowercase sentence fragment | **Fixed** (314f27a) |
| C3 | code-reviewer | Low | More shard jobs + WebKit now red = flakes (known: `cats.spec.js` CC-5, `cats.spec.js:960`, a courts WebKit flake on 5a4584d) will stop PRs | **Accepted**: Zeeshan's decision 2026-11-25 ("webkit goes red on failure"); flakes get fixed, not retried (CLAUDE.md §14) |
| C4 | code-reviewer | Low | `if: failure()` keeps no report when a shard times out or is cancelled | **Deferred**: same as before this change; tracked here. `if: ${{ !success() }}` would cover it |
| C5 | code-reviewer | Low | No in-workflow guard on per-shard test counts | **Accepted**: the total comes from `strategy.job-total` (no hand-typed count to drift); contract row 2 proves 807 per lane |
| S1 | security-reviewer | Low | A PR can edit this `pull_request` workflow to fake a green `e2e` | **Accepted, not new**: auto-merge hard-denies `.github/`; a human reads the diff |
| S2 | security-reviewer | Low | Failure artifacts (WebKit traces of the stubbed app) are public for 7 days | **Accepted, not new**: stubbed backend, no secrets in the workflow |

Security reviewer, also verified: no expression injection (`$SHARD` / `$RESULT` via `env:`), permissions unchanged
(`contents: read`, `persist-credentials: false`), action SHAs unchanged, concurrency group per PR number (no cross-PR
or fork cancellation), shard check names can't collide with `e2e` / `e2e-webkit` (merge-check matches exact names),
and removing `continue-on-error` closes a real false-green: a failed WebKit run used to report `success`, which
merge-check would have counted.

## Test counts

| Run | Chromium | WebKit | Wall time |
|---|---|---|---|
| Baseline 45586853074 (981fa3d, before) | 807 passed | 802 passed, 5 skipped | 13m08s |
| 45590028239 attempt 1 (177cc55) | 404 + 403 = 807 passed | 269 + 269 + 264 = 802 passed, 5 skipped | **5m11s** |
| 45590028239 attempt 2 (177cc55) | 404 + 403 = 807 passed | 269 + 269 + 264 = 802 passed, 5 skipped | **5m06s** |
| Throwaway #221, run 45590480172 (planted failure) | shard 2: 1 failed (`zz-gate-probe.spec.js:4`) | shard 3: 1 failed (same) | 5m48s |

Local: shard lists sum to 807 per lane (`--list`, mobile 404 + 403, webkit 269 × 3); `repo-rules` OK (R1–R9).

## Evaluator

### Round 1 (HEAD e30f513, contract 0ef50669): NOT READY

| # | Check (short) | Verdict | Evidence (summary of the evaluator's cell) |
|---|---|---|---|
| 1 | ≤ 7 min on two separate runs | FAIL | Only one run ID (45590028239); attempt 2 was a re-run of the same run, not a second run |
| 2 | No test dropped, totals match baseline (799 / 794+5 as written) | FAIL | Run matches baseline run 45586853074 (807; 802+5) but not the figures in the Check cell; no `Re-agreed` line |
| 3 | One `e2e` + one `e2e-webkit`, green only when all shards pass | PASS | `gh pr checks 220`; probe run 45590480172 red side |
| 4 | Planted failure → both red, artifact kept | PASS | #221: only `e2e shard 2` / `e2e-webkit shard 3` failed at `zz-gate-probe.spec.js:4:1`; artifacts present; closed, branch 404 |
| 5 | Second push cancels older run | PASS | 45590409732 cancelled ("higher priority waiting request for commons-e2e-221"); 45590480172 completed |
| 6 | Nothing else in CI changes | PASS | only `commons-e2e.yml` under `.github/`; permissions kept; 5 gates pass |
| 7 | Manifest describes the new shape | PASS | `docs/architecture.md:166` |

`EVALUATOR: NOT READY head=e30f513f2db6353373bf27e2d9a1a17f81ec712f contract=0ef50669`

Fixes: #1, pushed e30f513 for a genuinely separate run (45593170662, 5m25s). #2, Zeeshan re-agreed the figures (807 / 802+5, the named baseline run's own figures; `Re-agreed 2026-11-25: #2`). The builder agreed with both FAILs.

### Round 2 (HEAD d54b41f, contract 148a22f9): READY

| # | Check (short) | Verdict | Evidence |
|---|---|---|---|
| 1 | Commons e2e on this PR finishes in ≤ 7 min, on two separate runs | PASS | `gh api .../runs/45590028239/attempts/1`: pull_request, 177cc55, success, 09:55:33→10:00:44 = 5m11s; `gh run view 45593170662`: pull_request, e30f513, attempt 1, success, 10:15:09→10:20:34 = 5m25s. Two separate runs, both completed/success, both under 7 min (baseline 45586853074: 09:35:30→09:48:38 = 13m08s) |
| 2 | (Re-agreed) Shard counts sum to 807; Chromium 807 passed, WebKit 802 passed + 5 skipped, matching baseline | PASS | `gh run view 45590028239 --attempt 1 --log`: Chromium "Running 404 … shard 1 of 2" + "Running 403 … shard 2 of 2" = 807; "404 passed" + "403 passed" = 807. WebKit 3 × "Running 269" = 807; 269 + 269 + 264 passed = 802, plus "5 skipped". Baseline 45586853074: "Running 807" both lanes, "807 passed", "802 passed", "5 skipped": identical. Run 45593170662 gives the same counts |
| 3 | Exactly one `e2e` and one `e2e-webkit` check; each green only when all its shards passed | PASS | `gh pr checks 220` (head e30f513): one `e2e` pass, one `e2e-webkit` pass, plus `e2e shard 1–2` and `e2e-webkit shard 1–3` all pass. Summary jobs: `needs: <lane>-shard`, `if: always()`, `[ "$RESULT" = success ] \|\| exit 1`. Red side proved by row 4; the cancelled run in row 5 also turned both summaries to failure ("a Chromium shard did not pass (cancelled)") |
| 4 | Planted failure on a throwaway PR → `e2e` and `e2e-webkit` red; failing shard keeps its report | PASS | `gh pr checks 221`: `e2e` fail, `e2e-webkit` fail, `e2e shard 2` fail, `e2e-webkit shard 3` fail, other shards pass. Compare 177cc55...2c86151: 2 ahead, 0 behind; only file added is `tests/e2e/specs/zz-gate-probe.spec.js` (`expect(1).toBe(2)`). Failed logs: "✘ … specs/zz-gate-probe.spec.js:4:1 › gate-probe: planted failure", "1 failed" in both failing shards. Artifacts on run 45590480172: `playwright-results-2`, `playwright-webkit-results-3`. PR 221 CLOSED, mergedAt null; branch `probe/e2e-shard-fail` 404 |
| 5 | A second push while e2e runs cancels the older run; the newer one completes | PASS | `gh run list --workflow commons-e2e.yml --branch probe/e2e-shard-fail`: 45590409732 (3056137) `cancelled`; 45590480172 (2c86151) `completed`, all jobs completed. Cancelled run's shard annotations: "Canceling since a higher priority waiting request for commons-e2e-221 exists" (×5), so the concurrency group did it. The Proof cell names `success` for the newer run, but on the probe branch it is `failure` because it carries the planted test; the contract allows the probe branch and the Check asks only for "runs to completion" |
| 6 | Only `commons-e2e.yml` changes under `.github/`; `contents: read`, `persist-credentials: false`, `pull_request` kept; other five gates pass | PASS | `git diff origin/main HEAD --stat -- .github/` → only `commons-e2e.yml` (64+, 18−). grep → `pull_request:` l.12, `contents: read` l.20, `persist-credentials: false` l.42 and l.93. `on:` untouched (pull_request + paths, workflow_dispatch already on main), no `pull_request_target`. `gh pr checks 220`: review-saved, plan-followed, design-guard, secret-scan, repo-rules pass (on pushed head e30f513; local HEAD d54b41f differs only in the contract file) |
| 7 | Stack Manifest's CI/CD line describes the new shape | PASS | `grep -n shard docs/architecture.md` → l.166 under "## LAYER — CI / CD (whole repo)" (l.161): shards `e2e shard 1–2` / `e2e-webkit shard 1–3`, kept check names `e2e` / `e2e-webkit` (green only when every shard passed), "a WebKit failure is red", the `concurrency` cancel, per-shard artifacts; KG 17 (l.203) updated |

PASS 7 · FAIL 0 · DEFERRED 0 · HUMAN 0 → READY. Re-agreed rows for Zeeshan to confirm: #2.

Evaluator agreed: asked at /ship-pr step 6 (tuning record).

## Merge evidence
TIER: 3
EVALUATOR: READY head=d54b41f53689b1abf0563a92cb64d6aba9eaa3eb contract=148a22f9
CODE-REVIEW: critical=0 high=0 head=177cc55641f40256a37c4629d948067c6777a78d
