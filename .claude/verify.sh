#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# PROJECT VERIFY CONTRACT (harness-autonomy-plan B2, 2026-11-23)
# Run by the verify gate (~/.claude/scripts/hooks/verify-gate.js) when Claude tries to finish a turn with
# uncommitted changes here. exit 0 = green, Claude may finish; anything else = Claude must fix and re-check
# (after 3 red rounds the gate hands back to Zeeshan).
#
# LOCAL ONLY: never the live Supabase projects, never paid APIs, never a deploy. The browser tests run
# against stubs (tests/e2e/specs/stub.js).
#
#   1. repo-rules (R1–R8) and design-guard — about a second, always
#   2. the mobile (Chromium) Playwright specs that cover the change (tests/ci/affected-specs.mjs):
#      none for docs-only changes, a few for one module, all for shared files. A green run is remembered
#      for the same diff, so stopping again without new edits doesn't rerun them.
#      WebKit runs in CI only (commons-e2e.yml), as does the full suite on every PR.
# Run it yourself: bash .claude/verify.sh
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

fail=0
node tests/ci/repo-rules.mjs || fail=1
node tests/ci/design-guard.mjs || fail=1
# fast checks first: don't spend a minute on browsers when a rule already failed
[ "$fail" = 0 ] || { echo "verify: red (rule checks)"; exit 1; }

# everything this branch changes: committed since main, uncommitted, and new files
if ! base=$(git merge-base HEAD origin/main 2>/dev/null); then
  echo "verify: no origin/main here — checking uncommitted changes only"; base=$(git rev-parse HEAD) || exit 1
fi
# quotepath off: "café.js" would otherwise print quoted and escaped, and match nothing; no renames: a file moved out of
# commons/ must still count as a commons/ change (code review 2026-11-23)
changed=$( { git -c core.quotepath=false diff --name-only --no-renames "$base" &&
             git -c core.quotepath=false ls-files --others --exclude-standard; } | sort -u) || exit 1
sel=$(printf '%s\n' "$changed" | node tests/ci/affected-specs.mjs) || { echo "verify: red (affected-specs failed)"; exit 1; }
if [ "$sel" = NONE ]; then echo "verify: green (no app or e2e files changed — no browser tests needed)"; exit 0; fi

# the result is remembered per exact diff of the app + tests (and the spec list), never across different content
key=$( { printf '%s\n' "$sel"; git diff "$base" -- commons tests/e2e;
         git ls-files --others --exclude-standard -z -- commons tests/e2e | xargs -0 shasum 2>/dev/null; } | shasum -a 256 | cut -c1-16)
cache=$(git rev-parse --git-path verify-e2e-pass)
if [ -f "$cache" ] && [ "$(cat "$cache")" = "$key" ]; then echo "verify: green (browser tests already passed for this exact diff)"; exit 0; fi

if [ ! -d tests/e2e/node_modules/@playwright/test ]; then
  echo "verify: red — Playwright isn't installed. Run: (cd tests/e2e && npm ci && npx playwright install chromium)"; exit 1
fi
args=()
if [ "$sel" != ALL ]; then
  # spec names → anchored file patterns (Playwright treats them as regular expressions)
  while IFS= read -r s; do [ -n "$s" ] && args+=("/${s//./\\.}\$"); done <<<"$sel"
fi
echo "verify: browser tests — ${sel//$'\n'/ }"
# stop after 5 failures (a broken module otherwise waits out every timeout, ~3.5 min); the test server's request log
# is dropped: the gate shows Claude only the last 4000 characters, which must be the failures
(cd tests/e2e && npx --no-install playwright test --project=mobile --reporter=line --max-failures=5 ${args[@]+"${args[@]}"}) 2>&1 \
  | grep -v -e '^\[WebServer\]' -e '^[[:space:]]*$'
rc=${PIPESTATUS[0]}
if [ "$rc" = 0 ]; then
  printf '%s\n' "$key" > "$cache"
  echo "verify: green"
else
  rm -f "$cache"
  echo "verify: red (browser tests) — if the port is busy, another Playwright run is using 4173"
  exit 1
fi
