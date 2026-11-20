# CC-6 — Cats import format

How to prepare the programme's records for the one-time bulk load into Commons Cats. Build these as spreadsheet tabs,
export each tab as CSV, and keep the files **on your machine only**. They hold personal data (volunteer emails) and
private locations, so they are **never committed** to this repo.

Written from the live JubailCommons schema (`qrpxfssdeeuzmsmlbtbu`) on 2026-11-20. If a migration later changes a
`jc_cat*` table, re-check this page before importing.

## The five files, in load order

| # | File | One row per | Required? | Loads into |
|---|---|---|---|---|
| 1 | `areas.csv` | area (e.g. "Marfaa North") | Yes | `jc_cat_areas` |
| 2 | `stations.csv` | feeding station | Yes | `jc_cat_stations` |
| 3 | `cats.csv` | cat | Yes | `jc_cats` (+ the first entry in `jc_cat_status_log`) |
| 4 | `volunteers.csv` | person | Optional | `jc_module_admins` role + `jc_cat_station_people` |
| 5 | `vet_visits.csv` | vet visit | Optional | `jc_cat_vet_visits` + `jc_cat_vet_cats` |

Files refer to each other by **human keys**, not database ids: area **name**, station **number**, cat **old ID**,
volunteer **email**. The import looks the ids up.

## General rules

- **Encoding:** UTF-8 CSV with a header row exactly as named below. Arabic text is fine.
- **Dates:** `YYYY-MM-DD` (e.g. `2026-03-14`). No other format is accepted.
- **Coordinates:** decimal degrees, `lat` then `lng` (Google Maps: long-press the spot, then copy the numbers it shows,
  e.g. `24.5401, 54.4523`).
- **Lists inside one cell:** separate with `;` (e.g. `vaccination;deworming`).
- **Blank cell** = "not known" (uses the default shown). Never type `N/A`, `-` or `unknown` in a free-text column.
- **Fixed-choice columns** take the exact lower-case words listed. Anything else stops the whole import (nothing is
  half-loaded: it runs in one transaction).
- **Lengths** are the database's hard limits, in characters.

---

## 1. `areas.csv`

| Column | Required | Rule |
|---|---|---|
| `name` | Yes | 1–40 characters, unique in the file |

```csv
name
Marfaa North
Marsa
```

## 2. `stations.csv`

