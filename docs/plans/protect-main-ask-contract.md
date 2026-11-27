# protect-main-ask: contract

Agreed 2026-11-27 (Zeeshan's brief). Commons main should prompt, not hard-block, so live-event-day
hotfixes stay possible. The harness hook `git-guard.protect-main` (claude-config 63022a6 + 080005c) keeps the prompt only
when the first non-blank, non-`#` line of `.claude/protect-main` is exactly `ask`, read from **origin/main and local
main**, never from the branch or the working tree.

Tier 1 (cosmetic): one config file, no app code, no data.

| # | Check | Proof | Pass/Fail |
|---|---|---|---|
| 1 | The branch's `.claude/protect-main` has exactly `ask` as its first non-blank, non-comment line | `git show HEAD:.claude/protect-main \| grep -v '^[[:space:]]*#' \| grep -v '^[[:space:]]*$' \| head -1` prints `ask` | |
| 2 | Baseline: before the merge, a commit on Commons main is blocked | smoke command (below) on main before the merge: exit=2 + block message | |
| 3 | Required CI checks are green on the PR | `gh pr checks <n>` all pass | |
| 4 | Post-merge: PR merged with `ask` as the first non-comment line on main | PR link + `git show origin/main:.claude/protect-main` | |
| 5 | Post-merge: local main matches origin/main in ~/code/commons | `git status -sb` on main shows no ahead/behind | |
| 6 | Post-merge: a commit on main prompts, not blocks | smoke command from ~/code/commons on main: exit=0, `"permissionDecision":"ask"`, `(.claude/protect-main says ask)` | |

Smoke command:

```sh
printf '{"session_id":"smoke","tool_name":"Bash","tool_input":{"command":"git commit -m x"},"cwd":"%s"}' "$PWD" | node ~/.claude/scripts/hooks/git-guard.js; echo "exit=$?"
```
