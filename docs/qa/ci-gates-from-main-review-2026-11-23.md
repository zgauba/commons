# CI gates read from main + CI secret scan — review (2026-11-23)

Change: harness-autonomy-plan PR 3a (the CI halves of A1 and A4). Branch `ci-gates-from-main`.
Reviewers: `security-reviewer` and `code-reviewer` (run in parallel on the first draft), then `security-reviewer` re-verified the fixes.

## What changed

- `review-saved`, `plan-followed` and `design-guard` run on `pull_request_target`. GitHub uses main's copy of the workflow, so a PR can't pass a gate by editing it. All three use read-only tokens and no secrets, and nothing from the PR runs.
- `design-guard`:
  - It runs main's copy of the guard from `./base` against the PR, which is checked out as data in `./pr`.
  - `design-guard.mjs` gains a `--root` option.
  - It refuses symlinks under `commons/`.
- New `secret-scan` workflow and `tests/ci/secret-scan.mjs`:
  - It uses the same patterns as the local git-guard scan. `tests/ci/secret-patterns.cjs` is a byte copy, and a drift test in claude-config checks the two stay identical.
  - It scans the net diff and every commit.
  - It fails closed when it can't read the diff, or when it sees fewer files than GitHub reports for the PR.
- `.claude/protect-main` opts this repo into the local main-branch guard, which runs in observe mode.

## Findings

| # | Source | Severity | Finding | Outcome |
|---|---|---|---|---|
| S1 | security | CRITICAL | A PR could commit `tests/ci/design-guard.mjs` as a symlink. `cp` then wrote main's guard code through the link, and the entry check (`argv[1]` vs the realpath'd `import.meta.url`) failed, so the guard exited 0 without checking anything. Reproduced locally. | **Fixed.** The PR goes in `./pr` and main's guard in `./base`, with nothing copied over PR files. The entry check compares realpaths. Test: "run through a symlinked script path, the guard still runs". |
| S2 | security | HIGH | A NUL byte in a file, or a PR `.gitattributes` with `* -diff`, made git print "Binary files differ". No added lines meant "no secrets found". Reproduced locally. | **Fixed.** The diff uses `-a`, with no system or global git config or attributes. Tests: the NUL-byte case and the `* -diff` case. |
| S3 | security | MEDIUM | `secret-scan:allow` let a PR wave its own finding through. | **Fixed.** First pass: the marker counted anywhere under `tests/`. The re-check found that still let a real key in `tests/f.txt` through, so it now counts only in test files (`tests/**/*.test.*` and `*.spec.*`). Nothing in the repo used the marker. Test: "allow outside a test file does not hide a finding" covers `commons/`, `tests/f.txt` and a fixtures `.js`. |
| S4 / C3 | both | MEDIUM | Only the net diff was scanned. A key added and then removed inside the PR is still in public history. | **Fixed.** It also scans every non-merge commit (`git log -p`), and `.env` names in every commit. Tests: the added-then-removed key case and the added-then-deleted `.env` case. |
| S5 | security | MEDIUM | The base checkout went into a path the PR could control: a symlinked `base` directory. | **Fixed** by the `./pr` + `./base` layout. |
| S6 | security | LOW | Untested: whether a fork PR's `head.sha` with `fetch-depth: 0` checks out. | **Deferred.** It fails closed, not open, and this is a solo repo. Verify on the first fork PR. |
| S7 / C1 | both | HIGH (process) | This PR can't get runs of the three switched checks. `pull_request` reads the PR's file, which now says `_target`; `pull_request_target` reads main's file, which still says `pull_request`. | **Planned.** One-time branch-protection change at merge: drop the required contexts, merge, then require all four (`review-saved`, `plan-followed`, `design-guard`, `secret-scan`). Never `--admin`. |
| S8 | security | LOW | A PR targeting a stale branch runs that branch's old workflows. | **Accepted.** Only `main` is used and protected. |
| S9 | security | LOW | A PR-controlled path inside `::error file=…` could garble the annotation. | **Fixed.** `, : %` and newlines are replaced. Test: "annotation-breaking file name is neutralised". |
| S10 | security | LOW | design-guard skips `vendor/` and `node_modules/`, and it only reads `.css` files. | **Pre-existing**, unchanged. |
| C2 | code | MEDIUM | design-guard now checks the PR head, not a merge with main. A PR that branched before main lowered the baseline reports "baseline grew". | **Documented** in the workflow header. The fix is to merge main into the PR branch. Accepted as the stricter behaviour. |
| C4 | code | LOW | Retargeting a PR to a new base didn't re-run the scan. | **Fixed.** `edited` is added to the secret-scan triggers. |
| C5 | code | LOW | No `core.quotePath=false`, so non-ASCII paths came out escaped. | **Fixed.** |
| C6 | code | LOW | "Don't commit the empty `.claude/protect-main`." | **Kept.** It's the planned per-repo opt-in marker for the local main-branch guard (plan decision 2026-11-20). |
| C7 | code | LOW | No rename or binary tests. | **Partly fixed.** Binary is covered (S2). Renames aren't tested: `--no-renames` makes a rename a delete plus an add, and the add is scanned. |

## Verification

- `node --test tests/ci/*.test.mjs`: 31/31 pass. Each security fix was mutation-checked by removing the fix, and its test then failed:
  - without `-a`: the NUL and `-diff` tests fail;
  - without the per-commit scan: the added-then-removed test fails;
  - with the allow marker honoured everywhere: the allow test fails;
  - with the old entry check: the symlinked-script test fails.
- The local simulation of the CI layout (`./base` + `./pr`) passes on main's CSS. A bare `select` added to a module fails with an annotation.
- claude-config drift test: it passes against this branch and fails after a one-byte change. It skips with the reason shown when the repo is absent.
- Re-verification by `security-reviewer`: S1, S2, S4 and S5 **fixed**. S3 was **partial** (the `tests/` scope) and is now tightened as above. No new HIGH or CRITICAL.
- Known limits from the re-check, accepted:
  - A key in UTF-16, base64 or compressed content isn't found, because the regexes read text.
  - A diff over 256 MB fails closed.
  - A fork PR's checkout is untested live (it fails closed).
- The whole history of main (459 files) scans clean under the stricter rules, so PRs that merge main in won't trip on old content.
- Live proofs come after the merge (Done-when 1–4): throwaway PRs that edit a gate, add a fake key, and change docs only.
