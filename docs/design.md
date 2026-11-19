# Commons design system

**Read this before building or restyling any Commons screen.** `/plan-change` Step 1b starts here; `/ship-pr` reviews
visible changes against it. Written 2026-11-19 (DS-2, `docs/plans/DS-design-system.md`) after Cats shipped looking
unlike Pets (`docs/qa/cats-design-review-2026-11-19.md`).

- **Brand** (palette, names, voice) lives in `docs/brand.md`; this file is how screens are *built*.
- **Tokens:** `commons/assets/tokens.css`. **Shared styles:** `commons/assets/app.css` (+ `mapui.css`, `tabbar.css`,
  `slots.css`). **Shared markup:** `commons/assets/*.js` as `jcXxxHtml` (returns markup) + `jcXxxWire` (adds events).
- **Reference screenshots:** `docs/design/` (iPhone 13, stubbed backend, taken with `/shot`). Re-take when the
  reference screen changes.

## How to read an entry

Every component uses the same fields (shape borrowed from shadcn-html's per-component spec):

| Field | Means |
|---|---|
| **Status** | **Shared** = one copy in `assets/`, use it · **Module-only** = lives in one module; on the 2nd use, promote it (§10) · **Gap** = no shared version yet; scheduled in DS-3 |
| **Native basis** | The HTML element it is built on |
| **Markup** | The shared function and/or the class structure |
| **Variants / states** | Allowed variants; nothing else |
| **Accessibility** | Roles, labels, keyboard, focus, Arabic |
| **Wiring** | What the page calls after setting `innerHTML` |
| **Use / Don't** | When it's the right piece; the drift it prevents (D-numbers = Cats review findings) |
| **Reference** | Screenshot in `docs/design/` |

---

## 1. Foundations

| Rule | Detail |
|---|---|
| Tokens only | Colours via `var(--jc-*)`, never raw hex in module CSS (only exception: ink on red `#2d0808` in `app.css`) |
| Four signals are reserved | `--jc-good` available/done · `--jc-warn` heads-up/due · `--jc-danger` alert/missing · `--jc-info` informational. Never decorative; never overridden by a community or event look |
| Colour is never the only signal | A state always says it in words too (slots, care status, Missing) |
| Logical properties only | `margin-inline`, `padding-inline`, `inset-inline`, `text-align:start`; Arabic mirrors from `dir`. Exception: map controls (Leaflet zoom is physically top-left) |
| Mirrored icons | Back, chevrons, prev/next: `transform:scaleX(-1)` under `[dir=rtl]` |
| User-typed text | `dir="auto"` (keeps Latin letters in order) **plus** `text-align:right` under `html[dir=rtl]` so it lines up with the Arabic. Pets does this for names but **not** for `dl.facts dd`: a Latin fact sits flush left in Arabic (`design/pet-stray-ar.jpg`). Fix in DS-3 |
| Type scale | `h1` 22px/800 · `h2.group` 12.5px caps muted · body 15px · `.meta` 12.5–13px muted · `.help` 12.5px faint |
| Inputs ≥ 16px text | iOS zooms on focus below 16px |
| Touch targets | ≥ 44px for anything primary; `.mini` 36px, inside cards only |
| Spacing | **12px between every block** (page shell) · 8px between buttons in a `.row` · 6px between pills. Nothing touches |
| Radius | `--jc-radius` 14px panels/cards · 10px fields and `.btn` · 8px `.mini` · pill for chips/choices |
| Focus | One ring everywhere (`app.css`): 2px accent, 2px offset. Never removed |
| Desktop | All ≥ 900px rules in one `@media` block in `app.css`: `.jcgrid` card columns, `.jcsplit` list + map. Phones unchanged |

### The three looks (never mixed up)

| Look | Class | Tappable? | For |
|---|---|---|---|
| **Chip** | `.chip` (`.miss`, `.warn`) | **Never** | A label: status, "Yours", "Wanderer", "Private location" |
| **Choice** | `.opts button` / `.filters button` with `aria-pressed` | Yes: pick one | Short fixed choice lists, filters |
| **Action** | `.btn` / `.btn.ghost` / `.mini` | Yes: does something | Save, Edit, Log, Report |

### Choosing a control for a choice

Basis: Apple's guidelines cap a segmented control at about 5 options on iPhone (slower to scan beyond that); NN/g:
show options openly when few, use a dropdown to save space when many; Baymard: don't fixate on an exact count.

| Use | When |
|---|---|
| **Pills** (`.opts`) | **≤ 5 options**, the list is **fixed in code**, and they fit in **2 rows** at phone width |
| **Dropdown** (`select`) | **≥ 6 options**, **or** the list comes from data and can grow (areas, stations, cats), whatever its size today |
| **Search** (`jcSearchHtml`) | A data list likely to pass ~15 items |
| **Checkbox** | Yes/no that is genuinely independent (not one of a set) |

Cats today: sex (3), life stage (4), ear tip (3), sterilisation (3) → pills · TNVR stage (6), status (8) → dropdown.

---

## 2. Page frame

### Page shell (12px rhythm)
| | |
|---|---|
| Status | **Module-only** (copied in `pets/pets.css:2-6` and `cats/cats.css:2-6`) → `app.css` in DS-3 |
| Native basis | `main`, `#view`, `[role=tabpanel]` |
| Markup | Flex columns, `gap:12px`; direct children carry no vertical margins |
| Accessibility | — |
| Wiring | — |
| Use / Don't | Every module page. Don't space blocks with margins |
| Reference | `design/pets-list.jpg` |

### Top bar (back, help, language)
| | |
|---|---|
| Status | **Shared** |
| Native basis | `a` (back, home), `button` (help, language) |
| Markup | `jcShell(me, cfg)`, `jcBack(target, labelKey)`, `jcHelp(key)` (`assets/nav.js`); `.topbar`, `.lang`, `.help-btn` |
| Variants / states | Back present on any page below a module's list |
| Accessibility | Back has a label from `labelKey`; mirrored in Arabic. Help: `aria-haspopup="dialog"`, opens `dialog.sheet` |
| Wiring | Called once per page by the shell |
| Use / Don't | Back left of the logo. Never a "‹ Events" text line |

### Page title
| | |
|---|---|
| Status | **Shared** |
| Native basis | `h1` |
| Markup | `h1` + optional `p.sub`. With an Admin button: `.evtop > .evtitle > h1 + a.adminbtn` |
| Accessibility | One `h1` per screen; it's where `jcFocusKeep` lands after a redraw |
| Use / Don't | A page about one thing with a photo uses the **hero header** (§4) instead |

### Sub-tabs
| | |
|---|---|
| Status | **Shared** |
| Native basis | `button` in a `div` |
| Markup | `jcTabsHtml(prefix, keys, selected, labelOf, name, panelId)`; content wrapper gets `jcTabPanel(prefix, selected, panelId)`; `.subtabs` |
| Variants / states | `aria-selected="true"` = accent underline. A row too wide scrolls sideways |
| Accessibility | `role=tablist` (labelled), `role=tab` + `aria-controls`, `role=tabpanel` + `aria-labelledby`. ←/→ (mirrored in Arabic), Home/End; roving tabindex; focus returns to the tab after redraw |
| Wiring | `jcTabsWire(prefix, keys, pick)` after `innerHTML` |
| Use / Don't | Sections of one page. **Never a heading inside a tab that repeats its name (D1)**; use `h2.group` |
| Reference | `design/pets-list.jpg`, `design/pet-stray.jpg` |

### Group label
| | |
|---|---|
| Status | **Shared** |
| Native basis | `h2` |
| Markup | `h2.group` |
| Accessibility | Real heading: screen-reader users jump between sections |
| Use / Don't | Sections inside a page or tab ("MISSING NOW", "CARE RECORD", "SIGHTINGS") |
| Reference | `design/pet-stray.jpg` |

### Message line
| | |
|---|---|
| Status | **Shared** |
| Native basis | `p` |
| Markup | `jcMsgBox()` under the title; `.msg.err` / `.msg.ok` |
| Variants / states | Error (red border) · OK (green border) · hidden |
| Accessibility | `jcSay` scrolls it into view after a write |
| Wiring | `jcShowErr(code)`, `jcShowErrFor(prefix, code)`, `jcShowOk(text)`; in-flight button: `jcBusy(id, on)` ("Working…" + disabled) |
| Use / Don't | One per screen. Errors by code, worded in `strings.js`. Don't add ad-hoc alert boxes |

### Bottom tab bar · footer · banner
| | |
|---|---|
| Status | **Shared** |
| Markup | `jcTabBar(root, active, cfg)` (`nav.js`), `jcFooter(root)` (`api.js`), `jcBanner(cfg)` (`nav.js`); `tabbar.css`, `.bcast` |
| Accessibility | Active tab `aria-current="page"`; labels clamp to 2–3 lines, never cut |
| Use / Don't | Every page. Never a page-specific nav bar |

---

## 3. Lists and cards

### Photo card grid
| | |
|---|---|
| Status | **Module-only** (`pets/pets.css` `.ptgrid/.ptcard/.ptbody`; `card()` in `pets/pets.js:262`) → shared in DS-3 |
| Native basis | `ul > li > button` |
| Markup | `ul.ptgrid > li > button.ptcard` = photo tile (`jcPetPhotoHtml(p, 34, "tile")`) + `.ptbody` (`b` name, `.meta` lines, `.head` chips) |
| Variants / states | 2 columns (default) · `.ptgrid.wide`: 1 column, photo beside text, for urgent items · `li.missing`: red 2px border |
| Accessibility | The whole card is one button; name is its first text; name `dir="auto"` |
| Wiring | Page binds click → open the item |
| Use / Don't | Any list of things with photos (pets, cats). **Not** a 44px-thumbnail row list (D2) |
| Reference | `design/pets-list.jpg` |

### List cards
| | |
|---|---|
| Status | **Module-only**, already drifting (copied in `pets/pets.css` and `bookings/bookings.css`) → shared in DS-3 |
| Native basis | `ul > li` |
| Markup | `ul.bklist > li`: optional `.meta` line, body, `.acts` row at the foot |
| Variants / states | `li.missing` red border |
| Use / Don't | Text entries without photos: sightings, activity, reports, bookings |
| Reference | `design/pet-sightings.jpg` |

### Card actions
| | |
|---|---|
| Status | **Shared** |
| Native basis | `button` |
| Markup | `.row` (or `.acts`) of `.mini` buttons at the **foot** of the card |
| Variants / states | `.mini` · `.mini.danger` · `:disabled` |
| Accessibility | 36px min; the label names the action ("Edit", not "✎") |
| Use / Don't | Never stacked loosely or floating beside content (D11). The card's main action may be an accent `.mini` |
| Reference | `design/admin.jpg` |

### Settings rows
| | |
|---|---|
| Status | **Shared** |
| Native basis | `ul > li > button` |
| Markup | `ul.setrows > li > button.setrow` = `span` (`b` name + `small` one line) + `.chev` |
| Variants / states | `.setrow.hot`: the line in accent (something needs attention) |
| Accessibility | 56px rows; chevron mirrored in Arabic |
| Use / Don't | A list of things that each open their own screen (settings, Organizer Tools → Community) |

### Record rows (care / status history)
| | |
|---|---|
| Status | **Shared** |
| Native basis | `ul > li` |
| Markup | `ul.care > li` = `.nm` name, `.st` state, `.note`; body text from `jcCareLogBody(c)` (`pet-photo.js`) |
| Variants / states | `.st-done` green · `.st-due` amber · plain muted ("Not recorded") |
| Accessibility | State is a word, not only a colour |
| Use / Don't | Any record or status history. **Never a bulleted list (D5)** |
| Reference | `design/pet-stray.jpg` (CARE RECORD) |

### Filters · search · sort line
| | |
|---|---|
| Status | **Shared** |
| Native basis | `button` group · `input` · `p` + `button` |
| Markup | `jcChipsHtml({id, prefix, label, items, current})` → `.filters` · `jcSearchHtml({id, placeholder, value})` · `jcSortedHtml(o)` (`map.js`) |
| Variants / states | Filter pill with a count `.n`; pressed = accent ring |
| Accessibility | Filters `role=group` + label, `aria-pressed`; search has `aria-label`, `inputmode=search`, `dir=auto`, matches without accents / Arabic short vowels |
| Wiring | `jcChipsWire(id, prefix, onPick)` (focus returns to the pill) · page filters on `input` · `jcSortedWire(o)` |
| Use / Don't | Order on a list page: urgent group → filters → search → sorted-by → cards |
| Reference | `design/pets-list.jpg` |

---

## 4. A thing's own page (pet, cat)

### Hero header
| | |
|---|---|
| Status | **Module-only** (`pets/pets.css` `.pthero/.ptwho`; `pets/pets.js:404-419`) → shared in DS-3 |
| Native basis | `div` + `h1` |
| Markup | `.pthero` = photo tile 104px (`jcPetPhotoHtml(p, 34, "tile", {view:true})`) **beside** `.ptwho` (`h1 dir=auto`, `.meta` "Kind · Status", chips). Sub-tabs follow (About · Sightings · Map) |
| Variants / states | A state box (§4) sits between hero and tabs when it applies |
| Accessibility | Photo opens the viewer (button); name mirrors in Arabic (`design/pet-stray-ar.jpg`) |
| Use / Don't | Every page about one animal / thing with a photo. **Never a full-width photo stacked above the name (D3)** |
| Reference | `design/pet-stray.jpg` |

### Facts list
| | |
|---|---|
| Status | **Module-only** (`pets/pets.css` `.facts`) → shared in DS-3 (with the Arabic alignment fix, §1) |
| Native basis | `dl` |
| Markup | `dl.facts > dt + dd[dir=auto]`, two columns: muted bold label, value |
| Variants / states | Long sets split under `h2.group` labels (Cats: About · Health · Where) |
| Accessibility | `dl` reads as label/value pairs |
| Use / Don't | Any label → value facts. **Never bullets (D3)** |
| Reference | `design/pet-stray.jpg` |

### Sightings block
| | |
|---|---|
| Status | **Module-only** (`sightingsHtml()` in `pets/pets.js:530`) → shared shell in DS-3; each module keeps its own data + RPCs |
| Native basis | `button` + `ul` |
| Markup | ghost `.btn` "Report seeing ⟨name⟩" → `h2.group` → `ul.bklist` (`.meta` when · by me, note, optional `.ptmini`, "Open in Google Maps") → `p.help` retention line |
| Variants / states | Empty: `p.help` instead of the list |
| Accessibility | Mini map is `role=img` + label; the link beside it is the real target |
| Wiring | `jcMiniMap(node, latlng)` for each `.ptmini` after `innerHTML` |
| Use / Don't | Every "seen this animal" feature. One component, not a Cats-only one (D4) |
| Reference | `design/pet-sightings.jpg` |

### State boxes
| | |
|---|---|
| Status | **Module-only** (`pets/pets.css` `.alarm`, `.seenbox`) |
| Markup | `.alarm` (red 2px: missing, with its own `.acts`) · `.seenbox` (amber 2px: heads-up) |
| Use / Don't | Above the tabs, on every tab. Red only for a real alarm |

### Photo + viewer
| | |
|---|---|
| Status | **Shared**; zoom is a **Gap** (D12, DS-3) |
| Native basis | `button` (tappable photo), `dialog` (viewer) |
| Markup | `jcPetPhotoHtml(p, size, cls, {view})` (`pet-photo.js`); `.ptph` `.thumb` 44px · `.tile` · `.big`; paw placeholder until loaded |
| Variants / states | `{view:true}` or a list of paths → opens `jcPhotoView(paths, i, from)`: full screen, count, prev/next |
| Accessibility | Count `aria-live`; prev/next labelled, mirrored in Arabic; ←/→ keys; one-finger swipe; focus returns to the photo on close |
| Wiring | `jcPetPhotoFill()` after `innerHTML` |
| Use / Don't | Every photo of a person's animal. Don't build a second viewer |

---

## 5. Forms

### Panel + Save + danger zone
| | |
|---|---|
| Status | **Shared** |
| Native basis | `form` / `div` |
| Markup | `.panel` (surface, 14px radius, 12px gap) → fields → one full-width `.btn` Save **at the bottom of everything**. Destructive actions in a separate `.panel.danger-zone` below (`.btn.ghost.danger`) |
| Use / Don't | Photos, extra sections, merge go **above** Save, never in boxes after it (D14) |
| Reference | `design/pet-edit.jpg` |

### Label · fieldset · legend · help
| | |
|---|---|
| Status | **Shared** |
| Native basis | `label`, `fieldset`, `legend`, `p` |
| Markup | `label` wraps its control (column, 13px muted bold) · groups: `fieldset > legend` · help under a field: `p.help` |
| Accessibility | Every control has exactly one accessible name |
| Use / Don't | **One caption per control: legend or label, never both saying the same word (D8)** |

### Text input
| | |
|---|---|
| Status | **Shared** (`input[type=text|email|password|number|tel]` in `app.css`) |
| Native basis | `input` |
| Variants / states | `:disabled` (opacity) · focus ring |
| Accessibility | 16px text; `dir="auto"` on free text |

### Textarea
| | |
|---|---|
| Status | **Gap** — copied in 5 files (`pets`, `cats`, `admin`, `events`, `home`) → one rule in `app.css` (DS-3) |
| Native basis | `textarea` |
| Markup | Same look as text inputs; min-height 80px; vertical resize. Optional `jcRichToolbar` (§5 rich text) |

### Dropdown (`select`)
| | |
|---|---|
| Status | **Gap** — styled bare in `cats.css` and `admin.css`, ≈30px on iOS (D7) → shared in DS-3 |
| Native basis | `select` |
| Markup | Target: 46px, field look, one own chevron (mirrored in Arabic) |
| Use / Don't | Per the choice table (§1). **Never redraw the form on `change` and re-focus a new `select`**: on iPhone it can re-open the picker (D9). Update only the dependent part |

### Date · time · datetime
| | |
|---|---|
| Status | **Gap** — copied in `cats.css` and `admin.css` (bare and `.pmform`) → shared in DS-3 |
| Native basis | `input[type=date|time|datetime-local]` |
| Markup | Target: field look, 46px, `appearance:none`, `color-scheme` from the theme |

### Choice pills
| | |
|---|---|
| Status | **Shared**, with drift: `events/events.css:50` and `home/home.css:27` redefine `.opts` → removed in DS-3 |
| Native basis | `button` in a `fieldset` |
| Markup | `fieldset > legend + .opts > button[aria-pressed]` |
| Variants / states | Pressed = accent ring |
| Accessibility | `aria-pressed`; 40px min |
| Use / Don't | Per the choice table (§1) |
| Reference | `design/pet-edit.jpg` (Kind of animal) |

### Checkbox
| | |
|---|---|
| Status | **Gap** — `.check` copied in Pets and Cats; browser-blue in both (D13) → shared, `accent-color:var(--jc-accent)` (DS-3) |
| Native basis | `input[type=checkbox]` in `label.check` |
| Markup | `label.check` (row, 20px box, then the text) |
| Reference | `design/pet-edit.jpg` (shows the blue to fix) |

### Tap-to-pick grid
| | |
|---|---|
| Status | **Module-only** (Cats `.caPicks/.caPick`) |
| Native basis | `button[aria-pressed]` |
| Use / Don't | Pick several things by photo (cats in a visit) |

### Rich text
| | |
|---|---|
| Status | **Shared** |
| Markup | `jcRichToolbar(textarea, preview)` + `jcRich(src)` (`rich.js`); `.rich`, `.richpreview` |
| Use / Don't | Event descriptions. Stored as plain markers, rendered by `jcRich` |

---

## 6. Maps

| Piece | Status | Markup / function | Use |
|---|---|---|---|
| Full map | Shared | `jcMapHtml` / `jcBigMap` (`map.js`); `.evmapwrap > .evmap`, `mapui.css` | A module's map tab |
| Pin popup | Shared | `jcPopHtml({head, body, acts})`; `.pop` | Every pin |
| Map key | Shared | `jcKeySheet` / `jcKeySheetHtml`; `dialog.sheet .legend` | "Map Labels" |
| Pin picker | Shared | `jcPinPickerHtml` + `jcPinPicker`; `.pinmap` (fixed ring, map pans) | Choosing a place |
| Where field | Shared | `jcWhereHtml` / `jcWhereWire` (`where.js`) | "Where" on a report form |
| Mini map | Shared | `jcMiniMap(node, latlng)`; `.ptmini` | A still dot inside a list entry |
| You-are-here | Shared | `jcMeDot`; `--jc-me` | Every map |

Accessibility for all maps: the map is never the only way to reach information. Each pin's content is also in a list,
and each mini map has a text link next to it.

---

## 7. Dialogs

| | |
|---|---|
| Status | **Shared** |
| Native basis | `dialog` (`showModal`) |
| Markup | `dialog.sheet > .sheethead (h2 + close)` · help: `jcHelpOpen(key)` → `.helplist` · photo viewer: `dialog.photoview` |
| Accessibility | Tapping outside closes (help sheet); Esc closes (native `dialog`). Photo viewer returns focus to the photo (`jcPvBack`); other sheets: not verified — check when building one |
| Use / Don't | Never a custom overlay `div` |

---

## 8. Never

1. **Never style bare elements in module CSS** (`select`, `input`, `textarea`, `label`, `button`), with or without a
   type or a parent selector (`.panel textarea` counts). Fix the shared look in `app.css` for everyone. (DS-5 CI.)
2. **Never copy a shared or module-only piece into another module.** Promote it (§10). (DS-5 CI: duplicate rules.)
3. **Never a heading that repeats the tab name** inside the tab (D1).
4. **Never bulleted lists for facts or history**: `dl.facts` / `ul.care` (D3, D5).
5. **Never two captions for one control** (D8).
6. **Never a dropdown for ≤ 5 fixed choices; never pills for a list that grows** (§1 choice table, D7).
7. **Never chips that do something, or buttons that look like chips.**
8. **Never colour as the only signal; never a reserved signal colour as decoration.**
9. **Never raw colours or physical left/right** in module CSS.
10. **Never a module-only action** where a sibling module already has the same action: use its placement and
    wording ("Report seeing ⟨name⟩", one "Log activity" entry point, D10).

---

## 9. Screens to match

| If you're building… | Match | Screenshot |
|---|---|---|
| A list of animals / things with photos | Pets list | `design/pets-list.jpg` |
| One animal's / thing's page | Pet page, About | `design/pet-stray.jpg` · AR `design/pet-stray-ar.jpg` |
| A sightings or activity log on that page | Pet page, Sightings | `design/pet-sightings.jpg` |
| An add / edit form | Edit pet | `design/pet-edit.jpg` |
| An organizer list with card actions | Organizer Tools → Events | `design/admin.jpg` |

---

## 10. Changing this system

### Promoting a module-only piece (the 2nd use)
The plan for the feature that needs it marks it **EXTRACT** in its Prior Art table (`/plan-change` Step 1b). In
**the same PR** as the second use:

1. Move the CSS to `app.css` (or a shared `assets/*.css`) and the markup to `assets/*.js` as `jcXxxHtml` / `jcXxxWire`.
2. **Delete** the module copy; the first module now calls the shared one.
3. Set this entry's Status to **Shared** and point Markup at the new function.
4. Re-take the reference screenshot for **both** modules; the PR's visual Done-when compares them.

### A new rule found during a build
Add it here (an entry field or a "Never") in the same PR (`/ship-pr` step 1b).

### What enforces this
| Check | Catches | Where |
|---|---|---|
| Prior Art + Screens to match tables | Building without looking | `/plan-change` Step 1b |
| Visual Done-when (side-by-side) + UI review | Re-invention that looks different | `/plan-change` Step 4, `/ship-pr` 1b |
| Bare-element guard | Module CSS restyling shared controls | CI `design-guard.yml` (`tests/ci/design-guard.mjs`) |
| Duplicate-rule guard | The same rule body (≥ 3 declarations) in two CSS files | CI `design-guard.yml` |
| Plan conformance table | The build ignoring the plan's rows | `/ship-pr` step 3b |
| Plan-followed guard | A PR body without Done when / Screens to match / Plan conformance | CI `plan-followed.yml` |

**Baseline** (`tests/ci/design-guard-baseline.txt`): the offenders that existed on 2026-11-19 — 51 bare-element
rules and 19 duplicated bodies across all modules. It may only **shrink**: a new offender fails, and so does a
line that no longer matches (you fixed it: delete the line in the same PR). Never add a line to make CI pass.
