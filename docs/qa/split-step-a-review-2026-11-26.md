# Split step A — review note (2026-11-26)

Contract: `docs/plans/SPLIT-commons-repo-contract.md` (rows 2 and 7 are this step's).

## What changed
- New public repo `zgauba/commons`, created from `zgauba.github.io` main at `ddc8fb8` with full history (that history is already public, so nothing new is exposed).
- Removed what stays in `zgauba.github.io`: `index.html`, `jubail/`, `jubail-halloween/`, root `assets/` (personal lockups), `supabase/signalpost/`, `docs/halloween-2026-final.md`, `.nojekyll`, `.DS_Store`. Nothing under `commons/` refers to them (grep for `../assets` etc. resolves inside `commons/`).
- `tests/ci/repo-rules.mjs`: `MIN.personal` 2 → 0. The zero-output guard counted personal pages, which no longer live here; the other guards (migrations 40, copy 5, credit 5) still apply. The zgauba.github.io copy keeps 2.
- `CLAUDE.md` rewritten for a Commons-only repo (personal + Halloween sections dropped, split note, Pages-off rule).
- Repo settings mirrored from the old repo: secret scanning + push protection on, delete-branch-on-merge, read-only workflow token, labels `plan-not-needed` / `review-not-needed`. Main protection (5 required checks) set once this PR's checks have run.

## Checks run locally
- `node tests/ci/repo-rules.mjs` → OK (R1–R9), reads 51 migrations / 32 copy / 35 credit files.
- `node tests/ci/design-guard.mjs` → exit 0.
- `node --test tests/ci/*.test.mjs` → 77/77 pass.
- Memory: `diff -rq` old vs new memory folder → identical, 30 files.

## Not in this step
- commons.ae still deploys from `zgauba.github.io` until step B (Cloudflare domain move). **Commons changes freeze in the old repo from now.**
- `docs/architecture.md` still carries the SignalPost / personal-page layers; trimmed in step C alongside the old repo's copy.

## Disposition
No reviewer agent: no app, schema or auth change; the only logic change is a one-line guard threshold with its reason stated above.
