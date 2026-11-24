# Review — app-check flows (harness PR5a, B6), 2026-11-24

Reviewer: `code-reviewer` (tier 2: tooling config plus a new global skill, no app code).
Scope: `.claude/app-check.json` (this repo), `~/.claude/skills/app-check/SKILL.md` + one cheatsheet line (claude-config).
Contract: `docs/plans/PR5a-contract.md` (agreed `59b8e24`; Check cells unchanged since, only Proof and Pass/Fail filled in).

## Findings

| # | Severity | Finding | Disposition |
|---|---|---|---|
| R1 | Important | Skill step 3 invited `cmd \| grep \| tail`, so the pipe's exit code (tail's) could turn a failed run into exit 0 | **Fixed**: the output goes to a log file, `$?` is taken from the command itself, and there's a literal example |
| R2 | Important | The shot config runs mobile **and** WebKit into one `SHOT_OUT`, and a leftover picture also satisfied "exists" | **Fixed**: `--project=mobile` in `command`; the picture is deleted before each step; PASS also needs `done_marker` (`SHOT `) in the log |
| R3 | Important | BLOCKED (port in use) was unbounded and could hide a failure | **Fixed**: BLOCKED only when the log has `blocked_marker` and no `done_marker`; one more run after the port frees, blocked twice → FAIL; reported as `K blocked`, never counted as passed |
| R4 | Important | Pets might be the same false-PASS kind as Cats / Courts (`shot.spec` sets `pets` off); "wrong screen" was judged from memory | **Not a bug**: the Pets stub switches the module on, and all 6 pets pictures show the pets screens. **Fixed** the judging part: each step now has an `expect`, and step 5 also checks the persona and the language |
| R5 | Important | Unescaped `\|` in the cheatsheet row split the table | **Fixed**: reworded |
| R6 | Nit | Config `about` said exit 0 = pass, which contradicts step 5; it repeated `/shot` | **Fixed**: `about` shortened, and the skill's Config table says exit 0 is necessary, not sufficient |
| R7 | Nit | Coverage limits (viewport only, console errors not checked) unstated | **Fixed**: a Limits section in the skill |
| R8 | Nit | The skill restated `/shot` step 4 (missing stub) | **Fixed**: it now points to the project's guidance |

## Found while building

- **False PASS by exit code:** `cats/` and `bookings/` exit 0 while the screen says "This section isn't open yet", because `/shot` doesn't switch those modules on. Skill step 5 turns these into FAIL. Cats and Courts flows need `/shot` stubs first (follow-up, not in this PR).
- **Two sessions in one checkout (2026-11-24):** a second Claude session switched this checkout to its own branch mid-build. Both sessions' Playwright runs use port 4173 (`reuseExistingServer: false`), so one run fails with "already used". That's the likely cause of one unexplained `/shot` failure, which did not recur in 15 repeats. This PR was finished in its own worktree. The checkout-lock rule is a follow-up in claude-config.

## Plan conformance

| Plan row | Plan said | FOLLOWED / NOT FOLLOWED | Evidence |
|---|---|---|---|
| Screenshot engine | REUSE `/shot` | FOLLOWED | `command` runs `playwright.shot.config.js`; `tests/` unchanged (0-line diff) |
| Global launcher | DEPART from built-in `run` | FOLLOWED | No `run` dependency; the skill reads the config directly |
| Per-project config pattern | REUSE the `verify.sh` shape (a repo file switches it on) | FOLLOWED | `.claude/app-check.json`; the skill stops when it's missing |
| Config read from main | Planned for PR5b (evaluator) | Not in 5a by design | — |

## Tests

- All flows from the branch: **28/28 PASS** (6 flows, 14 steps × EN/AR), run twice (before and after the review fixes). Every picture was read and matched to its `expect`.
- Seeded break (temporary `delete rpc.jc_event_get`, reverted): events list PASS; live and archived event FAIL with the log naming `jc_event_get`.
- `bash .claude/verify.sh`: green (R1–R9, design-guard; no app or e2e files, so no browser tests).