| Column | Required | Rule |
|---|---|---|
| `num` | Yes | Station number, 1–9999, unique. Keep the numbers from her doc if it has them |
| `area` | Yes | Must match a `name` in `areas.csv` |
| `lat` | Yes | −90 to 90 |
| `lng` | Yes | −180 to 180 |
| `private` | Yes | `yes` or `no`. Private stations are never shown to residents. There is no default; choose |
| `landmark` | No | 1–120. What a volunteer looks for ("behind the bin store, villa 41") |
| `access_notes` | No | 1–400. Volunteers only (gate codes do **not** go here: this repo's rule is never to store codes) |

```csv
num,area,lat,lng,private,landmark,access_notes
1,Marfaa North,24.54010,54.45230,no,Behind the bin store near the park,
2,Marsa,24.53880,54.45610,yes,Garden wall of a resident's villa,Ask the lead before visiting
```

## 3. `cats.csv`

Commons gives every cat its own number (C-001, C-002 …) in file order. Whatever ID her doc uses goes in `old_id`, so it
stays searchable.

| Column | Required | Allowed values / rule | Default if blank |
|---|---|---|---|
| `old_id` | Strongly recommended | 1–40, unique. Her doc's ID / ID-card number. Used by `vet_visits.csv` to find the cat | — |
| `name` | One of `name` / `coat` | 1–40 | — |
| `coat` | One of `name` / `coat` | 1–120 ("ginger tabby, white socks") | — |
| `sex` | No | `female` `male` `unknown` | `unknown` |
| `life_stage` | No | `kitten` `adult` `senior` `unknown` | `unknown` |
| `area` | No | A `name` from `areas.csv` | — |
| `station` | No | A `num` from `stations.csv` (its home station) | — |
| `confirmed` | No | `yes` = a coordinator has seen and verified the cat; `no` = provisional (shown as such) | `no` |
| `status` | No | `community` `clinic` `foster` `adopted` `transferred` `missing` `deceased` `unknown` | `community` |
| `status_on` | No | Date the status began | — |
| `status_source` | No | 1–120. Who or what says so ("vet record", "Sara saw her 3 Nov") | — |
| `ear_tip` | No | `present` `absent` `unclear` | `unclear` |
| `ear_side` | No | `left` `right`. **Only** when `ear_tip` = `present` | — |
| `sterilised` | No | `yes` `no` `unknown` | `unknown` |
| `sterilised_source` | No | 1–120 ("ear tip", "clinic invoice") | — |
| `tnvr` | No | `none` `needed` `booked` `captured` `clinic` `returned` | `none` |
| `tnvr_on` | No | Date of the current TNVR stage | — |
| `tnvr_place` | No | 1–120 (clinic or place) | — |
| `story` | No | 1–1000. Shown to residents, so nothing private | — |

```csv
old_id,name,coat,sex,life_stage,area,station,confirmed,status,status_on,status_source,ear_tip,ear_side,sterilised,sterilised_source,tnvr,tnvr_on,tnvr_place,story
JC-014,Biscuit,ginger tabby,male,adult,Marfaa North,1,yes,community,,,present,left,yes,ear tip,returned,2026-02-10,City Vet,Friendly; waits by the bench at dusk
JC-022,,black with white chest,female,kitten,Marsa,2,no,community,,,unclear,,unknown,,needed,,,
```

## 4. `volunteers.csv` (optional)

A person can only be put on a station once they **have a Commons account** (they accepted an invite and signed in).
The import matches by email. Rows whose email has no account are **listed back to you and skipped**, not created:
send those people an invite, then re-run just this file.

| Column | Required | Rule |
|---|---|---|
| `email` | Yes | The email they signed in with |
| `role` | Yes | `coordinator` (logs vet visits, edits cats, sees contacts) or `volunteer` (logs feeding visits and sightings) |
| `lead` | No | Station numbers they lead, `;`-separated |
| `feeder` | No | Station numbers they feed at |
| `backup` | No | Station numbers they cover |

Names and contact details come from each person's own account. They are not typed here.

```csv
email,role,lead,feeder,backup
someone@example.com,coordinator,1,,2
another@example.com,volunteer,,1;2,
```

## 5. `vet_visits.csv` (optional — vaccine history)

Worth loading if you want residents to see **Vaccinated ✓** from day one. That tick reads the latest rabies entry.

| Column | Required | Allowed values / rule |
|---|---|---|
| `cats` | Yes | One or more `old_id`s from `cats.csv`, `;`-separated (one visit can cover several cats) |
| `visited_on` | Yes | Date of the visit (= the date a vaccine was given). Not in the future, not before 2000 |
| `done` | Yes | 1+ of `checkup` `sterilisation` `vaccination` `deworming` `parasites` `treatment` `surgery` `microchip` `other` |
| `clinic` | No | 1–120 |
| `vaccine` | Only if `done` includes `vaccination` (and then required) | `rabies` `core` `other` |
| `vaccine_name` | No | 1–80. Only with a `vaccine` (e.g. "FeLV") |
| `next_due` | No | After `visited_on`, at most 5 years later |
| `invoice_no` | No | 1–60 |
| `doc_url` | No | Only `https://drive.google.com/file/d/…`, `…/open?id=…`, `…/drive/folders/…`, or `https://docs.google.com/(document\|spreadsheets\|presentation)/d/…` |
| `shared` | No | `yes` = residents can see this invoice (number, link, date, what was done). Needs `invoice_no` or `doc_url`. Default `no` |
| `note` | No | 1–500. Programme only |

```csv
cats,visited_on,done,clinic,vaccine,vaccine_name,next_due,invoice_no,doc_url,shared,note
JC-014,2026-02-10,sterilisation;vaccination,City Vet,rabies,,2027-02-10,INV-5531,,no,
JC-014;JC-022,2026-05-02,deworming,City Vet,,,,,,no,
```

## Not imported

- **Feeding visit history and sightings.** These start fresh in the app; old logs would show under today's volunteers.
- **Photos.** Add them on each cat's page after the import.
- **Money.** No amounts anywhere (ROADMAP "No money in the app").

## What the import will do (CC-6, when un-held)

1. Check every file against the rules above and list **all** problems at once before loading anything.
2. Load in one transaction, in the order above, into the community you name.
3. End with a count check: rows loaded = rows in each file, or it raises and rolls everything back.
4. Write the import to the admin log as counts only.

Before a real import on `e2e`, the sample data (cats with old ID `SAMPLE-n`, stations whose landmark says "(sample)") is removed.
Cats is switched on only for `e2e` until the Jubail management question on the ROADMAP is settled.
