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

EVALUATOR_TABLE

Evaluator agreed: _Zeeshan to answer_
