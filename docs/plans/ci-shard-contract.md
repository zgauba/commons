# ci-shard — contract
Status: agreed 2026-11-25 (Zeeshan: "approved, webkit goes red on failure")
Plan: /plan-change in session, 2026-11-25 (shard Commons e2e; WebKit result made honest; cancel superseded runs)

Baseline (before): run 45586853074 on 981fa3d took 13m08s from start to finish; both lanes "Running 807 tests using 2 workers"; `e2e` 4.3 min, `e2e-webkit` ~12.5 min.

| # | Check | Proof | Pass/Fail |
|---|---|---|---|
| 1 | The Commons e2e workflow on this PR finishes in **≤ 7 minutes** from start to finish (baseline 12–13 min), on two separate runs | `gh run view <run> --json createdAt,updatedAt` for two `pull_request` runs of `Commons e2e` on this PR, both completed / success | |
| 2 | No test is dropped: across each lane's shards, the "Running N tests" counts add up to 807, and the passed + skipped totals match the baseline run (Chromium 799 passed; WebKit 794 passed + 5 skipped, the existing Chromium-only skip) | `gh run view <run> --log`: grep "Running .* tests" and the summary lines per shard job, summed, next to the baseline run 45586853074 | |
| 3 | The PR still shows exactly one `e2e` check and one `e2e-webkit` check, and each is green only when **all** its shards passed | `gh pr checks <PR>` on this PR (both names present, success); plus row 4's probe (both red) | |
| 4 | A failing test turns the checks red. A throwaway PR based on this branch with one planted failing assertion in a spec → `e2e` **failure** and `e2e-webkit` **failure** (WebKit no longer shows green on a failure), and the failing shard keeps its Playwright report as a run artifact | `/gate-probe` should-fail probe: `gh pr checks <probe>` conclusions + `gh api repos/zgauba/zgauba.github.io/actions/runs/<run>/artifacts` lists a `playwright-*-results-<shard>` artifact; probe PR closed and branch deleted afterwards | |
| 5 | A second push to the same PR while e2e is running cancels the older run; the newer one runs to completion | `gh run list --workflow commons-e2e.yml --branch <branch>`: the older sha `cancelled`, the newer `success` (probe branch or this PR) | |
| 6 | Nothing else in CI changes: the diff under `.github/` touches only `commons-e2e.yml`; permissions stay `contents: read`, `persist-credentials: false`, trigger stays `pull_request`; the other five gates run and pass on this PR | `git diff origin/main --stat -- .github/`; `grep -n "permissions\|persist-credentials\|pull_request" .github/workflows/commons-e2e.yml`; `gh pr checks <PR>` shows review-saved, plan-followed, design-guard, secret-scan, repo-rules success | |
| 7 | The Stack Manifest's CI/CD line describes the new shape (shards, check names kept, WebKit red on failure, cancel-in-progress) | `grep -n "shard" docs/architecture.md` in the CI / CD layer | |
