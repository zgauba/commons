# OT-1: Organizer Tools Events chips + search, Banner → Announcement: review (2026-11-14)

Plan: `docs/plans/OT-organizer-tools-ia.md` (Zee 2026-11-14: D1 "let's see how filter chips look" → "look great, add an All chip"; D4 Announcement). Tier: **screen logic**, so `code-reviewer`. No database change.

## What changed

- **Organizer Tools → Events:** chips **All · Now · Upcoming · Past**, each with a count, plus a **Search events** box.
  - Now = live and started. Past = ended or archived. Upcoming = the rest (drafts, coming soon, a later date).
  - It opens on Now (else Upcoming, else Past). All lists Now, then Upcoming (soonest first), then Past (newest first).
  - The chip stays in the address (`?show=`), so a reload or Back returns to it.
  - Search matches English and Arabic titles, the short name and the venue. It ignores accents and Arabic short vowels. It narrows every chip's count.
  - **After a save, Publish, Coming Soon, Open sign-ups or Close, the list follows the event to its new chip**, and clears a search that would hide it. Found while migrating tests: a new draft used to vanish from the Now view.
- **Shared pieces** in `assets/api.js` (`jcChipsHtml`, `jcChipsWire`, `jcSearchHtml`, `jcNorm`, `jcMatches`). The residents' Pets filter now uses them. The chip CSS moved to `assets/app.css`.
- **Banner → Announcement** in EN and AR wherever organizers or members see the name. The event-night prompts (`ev_banner*`) are unchanged.
- **Tab rows (`.subtabs`)** scroll sideways when too wide (Organizer Tools: 5 tabs), and the selected tab scrolls into view. Rows that fit keep equal widths.

## Findings and disposition (`code-reviewer`: APPROVE, 0 critical / 0 high)

| # | Sev | Finding | Disposition |
|---|---|---|---|
| 1 | MEDIUM | `overflow-x:auto` on `.subtabs` could clip the underline (the buttons sat 1px below the row) | **Fixed.** The row line is now an inset shadow, with `overflow-y:hidden` and no negative margin. Screenshots: underline whole. |
| 2 | MEDIUM | `flex:1 0 auto` made tabs unequal in rows that fit | **Fixed.** `flex:1 0 0; min-width:max-content`: equal while the row fits, never narrower than the label. Event detail (AR) checked. |
| 3 | LOW | AR `acc_can` still said "نشر تنبيه" | **Fixed:** "نشر إعلان". |
| 4 | LOW | `evFollow` pins the chip even when none was chosen | **Kept (intended).** Showing the event just changed beats keeping an unchosen default. |
| 5 | LOW | An active search could hide a just-saved event | **Fixed.** `evFollow` clears a search that doesn't match. Test added. |
| 6 | LOW | No live region on search results | **Partly fixed:** `role="status"` on the empty / no-match line. |

## Verification

- **New `admin-events-chips.spec.js` (9 tests × 2 browsers):**
  - chips, counts, default, per-chip order, focus
  - `?show=` kept over a reload; a bogus value falls back
  - nothing on now → Upcoming, and the empty wording
  - search: accents, Arabic, counts, no match, focus kept
  - hostile title
  - follow after close and after a new draft (the search is cleared)
  - All stays All
  - Arabic chips
- **Migrated:** 30 tests open `?show=all` or tap All where they act on drafts or past events, plus the Announcement wording and tab names. No assertion was weakened.
- **Full suite, both browsers:** 1272 passed (before the review fixes). Affected specs after the fixes: 492 passed.
- **Screenshots:** Organizer Tools EN/AR (chips, the scrolling tab row, Announcement), event detail AR (equal tabs, underline whole).
