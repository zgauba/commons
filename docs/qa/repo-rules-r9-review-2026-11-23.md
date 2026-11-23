# Review — repo-rules R9 (harness PR 4b) — 2026-11-23

Scope: `tests/ci/repo-rules.mjs` (R9 + diff mode), `tests/ci/repo-rules.test.mjs`, `tests/ci/secret-scan.mjs` (`export` on `git` and `DIFF` only), `.github/workflows/repo-rules.yml` (full-depth PR checkout, `--base` / `--expect-files`), `.claude/verify.sh` (comment), `docs/architecture.md`, `docs/plans/PR4b-contract.md`.
Tier: CI gate → `code-reviewer` + `security-reviewer` (both run in parallel on `84c00cd`).

## Findings and disposition

| # | Source | Sev | Finding | Disposition |
|---|---|---|---|---|
| 1 | code + security | MEDIUM | `addedLines` dropped files whose names git C-quotes (`+++ "b/a\"b.spec.js"`): R9 passed green with the file unread; `--expect-files` couldn't see it | **Fixed**: `unquote()` (C escapes incl. octal UTF-8 bytes); unit test + CLI test with a real `a"b.spec.js` |
| 2 | code + security | MEDIUM (sec) / LOW (code) | `codeOnly` blanked any line starting with `/*` or `*`, so `/* eslint-disable */ await page.waitForTimeout(1)` and `*/ code` passed | **Fixed**: `/* … */` handled by position; a `*`-line is blanked only up to its `*/`; tests for all three shapes |
| 3 | security | LOW | A lone `\r` / U+2028 / U+2029 ends a `//` comment in JS but not in `split('\n')` | **Fixed**: each JS line piece is blanked separately; tests |
| 4 | code + security | LOW | `page['waitForTimeout'](3)`, `{'retries': 2}`, `retries` on the next line, `test['skip']()` pass | **Accepted**: deliberate evasion, not honest mistakes; R9 is a lint like R3–R8 (header says so) |
| 5 | security | LOW/INFO | secret-scan's `git()` inherits git's stderr unescaped (theoretical `::` workflow-command line) | **Deferred**: secret-scan logic stays byte-identical in this PR (Zee); separate secret-scan follow-up, with #6 |
| 6 | this review | MEDIUM (pre-existing) | secret-scan's own `scanDiff` has the same quoted-file-name gap as #1: a secret in `a"b.js` isn't scanned | **Deferred** to the same secret-scan follow-up (not changed here, by decision) |
| 7 | security | LOW | CI branch doesn't check `pr` is the git toplevel | **Accepted**: no parent repo in the runner workspace, so git errors and R9 fails closed |
| 8 | security | LOW | Local mode without `origin/main` reads uncommitted changes only | **Accepted**: printed note; CI is the gate (same as verify.sh) |
| 9 | code | LOW | Two existing conditional skips (`smoke/real-backend.smoke.js:20`, `specs/strings-parity.spec.js:59`) will fail R9 if edited | **Accepted** (no allow marker, by decision); stated in the PR body |

No code execution, argument or annotation injection found (security areas 1–6 clean).

## Plan conformance

| Plan row | Plan said | Result | Evidence |
|---|---|---|---|
| Rule entry, error format, escaping | REUSE | FOLLOWED | R9 violations use `{rule,file,line,msg}` and the existing `prop()`/`data()` emit |
| `git()` + `DIFF` | REUSE by import; secret-scan byte-identical | FOLLOWED | `repo-rules.mjs` imports both; secret-scan diff = 2 lines, `export` only |
| Added-lines walker | DEPART (agreed) | FOLLOWED | own `addedLines`, comment states why |
| `--expect-files` guard | REUSE | FOLLOWED | same flag; CLI test "fails closed" |
| Local base rule | REUSE (verify.sh L27-29) | FOLLOWED | `readAdded` local branch |
| Comment blanking | EXTEND `noJsComments` to blank strings | **NOT FOLLOWED → DEPART proposed** | New per-line `codeOnly`. Reason: `noJsComments` serves R8, which must still READ strings ("Soccer" lives in string literals); blanking strings there would blind R8. R9 also works per diff line, not per file. **DEPART accepted by Zee 2026-11-23 ("accept")** |
| `page.clock` in message | REUSE | FOLLOWED | R9 sleep message |
| No allow marker | decided | FOLLOWED | none exists |
| Screens to match | No screen changes | FOLLOWED | no UI files |
| Contract | no rewritten Check cells | FOLLOWED | `git diff a05f145..HEAD -- docs/plans/PR4b-contract.md`: Proof / Pass cells only |

## Tests

- `node --test tests/ci/*.test.mjs`: **62/62** (repo-rules 26, secret-scan + design-guard + affected-specs 36), after fixes.
- Mutation runs (before fixes): dropping `-a` → the `-diff` test fails; disabling the file-count guard → the fail-closed test fails.
- `bash .claude/verify.sh`: red on a planted untracked sleep (`zz-planted.spec.js,line=3`), green once removed; no browser specs selected (no app / e2e files changed).
