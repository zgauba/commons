# node24-actions — contract
Status: agreed by Zeeshan 2026-11-25 ("v7 default and Node 24 … complete and merge"); written before any workflow edit
Plan: none (CI version bump). Carryover from 2026-11-23: "Bump all 7 zgauba workflows off Node 20 (check GitHub's removal date first)". GitHub already forces these actions onto Node 24 (run annotations: "Node.js 20 is deprecated … being forced to run on Node.js 24"), so this is cleanup, not a fix for a broken run.

Scope: `actions/checkout` v4 → v7.0.1 (`3d3c42e5aac5ba805825da76410c181273ba90b1`), `actions/setup-node` v4 → v7.1.0 (`949feb2413d6458794dcd2491c4babbbce0c15c1`), `actions/upload-artifact` v4 → v7.0.2 (`cf430e030ddbb5b0abf93d22962f4752f3646cd9`), all SHA-pinned; `node-version: 20` → `24` (Node 20 end of life 2026-04-30; 24 supported to 2028-04-30). plan-followed and review-saved use no actions and are untouched.

Decision (Zeeshan): checkout v7's default stays on. On `pull_request_target` it refuses to check out a **fork's** PR code, so a fork PR fails secret-scan, repo-rules and design-guard (fail closed). Same-repo PRs are unaffected. No `allow-unsafe-pr-checkout`.

Known limit: the five `pull_request_target` gates run from main's copy of their workflow file, so this PR's own CI exercises only `commons-e2e` (and `commons-canary` if it triggers). The gates are proved after merge with a throwaway same-repo PR (pattern of #196–198).

| # | Check | Proof | Pass/Fail |
|---|---|---|---|
| 1 | No action in `.github/workflows/` targets Node 20, and no script runs on Node 20 | `grep -n "uses:\|node-version" .github/workflows/*.yml` shows only the three v7 SHAs above and `node-version: 24`; `gh api repos/<action>/contents/action.yml?ref=<sha>` shows `using: node24` for each | |
| 2 | `commons-e2e` (both jobs) is green on this PR on the new versions, with no Node 20 deprecation annotation | `gh pr checks`; check-run annotations API for the `e2e` and `e2e-webkit` jobs contain no "Node.js 20 is deprecated" | |
| 3 | Post-merge: all five gates run on the new versions, green, with no Node 20 annotation | throwaway same-repo PR: `gh pr checks` all pass; annotations API on secret-scan, repo-rules, design-guard contain no "Node.js 20 is deprecated"; throwaway closed, branch deleted | |
| 4 | Fork PRs on the three gates that check out the PR head fail closed (Zeeshan's choice) | checkout v7.0.1 README "What's new" + `allow-unsafe-pr-checkout` default `false`; no workflow sets it (`grep -rn allow-unsafe .github/` empty). Not provable live: the owner can't fork their own repo | |
