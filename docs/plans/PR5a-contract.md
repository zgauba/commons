# PR5a — contract
Status: agreed 2026-11-24 (Zee: "approve, do 5a first /goal complete it including merging")
Plan: /plan-change in session, 2026-11-24 (harness-autonomy-plan B6: app-check skill; PR 5 split into 5a = B6, 5b = B5)

| # | Check | Proof | Pass/Fail |
|---|---|---|---|
| 1 | Asking for a named Commons flow (e.g. `cats-stations`) returns one PASS/FAIL row per step with the screenshot paths, in EN and AR, and the pictures show the named screen | Run the `app-check` skill for `cats-stations` in EN + AR; output table + PNGs read and described | |
| 2 | A flow whose screen calls an RPC the stubs don't answer comes back FAIL naming that RPC, never PASS (zero-output canary) | Run with a temporary flow pointing at a screen with no stub (config not committed): FAIL row naming the RPC | |
| 3 | Every flow listed in zgauba's `.claude/app-check.json` passes on main, so the list is not stale on day one | Run all flows: N/N PASS, N stated | |
| 4 | Regression: `/shot` and the test suites are unchanged, and nothing reaches the live Supabase project | `git diff main -- tests/ commons/` empty; `bash .claude/verify.sh` green; every flow run reports 0 escaped requests | |
