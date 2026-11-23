/**
 * Secret patterns (harness-autonomy-plan PR 2, item A1, 2026-11-20). One list, used by git-guard's secret scan;
 * PR 3's CI scan must load or mirror this file, or the two drift apart (premortem #2b).
 *
 * High-precision patterns only: a false positive costs one blocked commit, so no generic "high entropy" rule.
 * A Supabase JWT is flagged only when its payload says role=service_role; the anon key is public by design.
 * A line containing `secret-scan:allow` is skipped (deliberate fixtures, docs).
 * Findings carry file, line and rule, never the matched text: it must not reach a message or a log.
 */
const path = require('path');

const RULES = [
  { id: 'supabase-secret-key', re: /\bsb_secret_[A-Za-z0-9_-]{20,}/ },
  { id: 'private-key', re: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY/ },   // RSA, EC, OPENSSH, PGP … BLOCK
  { id: 'supabase-access-token', re: /\bsbp_[0-9a-f]{40}\b/ },
  // A credential assigned to a provider-named key; ANON / PUBLISHABLE / PUBLIC names are public by design.
  { id: 'named-secret', re: /\b(?!\w*(?:ANON|PUBLISHABLE|PUBLIC))(?:VERCEL|CLOUDFLARE|CF|SUPABASE|APIFY|ANTHROPIC|RESEND|BUFFER)_\w*(?:TOKEN|KEY|SECRET|PASSWORD)\s*[=:]\s*['"]?[A-Za-z0-9_\-.]{20,}/ },
  { id: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { id: 'github-token', re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/ },
  { id: 'aws-access-key', re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { id: 'apify-token', re: /\bapify_api_[A-Za-z0-9]{20,}/ },
];
// postgres://user:password@host, unless the password is an obvious placeholder.
const PG_URI = /\bpostgres(?:ql)?:\/\/[^\s:@\/]+:([^\s@\/]+)@/g;
const PG_PLACEHOLDER = /^(?:password|pass|pw|secret|\[[^\]]*\]|<[^>]*>|\$\{?\w+\}?|\*+|x+|\.\.\.)$/i;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{8,}/g;
const ALLOW = 'secret-scan:allow';

function isServiceRoleJwt(payload) {
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).role === 'service_role';
  } catch {
    return false;
  }
}

/** Rules hit by one line of text (ids only). */
function scanLine(text) {
  if (!text || text.includes(ALLOW)) return [];
  const hits = RULES.filter((r) => r.re.test(text)).map((r) => r.id);
  for (const m of text.matchAll(PG_URI)) {
    if (!PG_PLACEHOLDER.test(m[1])) { hits.push('postgres-password-uri'); break; }
  }
  for (const m of text.matchAll(JWT)) {
    if (isServiceRoleJwt(m[1])) { hits.push('supabase-service-role-jwt'); break; }
  }
  return hits;
}

/** `.env`, `.env.local`, `.envrc`, `.dev.vars` (Cloudflare) …; not `.env.example` / `.sample` / `.template` / `.dist`. */
function isEnvFile(file) {
  const base = path.basename(file);
  return /^(\.env(rc)?(\..+)?|\.dev\.vars)$/.test(base) && !/\.(example|sample|template|dist)$/.test(base);
}

module.exports = { scanLine, isEnvFile, RULES };
