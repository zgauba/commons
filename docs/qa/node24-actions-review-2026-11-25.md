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

## Evaluator

### Round 1 — 2026-11-25, HEAD 722339e, contract bc502233

Contract history: added in ae8d0d0; vs HEAD no Check cell changed, no row removed, no Proof weakened (only builder "Ran …" notes and Pass marks appended, ignored). No test/spec files changed on the branch (`git diff --name-only origin/main...HEAD`) → rule 8 has nothing to check. No injection text found in the contract, QA doc or workflow diff.

| # | Check (short) | Verdict | Evidence |
|---|---|---|---|
| 1 | No action targets Node 20; no script runs on Node 20 | PASS | `grep -n "uses:\|node-version" .github/workflows/*.yml`: every `uses:` is `checkout@3d3c42e5…` (v7.0.1), `setup-node@949feb24…` (v7.1.0) or `upload-artifact@cf430e03…` (v7.0.2); all 5 `node-version:` lines read `24`. `gh api repos/<action>/contents/action.yml?ref=<sha>` → `using: node24` (checkout), `using: 'node24'` (setup-node, upload-artifact). `git/matching-refs/tags/v7` confirms each SHA is the stated tag. commons-canary / plan-followed / review-saved use no actions and no setup-node. |
| 2 | commons-e2e (both jobs) green on this PR on the new versions, no Node 20 annotation | PASS | Run 45541324455 (pull_request, e4f1a95) completed/success. `e2e`: suite step success, log "799 passed (4.0m)". `e2e-webkit`: suite step **success** ("Flag the failure" skipped), log "794 passed (9.2m)". setup-node log shows `node: v24.22.3` in both jobs. Annotations API → empty for jobs 138960277174 and 138960277511; `grep "Node.js 20\|node20"` in both job logs → 0. Control: pre-change run 45389322917 returns "Node.js 20 is deprecated…" for both jobs, so the API does surface it. Caveat: e4f1a95 ≠ HEAD; `git diff e4f1a95 HEAD -- .github` is empty (HEAD only adds docs), but HEAD's own run 45542614943 was still in progress at last look. |
| 3 | Post-merge: all five gates on new versions, green, no Node 20 annotation | DEFERRED | Genuinely not runnable before merge: on HEAD, design-guard / secret-scan / repo-rules (jobs 138964502849 / 138964504135 / 138964504358) each carry the "Node.js 20 is deprecated … actions/checkout@11d5960a…" annotation, proving they ran main's copy of the workflow (`git show origin/main:.github/workflows/secret-scan.yml` shows checkout/setup-node v4). To be proved by the post-merge throwaway same-repo PR. |
| 4 | Fork PRs on the 3 head-checkout gates fail closed | PASS | `grep -rn allow-unsafe .github/` → no output (exit 1). checkout action.yml at 3d3c42e5: `allow-unsafe-pr-checkout` … `default: false`. README "What's new" (v7) at that SHA: "checkout now refuses to check out fork pull request code by default when the workflow is triggered by `pull_request_target`". Read `src/unsafe-pr-checkout-helper.ts` at the SHA: returns early for same-repo PRs, throws "Refusing to check out fork pull request code…" when the commit matches `pull_request.head.sha` — the exact `ref: ${{ github.event.pull_request.head.sha }}` all three of secret-scan / repo-rules / design-guard use. Not proved live, as the contract states. |

PASS 3 · FAIL 0 · DEFERRED 1 · HUMAN 0 → READY

Possible flakes: none observed (the known cats.spec CC-5 flake did not appear in run 45541324455). Re-agreed rows for Zeeshan: none.

Builder follow-up on the caveat: HEAD 722339e's run 45542614943 finished **success**; both "Run the suite" steps success.

Evaluator agreed: yes (Zeeshan, 2026-11-25). Tuning run 3 of 5.
