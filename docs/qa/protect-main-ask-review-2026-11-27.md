# protect-main-ask review: 2026-11-27

**Scope:** PR #7. `.claude/protect-main` is set to the `ask` override (a comment line plus `ask`), with contract
`docs/plans/protect-main-ask-contract.md`. There's no app code, no data and no screens.

**Tier:** 1 (cosmetic). No reviewer agent; this note stands in for one.

**Tests:** The local suite wasn't run, because nothing under `commons/`, `supabase/` or `tests/` changed and so no spec
can be affected. On CI, all 6 checks passed at 76d6eed (Cloudflare Pages, design-guard, plan-followed, repo-rules,
review-saved, secret-scan).

**Screenshots:** none (no screen changes).

**Findings:** none.

**Note:** the override only works once both origin/main and local main carry it. Until local main in ~/code/commons is
pulled after the merge, a commit on main is still blocked (contract rows 5–6).

## Evaluator

## Evaluator — protect-main-ask, round 1 (final), 2026-11-27, HEAD 76d6eed, contract 4f43967e

| # | Check (short) | Verdict | Evidence |
|---|---|---|---|
| 1 | Branch `.claude/protect-main` first non-blank, non-comment line is exactly `ask` | PASS | `git show HEAD:.claude/protect-main \| grep -v '^[[:space:]]*#' \| grep -v '^[[:space:]]*$' \| head -1` printed `ask`. The full file is one comment line followed by `ask`. |
| 2 | Baseline: before merge, a commit on Commons main is blocked | PASS | I ran the smoke command from /Users/zeegauba/code/commons on branch `main` (main = origin/main = ffa3fbd, `## main...origin/main`, and origin/main's `.claude/protect-main` is empty, 0 bytes). Output: `git-guard: this would land on main in commons, which is protected (.claude/protect-main). …` and `exit=2` |
| 3 | Required CI checks green on the PR | PASS | `gh pr checks 7` gave rc=0. All 6 checks pass: Cloudflare Pages, design-guard, plan-followed, repo-rules, review-saved, secret-scan. `gh run list` shows all 5 Actions runs `completed/success` with headSha 76d6eed17fbb…, which is the judged HEAD itself, so the ancestor check is trivial and the diff is empty. Nothing is queued or running. |
| 4 | Post-merge: PR merged with `ask` first on origin/main | DEFERRED | PR #7 is still OPEN and origin/main's file is still empty, so this can't be proved before merge |
| 5 | Post-merge: local main in ~/code/commons matches origin/main | DEFERRED | This needs the merge plus a pull. Before merge it would only show the old state. |
| 6 | Post-merge: a commit on main prompts (exit=0, `"permissionDecision":"ask"`) | DEFERRED | The hook reads `.claude/protect-main` from origin/main and local main, and both still have the empty file (row 2 shows the block). This can't be proved before merge. |

PASS 3 · FAIL 0 · DEFERRED 3 · HUMAN 0 · CI-LATER 0 → READY

Evaluator agreed: (Zeeshan to confirm)

## Merge evidence
TIER: 1
EVALUATOR: READY head=76d6eed17fbbba4a466bb2fa8e15559b16bbe00a contract=4f43967e
