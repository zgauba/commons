---
name: shot
description: Screenshot Commons screens against the stubbed backend and look at them — one screen (phone size, EN or AR, any persona), or `sweep <module>` for a picture of the end of every test in a module. Use instead of writing a throwaway Playwright test to see a screen, and to start any module UI review (Courts, Pets, Home, Account, Admin, Events, Cats) or cross-module consistency pass.
argument-hint: "<path under /commons/> [persona] [en|ar] [full]  |  sweep <module> [grep] [full]"
---

If the first argument is `sweep`, skip to **Sweep mode** below.

# /shot — see one Commons screen

Never reaches the real Supabase project: it runs on the same stubs as the specs
(`tests/e2e/specs/stub.js` + `specs/backends.js`), local server on this checkout's own port (`tests/e2e/port.js`), iPhone 13 viewport.

## Arguments

`$ARGUMENTS` → `<path> [persona] [lang] [full]`, any order after the path:

- **path** — under `/commons/`: `""` (hub), `events/`, `events/?id=11111111-1111-4111-8111-111111111111` (live test event), `events/?id=22222222-2222-4222-8222-222222222222` (archived Halloween), `home/`, `account/`, `admin/`, `pets/` (list), `pets/?pet=22222222-bbbb-4bbb-8bbb-00000000000N` (N = 1 Rex · 2 Luna missing · 3 Ginger stray · 4 Sandy community · 6 Mochi mine) — Pets uses the Pets stub; 1–3 have photos
- **persona** — `member` (default), `anon`, `member-no-home`, `member-no-pin`, `organizer`, `community-admin`, `event-admin` (runs only the live test event)
- **lang** — `en` (default) or `ar`
- **full** — whole page instead of one screen
- **clicks** (optional, env `SHOT_CLICKS`) — `;`-separated selectors tapped in order before the picture, for screens behind a button, e.g. `SHOT_CLICKS='#newEv;[data-tpl="market"]'`

## Steps

1. Name the file from the args, in the session scratchpad (never in the repo): `<scratchpad>/shot-<path-slug>-<persona>-<lang>.png`.
2. Run from `tests/e2e/`:
   ```bash
   SHOT_PATH='<path>' SHOT_PERSONA=<persona> SHOT_LANG=<lang> SHOT_FULL=<1|0> SHOT_CLICKS='<sel;sel>' SHOT_OUT=<abs png> \
     npx playwright test -c playwright.shot.config.js 2>&1 | grep -v WebServer | tail -15
   ```
3. Read the PNG with the Read tool and describe what matters for the question at hand.
4. If the run failed with **"RPCs with no stub"**: the picture exists but probably shows an error state. Say which RPC is missing; add a handler to `specs/backends.js` (or `stub.js`) as a real fixture the specs can reuse — don't patch `shots/shot.spec.js` with one-off data.
5. To click into a state the URL can't reach (a form open, a tab selected), that's a real test — write it in `specs/`, not here.

## Sweep mode — `/shot sweep <module> [grep] [full]`

Runs a module's existing specs (same stubs, Chromium iPhone 13) and keeps a picture of where each
test ended. It replaces hand-building that setup at the start of each module UI review.

| module | spec filter (passed to Playwright as-is) | tests (2026-11-24) | screens live in |
|---|---|---|---|
| `courts` | `courts.spec admin-court` | 96 | `commons/bookings/`, admin Bookings tab |
| `events` | `events.spec events-audit event-day organizer-acts admin-events-chips admin-signups` | 164 | `commons/events/`, admin Events tab |
| `cats` | `cats` | 85 | `commons/cats/` |
| `pets` | `pets.spec admin-pets admin-pet-reports` | 105 | `commons/pets/`, admin Pets tab |
| `home` | `home.spec` | 31 | `commons/home/` (Home / Household / Account tabs, tab-bar setup, feedback form) |
| `account` | `account.spec` | 22 | `commons/account/` |
| `admin` | `admin.spec admin-admins admin-households admin-health` | 125 | `commons/admin/` (the tabs no other module owns) |

The counts are the check that a filter matched what you meant (each was verified with `--list`): if yours is far off, the filter is catching the wrong files. A module not in the table: list `tests/e2e/specs/` and pick the files by name; add the row here.
**grep** (optional) narrows to tests whose title matches, e.g. `arabic` or `private`.

1. Folder: `<scratchpad>/sweep-<module>/` — delete it first if it exists (old pictures would mix in).
2. Run from `tests/e2e/` (word-split the filter; in zsh use `${=FILTER}`):
   ```bash
   SWEEP_OUT=<abs folder> SWEEP_FULL=<0 default; 1 when screens run past one phone height> npx playwright test -c playwright.sweep.config.js <filter> [--grep '<grep>'] 2>&1 | grep -v WebServer | tail -8
   node shots/sweep-index.js <abs folder>
   ```
   The sweep serves on its own per-checkout port (5000–5699, `tests/e2e/port.js`; `SWEEP_PORT` overrides), apart
   from the suite's (4300–4999), so sweeps, suites and `/shot` in different worktrees never collide.
3. The folder holds the numbered pictures, `index.md`, `report.json` (Playwright's raw report) and `raw/`.
   `index.md` lists every test → its picture (`NNN-<spec>-<title>.png`), result,
   and any test with **no picture** (it opened its own browser context; look at the spec if it matters).
4. Look at the pictures. Don't read all of them one by one when there are 100: read the index,
   group tests that end on the same screen, and look at one or two per group plus every
   failure. Titles are the only grouping hint, so confirm a group by opening one picture. A picture of an
   error box is often the test *checking* that error — read the title first. A failed test stopped
   early: its picture is where it stopped, and every screen it would have reached after that is unseen —
   count those in step 5.
5. **Screens not reached.** A sweep only shows screens a test ends on. List the module's screens
   from where its screens live (table above: tabs, sheets, empty / error / signed-out states, AR) and
   name the ones no picture shows. Reach those with single `/shot` runs, or note them as a test gap
   in the review — never present a sweep as the whole module.
6. Pictures stay in the scratchpad; the review that uses them goes to `docs/qa/` as usual.
