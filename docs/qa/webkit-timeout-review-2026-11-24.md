# webkit-timeout review — 2026-11-24

**Scope:** PR #213, branch `ci/webkit-timeout`. Raises the `e2e-webkit` job's `timeout-minutes` from 15 to 25 in `.github/workflows/commons-e2e.yml` (plus one comment line). Nothing else.
**Tier:** 1 (CI config value: no app, test or data change). No reviewer agent; this note instead.
**Evaluator:** `evaluator` agent, ship-pr step 2b (tuning run 2).
**Contract:** [docs/plans/webkit-timeout-contract.md](../plans/webkit-timeout-contract.md) (no /plan-change; checks written under ship-pr step 2).

## Why

The WebKit suite alone takes 11.7–12.9 min. On PR #212, run 45358437014 finished 30 s inside the 15-min limit. Run 45354520531 was cancelled by the limit while installing WebKit, before any test ran. 25 min leaves room for a slow install without letting a real hang run for long.

## Findings

None: one value and one comment. Secret-shape grep of the diff: no hits.

## Tests

- No local test applies: the change only takes effect in GitHub Actions.
- CI at 2d4101b (run 45372721297): `e2e` 799 passed (4.8m); `e2e-webkit` 794 passed + 5 skipped (12.6m), job 13m18s; all 8 checks green.

## Plan conformance

No plan: one-line CI timeout change, agreed with Zeeshan after PR #212.

## Evaluator

### Round 1 — HEAD 585c830 — READY (3 PASS, 0 FAIL, 0 DEFERRED, 0 HUMAN)

| # | Check (short) | Verdict | Evidence |
|---|---|---|---|
| 1 | WebKit job limit is 25 min; nothing else in CI changes | PASS | `git diff origin/main...HEAD -- .github/` → one hunk in `commons-e2e.yml` under `e2e-webkit:`: `-    timeout-minutes: 15` / `+    timeout-minutes: 25` + one comment line; no other `.github/` file. `grep -n timeout-minutes` on the branch: line 20 (`e2e`) 15, line 50 (`e2e-webkit`) 25; on origin/main both 15 |
| 2 | WebKit job runs the full suite under the new limit and passes | PASS | Run 45375069294 (head 585c830): `e2e-webkit` success, 10:28:10 → 10:38:23 (10m13s); step "Run the suite (WebKit project)" success; "Flag the failure (continue-on-error…)" skipped, so the green isn't continue-on-error hiding a failure. Log: "794 passed (9.4m)", "5 skipped" |
| 3 | Regression: `e2e` and every other required check unchanged and green | PASS | `gh pr checks 213`: all 8 pass; `e2e` log "799 passed (5.6m)" |

Proofs run once each. Possible flakes: none. Re-agreed rows: none. Contract Check cells unchanged since 2d4101b; only "Ran" text and Pass/Fail added. The evaluator's `gh run watch` dropped on a network error and its first log download failed; it re-read the same finished run (not a re-run).

Evaluator agreed: yes (Zeeshan, 2026-11-24)
