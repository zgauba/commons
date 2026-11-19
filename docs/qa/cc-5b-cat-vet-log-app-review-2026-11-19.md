# CC-5b — Cats vet log (app) — review 2026-11-19

Tier 2 (screen logic; the database half, CC-5a #182, is live). Plan: `docs/plans/CC-community-cats.md` → "CC-5 plan".
Files: new `commons/cats/vet.js`; `commons/cats/log.js`, `cats.js`, `index.html`; `commons/assets/strings.js` (EN + AR),
`app.css` (`input[type=url]` joins the shared field rule); `docs/design.md` (that rule written down); tests in
`tests/e2e/specs/cats.spec.js`.

## What ships
- **Log activity** gets a third kind, **Vet visit** (coordinators only): the cats (tap-to-pick), date (= date given),
  clinic, what was done (9 ticks), vaccine (Rabies / Core / Other pills, shown in place when Vaccination is ticked) + name,
  next dose due, invoice number, Drive link, "Show this invoice to residents", note.
- **Activity**: chip **Vet**; vet entries in the shared dated list (meta: Vet visit · date · clinic · by); the invoice and
  "Open the document (Google Drive)" for coordinators (link only when it passes the server's rule; new tab,
  `rel="noopener noreferrer"`); Hide / Show again for coordinators.
- **Cat page**: coordinators get "Log a vet visit" on the cat's Activity tab; the programme sees each vaccine as a record
  row under Health (green "next dose due …" / amber "overdue since …", "given …"). Residents see **Vaccinated ✓ Rabies,
  up to date** + "After a scratch or bite, always see a doctor…", and **Vet invoices** a coordinator chose to show.

## Tests (Chromium "mobile" lane)
- `cats.spec.js` **51 passed** (CC-5 adds 7: log a vet visit with exact payload; Activity entries + safe link + hide;
  a disallowed link never a link; cat page vaccines + log from the cat; residents' Vaccinated / invoices; Arabic;
  form refusals + save from a cat page re-reads the register).
- `strings-parity` + `pets` + `a11y` **102 passed**. `design-guard` OK (baseline only).

## Screens to match (side-by-side, `docs/qa/cc-5b/`)
| New / changed screen | Reference | Proof | Result |
|---|---|---|---|
| Vet visit form (EN, AR) | Edit pet (`design/pet-edit.jpg`) | `sbs-form-en.jpg`, `sbs-form-ar.jpg` | MATCH — same panel, labels, pills, ticks, help lines, Save. Found: the Drive link (`type=url`) drew as a browser box → fixed in `app.css` for everyone + rule added to `design.md` |
| Cat page Health: vaccines (EN, AR) | Pet page About, care record (`design/pet-stray.jpg`, `-ar`) | `sbs-vaccines-en.jpg`, `sbs-vaccines-ar.jpg` | MATCH — the same record rows (name, state word in green / amber, note) |
| Resident cat page: Vaccinated + invoices | Pet page About (`design/pet-stray.jpg`) | `sbs-resident-en.jpg` | MATCH — facts + record rows |
| Vet entry in Activity (AR) | Pet page Sightings (`design/pet-sightings.jpg`) | `sbs-entry-ar.jpg` | MATCH — the shared dated list |

UI review against `docs/design.md` §8 "Never": no module CSS added; no bare-element styling; pills for 3 fixed choices,
ticks for 9 multi-choices (§1); no heading repeating a tab name; history as `ul.care` rows; chips display only; the
overdue state is a word as well as a colour; one Log activity entry point (D10).

## code-reviewer — no High; APPROVE after M1
| Finding | Disposition |
|---|---|
| M1 Arabic vaccine state forced left-to-right (LRI around a phrase) | **Fixed**: first-strong isolate; AR test asserts the `.st` text and its first character |
| M2 The volunteer "no invoice" check only proved the stub | **Fixed**: test renamed + comment — the server's refusal is proven by s37 VT03a; the page test proves no Hide, no Vet kind, nothing added |
| M3 Missing tests: dates, due bounds, untick Vaccination, NO_INVOICE, save from a cat page + register re-read | **Fixed**: new test "the vet form refuses what the server would…" |
| L4 5-year bound by day count (1827) ≠ Postgres `+ '5 years'` | **Fixed**: `vetPlus5` adds 5 calendar years (29 Feb → 28 Feb) |
| L5 Clinic name not isolated in the entry meta (RTL) | **Fixed**: isolated |
| L6 Quiet register refresh redraws the cat page and shows "Saved." twice | **Accepted**: only when that page is showing; the second message replaces the first |
| L7 A no-op line in the resident test | **Fixed**: removed |

## Plan conformance (code-reviewer, step 3b)
| Plan row | Plan said | Result | Evidence |
|---|---|---|---|
| Visit + the cats in it | REUSE CC-4 pattern | FOLLOWED | `vet.js` `openVet` / `wd` / `vetBack` mirror `openVisit` / `vd` / `visitBack` |
| Entry point | one Log activity, 3rd pill, coordinators | FOLLOWED | `log.js` `kindHtml` (pill only when `canEditCats()`), `wireKind` → `openVet` |
| Picking cats | REUSE tap-to-pick grid | FOLLOWED | `picksHtml(w, off, "ca_vt_cats", "ca_vt_cats_help")` — optional key arguments only |
| What was done | `label.check` | FOLLOWED | `vet.js` `data-vtdone` ticks |
| Vaccine | `jcPillsHtml` | FOLLOWED | `vet.js` `caVtVac` |
| History list / hide | `logItem` / `jc_cat_activity`, chip Vet | FOLLOWED | `LOG_KINDS` + `vet`, `logItem` → `vetItemHtml`, `data-lhide="vet:…"`, `logWrite` takes `d.vet` |
| Health facts | `jcFactsHtml` Health group | FOLLOWED | `cats.js` Health pairs + `vetVaccinesHtml` (`ul.care`) |
| External link | `jcMapLink` pattern, Drive only | FOLLOWED | `vetDocLink` (same anchor shape), only after `vetOk` |
| Screens to match | Edit pet / Sightings / care rows | FOLLOWED | side-by-side table above |

Duplication noted by the reviewer, none a DEPART: `vetDocLink` has the same anchor shape as `jcMapLink` (plan said
"REUSE pattern"; a shared `jcExtLink` would also serve Pets — backlog candidate, not done here); `vetText` is the local
labelled-input pattern (no shared helper exists); `VET_URL` deliberately mirrors the server's rule (the server stays
authoritative — a drift only means a second refusal); `vetBack` follows `visitBack` / `sightBack`.
