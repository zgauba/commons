# PV — Photo viewer (shared) — `/plan-change` 2026-11-17

> Status: **approved 2026-11-17 (Zee: list cards keep opening the pet; no custom zoom), built 2026-11-18 (PV-1).** Second shared step before Community Cats (`docs/plans/CC-community-cats.md`): CC-3
> gives each cat up to 4 ID photos, shown here. ROADMAP → "Photo viewer (shared)".

## Step 0 — Scope

- **Tier: localized + one shared helper (`assets/pet-photo.js`).** Frontend only. No DB, auth, storage rule, job or
  paid layer. It reuses the signed URLs already fetched, so there are **no new downloads**: the stored photo is
  already the ≤ 1280 px original. Verification tier: **screen logic** → affected specs + CI + `code-reviewer`.
- Manifest LAST VERIFIED 2026-11-17. No `[live]` layer touched.

## Step 1 — Inventory

| Layer | Touched? | Check |
|---|---|---|
| Photo display sites | **8 found.** Pets: list card tile `pets.js:268` (**inside a `<button>`**, the card), detail hero `:407`, edit form saved / picked `:809-810`, report form picked `:984`, My Reports tile `:1172`. Organizer Tools: stray editor saved / picked `admin.js:692-693`, stray report card `:2271` | grep `jcPetPhotoHtml\|ptph` |
| Events / Bookings / Home | **No photos anywhere** → nothing to retrofit today; the viewer is ready for them | grep `photo\|img` in `events/ bookings/ home/` |
| Shared photo code | `assets/pet-photo.js`, loaded by Pets + Organizer Tools only; signed-URL cache + one retry | read file |
| Pop-up pattern | native `<dialog class="sheet">`: help `nav.js:279`, map key `map.js:276`; Escape is native; tap outside closes; `map.js:100` already ignores Escape while any `dialog[open]` | read |
| CSP | `img-src` already allows the signed pet-photos origin on Pets + Organizer Tools (the only pages with photos) | `pets/index.html:7`, `admin/index.html:6` |
| DB / auth / storage / jobs / hosting / CI / secrets | **Not touched**: JS + CSS + strings only, no new file to register (it lives in `pet-photo.js`) | path scope |

## Step 1b — Prior art

| Building block | Existing | Decision |
|---|---|---|
| Modal | `dialog.sheet` + outside-tap close (`nav.js`, `map.js`) | **REUSE the pattern**: native `<dialog>`, own class `photoview` (full-screen, dark) since a 420 px sheet is too small for a photo |
| Loading a photo | `jcPetPhotoHtml` + `jcPetPhotoFill` (signing, cache, paw while loading, one retry) | **REUSE as-is**: the viewer renders a `data-photo` span and calls `jcPetPhotoFill()` |
| Close label | `ev_labels_close` "Close" / "إغلاق" | **REUSE** |
| Lightbox / gallery | none (grep `lightbox`, `gallery`, `swipe`) | **NEW shared**: `jcPhotoView(paths, i)` in `pet-photo.js` |
| Tappable photo | none | **NEW**: `jcPetPhotoHtml(p, size, cls, { view: true })` wraps the photo in a `<button>` labelled "View photo" |

## Step 2 — Impact map

1. **Which photos open the viewer.** Wherever a *saved* photo is shown and isn't already inside a button: pet
   detail hero, My Reports tile, Organizer Tools stray report card, stray editor's saved photo. (c) **List cards**
   are buttons that open the pet, so a button inside them is invalid HTML and taps would fight. **The card keeps
   opening the pet**, same as Events cards. Unsaved picked previews (edit / report forms) are excluded: they're
   being chosen, not viewed.
2. **The viewer.** Full-screen dark window, photo fitted to the screen (`object-fit: contain`), Close button. Escape
   and a tap outside the photo also close it. Focus goes back to the photo that opened it (native `<dialog>`).
   Several photos: "2 of 4", previous / next buttons, arrow keys, and swipe. **In Arabic** the arrows and swipe are
   mirrored. (c) The map's Escape handler already skips open dialogs. (d) Assume one photo per pet / report today,
   so next / previous is proven by a test with 2 stubbed photos until CC-3 brings real ones.
3. **Strings:** `pv_view` "View photo", `pv_prev`, `pv_next`, `pv_count` "{n} of {t}". EN + AR, with the AR
   wording added to the existing AR review list.

## Step 3 — Regression surface

- Pets list card tap opens the pet (not the viewer); hero, edit, remove-photo and My Reports buttons are unchanged.
- Organizer Tools: stray report actions (make a stray, close) and the stray editor's Change / Remove photo work as
  before.
- Photo still shows the paw until it loads and retries once on a dead link (existing `pets.spec` photo tests).
- Map Labels / help windows and the full-screen map keep their Escape behaviour.

## Step 4 — Proposal (one PR, PV-1)

- `pet-photo.js`: `view` option on `jcPetPhotoHtml`, `jcPhotoView(paths, i)` (dialog built once, delegated click on
  `[data-view]`), keys + swipe (pointer events, 40 px threshold, mirrored in RTL).
- `app.css`: `dialog.photoview` + `.ptview` button reset (looks identical to today's photo, plus a focus ring).
- `pets.js` (2 call sites), `admin.js` (2 call sites): pass `{ view: true }`.
- `strings.js`: 4 keys × EN/AR.
- New `photo-viewer.spec.js`: open from the hero (EN + AR), close by button / Escape / outside tap with focus
  returned; the list card still opens the pet; Organizer Tools report card opens it; 2-photo stub: next / previous
  by button, arrow keys (mirrored in AR) and swipe; "2 of 2" counter.
- **Cost: $0. Diff: ~70 JS + ~20 CSS + ~10 strings + ~130 test.** No migration, no cache step.

## Step 5 — Premortem

| # | Mode | Exposed? | Mitigation |
|---|---|---|---|
| 1, 2, 2b, 6 | data / zero-output / drift / auth | **No**: no data written, same signed URLs | — |
| 3 | Cost | No (no extra downloads, same cached URL) | — |
| 4 | Contract drift | No | — |
| 5 | Race | **Small**: the signed URL expires while the viewer is open | `jcPetPhotoFill` re-signs 5 min early and retries once; the paw shows rather than a broken image |
| 7 | Rollback | Covered | one-PR `git revert`, frontend only |
| UX | Users tap a list card's photo expecting it to enlarge, and get the pet instead | **Yes, mild** | It matches Events cards, and the hero one tap later enlarges |
| UX | iPhone: a tap outside closes the window by accident while swiping | **Yes** | close only on a tap (pointer moved < 10 px), never at the end of a swipe |
| UX | No pinch-to-zoom inside the photo | Accepted | the phone's own zoom still works; photos are ≤ 1280 px, so there's little detail to gain |

## Questions for Zee

1. **List cards keep opening the pet** (only the photo on the pet's own page, reports and Organizer Tools enlarges).
   *Recommended*, because a photo button inside the card button would make taps unreliable.
2. **No custom zoom in v1** (fit to screen, swipe between photos). *Recommended*. Add zoom later only if testers ask.
