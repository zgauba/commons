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
| DS-2 | **`docs/design.md`:** one entry per component (shared function, classes, when to use, a11y, reference screenshot) + a "never" list | written 2026-11-19 — Zee to review |
| DS-3 | **Extract shared pieces** from Pets: hero header, card grid, facts list, sightings block; shared dropdown + checkbox styles; tap-to-zoom in the photo viewer | merge |
| DS-4 | **Rebuild Cats** on them (review D1–D14), incl. one "Log activity" button and the dropdown fix (iPhone); UI review Cats vs Pets | merge |
| DS-5 | **CI guard:** module CSS may not style bare `select` / `input` / `textarea` / `label` / `button` | merge |

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
