// Repo rules (harness-autonomy-plan B1, 2026-11-23): the standing rules in CLAUDE.md that a script can check.
//   R1 no jc_ under supabase/signalpost/ (Commons tables live in their own project)
//   R2 every migration's header (first 15 lines) names its folder's project ref and not the other project's
//   R3 no create / alter / drop of jh_signup (its signature is frozen: cached pages + PostgREST overloads)
//   R4 personal page: no phone number, tel: or WhatsApp link — LinkedIn + email only
//   R5 personal page: Segmint was an exit — no "acquired" within 200 characters of "Segmint"
//   R6 personal page: already in Abu Dhabi — no "relocating" / "planning to move"
//   R7 credit links go to https://zgauba.github.io/, never the /jubail/ redirect stub
//   R8 Commons user-facing copy says "football", never "soccer"
// One script for CI (repo-rules.yml runs main's copy against the PR, checked out as data in ./pr) and for the local
// verify gate (.claude/verify.sh). Usage: node tests/ci/repo-rules.mjs [--root <repo dir>]   (no dependencies)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REFS = { signalpost: 'hrdmhifeynnokzjqtlsa', commons: 'qrpxfssdeeuzmsmlbtbu' };
// migrations written before the header rule; they predate it and stay as they are. Never add to this list.
export const R2_EXEMPT = new Set([
  'supabase/signalpost/migrations/20261102160000_jh_stats_rls_lockdown.sql',
  'supabase/signalpost/migrations/20261102170000_jh_admin_tarpit.sql',
]);
const PERSONAL = (f) => f === 'index.html' || /^jubail\/.+\.html$/.test(f);
const COPY = (f) => /^commons\/.+\.html$/.test(f) || f === 'commons/assets/strings.js';
const CREDIT = (f) => /^(commons|jubail-halloween)\/.+\.(html|js)$/.test(f);
const SKIP_DIRS = new Set(['.git', 'node_modules', 'vendor', 'test-results', 'playwright-report']);
const ROOTS = ['index.html', 'jubail', 'jubail-halloween', 'commons', 'supabase'];
// zero-output guard: a check that read nothing must not pass
export const MIN = { migrations: 40, personal: 2, copy: 5, credit: 5 };

