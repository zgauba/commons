# webkit-timeout — contract
Status: written by the builder under /ship-pr step 2 (no /plan-change: a one-line CI change Zeeshan asked for after PR #212, 2026-11-24)
Plan: none — "open the WebKit timeout PR (15 → 25 min) as a separate small change" (Zeeshan, 2026-11-24)

| # | Check | Proof | Pass/Fail |
|---|---|---|---|
| 1 | The WebKit job's limit is 25 minutes and nothing else in CI changes | `git diff origin/main -- .github/` shows only `timeout-minutes: 15` → `25` (plus one comment line) on the `e2e-webkit` job in `commons-e2e.yml`; the `e2e` job still reads 15. **Ran (2d4101b):** one hunk in `commons-e2e.yml` under `e2e-webkit`: `-    timeout-minutes: 15` / `+    timeout-minutes: 25` and one comment line; `grep -n timeout-minutes` → line 20 (`e2e`) 15, line 50 (`e2e-webkit`) 25 | Pass |
| 2 | The WebKit job runs the full suite under the new limit and passes | This PR's `e2e-webkit` check green on its head; `gh run view <run> --log` shows "794 passed" for the WebKit step. **Ran (2d4101b, run 45372721297):** `e2e-webkit` success, job 10:13:36 → 10:26:54 (13m18s); log "5 skipped", "794 passed (12.6m)" | Pass |
| 3 | Regression: the mobile (`e2e`) job and every other required check are unchanged and green | `gh pr checks 213`: all checks pass; `e2e` log shows "799 passed". **Ran (2d4101b):** all 8 checks pass; `e2e` "799 passed (4.8m)" | Pass |
