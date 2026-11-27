# flaky-admin-admins: contract

Agreed 2026-11-27 (Zeeshan: "fix the flaky admin-admins test"; ROADMAP split leftover). Fix the race behind the
one-off timeout of `admin-admins.spec.js:348` "NOT_ADMIN while on Admins goes back through the re-check" on PR #3.
No retries, no sleeps.

**Root cause (found before this contract):** the `openAdmins` helper waited only for the "Admins" heading.
`VIEWS.admins` (`commons/admin/admin.js` ~1052) draws that heading with "One moment…" before the six
`jc_module_admins_list` reads come back. The test then ends the grant (`b.st.scopes = []`), so a read still in flight
answers NOT_ADMIN and `loadAdmins` correctly goes to the lock screen. `[data-admake="events"]` is never drawn,
and the test times out. The bug is in the test, not the app.

Tier 1: test file only, no app code.

| # | Check | Proof | Pass/Fail |
|---|---|---|---|
| 1 | The race is reproducible on demand: with one list read answering 300 ms late, the unfixed test fails at the same line as CI | local run on the unfixed helper, `--repeat-each=3`, Chromium: 3 failed at the `[data-admake="events"]` click | |
| 2 | With the fix, the delayed test passes every time in both browsers | `--repeat-each=10 --project=mobile --project=webkit`: 20 passed | |
| 3 | The whole spec passes locally in both browsers and CI is green | local `admin-admins.spec.js` both projects all pass; `gh pr checks <n>` all pass | |