const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;
const sqlNoComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' ')).replace(/--[^\n]*/g, '');
const noUrls = (t) => t.replace(/(?:https?:)?\/\/[^\s"'<>)]+/g, (u) => ' '.repeat(u.length));   // LinkedIn IDs look like numbers

function* matches(re, text) { for (const m of text.matchAll(re)) yield { at: m.index, text: m[0] }; }

/* files: [{ file, text }] → { violations: [{ rule, file, line, msg }], counts } */
export function check(files) {
  const v = [], counts = { migrations: 0, personal: 0, copy: 0, credit: 0 };
  const add = (rule, file, line, msg) => v.push({ rule, file, line, msg });
  for (const { file, text } of files) {
    if (file.startsWith('supabase/signalpost/')) {
      for (const m of matches(/\bjc_\w*/g, text)) add('R1', file, lineOf(text, m.at), `"${m.text}" under supabase/signalpost/ — Commons tables belong in the JubailCommons project (supabase/commons/).`);
    }
    const mig = /^supabase\/([^/]+)\/migrations\/[^/]+\.sql$/.exec(file);
    if (mig) {
      counts.migrations++;
      const own = REFS[mig[1]];
      const head = text.split('\n').slice(0, 15).join('\n');
      if (!own) add('R2', file, 1, `Unknown project folder supabase/${mig[1]}/ — add its ref to REFS in tests/ci/repo-rules.mjs.`);
      else {
        for (const [name, ref] of Object.entries(REFS)) {
          if (name !== mig[1] && head.includes(ref)) add('R2', file, lineOf(head, head.indexOf(ref)), `Header names the ${name} project (${ref}) but this file is under supabase/${mig[1]}/.`);
        }
        if (!head.includes(own) && !R2_EXEMPT.has(file)) add('R2', file, 1, `Header (first 15 lines) must name the target project ref ${own}.`);
      }
    }
    if (file.startsWith('supabase/') && file.endsWith('.sql')) {
      const sql = sqlNoComments(text);
      for (const m of matches(/\b(create(\s+or\s+replace)?|alter|drop)\s+function\s+(if\s+exists\s+)?("?public"?\s*\.\s*)?"?jh_signup"?\s*[(;\s]/gi, sql)) {
        add('R3', file, lineOf(sql, m.at), 'Changes jh_signup — its signature is frozen (cached pages + PostgREST overloads). Add a follow-up RPC instead.');
      }
    }
    if (PERSONAL(file)) {
      counts.personal++;
      for (const m of matches(/\btel:|wa\.me\/|api\.whatsapp\.com|[?&]phone=/gi, text)) add('R4', file, lineOf(text, m.at), `"${m.text}" — no phone number on the personal page, ever (LinkedIn + email only).`);
      const t = noUrls(text);
      for (const re of [/(?:\+|\b00)[1-9]\d{0,2}[\s.()-]{0,2}(?:\d[\s.()-]{0,2}){7,12}\d/g, /\b0?5\d[\s.-]?\d{3}[\s.-]?\d{4}\b/g, /\b\d{9,15}\b/g]) {
        for (const m of matches(re, t)) add('R4', file, lineOf(t, m.at), 'Looks like a phone number — no phone number on the personal page, ever (LinkedIn + email only).');
      }
      for (const m of matches(/\bacquired\b/gi, text)) {
        const near = text.slice(Math.max(0, m.at - 200), m.at + 200);
        if (/segmint/i.test(near)) add('R5', file, lineOf(text, m.at), 'Segmint was an exit — never "acquired".');
      }
      for (const m of matches(/\brelocat(e|ed|es|ing|ion)\b|\bplanning to move\b|\bmoving to (abu dhabi|the uae|uae|dubai)\b/gi, text)) {
        add('R6', file, lineOf(text, m.at), `"${m.text}" — already in Abu Dhabi; never "relocating" or "planning to move".`);
      }
    }
    if (CREDIT(file)) {
      counts.credit++;
      for (const m of matches(/(?:zgauba\.github\.io|href\s*=\s*["']\s*(?:\.\.)?)\/jubail(?![\w-])/gi, text)) {
        add('R7', file, lineOf(text, m.at), 'Credit links go to https://zgauba.github.io/ — /jubail/ is only a redirect stub.');
      }
    }
    if (COPY(file)) {
      counts.copy++;
      for (const m of matches(/\bsoccer\b/gi, text)) add('R8', file, lineOf(text, m.at), 'Commons copy says "football", never "soccer".');
    }
  }
  return { violations: v, counts };
}

/* the files the rules read, from the working tree (so a new, uncommitted file is checked too); symlinks are refused */
export function collect(root) {
  const out = [];
  const visit = (rel) => {
    const abs = path.join(root, rel);
    let st;
    try { st = fs.lstatSync(abs); } catch { return; }
    if (st.isSymbolicLink()) throw new Error(`${rel} is a symlink — repo-rules doesn't follow symlinks`);
    if (st.isDirectory()) {
      for (const e of fs.readdirSync(abs)) if (!SKIP_DIRS.has(e)) visit(path.posix.join(rel, e));
    } else if (/\.(html|js|sql)$/.test(rel)) out.push({ file: rel, text: fs.readFileSync(abs, 'utf8') });
  };
  for (const r of ROOTS) visit(r);
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

const prop = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A').replace(/:/g, '%3A').replace(/,/g, '%2C');
const data = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

/* ---------- CLI ---------- */
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } };
if (process.argv[1] && isMain()) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const ri = process.argv.indexOf('--root');
  const ROOT = ri > 0 ? path.resolve(process.argv[ri + 1] || '.') : path.resolve(here, '..', '..');
  let files;
  try { files = collect(ROOT); } catch (e) { console.error(`::error::repo-rules: ${data(e.message)}`); process.exit(1); }
  const { violations, counts } = check(files);
  console.log(`repo-rules: read ${files.length} files (${counts.migrations} migrations, ${counts.personal} personal-page, ${counts.copy} Commons copy, ${counts.credit} credit-scope).`);
  const short = Object.entries(MIN).filter(([k, n]) => counts[k] < n);
  if (short.length) {
    console.error(`::error::repo-rules read too little (${short.map(([k, n]) => `${k} ${counts[k]} < ${n}`).join(', ')}) — the check is broken, not passing.`);
    process.exit(1);
  }
  for (const x of violations) console.error(`::error file=${prop(x.file)},line=${x.line}::${x.rule}: ${data(x.msg)}`);
  if (violations.length) { console.error(`repo-rules: ${violations.length} violation(s).`); process.exit(1); }
  console.log('repo-rules: OK (R1–R8).');
}
