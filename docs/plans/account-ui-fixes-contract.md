# account-ui-fixes — contract
Status: written by the builder before any code (no /plan-change: fixes from the Account UI review, Zeeshan 2026-11-25: "fix all four, yes to D")
Plan: `docs/qa/account-ui-review-2026-11-25.md` (findings C1–C4, decision D)
Tier: screen logic (C1/C3 change where sign-up leads; no Supabase Auth call, RPC or stored data changes) — suite once + CI + code-reviewer.

| # | Check | Proof | Pass/Fail |
|---|---|---|---|
| 1 | Create Your Account with an email that already has an account: the message plus a **Sign In** button; tapping it opens Sign In with that email filled in and the password focused; signing in then continues to the code step with the code kept (C1) | `account.spec` (email-taken test extended): button visible only after EMAIL_TAKEN, sign-in view, `#email` value, `#password` focused; picture | |
| 2 | Create Your Account: the privacy text is one visible line + a closed "What we keep" tap-to-open line holding the full text (shared `details.more`); the display-name help stays (C2) | `account.spec` asserts the short line visible, `details.more` closed by default with the full `join_privacy` inside, Create Account within the first phone screen (bounding box ≤ 844px); EN + AR picture | |
| 3 | Sign-up that comes back with no session (email confirmation turned on by mistake): Sign In opens with the email filled in and a **green** "Check your email to confirm…" message; no red error, no second Create Account (C3) | `account.spec` (no-session test extended): `#msg` has class `ok`, sign-in view, `#email` filled, still no `jc_join` | |
| 4 | Link rows: the code step's sign-out link reads "Sign out" (its own sentence-case string; the Sign Out buttons keep theirs); Choose a New Password's link reads "Send me a new link" and still opens the reset-request view (C4) | `account.spec` asserts both texts and the destination | |
| 5 | A "?" help button on Sign In, Join (code + account steps) and Reset (forgot + choose new password), EN + AR, each opening its own sheet (D) | `account.spec` opens each sheet and checks its title + line count; AR picture of one sheet | |
| 6 | Regression: account, home and the casing spec pass; full mobile suite once locally; design guard clean; PR CI green | Local mobile run; CI on the PR | |
