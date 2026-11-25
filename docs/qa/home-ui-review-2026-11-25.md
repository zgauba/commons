# Home UI review — 2026-11-25

Scope: `commons/home/` (Home / Household / Account tabs, claim, pin, edit, invite outcomes, signed-out).
Method: `/shot sweep home` (31 tests, 31 pictures, all passed) + single `/shot` runs for screens no test ends on
(Account tab EN, Fix House Details, invite panel). Tier: cosmetic (markup + strings; no data, auth or PII change) —
suite once + CI + screenshots, no reviewer agent.

## Findings and dispositions

| # | Screen | Finding | Disposition |
|---|---|---|---|
| H1 | Account tab | Leave This Home and Delete My Account shared one box; "This deletes your account…" sat right under Leave, so leaving read as deleting | **Fixed**: two `.panel.danger-zone` boxes (design.md "Panel + Save + danger zone"); the delete text + DELETE box live in Delete's box only |
| H2 | Account tab | Save and Sign Out stacked as identical buttons in the name box | **Fixed**: "Signed in as ⟨email⟩" + Sign Out in their own box (the Account page's pattern); name form is its own box |
| H3 | My Home after saving a pin | "Pinned on the map" twice (flash + the card's status line) | **Fixed**: flash dropped; the status line says it |
| H4 | Fix House Details | "Back" text link under the card; Pin Your Home uses Save + Cancel side by side | **Fixed**: Save + Cancel (`.btn.ghost`) in one row |
| A | All modules | Button casing mixed: Title Case in Home/Events/Pets, sentence case in Cats and parts of Admin/Courts | **Decided (Zeeshan): Title Case everywhere.** 68 English labels retitled; prose that names a button updated to match (help text, a few messages/confirms); rule added to design.md Foundations; `button-case.spec.js` enforces it |
| B | Pin (and Pets/Cats maps) | Location refused shows a red error box although it's recoverable | **Kept red** (Zeeshan) |

Not findings: Seef Al Jubail has no Arabic subtitle because the stub sets `ar: null` on purpose; the bottom bar
over cards in full-page pictures is a screenshot artifact (fixed bar).

## Title Case pass — how the labels were found
1. Static scan of every `<button>` / `.btn` span, choice-pill items and Cats `pillsHtml` prefixes (now `button-case.spec.js`): 53 + 12 labels.
2. Runtime harvest: a temporary `stubBackend` hook (not committed) logged the text of every button the full mobile suite rendered; it found 3 more that reach buttons through a variable (`pt_sight`, `pt_sight_out`, `ct_act_day`).
   **Limit:** the spec cannot see labels passed through a variable; a new one of those can slip through.
Left as they are: text links ("Forgot your password?", "Have an organizer code?", "Save Commons as an app"), the
busy text "One moment…", the update banner, and per-event answer choices ("Front gate", "Candy only"), which are
organizer-written event data, not app strings.

## Evidence
- `button-case.spec.js` fails on main's `strings.js` (53 labels listed) and passes on the branch.
- New / changed `home.spec` tests (Account boxes, Fix House Details Cancel, pin said once) fail on main's `home.js`, pass on the branch.
- Full mobile suite: 813 passed (local, once). Design guard: OK (baseline only).
- Pictures looked at: Account tab EN + AR, Fix House Details, invite panel (now reachable: `jc_invite_create` in `specs/backends.js`).

## Gaps (not done here)
- Tab rows at 320px (Organizer Tools; Cats 5 tabs): left for the Admin UI review.
- "Pending approval" invite outcome and the feedback "sent" state: not pictured.
