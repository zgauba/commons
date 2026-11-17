# Incident 2026-11-17 — "the community code is not working" (tester joined the wrong community)

**Severity:** low (one tester blocked at join; no data at risk; nobody stuck now). **Status:** closed, fix to plan.
No codes, emails or names in this file (public repo).

## Timeline (UTC)
- 2026-11-17 ~09:4x — a tester tells Zee: "I have signed up but the community code is not working for me", quoting the
  code they were given. Zee relays it to Claude.
- 09:4x — checked live (read-only): the quoted code is **valid — it is the `e2e` test community's join code**
  (`jc_code_ok('e2e', 'join', …)` = true; false for every other slot).
- 09:5x — `jc_codes` has **no `join` row for `jubail`** (only its admin-unlock row): every Jubail join attempt fails
  with BAD_CODE, by design until R8 ("fresh Jubail codes").
- 09:5x — all 7 auth users are members of `e2e`; **no account is stuck** signed-up-but-not-joined. The newest account
  was created 09:10 UTC (likely the reporter on a later try — not confirmable).
- 09:56 — closed as not an active incident; no mitigation needed.

## Detection
A tester's message. Ideal: the join screen itself says "this code is for another community" so the tester self-corrects.

## Trigger
The tester was on **Jubail Commons** (the only community the public picker lists) and entered the **test community's**
code.

## Root cause
Testers depend on `?community=e2e` in their link, and that choice is fragile:
- `landing.js` lists only `jubail` publicly (the test community must never be listed); `e2e` appears only for a visitor
  whose link carries `?community=e2e`.
- `jcCommunity()` keeps that choice in **sessionStorage** (one browser tab). A new tab, the email app's browser, a plain
  commons.ae visit or the saved home-screen app all fall back to **jubail**.
- Jubail has no join code before launch, so the failure is guaranteed — and the error ("That code didn't work") gives no
  hint that the community is wrong. The "Community: …" line on the join step only appears for non-Jubail communities.

## Why not caught earlier
Tests always open the join page with the intended community; no test covers "right code, wrong community". Testing
moved from Zee alone to several testers this week (5 new accounts in 3 days), which is when a fragile link starts to bite.

## Immediate workaround (no code change)
Send testers the link **with** `?community=e2e` (e.g. commons.ae/account/?view=join&community=e2e) and tell them to open
it in the same tab they sign up in; if they saved the app before, open the link once in the browser first.

## Fix plan (needs `/plan-change`; app + maybe one RPC)
1. **Say it when the community is wrong:** on BAD_CODE, if the code is a valid join code for another community, answer
   a distinct error ("This code is for a different community — open the exact link you were sent"). Never name the
   other community. Keep the join rate limit (10 / hour) so this can't be used to probe codes.
2. **Remember the chosen community beyond one tab** (localStorage, like other per-viewer choices), so new tabs and the
   saved app keep `e2e` for testers.
3. **Pre-launch Jubail card:** while Jubail has no join code, its Join button says the community opens soon instead of
   asking for a code that can't work.

## Detection plan
- E2E test: right code, wrong community → the new message.
- App Health: count BAD_CODE join failures per day (a spike after invites = a bad link or code).
