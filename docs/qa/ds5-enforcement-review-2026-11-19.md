# DS-5 enforcement — review (2026-11-19)

Scope: `~/.claude` hooks + `/ship-pr` (E0, E1, E5 — global, outside this repo), and in this repo `plan-followed.yml`
(E2, branch `ci/plan-followed`) and `design-guard` (E3/E4, branch `ci/design-guard`). Plan:
`docs/plans/DS-design-system.md` → "DS-5 — enforcement scope".
Reviewers: `code-reviewer` (C + D), `security-reviewer` (both workflows), `code-reviewer` running the new plan-conformance
step retroactively on Cats (`plan-conformance-retro-cats-review-2026-11-19.md`).

## Findings and disposition

| # | Sev | Finding | Disposition |
|---|---|---|---|
| CR1 | High | `plan-followed.yml`: `printf … \| grep -q` under `set -o pipefail` → SIGPIPE (141) on a file list > 64 KB → "no app files" → **passes** (reproduced by reviewer) | **Fixed**: here-strings, no pipe |
| CR2 | Med | `@import` / `@charset` before a rule swallowed that rule | **Fixed** + test |
| CR3 | Med | `:not(:is(..))`, `.a :is(input, select)` not seen as bare | **Fixed** (balanced-paren pseudo stripping; `:is()`/`:where()` members checked when the compound has nothing else) + test. `.a:is(input)` deliberately allowed = `input.a`, a classed element like `label.check` |
| CR4 | Med | Native CSS nesting silently skipped | **Fixed**: nested rules fail the guard ("write flat rules or extend the guard") + test |
| CR5 | Med | Baseline keyed by a set → a repeat of a baselined offender passed | **Fixed**: baseline stores counts; more than listed fails, fewer fails ("lower the count") + test |
| CR6 | Med | Done-when check passed on a header row alone; other two sections passed empty | **Fixed**: needs a separator row and ≥ 1 data row; the other sections need text under them |
| CR7 | Med | Only `commons/<dir>/*.css` one level deep was scanned | **Fixed**: recursive walk (skips `vendor`, `node_modules`) |
| CR8 | Low | grep and awk heading tests disagreed ("Done whenever") | **Fixed**: same boundary in both |
| CR9 | Low | Counts removed files too (review-saved doesn't) | Accepted — deleting app files is a change that needs the headings |
| CR10 | Low | `;` inside `url(data:…)` splits a declaration | Accepted — none in the repo; only false negatives on dups |
| CR11 | Low | `{` inside a string / attribute value breaks brace matching | Accepted — none in the repo; nested-brace refusal makes a mis-parse loud, not silent |
| SR1 | Low | A PR can satisfy its own guard: edit `design-guard.mjs`, **grow the baseline**, or write junk under the headings | **Partly fixed**: CI now compares the PR's baseline to the base branch's and fails if any count is new or higher. Editing the script itself remains visible only in the diff (accepted: solo maintainer reviews `tests/ci/` diffs; noted in the workflow). Junk content is the reason E1 (plan conformance, judged by a reviewer) exists |
| SR2 | Info | Repo allows any action / SHA pinning not enforced | Accepted — pinned by convention, same as the other workflows |
| — | — | Script injection, token scope, `pull_request_target`, secrets | **None** (security reviewer: verified) |

## Done when (DS-5) — status at this review

| # | Check | Proof | Pass/Fail |
|---|---|---|---|
| 1 | Commons PR without headings → red check naming them; adding them → green | Probe PR #167 (closed): red with 3 errors, green after `gh pr edit` | Pass (re-run after CR1/CR6 fixes on the PR) |
| 2 | A bare `select` added to a module fails, naming file + selector; current main passes | `node tests/ci/design-guard.mjs` with `.caNew select` appended to cats.css → `::error file=commons/cats/cats.css,line=50` | Pass |
| 3 | A fixed baseline entry fails as stale | Unit test + live: `.starts input[type=radio]` renamed → "Fixed — delete the line" | Pass |
| 4 | Plan check re-run on Cats flags "reuse the pet page" as NOT FOLLOWED | `plan-conformance-retro-cats-review-2026-11-19.md`: would have blocked CC-3 and CC-4 | Pass |
| 5 | `gh pr create` without the table warns, PR still created | Hook tests 8/8; live on #167 ("PR body has no Done when") | Pass |
| 6 | Session log shows a real session id after E0 | Hook test; next live Stop entry in `~/.claude/session-logs/current.md` | Pending live entry |
| 7 | e2e + review-saved unaffected; red required check blocks merge; admin push still works | `gh pr checks` on C and D; E6 test after merge | Pending E6 |

Tests: `node --test tests/ci/design-guard.test.mjs` 10/10 · `node --test ~/.claude/scripts/hooks/test/hooks.test.js` 8/8.
