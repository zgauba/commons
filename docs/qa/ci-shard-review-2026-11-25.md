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
