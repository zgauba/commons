# admin-ui-fixes — contract
Status: written by the builder before any code (no /plan-change: fixes from the Admin UI review, Zeeshan 2026-11-25: "fix all six")
Plan: `docs/qa/admin-ui-review-2026-11-25.md` (findings G1–G6)
Tier: screen logic (G2 changes the shared tab-row helper every module uses; no RPC, schema or stored data changes) — affected specs + CI + code-reviewer.

| # | Check | Proof | Pass/Fail |
|---|---|---|---|
| 1 | Households: each member is a plain row inside the home card (name + joined date at the start, Remove at the end), not a bordered card of its own; top-level cards everywhere keep their card look (G1) | `admin-households.spec`: member `li` has no border and its Remove button sits at the row's end edge; picture | |
| 2 | Any tab row wider than the screen shows a fade on the cut edge(s) (end at rest, both mid-way, start at the end; mirrored in Arabic), and the selected tab is scrolled fully into view; rows that fit show no fade (G2, shared: Organizer Tools, Cats, every module) | `admin.spec`: Organizer Tools row at 390px has the end fade, not the start; after selecting the last tab it is fully visible and the start fade shows; AR mirrored; a row that fits (My Home) has none; EN + AR pictures | |
| 3 | Counts use singular and plural: "1 home · 1 pinned · 1 member", "2 homes · … · 3 members"; App Health says "1 thing needs a look" / "6 things need a look" (G3) | `admin-households.spec` + `admin-health.spec` assert both forms | |
| 4 | Households: 12px between the "Waiting for you" cards and the search box (G4) | `admin-households.spec` measures the gap with `expect.poll` | |
| 5 | Event editor: each description reads label → H/B/U/•/1. toolbar → box; the toolbar stays outside the label (box's spoken name unchanged); tapping the label still focuses the box (G5) | `admin.spec` rich-text test: label above toolbar above textarea (bounding boxes), `label .richbar` count 0, box's accessible name = label text; picture | |
| 6 | Hyphenated button labels are Title Case in every part ("Sign-Ups", "Check-Up", "Ear-Tipped", …) and `button-case.spec` checks each part after a hyphen (G6) | `button-case.spec` extended; fails on main | |
| 7 | Regression: affected specs (admin*, home, cats, events, courts, pets tab rows, a11y) pass; design guard clean; PR CI green | Local runs; CI on the PR | |
