# PR4b — contract
Status: agreed 2026-11-23 (Zee: "Approved, with two changes"; diff parser: "Import git+DIFF, own walker")
Plan: /plan-change in session, 2026-11-23 (harness-autonomy-plan PR 4b: repo-rules R9, flaky-test patterns)

| # | Check | Proof | Pass/Fail |
|---|---|---|---|
| 1 | After merge, a PR that adds `await page.waitForTimeout(500)` to a spec fails the required `repo-rules` check on GitHub, with an R9 annotation on that file and line | Throwaway PR (opened, red run linked, then closed unmerged) | |
| 2 | Each pattern is caught on an added line: `waitForTimeout(`, `test.skip(` / `test.fixme(` / `test.describe.skip(` / `describe.skip(`, `retries: 2`, `retries: process.env.CI ? 2 : 0`, `--retries=2` in a workflow; and each near-miss passes: the call named in a comment, inside a string, in a docs file, `retries: 0`, `--retries=0` | `node --test tests/ci/repo-rules.test.mjs` output, one assertion per pattern and near-miss | |
| 3 | The 34 existing sleeps don't fail anyone: a change next to an existing sleep passes; changing the sleep line itself fails | CLI test on a throwaway git repo (base commit with a sleep → head edits the neighbour line: pass; head edits the sleep line: fail) | |
| 4 | R9 fails closed instead of passing silently: an unreadable base, a diff with fewer files than GitHub reports, and a PR `.gitattributes` marking specs `-diff` all end red | CLI tests (same three cases secret-scan already proves for itself) | |
| 5 | Nothing that works today breaks: R1–R8 behave as before; secret-scan's logic is byte-identical (its only change is the word `export` on `git` and `DIFF`) and still finds what it found; this PR is green on all 5 required checks | Existing repo-rules + secret-scan test suites pass unchanged; `git diff main -- tests/ci/secret-scan.mjs` shows export keywords only; PR checks API listing | |
| 6 | Locally, the verify gate catches an uncommitted planted sleep before Claude may finish, and is green once it's removed | Manual `bash .claude/verify.sh` run, red then green, output pasted | |
