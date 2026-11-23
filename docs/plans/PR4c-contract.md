# PR4c — contract
Status: agreed 2026-11-23 (Zee: "approve, do what you think is the right way to do it" — local hook parser left as is, DEPART recorded)
Plan: /plan-change in session, 2026-11-23 (secret-scan follow-up from harness-autonomy-plan decision log; shared diff parser)

| # | Check | Proof | Pass/Fail |
|---|---|---|---|
| 1 | A fake key added in a file whose name git quotes (`a"b.js`, a name with a tab) is reported by secret-scan under its real name, not `"b/a\"b.js"` | CLI test in `secret-scan.test.mjs` on a real temp git repo: annotation `file=a"b.js` | |
| 2 | `secret-scan:allow` is honoured on a quoted-name test file (`tests/e2e/a"b.spec.js`) and still refused on a quoted-name non-test file (`commons/a"b.js`) | Unit tests in `secret-scan.test.mjs` | |
| 3 | Regression: R9 still fails a sleep added in `tests/e2e/a"b.spec.js`, and every existing tests/ci test still passes | `node --test tests/ci/*.test.mjs`: all green, count ≥ 62; existing R9 quoted-name test unchanged | |
| 4 | A diff git can't read (unknown base sha) fails secret-scan closed, and git's own error text is not echoed raw into the CI log | CLI test: exit 1, output is only the `::error::secret-scan could not read the PR diff` line | |
| 5 | Zero-output guard: the shared parser returns every added line of a multi-file diff (none dropped by the refactor) | Unit test: 3 files, 5 added lines → 5 entries with correct file + line | |
| 6 | Post-merge: a throwaway PR adding a fake key in a quoted-name file fails the live `secret-scan` check with the real file name in the annotation | Throwaway PR run link, closed unmerged (post-merge: CI runs main's copy, so this can only be filled after merge) | |
