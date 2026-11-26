# commons — Jubail Commons — agent bootstrap

If you're a Claude Code session starting work in this repo, read this file first.

## What this repo is

**Jubail Commons**: community-run events, facility booking, pet directory and community cats for Jubail Island, Abu Dhabi. Platform name "Commons"; multi-community pattern is "⟨Community⟩ Commons". The app lives in `commons/` and is served at **commons.ae** by Cloudflare Pages (build output directory `commons/`, no build command).

Split out of `zgauba/zgauba.github.io` on 2026-11-26 (full history kept; plan `docs/plans/SPLIT-commons-repo-contract.md`). That repo keeps Zeeshan's personal page, the `/jubail/` redirect, the legacy Halloween site and its SignalPost (`jh_`) migrations, plus a `commons/` redirect stub so old `zgauba.github.io/commons/…` links forward to commons.ae. PR numbers up to #226 in docs and commit messages refer to that repo (`zgauba.github.io#NNN`).

Backend: dedicated Supabase project **JubailCommons** (`qrpxfssdeeuzmsmlbtbu`, ap-south-1). Never put `jc_` tables in SignalPost (`hrdmhifeynnokzjqtlsa`). Schema SQL: `supabase/commons/migrations/`.

## How to work in this repo

1. **Read `~/.claude/docs/BUILDING_APPS_WITH_AI.md`**: universal operating protocols.
2. **Read `docs/architecture.md`**: the Stack Manifest. If LAST VERIFIED is stale, run `/manifest` first.
3. The authoritative backlog + ops context live in the private Claude project doc "Jubail Trick-or-Treat Site — Ops Reference" (project "Jubail Villa"), never in this public repo.

## Workflow rules

- **Reviews are saved in the repo, on the PR branch, before merge.** Every reviewer agent's report → `docs/qa/<name>-review-<YYYY-MM-DD>.md` (findings + disposition). CI (`review-saved.yml`) fails any PR touching `commons/` or `supabase/` without one; label `review-not-needed` only for trivial copy changes.
- **PR bodies carry the plan headings** (DS-5, 2026-11-19): a PR touching `commons/` needs `## Done when` (Check | Proof | Pass/Fail table), `## Screens to match` (or "No screen changes") and `## Plan conformance` (or "No plan: <reason>"); `supabase/`-only needs `## Done when`. CI `plan-followed.yml` enforces; label `plan-not-needed` only for copy-only changes. `/ship-pr` writes them.
- **Verification is tiered** (see `/ship-pr` step 1b). Cosmetic changes under `commons/` still save a short review note to `docs/qa/<name>-review-<YYYY-MM-DD>.md` (what changed, screenshots looked at, test counts) so `review-saved.yml` passes without a reviewer agent.
- **Branches + PRs, even solo**: standing exception: live-event-day hotfixes go straight to `main` (commons.ae deploys in ~1 min).
- **Live infra wins over docs.** Update the doc when they disagree.
- **This repo is PUBLIC** (until the R8 launch-gate step makes it private). Never commit: organizer/admin codes, sign-up passcodes, service-role keys, resident data. Supabase publishable (anon) keys in HTML are public by design.
- **PII only when necessary** (Zee, 2026-11-16; replaces the old zero-PII promise): collect personal data only when a feature genuinely needs it, never "just in case". Opt-in where possible, minimal, disclosed on the screen that collects it, deleted once it's no longer needed. First-party only: no third parties, no ad-tech. Never a silent schema change.
- **Never change a `jc_` signup-class RPC's signature once live** (cached pages + PostgREST overload ambiguity). Follow-up RPCs instead.
- **GitHub Pages stays OFF in this repo**: a project site named `commons` would claim `zgauba.github.io/commons/` and fight the redirect stub.

## App rules (`commons/`)

Per-community config (villages, map center, branding, WhatsApp links) + per-module feature flags (events / bookings / pets — flags are also the compliance kill switch for the booking module). EN/AR strings dictionary + RTL. Identity model: full accounts; any further PII is per-feature and only when necessary. Booking module carries "official JICM bookings take precedence" on the booking screen (MCD §15.10). **Design system:** read `docs/design.md` before building or restyling any screen; every new screen names the existing screen it must match. Module CSS never restyles bare elements (`select`, `input`, `textarea`, `label`, `button`); use the shared classes. CI `design-guard.yml` enforces this and blocks copied rule bodies; `tests/ci/design-guard-baseline.txt` lists today's offenders and may only shrink (delete a line when you fix it, never add one).

## Conventions

- No package manager, no build step. Deploy = push to `main` → Cloudflare Pages → commons.ae in ~1 min (other branches get preview URLs).
- Local verification: Playwright with stubbed RPCs (CORS headers + OPTIONS 204 on stubs; chainable-Proxy `window.L` shim when the Leaflet CDN is unreachable).
- Supabase changes via migrations; mirror each into `supabase/commons/migrations/` (every migration's header comment names its target project ref).

## Where docs live

- `docs/plans/ROADMAP.md`: **the plan of record**: phases to launch (launch only when the full app is built)
- `docs/architecture.md`: Stack Manifest (refresh via `/manifest`)
- `docs/qa/`, `docs/incidents/`, `docs/plans/`: audits, incidents, multi-PR plans
