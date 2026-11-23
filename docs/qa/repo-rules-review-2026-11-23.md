# Repo rules (B1) review — 2026-11-23

Scope: `tests/ci/repo-rules.mjs`, `tests/ci/repo-rules.test.mjs`, `.github/workflows/repo-rules.yml` (harness-autonomy-plan PR 3b-1).
Reviewers: code-reviewer + security-reviewer agents. Both found the workflow sound (same `pull_request_target`
pattern as design-guard / secret-scan; nothing from the PR runs; annotations escaped). Findings below were in the rule script.

| # | Finding | Severity | Outcome |
|---|---|---|---|
| S1 | `vendor/`, `node_modules/` etc. skipped at any depth — a violating page could hide there (Pages serves them) | Medium | Fixed: nothing under the checked folders is skipped; CLI test |
| S2 | R3 hidden by `select '--';` before the drop, or by `drop routine` | Medium | Fixed: R3 reads raw SQL (comments included), matches function/routine/procedure, `,` and end-of-file terminators. Documented as a lint: dynamic SQL can still evade it |
| S3 | UTF-16 file read as UTF-8 hides every pattern; `.htm`/`.svg`/`.mjs` and new top-level pages unscanned | Low | Fixed: NUL/BOM files fail closed; extensions widened (case-insensitive); any top-level page counts as personal |
| S4 | Quadratic line numbering + unbounded annotations (runner DoS, own PR only) | Low | Fixed: newline index + binary search, ≤ 20 annotations per file, files > 2 MB fail |
| C1 | R4 missed `(050) 123 4567`, landlines `02 123 4567`, `800 …`, en-dash and `&nbsp;` separators | Medium | Fixed; test cases added |
| C2 | R4 bare `\d{9,15}` would flag timestamps, pixel IDs, scheme-less LinkedIn URLs | Medium | Fixed: bare digits only as UAE-shaped `971…` / `05…`; scheme-less URLs blanked; false-positive test added |
| C3 | R8 ignored Commons JS (toasts, labels) | Medium | Fixed: all Commons JS except vendor/, with JS comments blanked so a comment stating the rule passes |
| C4 | R7 missed `../../jubail/`, unquoted `href=/jubail/`, `window.open("/jubail")` | Medium | Fixed; `community: "jubail"` and `/jubail-halloween` still pass |
| C5 | R5 / R6 wording gaps (`acquires`, `plan to move`, `&nbsp;`) | Low | Fixed for `acquires`, `plan(ning) to/on move`, `move to`, `&nbsp;`. Not widened to "bought"/"acquisition": that flagged the page's legitimate "$400M acquisition" line |
| C6 | `lstat` errors other than "not found" swallowed | Low | Fixed: only ENOENT is silent |
| C7 | R1 flags `jc_` in SQL comments | Low | Accepted: a comment mentioning `jc_` in a SignalPost file is worth a look |

Verification: `node --test tests/ci/*.test.mjs` 51/51; each rule disabled in turn fails ≥ 1 test; `node tests/ci/repo-rules.mjs` on main: 97 files, OK.
