# CC-7c Pets just for pets (app) — review 2026-11-20

Tier 2 (screen logic). PR #186. Plan: `docs/plans/CC-community-cats.md` "CC-7 plan" (CC-7c). Built by a build agent in
an isolated worktree (two commits), reviewed here.

## What changed
Removed (−2,504 lines): Pets' Strays tab (map, cards, sort), the old Pets report form + thank-you + My reports + waiting
line, the stray branches of the pet page (care record, territory, care log, stray facts); Organizer Tools → Pets:
Reported strays (screen + row), the stray editor (Add a Stray), Manage's care state / care record / quick log, the
Strays / Needs help / Homes' pets chips, Not fed / Not seen badges. 183 string keys (EN + AR), the CSS only they used.
Kept: every owned-pet flow. Redirects: `pets/?tab=strays` → Pets; `admin/?open=reports` → `cats/?tab=reports`;
`?show=strays|help|homes` → All; a stray's old `?pet=` link → "That pet isn't listed any more." The client drops any
non-owned pet the server still sends (until CC-7d archives them). Pets tab: "Report a stray cat" link while Cats is on.

## Tests
Full Chromium suite (worktree): **785 passed**, 0 flaky. After the chip follow-up: admin-pets, admin-pet-reports, pets,
strings-parity, a11y, desktop — 143 passed. design-guard OK (baseline unchanged).
Deleted with their feature (listed by the build agent): Strays tab pins / sort / Find Me (pets.spec ×4), care v2 auto log,
8 stray-editor tests incl. its CSP photo test, care record / log / state / Not fed / Needs help tests (admin-pets),
the 15 Reported strays tests (admin-pet-reports — equivalents in cats-reports.spec since #185). Moved: a report photo
opening the viewer → cats-reports.spec. Rewritten against owned pets: the stray page test, both axe tests, Map tab,
lazy small maps, `?show=` review, chips, search, archive, restore, sightings order. New: redirects, Cats line on / off,
no stray RPC ever called.

## Screens (`docs/qa/cc-7c/`)
| After | Before | Result |
|---|---|---|
| `after-pets-en.png` (+ `-ar`) | `before-pets-en.png` | Match: Pets · My Pets; Missing now + chips + cards unchanged |
| `after-admin-pets-en.png` | `before-admin-pets-en.png` | Match: Reported strays row, Add a Stray, 3 chips removed; group link + All / Missing / Archived kept |

## code-reviewer — APPROVE (0 High / 0 Medium)
| # | Finding | Disposition |
|---|---|---|
| — | ~180 deleted identifiers: no remaining reference; no undefined calls; no deleted string still referenced (incl. prefix keys); no client call to an RPC CC-7d drops | Verified clean |
| L1 | Redirect test's `/stray/` filter could catch the Cats page's own `jc_stray_reports_mine` | **Fixed**: filter `^jc_admin_stray` |
| L2 | Signed-out `admin/?open=reports` → Cats → sign-in returns to the Cats home tab, not Reports | Accepted (rare bookmark case) |

## Left as is (noted)
- Organizer Tools' empty line still reads "No animals yet." (now only pets) — copy nit, later.
- Card subtitle "Cat · Pet" — "Pet" is redundant now; copy unchanged on purpose (Pets profile v2 revisits cards).
- Admin-log labels for old stray actions kept: the log still holds those rows.
