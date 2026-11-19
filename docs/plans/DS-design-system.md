# DS — make Commons look like one app (plan, 2026-11-19)

**Why:** Cats shipped looking unlike Pets. The CC plan's Prior Art *said* "reuse the pet page"; the build didn't, and
nothing checked (review: `docs/qa/cats-design-review-2026-11-19.md`). Fix the process first, then the app.

**Decisions (Zee, 2026-11-19):**
- No component library dependency (Basecoat needs Tailwind; shadcn-html is stale). Keep plain-JS `jcXxxHtml` /
  `jcXxxWire` + `app.css` + `tokens.css`; borrow shadcn-html's per-component spec shape for design.md.
- No paid UI library (UXKIN / Mobbin), no Awwwards MCP. Use the free **UI Design Review** plugin (no UXKIN connection)
  — it replaces the proposed `/visual-fix` command (dropped).
- shadcn MCP + Basecoat → SignalPost only, later.
- **React: not before launch.** Revisit after launch only on a trigger: a second developer joins, or the shared
  pieces + CI guard still let screens drift. Cost today: a build step + rewriting every Commons page.

## Steps
| Step | What | Needs from Zee |
|---|---|---|
| DS-1 | **Protocols** (list below) | done 2026-11-19 |
| DS-2 | **`docs/design.md`:** fixed per-component template (shadcn-html shape: status, native basis, markup, variants, a11y, wiring, use/don't, reference) + choice-control rule + "never" list + promotion process | done 2026-11-19 (Zee approved) |
| DS-5 | **Enforcement — runs BEFORE DS-3** (Zee 2026-11-19: "ensure proper checks are in place so plans and protocols are followed"), so DS-3/DS-4 are the first PRs it checks. Scope below | done 2026-11-19 (#168, #170, E6 branch protection) |
| DS-3 | **Plan: `docs/plans/DS-3-shared-pieces.md`** (3a controls → 3b page pieces → 3c viewer zoom). **Extract shared pieces** from Pets: page shell, hero header, card grid, list cards, facts list (+ Arabic alignment fix), sightings block; shared textarea / select / date / checkbox styles (remove the 5 + 2 + 3 module copies and the `.opts` overrides in events/home); tap-to-zoom in the photo viewer. **Baseline found 51 bare-element + 19 duplicate rules across all modules** (not only Pets/Cats): DS-3 clears the Pets, Cats and shared-control lines; Events / Home / Bookings / Organizer Tools lines shrink whenever those files are next touched (or a later cleanup step) | done 2026-11-19 (#172 controls + guard fix, #173 page pieces, #174 viewer zoom) |
| DS-4 | **Rebuild Cats** on them (review D1–D14), incl. one "Log activity" button, the dropdown fix (iPhone), pills for sex / life stage / ear tip / sterilisation; UI review Cats vs Pets. **Also from the plan-conformance retro** (`docs/qa/plan-conformance-retro-cats-review-2026-11-19.md`): the CC plan's map REUSE row (station map / `jcSortedWire` / sighting mini maps) and a shared dated-entry list (Cats activity + Pets sightings/log) | merge |

## DS-5 — enforcement scope
The Cats failure: the plan said "reuse the pet page", the build didn't, nothing compared the two. Checks that only
test *presence* of a table can be filled with junk, so the core check compares the **plan to the diff**.

| # | Check | Catches | Where | Applies to |
|---|---|---|---|---|
| E1 | **Plan-conformance review** in `/ship-pr`: the reviewer gets the plan's Prior Art, Screens to match and Done-when tables and the diff, and reports every row FOLLOWED / NOT FOLLOWED (with file:line). Any NOT FOLLOWED without an agreed DEPART = not merge-ready | Plan says REUSE, build re-invents (the Cats failure) | `~/.claude/skills/ship-pr` (global) | All projects |
| E2 | **`plan-followed.yml` CI**: a PR touching `commons/` screens must have, in its body, the Check \| Proof \| Pass/Fail table and a Screens-to-match table (or the label `plan-not-needed` for copy-only changes, as `review-not-needed`) | Skipping `/plan-change` or `/ship-pr` entirely | this repo | Commons (works for Manus too) |
| E3 | **Bare-element guard** (CI grep) — starts with a baseline list of today's offenders that may only shrink; DS-3 empties it | New module CSS restyling shared controls | this repo | Commons |
| E4 | **Duplicate-rule guard** (CI script) — identical declaration blocks in 2+ CSS files fail; same shrink-only baseline | Copy-paste between modules | this repo | Commons |
| E5 | *(optional)* global hook on `gh pr create`: warn if the body lacks the Done-when table | Same as E2, earlier, in every project | `~/.claude` hook | All projects |

Limit: none of these judge *quality*. E1's reviewer and the side-by-side screenshot are the judgment layer; CI only
guarantees the steps weren't skipped.

## DS-1 — the protocol edits
| File | Change |
|---|---|
| `~/.claude/commands/plan-change.md` Step 1b | Read `docs/design.md` first (if the project has one). New required table **"Screens to match"**: every new/changed screen → the existing screen it must look like, or a stated DEPART. Screen layouts are prior art, not only code |
| `~/.claude/commands/plan-change.md` Step 4 | Any change people see needs ≥1 **visual Done-when** proved by a side-by-side screenshot (new vs reference) |
| `~/.claude/skills/ship-pr` step 1b | Cosmetic + screen-logic tiers: side-by-side screenshots + a UI Design Review pass against design.md; a new rule found → added to design.md in the same PR |
| `~/.claude/docs/BUILDING_APPS_WITH_AI.md` | Premortem catalog: new mode **"visual drift"** (a screen built outside the shared pieces) |
| `CLAUDE.md` (this repo) | Commons section: "read `docs/design.md` before building any screen; module CSS never restyles bare elements" |

## Separate, not part of DS
**Pets admins mark / un-mark a pet missing** (ROADMAP entry). DB change: new admin RPC, buttons on the pet page and
Organizer Tools → Pets; the owner sees "Marked missing by the Pets team" (Zee: yes). `/plan-change` + `/db-rehearse`
after DS-4; needs "apply".
