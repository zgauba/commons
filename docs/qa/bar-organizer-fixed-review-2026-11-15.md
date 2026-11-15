# Review: bottom bar — Organizer Tools fixed for organizers (2026-11-15)

**Tier:** screen logic → affected specs locally + CI + code-reviewer.
**Branch:** feat/bar-organizer-fixed · reviewed commit 62d08f8
**Scope:** commons/assets/nav.js (jcBarMax, jcRuns, jcShell, jcTabBar), commons/home/home.js (shell section),
commons/assets/strings.js (set_help {n}, set_admin_fixed EN/AR), tests/e2e/specs/shell.spec.js.

## Findings (code-reviewer) and disposition

| # | Sev | Finding | Disposition |
|---|---|---|---|
| LOW-1 | Low | Settings draft not re-capped if the role changes while it's open: Save could write 4 tabs for an organizer; render shows 3. | **Fixed** — saveShell caps tabs at jcBarMax(fresh) (+ switched-off buttons kept in place). |
| LOW-2 | Low | A saved 4-button bar for a newly promoted organizer shows 3; a later Save drops the 4th for good (doesn't return if the role is lost). | **Accepted** — the organizer sees exactly what will be kept before saving; rare (promotion + later demotion). |
| LOW-3 | Low | Arabic test didn't assert the {n} substitution in set_help. | **Fixed** — asserts "حتى 3 أزرار". |

## Checked and found correct (reviewer)
Legacy "admin" in saved tabs ignored on render and stripped on save; "admin" still a start page, stale one falls back
to Commons (landing.js); shellDirty consistent; jcBarMax callers consistent (me() / JC_ME / fresh); default ranking
(stable sort, registry order for owner / community admins; all six cases tested); {n} via jcFmt fine in RTL;
module off/on `known` logic untouched.

**Verdict:** APPROVE.

## Verification
- New organizer tests fail on the old code (3 failed), pass on the new.
- Local, mobile project: shell + landing 35 passed; all specs touching the tab bar (a11y, events, courts, home, pets,
  section-names) 252 passed. Full suite in both browsers in CI.
- Screenshot: My Home → Account as an organizer — bar Commons · Events · Organizer · My Home; Organizer a fixed row
  "Always shown, before My Home"; "Choose up to 3 buttons".
