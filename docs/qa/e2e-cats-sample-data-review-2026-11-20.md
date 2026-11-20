# e2e Cats sample data — review note (2026-11-20)

**What:** a one-off data load (no migration, no app code) into the shared test community `e2e`, so the team can test Cats and the UI review runs at real scale. Built from the programme's CC-6 workbook; the SQL, generator and photo uploader live outside the repo (they hold programme data) and were deleted after the load.

**Tier:** data → full rigor: rollback-only dry run on live (counts + built-in count check), proof nothing persisted, database + security reviews, load run by Zee in the SQL editor, live verification.

## Loaded
4 areas · 19 stations (3 private) · 42 cats (`SAMPLE-<NAME>`) · 42 status-log rows · 6 vet visits · 49 photos on 38 cats.
Removed first: every Cats test row in `e2e` (10 `SAMPLE-n` cats, 6 stations, the hand-made Test Area / Big oval park, 1 sighting, 3 photos + their files).

## Privacy handling
- People's names scrubbed from every text column; a blocklist check fails the build if one survives.
- Private stations, stations without a pin and the station whose source pin showed a resident's villa get an invented spot ~45 m from a public station in the same village. Public stations keep their real (public-place) pins.
- Photos re-encoded (≤ 1280 px JPEG): EXIF/GPS stripped and asserted empty; contact sheet checked for faces, plates, house numbers. One photo dropped as a probable wrong cat, one as a duplicate of another cat.
- Service-role key typed hidden (`read -rs`), never printed, unset after; uploader paths regex-checked before any delete or upload.

## database-reviewer — first run safe
| Finding | Disposition |
|---|---|
| HIGH: rerun blocked by its own guard + vet_cats FK | Fixed: stable ids (uuid5); the guard admits and the delete removes the sample's own 6 visits |
| MEDIUM: photo insert not idempotent; equal `created_at` → arbitrary hero photo | Fixed: `on conflict (path) do nothing`; `created_at` steps 1 s in file order |
| MEDIUM: real programme data in a shared test community | Accepted by Zee (real public pins, invented private ones); `SAMPLE-` tagging keeps it purgeable |
| LOW: photo rows looser than `jc_cat_photo_commit` | Fixed: same size + mimetype check |
| LOW: orphaned storage objects | Fixed: uploader removes every `e2e/c/` object not in the plan |
| LOW: numbering restarts at C-001 / S-1; snapshot history jump | Accepted (test community); manifest updated |

## security-reviewer — no CRITICAL / HIGH
| Finding | Disposition |
|---|---|
| Name blocklist not applied to every column | Fixed: applied to all free-text columns |
| Pin precision fingerprint (7 vs 6 decimals) | Fixed: all rounded to 6 |
| EXIF stripping | Verified stripped; assertion added |
| Key in shell history | Fixed: `read -rs`, `unset` after |
| Loose path guard | Fixed: full-match regex on upload and delete paths |
| Generator holds volunteer names — must never be committed | Kept outside the repo; deleted after the load |

## Live verification (read-only, after the load)
areas 4 · stations 19 · private 3 · untagged stations 0 · cats 42 · non-sample cats 0 · old samples 0 · status log 42 · vet visits 6 · photo rows 49 · cats with photo 38 · rows missing a file 0 · files without a row 0 · real villa pin 0 · sightings 0.
