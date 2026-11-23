# Verify gate (B2) review — 2026-11-23

Scope: `.claude/verify.sh`, `tests/ci/affected-specs.mjs` (+ test), and in claude-config `scripts/hooks/verify-gate.js` (+ test).
Reviewer: code-reviewer agent (ran bash 3.2.57 experiments in scratch repos). Verdict: approve; no critical / high.

| # | Finding | Severity | Outcome |
|---|---|---|---|
| M1 | A non-ASCII file name (`café.js`) prints quoted from `git diff`, matches nothing → wrongly green | Medium | Fixed: `core.quotepath=false` |
| M2 | A rename out of `commons/` lists only the new path → wrongly green | Medium | Fixed: `--no-renames` |
| M3 | Deleting a spec selects a filter that matches no file → "No tests found", wrongly red | Medium | Fixed: selected specs that no longer exist are dropped; test added |
| L1 | Gate runs only with uncommitted changes; no `origin/main` silently narrows the diff | Low | Accepted (pre-existing design; CI runs everything on the PR); verify.sh now says when it falls back |
| L2 | No test that the hook uses the input `cwd` | Low | Fixed: 2 tests; reverting to `process.cwd()` fails them |
| L3 | Timeout path / observe-pass untested | Low | Accepted: timeout path is two lines of message text |
| L4 | Round counter keyed on the first 6 bytes of the path (all `/Users/…` repos shared one count) | Low | Fixed: SHA-1 of the whole path; test added |

Measured: docs-only 0.3 s; cats change 27 s (211 tests); broken module red in 26 s with `--max-failures=5` (3.5 min without); cache hit 0.3 s.
Live proof (real hook, real verify.sh): planted "Soccer" → blocked 1/3, 2/3, 3/3 → handback → fixed → pass; 5 lines in gates.log.
