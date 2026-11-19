# Commons design system

**Read this before building or restyling any Commons screen.** `/plan-change` Step 1b starts here; `/ship-pr` reviews
visible changes against it. Written 2026-11-19 (DS-2, `docs/plans/DS-design-system.md`) after Cats shipped looking
unlike Pets (`docs/qa/cats-design-review-2026-11-19.md`).

- **Brand** (palette, names, voice) lives in `docs/brand.md`; this file is how screens are *built*.
- **Tokens** live in `commons/assets/tokens.css`. Shared styles in `commons/assets/app.css` (+ `mapui.css`,
  `tabbar.css`, `slots.css`). Shared markup in `commons/assets/*.js` as `jcXxxHtml` (markup) + `jcXxxWire` (events).
- **New rule found during a build** → add it here in the same PR (ship-pr step 1b).

**Status** on each entry: **Shared** = one copy, use it · **Pets-only → DS-3** = lives in `pets/`, gets extracted to
`assets/` in DS-3 (until then, don't copy it: reference it in the plan as EXTRACT) · **Gap → DS-3** = no shared
version exists yet; every module styles its own today.

Reference screenshots: `docs/design/` (iPhone 13, stubbed backend, `/shot`). Re-take them when the reference screen
changes.

---

## 1. Foundations

| Rule | Detail |
|---|---|
| Tokens only | Colours via `var(--jc-*)`, never raw hex in module CSS. Exception kept: ink on red (`#2d0808`) in `app.css` |
| Four signals are reserved | `--jc-good` available/done · `--jc-warn` heads-up/due · `--jc-danger` alert/missing · `--jc-info` informational. Never decorative, never overridden by a community or event look |
| Colour is never the only signal | A state chip/word always says it in text too (slots, care status, missing) |
| Logical properties only | `margin-inline`, `padding-inline`, `inset-inline`, `text-align:start`. Arabic mirrors from `dir`, not from extra rules. Exceptions: map controls (Leaflet zoom is physical top-left) |
| Mirrored icons | Back, chevrons, next/prev get `transform:scaleX(-1)` under `[dir=rtl]` |
| Names in Arabic | User-typed text gets `dir="auto"` (keeps Latin letters in order) **plus** `text-align:right` under `html[dir=rtl]`, so it still lines up with the Arabic around it. Pets does this for names (`pets.css`) but **not** for `dl.facts dd` — a Latin fact sits flush left in Arabic (`design/pet-stray-ar.jpg`, "Behind the mosque"). Fix in DS-3 when facts move to `app.css` |
| Type scale | Page title `h1` 22px/800 · group label `h2.group` 12.5px caps muted · body 15px · meta 12.5–13px muted · help 12.5px faint |
| Inputs ≥ 16px text | iOS zooms on focus below 16px |
| Touch targets | ≥ 44px for anything primary; `.mini` is 36px (card-internal only) |
| Spacing rhythm | **12px between every block on a page** (page shell, below); 8px between buttons in a `.row`; 6px between pills. Nothing touches |
| Radius | `--jc-radius` (14px) panels/cards · 10px fields and `.btn` · 8px `.mini` · pill for chips/choices |
| Focus | One ring for every control (`app.css`): 2px accent, 2px offset. Never remove it |
| Desktop | Everything ≥ 900px sits in one `@media` block in `app.css`. `.jcgrid` for card columns, `.jcsplit` for list + map. Phones unchanged |

### The three looks (never mixed up)

| Look | Class | Is it tappable? | Use for |
|---|---|---|---|
| **Chip** | `.chip` (+ `.miss`, `.warn`) | **Never** | A label: status, "Yours", "Wanderer", "Private location" |
| **Choice** | `.opts button` / `.filters button` (`aria-pressed`) | Yes, pick one | Short choice lists, filters |
| **Action** | `.btn` / `.btn.ghost` / `.mini` | Yes, does something | Save, Edit, Log, Report |

Buttons never look like chips; chips never look tappable.

---

## 2. Page frame

### Page shell + 12px rhythm — Pets-only → DS-3
- **What:** `main` and `#view` as flex columns with `gap:12px`; tab panels the same; no margins on direct children.
- **Where today:** copied in `pets/pets.css:2-6` and `cats/cats.css:2-6`. DS-3 moves it to `app.css`.
- **Use:** every module page.

### Top bar, back, help, language — Shared
- `jcShell` / `jcBack(target, labelKey)` / `jcHelp(key)` (`assets/nav.js`); `.topbar`, `.lang`, `.help-btn`.
- Back sits left of the logo (mirrored in Arabic). Never a "‹ Events" text line.

### Page title — Shared
- `h1` + optional `.sub`. With an Admin button: `.evtitle` (title, then `.adminbtn`).
- A page whose subject has a photo uses the **hero header** instead (below).

### Sub-tabs — Shared
- `jcTabsHtml(prefix, keys, selected, labelOf, name, panelId)` + `jcTabPanel` + `jcTabsWire` (`assets/nav.js`); `.subtabs`.
- `role="tablist"` / `aria-selected`; a row too wide scrolls sideways.
- **Rule (D1):** no heading inside a tab that repeats the tab's name. Use group labels for sections inside it.
- Reference: `design/pets-list.jpg`, `design/pet-stray.jpg`.

### Group label — Shared
- `h2.group`: small caps, muted. Separates sections within a page or tab ("MISSING NOW", "CARE RECORD", "SIGHTINGS").

### Message line — Shared
- `jcMsgBox()` under the title; `jcSay` / `jcShowErr(code)` / `jcShowErrFor(prefix, code)` / `jcShowOk(text)`
  (`assets/api.js`); `.msg.err` / `.msg.ok`. One per screen. Errors by code, worded in `strings.js`.
- In-flight button: `jcBusy(id, on)` ("Working…" + disabled).

### Bottom tab bar + footer — Shared
- `jcTabBar(root, active, cfg)` (`assets/nav.js`), `jcFooter(root)` (`assets/api.js`); `tabbar.css`. Every page.

### Banner — Shared
- `jcBanner(cfg)`; `.bcast`. Organizers' announcement on member pages.

---

## 3. Lists and cards

### Photo card grid — Pets-only → DS-3
- **What:** two-column photo cards; each card is one `<button class="ptcard">`: square photo tile on top, then
  `.ptbody` (bold name, `.meta` lines, chips row `.head`). `.ptgrid.wide` = one column, photo beside the text
  (used for urgent items, e.g. missing pets, full width on top, red border).
- **Where today:** `pets/pets.css` (`.ptgrid`, `.ptcard`, `.ptbody`); markup `card()` in `pets/pets.js:262`.
- **Use:** any list of things with photos (pets, cats). **Not** a 44px-thumbnail row list (D2).
- A11y: the whole card is one button; the name is its first text.
- Reference: `design/pets-list.jpg`.

### List cards — Pets-only → DS-3
- `ul.bklist > li`: surface card, 12×14 padding, 6px internal gap; `.meta` muted line; `.acts` row at the foot.
- **Where today:** copied in `pets/pets.css` and `bookings/bookings.css`.
- **Use:** text entries without photos — sightings, activity entries, reports, bookings.

### Card actions — Shared
- Actions inside a card: `.mini` buttons in a `.row` (or `.acts`) at the **foot** of the card, never stacked loosely
  or floating beside content (D11). Destructive: `.mini.danger`.
- Reference: `design/admin.jpg` (event card: Sign-ups · Edit · Pause · Close · View).

### Settings rows — Shared
- `.setrows > li > button.setrow` (name, one line of what it's for, chevron). Each row opens its own screen.

### Record rows (care / status history) — Shared
- `ul.care > li` with `.nm` (name), `.st` (`.st-done` green · `.st-due` amber · muted otherwise), `.note`.
  Body text: `jcCareLogBody(c)` (`assets/pet-photo.js`).
- **Use:** any record or status history (D5), never a bulleted list.
- Reference: `design/pet-stray.jpg` (CARE RECORD).

### Filters, search, sort — Shared
- Filter pills: `jcChipsHtml({id, prefix, label, current, …})` + `jcChipsWire` (`assets/api.js`); `.filters`.
- Search: `jcSearchHtml({id, placeholder, value})` — filters the list already on the phone.
- Sort line: `jcSortedHtml` / `jcSortedWire` (`assets/map.js`) — "Sorted by: …" + Use Where I Am / Use My Home.
- Order on a list page: urgent group → filters → search → sorted-by → cards. Reference: `design/pets-list.jpg`.

---

## 4. A thing's own page (pet, cat, event)

### Hero header — Pets-only → DS-3
- `.pthero`: photo tile (104px, rounded) **beside** `.ptwho` (`h1` name with `dir="auto"`, `.meta` "Kind · Status",
  chips). Then sub-tabs (About · Sightings · Map).
- **Where today:** `pets/pets.css` + `pets/pets.js:404-419`.
- **Use:** every page about one animal / thing with a photo. Never a full-width photo stacked above the name (D3).
- Reference: `design/pet-stray.jpg`, Arabic `design/pet-stray-ar.jpg`.

### Facts list — Pets-only → DS-3
- `dl.facts`: two columns, muted bold label (`dt`) beside value (`dd dir="auto"`).
- Group longer sets under `h2.group` labels (Cats: About · Health · Where).
- **Use:** any label → value facts. Never bullets (D3).
- Reference: `design/pet-stray.jpg` (Status / Usually around).

### Sightings block — Pets-only → DS-3
- Ghost `.btn` "Report seeing <name>" at the top → `h2.group` "SIGHTINGS" → `ul.bklist` entries (`.meta` when ·
  by me, note, optional `jcMiniMap`, "Open in Google Maps") → `.help` retention line.
- **Where today:** `sightingsHtml()` in `pets/pets.js:530`.
- **Use:** every "seen this animal" feature; each module keeps its own data and RPCs (D4).
- Reference: `design/pet-sightings.jpg`.

### State boxes — Pets-only (extract when a second module needs one)
- `.alarm` (red border: missing — with its own actions) and `.seenbox` (amber: heads-up). Sit above the tabs, on
  every tab.

### Photo + viewer — Shared
- `jcPetPhotoHtml(p, size, cls, {view})` (`assets/pet-photo.js`); `.ptph` sizes `.thumb` 44px · `.tile` · `.big`;
  paw placeholder until loaded. `{view:true}` makes it open `jcPhotoView(paths, i, from)` — full-screen, swipe/arrows.
- **Gap → DS-3:** zoom (double-tap / button) in the viewer (D12) — fixes Pets and Cats together.

---

## 5. Forms

### Panel — Shared
- A form sits in a `.panel` (surface, 14px radius, 12px gap). One `.btn` Save at the **bottom of everything**,
  full width. Photos, extra sections, merge etc. go **above** Save, not in boxes after it (D14).
- Destructive actions in a separate `.panel.danger-zone` below the form (`.btn.ghost.danger`).
- Reference: `design/pet-edit.jpg`.

### Labels, legends — Shared
- `label` wraps its input (column, 13px muted bold). A group of pills/checks is a `fieldset` + `legend`.
- **Rule (D8):** one caption per control: the legend **or** the label, never both saying the same word.
- Help under a field: `p.help`.

### Text inputs — Shared
- `input[type=text|email|password|number|tel]` styled in `app.css` (46px, 16px text, surface-2).

### Textarea — Gap → DS-3
- Same look as text inputs, min-height 80px, vertical resize. **Today copied in 5 files** (`pets`, `cats`, `admin`,
  `events`, `home`). DS-3: one rule in `app.css`, delete the copies.

### Dropdown (`select`) — Gap → DS-3
- Target: 46px tall, same field look as inputs, one own chevron (mirrored in Arabic). **Today styled bare in
  `cats.css` and `admin.css`**, ≈30px on iOS (D7).
- **Use only for long lists** (areas, stations, cats). A short choice list (≤ ~6: sex, life stage, ear tip, status)
  is `.opts` pills instead.
- Never redraw the form on `change` and re-focus a new `select`: on iPhone that can re-open the picker (D9).
  Update only the part that depends on it.

### Date / time / datetime — Gap → DS-3
- Target: same field look, 46px, `appearance:none`, `color-scheme` from the theme. **Today copied in `cats.css` and
  `admin.css`** (bare and `.pmform`).

### Choice pills — Shared (overrides to remove in DS-3)
- `fieldset > legend + .opts > button[aria-pressed]` — pick one. Reference: `design/pet-edit.jpg` (Kind of animal).
- **Drift:** `events/events.css:50` and `home/home.css:27` redefine `.opts` (surface-2 background). DS-3 removes them.

### Checkbox — Gap → DS-3
- `label.check` (row, 20px box). Target: accent-coloured (`accent-color:var(--jc-accent)`), shared. **Today
  browser-blue in Pets and Cats** (D13; `.check` copied in both).

### Tap-to-pick grid — Cats-only (candidate)
- `.caPicks > button.caPick[aria-pressed]` (photo + name, pick several). Keep in Cats until a second module needs it.

### Rich text — Shared
- `jcRichToolbar(textarea, preview)` + `jcRich(src)` (`assets/rich.js`); `.rich`, `.richpreview`.

---

## 6. Maps

| Piece | Shared function / classes | Use |
|---|---|---|
| Full map | `jcMapHtml` / `jcBigMap` (`assets/map.js`); `.evmapwrap > .evmap`, `mapui.css` | A module's map tab (Events, Courts, Strays) |
| Pin popup | `jcPopHtml({head, body, acts})`; `.pop` | Every pin |
| Map key | `jcKeySheet` / `jcKeySheetHtml`; `dialog.sheet`, `.legend` | "Map Labels" |
| Pin picker | `jcPinPickerHtml` + `jcPinPicker`; `.pinmap` (fixed ring, map pans) | Choosing a place |
| Where field | `jcWhereHtml` / `jcWhereWire` (`assets/where.js`) | "Where" on a report form |
| Mini map | `jcMiniMap(node, latlng)`; `.ptmini` | A still dot inside a list entry |
| You-are-here | `jcMeDot`; `--jc-me` blue | Every map |

---

## 7. Dialogs and help

- Pop-up window: native `<dialog class="sheet">` + `.sheethead` (title + close).
- Page help: `jcHelp(key)` → the "?" in the top bar opens a sheet with `.helplist`.
- Photo viewer: `dialog.photoview` (section 4).

---

## 8. Never

1. **Never style bare elements in module CSS** (`select`, `input`, `textarea`, `label`, `button`, with or without a
   type or a parent selector). If the shared look is wrong, fix it in `app.css` for everyone. (DS-5 adds a CI guard.)
2. **Never copy a shared piece's CSS or markup into a module.** Not shared yet → EXTRACT it to `assets/` first.
3. **Never a heading that repeats the tab name** inside the tab (D1).
4. **Never bulleted lists for facts or history** — `dl.facts` / `ul.care` (D3, D5).
5. **Never two captions for one control** (D8).
6. **Never a `select` for ≤ ~6 choices** — `.opts` pills (D7).
7. **Never chips that do something, or buttons that look like chips.**
8. **Never colour as the only signal; never a reserved signal colour as decoration.**
9. **Never raw colours or physical left/right** in module CSS (tokens + logical properties).
10. **Never a module-only action button** where a sibling module already has the same action — use its placement
    and wording (e.g. "Report seeing <name>", one "Log activity" entry point, D10).

---

## 9. Screens to match (current references)

| If you're building… | Match | Screenshot |
|---|---|---|
| A list of animals / things with photos | Pets list | `design/pets-list.jpg` |
| One animal's / thing's page | Pet page (About) | `design/pet-stray.jpg` · AR `design/pet-stray-ar.jpg` |
| A sightings or activity log on that page | Pet page (Sightings) | `design/pet-sightings.jpg` |
| An add / edit form | Edit pet | `design/pet-edit.jpg` |
| An organizer list with card actions | Organizer Tools → Events | `design/admin.jpg` |
