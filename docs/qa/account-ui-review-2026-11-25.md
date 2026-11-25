# Account UI review — 2026-11-25

Scope: `commons/account/` (Sign In, Join code step, Create Your Account, Reset Your Password, Choose a New Password,
signed-in box). Method: `/shot sweep account` (22 tests, 22 pictures, all passed) + single `/shot`s and a filtered
sweep for the new states. Tier: **screen logic** (C1/C3 change where sign-up leads; no Supabase Auth call, RPC or
stored data changed) — suite once + CI + code-reviewer.

## Findings and dispositions

| # | Screen | Finding | Disposition |
|---|---|---|---|
| C1 | Create Your Account, email taken | "Sign in instead" with no way to Sign In (only Back to the code step) | **Fixed**: a Sign In button under the message; Sign In opens with the email filled, password focused; the join code is kept |
| C2 | Create Your Account | Two help paragraphs (~10 lines) pushed Create Account below the first screen | **Fixed**: one privacy line + "What we keep" tap-to-open (shared `details.more`) with the full text; display-name help kept. Disclosure stays on the collecting screen |
| C3 | Create Your Account, no session (confirmation drifted on) | Next step shown as a red error over a form still offering Create Account | **Fixed**: Sign In with the email filled and a green message |
| C4 | Link rows | "Sign Out" (button string) beside sentence-case links; "Forgot your password?" on Choose a New Password misleads | **Fixed**: link-only "Sign out" string; "Send me a new link" |
| D | Sign-in / join / reset | No "?" help, unlike every other page | **Added** (Zeeshan: yes): Signing In (3), Joining (4, both steps), Password Reset (3), EN + AR; none on the signed-in box. The account page now loads `nav.js` |

Not findings: picture 007 (blank) is the screenshot catching the move to My Home mid-load; 014 ends on the hub.

## Code review (code-reviewer, 2026-11-25) — APPROVE, nothing HIGH/MEDIUM
| # | LOW finding | Disposition |
|---|---|---|
| 1 | After EMAIL_TAKEN, a later too-short password left the Sign In offer showing | **Fixed**: hidden at the start of every attempt; test added (fails before the fix) |
| 2 | Sign In receives the email as typed now, even if edited after the error | Accepted: cosmetic, and arguably what the person wants |
| 3 | Shared phone: the typed display name could be saved to a different account that signs in after the hand-off; sign-out kept the join code | **Fixed**: a different email signing in drops the name (checked on every try, cleared only on success); sign-out also clears the code; test added (fails before the fix) |
| 4 | Language switch on the Sign In reached via confirm-first loses the green line and email | Accepted: rare drift-only path; the email is one retype |
Reviewer verified: `signinEmail` is single-use; `showOk` runs after the synchronous re-render; `[hidden]` beats `.row`; `nav.js` has no load-time effects here; CSP `'self'` covers it; help copy claims match the code.

## Evidence
- `account.spec`: 28 pass; every new/changed check fails on main (9 tests) or on the pre-review-fix commit (2 tests).
- Full mobile suite 817 passed (before the review fixes); `account.spec` re-run after them. Design guard OK.
- Pictures: join code step with "?", Arabic Signing In sheet, Create Your Account (short line, Create Account on screen one), confirm-first → Sign In (green).

## Gaps
- Arabic picture of Create Your Account not taken (the shot tool can't type the code); Arabic covered by the help-sheet picture and the RTL test.
- "Signed in, no home yet" box and the `?community=` notice not pictured.
