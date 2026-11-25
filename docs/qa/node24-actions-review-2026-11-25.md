# node24-actions — review 2026-11-25

PR #214 · branch `ci/node24-actions` · contract `docs/plans/node24-actions-contract.md`
Scope: actions/checkout v4 → v7.0.1, actions/setup-node v4 → v7.1.0, actions/upload-artifact v4 → v7.0.2 (SHA-pinned, all `using: node24`); `node-version` 20 → 24; commons-e2e checkouts `persist-credentials: false`.
Tier: CI / security gates → one tier up: `security-reviewer` + `code-reviewer`, plus the evaluator (tuning run 3).

## Reviewers

| Reviewer | Verdict |
|---|---|
| `security-reviewer` | No Critical / High / Medium. 2 Low |
| `code-reviewer` | YAML correct, no breakage. 2 Important (contract proofs), 2 Nit |

## Findings

| # | From | Severity | Finding | Disposition |
|---|---|---|---|---|
| 1 | code-reviewer | Important | Check 3 (gates) is post-merge, but a throwaway PR with base `ci/node24-actions` could run the new gate workflows before merge | **Tried, disproved.** Probe PR #215 (base `ci/node24-actions`): all five gates ran **main's** copy (old checkout SHA `11d5960…`, Node 20 annotation on secret-scan, repo-rules and design-guard). `pull_request_target` takes the workflow from the default branch whatever the base. Check 3 stays `Post-merge:`. #215 closed, branch deleted |
| 2 | code-reviewer | Important | `e2e-webkit` has `continue-on-error: true`, so "green" proves nothing for check 2 | **Fixed in the proof:** check 2 is proved with each job's step conclusions (WebKit "Run the suite" step), not the check colour |
| 3 | code-reviewer | Nit | Check 4 is a source reading; add a same-repo head-checkout sanity run | **Covered by check 3** (post-merge throwaway is a same-repo PR checking out its head on v7) |
| 4 | code-reviewer | Nit | Check 1 could grep every `actions/*@` | **Accepted:** the check 1 grep lists every `uses:` line; only the three SHAs appear |
| 5 | security-reviewer | Low | commons-e2e checkouts persist the token (default `true`) while running PR code | **Fixed** `e4f1a95`: `persist-credentials: false` on both checkouts (the job never pushes) |
| 6 | security-reviewer | Low | Add `package-manager-cache: false` to the gate setup-node steps so no-cache is explicit | **Accepted, not applied:** the reviewer confirmed from setup-node source that caching reads only `$GITHUB_WORKSPACE/package.json`; the gates check out into `base/` and `pr/`, so it can't trigger. Adding it would be a further unprovable-before-merge change to required gates |
| 7 | security-reviewer | Info | v7 fork guard doesn't fire for a PR from a deleted fork (`head.repo` null) | **Accepted:** the checkout is still the exact `head.sha`, read as data only; no wrong-tree scan |

Security-reviewer also verified: each SHA equals its tag (`git/ref/tags`, lightweight tags); `persist-credentials: false` honoured at v7; the fork refusal throws before any fetch (no fallback to base); same-repo PRs return early and check out `head.sha` as before.

## Tests

- `.claude/verify.sh` (repo-rules R1–R9, design-guard, port unit test): green on `4422085` and `e4f1a95`. No app or e2e files changed, so no local browser specs.
- CI e2e (Chromium + WebKit) on the new action versions: see `## Done when` in the PR.
