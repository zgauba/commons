# Review — shared diff parser for secret-scan and R9 (PR4c), 2026-11-23

Reviewers: `security-reviewer`, `code-reviewer` (tier 3: a required CI security check).
Scope: `tests/ci/secret-scan.mjs`, `tests/ci/repo-rules.mjs`, `tests/ci/secret-scan.test.mjs`, `tests/ci/repo-rules.test.mjs`, `docs/plans/PR4c-contract.md`.
Contract: `docs/plans/PR4c-contract.md` (agreed `d72ac07`, unchanged since apart from Proof / Pass-Fail).

## Premise corrected during planning

The follow-up (`docs/qa/repo-rules-r9-review-2026-11-23.md` #6) said a secret in a C-quoted file name (`a"b.js`) is not scanned. Probed before planning: **it is scanned**, by both the CI scan and the local git-guard hook (blocked, exit 2). The quoted name only garbled the reported file name (`"b/a\"b.js"`), and stopped `secret-scan:allow` from being honoured on a quoted-name test file (fail-closed). Severity: LOW, not a bypass. R9 differed because its scope depends on the file name.

## Findings

| # | Reviewer | Severity | Finding | Disposition |
|---|---|---|---|---|
| B1 | build | MEDIUM (pre-existing) | R9's `unquote()` kept the closing quote + tab when git quotes a name that also holds a space (`+++ "b/x y\"z.spec.js"<TAB>`), so such a spec fell out of R9's scope | **Fixed**: the shared parser strips the trailing tab before unquoting; test `R9: a quoted name that also holds a space …` (fails on main) |
| S1 | security | MEDIUM (pre-existing) | R9's `TEST_CODE` / `RETRY_CLI` use `.`, which skips `\n`: a spec or `package.json` with a newline in its name dropped out of R9 | **Fixed**: `s` flag on both; test `R9: a file name holding a newline is still in scope` (fails before the fix). Names with a trailing newline still fall outside `$` (Playwright's own testMatch doesn't match them either) — accepted |
| S2 | security | LOW | `unquote()` decoded per UTF-16 unit, so an emoji in a name was reported as `��` (display only; scope/allow unaffected) | **Fixed**: decode by code point; test `unquote keeps characters outside the BMP` (fails before the fix) |
| C1 | code | Nit / plan row NOT FOLLOWED | New `oneLine` duplicated repo-rules' `data()` escaper | **Fixed**: `data` moved to secret-scan.mjs and imported by repo-rules; `oneLine` removed |
| — | security | — | Not findings (attempted): 16 hostile names incl. quotes, tabs, newline, `\x7f`, invalid UTF-8, fake `+++`/`@@`/`diff --git` inside hunks, `* -diff`, NUL, CRLF, symlink, submodule, mode-only — every key reported. Allow marker not widened by any crafted name. No workflow-command injection via `--base`/`--head`/names. Every git failure exits 1 | — |

**Addendum (same day, Zee: "go ahead, fix the duplication"):** the local-hook DEPART was reversed. The parser now lives in `~/.claude/scripts/hooks/lib/diff-lines.js` (claude-config) and is byte-copied to `tests/ci/diff-lines.cjs`, the same pattern as `secret-patterns`. `secret-scan.mjs` loads and re-exports it, and git-guard's `parseDiff` is rebuilt on it. A drift test (`mirror-drift.test.js`, formerly `secret-patterns-drift.test.js`) covers both pairs. The moved code is the reviewed code verbatim, so it was not re-reviewed. git-guard's `parseDiff` is now a 6-line wrapper, covered by a new hook test that fails on the old hook.

## Plan conformance

| Plan row | Plan said | FOLLOWED / NOT FOLLOWED | Evidence |
|---|---|---|---|
| Diff → added lines | EXTRACT into secret-scan.mjs, no new file → superseded by Re-agreed #7: a mirror file `tests/ci/diff-lines.cjs` | FOLLOWED | repo-rules copies deleted (`addedLines` is a filter wrapper); the parser is `diff-lines.cjs`, re-exported by secret-scan.mjs |
| Secret finding | REUSE `scanDiff` on the shared parser | FOLLOWED | `scanDiff` loops over `addedLines()`, same output shape |
| Error-text escaping | REUSE `data()` | FOLLOWED (after C1 fix) | `data` exported from secret-scan.mjs, imported by repo-rules; secret-scan's error line uses it |
| Local hook parser | DEPART: left as is → reversed (Re-agreed, contract #7) | FOLLOWED | git-guard.js uses `lib/diff-lines.js`; byte copy `tests/ci/diff-lines.cjs`, drift-tested |

## Tests

- `node --test tests/ci/*.test.mjs`: **69/69**, two runs, identical.
- Every new test was run against the code it guards against: the 6 from the first commit fail on main's code; the 2 from the review fixes fail on the first commit.
- `bash .claude/verify.sh`: green (R1–R9, design-guard; no app files, so no browser tests).
