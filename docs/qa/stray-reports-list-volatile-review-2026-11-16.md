# Review — stray reports list hotfix (STABLE → VOLATILE) — 2026-11-16

**Bug (live):** Organizer Tools → Pets → Reported strays showed "Couldn't load reports". Edge logs: every
`POST /rpc/jc_admin_stray_reports_list` returned **405** (iPhone, 10:48–10:50 UTC). The function was `STABLE`;
its first line `jc_assert_admin('pets')` UPDATEs `last_used_at`. PostgREST runs STABLE RPCs in a read-only
transaction → write refused → 405. Failed closed (no data exposed). SQL tests call functions directly, and
e2e stubs RPCs, so neither saw it.

**Fix:** `20261116180000_stray_reports_list_volatile` — `alter function … volatile`. Body, grants, definer,
search_path unchanged.

**Guard:** `00_grants` G20 — no public `jc_` STABLE/IMMUTABLE function may call `jc_assert_*` or contain
insert/update/delete. Proven: dry run on the live schema WITHOUT the migration fails G20 naming exactly this
function; WITH it → `ALL_TESTS_PASSED (1496 checks)`. Live catalog sweep: this was the only offender.
Nothing persisted after the rehearsal (still STABLE, no history row, no testville communities).

## database-reviewer
| # | Finding | Sev | Disposition |
|---|---|---|---|
| D1 | Migration correct and sufficient; ALTER keeps owner, ACL, definer, proconfig | info | Accepted; verified live after apply |
| D2 | G20 is a pattern match, not transitive: misses writes via other volatile helpers, `perform` of writers, dynamic SQL, MERGE/TRUNCATE | M/L | **Deferred** — a transitive "STABLE calls VOLATILE jc_" check needs triage of read-only volatile helpers (e.g. `jc_me`); worth doing in the soft-archive DB PR |
| D3 | `prosrc` includes comments → possible false positives | L | Accepted; failure message names the function |

## security-reviewer
| # | Finding | Sev | Disposition |
|---|---|---|---|
| S1 | Volatility does not change access control; `jc_assert_admin` still gates; anon/public revoked | info | Accepted |
| S2 | VOLATILE RPCs are POST-only in PostgREST (no GET/prefetch) — slightly better for PII | info | Accepted |
| S3 | Organizers now actually see reporter home + opt-in WhatsApp number; matches plan (Pets organizers only, number cleared at close / account deletion) | L | Accepted — already covered by the PR 1a slice (NOT_ADMIN for non-pets/lapsed, contact nulled on close, hidden once reporter left) |
| S4 | G20 heuristic, not proof | L | Same as D2 |

Verdict: both approve.
