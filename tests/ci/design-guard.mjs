// Design guard (DS-5 E3 + E4, 2026-11-19) — docs/design.md §8 "Never" #1 and #2, enforced.
//   E3 bare: module CSS (any commons/ CSS outside commons/assets/ and vendor/) may not target a bare select /
//            input / textarea / label / button — with or without a parent selector (".panel textarea" counts,
//            ":is(input, select)" counts, "label.check" does not).
//   E4 dup:  the same rule body (≥ 3 declarations) may not appear in two different CSS files.
// Today's offenders, with how many times each occurs, are in design-guard-baseline.txt ("<count>\t<key>").
// The baseline may only SHRINK: more occurrences than listed fails; fewer fails too ("fixed — lower the count /
// delete the line"); and CI (--base) fails if the PR's baseline lists more than the base branch's does.
// Nested CSS ("& input { }") is refused, not silently skipped.
// Usage: node tests/ci/design-guard.mjs [--write-baseline] [--base <base branch's baseline file>]   (no dependencies)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const BARE = new Set(['select', 'input', 'textarea', 'label', 'button']);
export const MIN_DECLS = 3;
const STATEMENT_AT = /^@(import|charset|namespace)\b/;

/* rules → { rules: [{ selector, body, line }], errors: [line] }; descends into @media / @supports / @layer /
   @container; skips other at-rule blocks (@keyframes, @font-face); statement at-rules (@import …;) are dropped */
export function parseCss(text) {
  const src = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));   // keep line numbers
  const rules = [], errors = [];
  const lineAt = (k) => src.slice(0, k).split('\n').length;
  (function walk(from, to) {
    let i = from;
    while (i < to) {
      const open = src.indexOf('{', i);
      if (open < 0 || open >= to) return;
      let hs = i;                                       // head start, after any "@import …;" statements
      for (;;) {
        while (hs < open && /\s/.test(src[hs])) hs++;
        if (!STATEMENT_AT.test(src.slice(hs, open))) break;
        const semi = src.indexOf(';', hs);
        if (semi < 0 || semi > open) break;
        hs = semi + 1;
      }
      const head = src.slice(hs, open).trim();
      let depth = 1, j = open + 1, nested = false;
      while (j < to && depth) {
        if (src[j] === '{') { depth++; nested = true; } else if (src[j] === '}') depth--;
        j++;
      }
      if (/^@(media|supports|layer|container)\b/.test(head)) walk(open + 1, j - 1);
      else if (head && !head.startsWith('@')) {
        if (nested) errors.push(lineAt(hs));
        else rules.push({ selector: head.replace(/\s+/g, ' '), body: src.slice(open + 1, j - 1), line: lineAt(hs) });
      }
      i = j;
    }
  })(0, src.length);
  return { rules, errors };
}

export function splitTop(s, sepRe) {      // split on a separator outside () and []
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (depth === 0 && sepRe.test(ch)) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/* a compound without its pseudo-classes (balanced parentheses), plus the selector lists inside :is() / :where() */
function stripPseudo(compound) {
  let base = '', i = 0;
  const lists = [];
  while (i < compound.length) {
    if (compound[i] !== ':') { base += compound[i++]; continue; }
    const m = /^::?([a-z-]+)/i.exec(compound.slice(i));
    if (!m) { base += compound[i++]; continue; }
    i += m[0].length;
    if (compound[i] === '(') {
      let depth = 0, k = i;
      for (; k < compound.length; k++) {
        if (compound[k] === '(') depth++;
        else if (compound[k] === ')' && --depth === 0) break;
      }
      if (/^(is|where|matches)$/i.test(m[1])) lists.push(compound.slice(i + 1, k));
      i = k + 1;
    }
  }
  return { base, lists };
}

/* the element a selector finally targets, if it is a bare one: ".panel textarea" → "textarea"; "label.check" → null */
export function bareTarget(selector) {
  const last = splitTop(selector, /[\s>+~]/).pop() || '';
  const { base, lists } = stripPseudo(last.replace(/\[[^\]]*\]/g, ''));
  if (/^[a-z]+$/i.test(base) && BARE.has(base.toLowerCase())) return base.toLowerCase();
  /* ".x :is(input, select)" — with nothing else in the compound, a bare member of an :is()/:where() list makes it bare.
     ".a:is(input)" is the same as "input.a": a classed element, allowed like "label.check". */
  if (base === '' || base === '*') {
    for (const list of lists) for (const s of splitTop(list, /,/)) { const t = bareTarget(s); if (t) return t; }
  }
  return null;
}

export function normBody(body) {
  return body.split(';').map((d) => d.trim().replace(/\s+/g, ' ').replace(/\s*:\s*/, ':')).filter(Boolean).sort();
}

/* files: [{ file, text, module }] → { bare, dup, nested, counts } */
export function check(files) {
  const bare = [], nested = [], seen = new Map();
  let rules = 0;
  for (const f of files) {
    const parsed = parseCss(f.text);
    for (const line of parsed.errors) nested.push({ file: f.file, line });
    for (const r of parsed.rules) {
      rules++;
      if (f.module) {
        for (const sel of splitTop(r.selector, /,/)) {
          if (bareTarget(sel)) bare.push({ key: `bare|${f.file}|${sel}`, file: f.file, line: r.line, selector: sel });
        }
      }
      const decls = normBody(r.body);
      if (decls.length >= MIN_DECLS) {
        const h = crypto.createHash('sha1').update(decls.join(';')).digest('hex').slice(0, 10);
        if (!seen.has(h)) seen.set(h, []);
        seen.get(h).push({ file: f.file, line: r.line, selector: r.selector });
      }
    }
  }
  const dup = [];
  for (const [h, where] of seen) {
    const filesWith = [...new Set(where.map((w) => w.file))].sort();
    if (filesWith.length >= 2) dup.push({ key: `dup|${h}|${filesWith.join(',')}`, where });
  }
  return { bare, dup, nested, counts: { files: files.length, rules } };
}

/* key → occurrences: a bare selector repeated in a second rule counts twice; a dup counts every copy */
export function tally(res) {
  const m = new Map();
  for (const b of res.bare) m.set(b.key, (m.get(b.key) || 0) + 1);
  for (const d of res.dup) m.set(d.key, d.where.length);
  return m;
}

export function readBaseline(text) {
  const m = new Map();
  for (const raw of text.split('\n')) {
    const l = raw.trim();
    if (!l || l.startsWith('#')) continue;
    const tab = l.indexOf('\t');
    if (tab > 0 && /^\d+$/.test(l.slice(0, tab))) m.set(l.slice(tab + 1), Number(l.slice(0, tab)));
    else m.set(l, 1);
  }
  return m;
}

/* found vs baseline: "added" = more than listed; "stale" = fewer than listed (fixed → lower or delete) */
export function compare(found, baseline) {
  const added = [], stale = [];
  for (const [k, n] of found) if (n > (baseline.get(k) || 0)) added.push({ key: k, n, was: baseline.get(k) || 0 });
  for (const [k, n] of baseline) if ((found.get(k) || 0) < n) stale.push({ key: k, n: found.get(k) || 0, was: n });
  return { added, stale };
}

/* the PR's baseline vs the base branch's: any line new or with a higher count = the baseline grew */
export function grew(prBaseline, baseBaseline) {
  return [...prBaseline].filter(([k, n]) => n > (baseBaseline.get(k) || 0)).map(([k, n]) => ({ key: k, n, was: baseBaseline.get(k) || 0 }));
}

/* ---------- CLI ---------- */
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..');
const BASELINE = path.join(here, 'design-guard-baseline.txt');
const MIN_FILES = 8, MIN_RULES = 200;   // zero-output guard: a guard that read nothing must not pass

function collect() {
  const out = [];
  (function walk(rel) {
    for (const e of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const r = path.posix.join(rel, e.name);
      if (e.isDirectory()) { if (e.name !== 'vendor' && e.name !== 'node_modules') walk(r); }
      else if (e.name.endsWith('.css')) out.push({ file: r, text: fs.readFileSync(path.join(ROOT, r), 'utf8'), module: !r.startsWith('commons/assets/') });
    }
  })('commons');
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const res = check(collect());
  const found = tally(res);
  console.log(`design-guard: read ${res.counts.files} CSS files, ${res.counts.rules} rules; ${res.bare.length} bare-element, ${res.dup.length} duplicate bodies.`);
  let fail = false;
  if (res.counts.files < MIN_FILES || res.counts.rules < MIN_RULES) {
    console.error(`::error::design-guard read too little (${res.counts.files} files / ${res.counts.rules} rules, need ≥ ${MIN_FILES} / ${MIN_RULES}) — the guard is broken, not passing.`);
    process.exit(1);
  }
  for (const n of res.nested) {
    console.error(`::error file=${n.file},line=${n.line}::Nested CSS isn't checked by design-guard — write flat rules (or extend tests/ci/design-guard.mjs first).`);
    fail = true;
  }
  if (process.argv.includes('--write-baseline')) {
    const head = '# design-guard baseline (DS-5): today\'s offenders and how often each occurs. May only SHRINK —\n' +
      '# lower the count / delete the line when you fix one (DS-3). Never add or raise a line to make CI pass.\n' +
      '# <count>\\tbare|<file>|<selector>   module CSS styling a bare select/input/textarea/label/button\n' +
      '# <count>\\tdup|<hash>|<files>       the same rule body (≥ 3 declarations) in several files\n';
    const lines = [...found].sort((a, b) => a[0].localeCompare(b[0])).map(([k, n]) => `${n}\t${k}`);
    fs.writeFileSync(BASELINE, head + lines.join('\n') + '\n');
    console.log(`Wrote ${lines.length} lines to ${path.relative(ROOT, BASELINE)}`);
    process.exit(fail ? 1 : 0);
  }
  const baseline = readBaseline(fs.existsSync(BASELINE) ? fs.readFileSync(BASELINE, 'utf8') : '');
  const { added, stale } = compare(found, baseline);
  for (const a of added) {
    const b = res.bare.filter((x) => x.key === a.key);
    if (b.length) {
      for (const x of b) console.error(`::error file=${x.file},line=${x.line}::Module CSS styles a bare element: "${x.selector}" (${a.n}× now, baseline ${a.was}). Use or fix the shared style in commons/assets/app.css (docs/design.md §8 #1).`);
    } else {
      const d = res.dup.find((x) => x.key === a.key);
      console.error(`::error::The same rule is in ${d.where.length} places (baseline ${a.was}) — ${d.where.map((w) => `${w.file}:${w.line} "${w.selector}"`).join(' · ')}. Make it one shared rule (docs/design.md §8 #2, §10).`);
    }
  }
  for (const s of stale) console.error(`::error::Fixed — ${s.n ? `lower the count to ${s.n}` : 'delete the line'} in tests/ci/design-guard-baseline.txt: ${s.key}`);
  const bi = process.argv.indexOf('--base');
  if (bi > 0 && fs.existsSync(process.argv[bi + 1] || '')) {
    for (const g of grew(baseline, readBaseline(fs.readFileSync(process.argv[bi + 1], 'utf8')))) {
      console.error(`::error::The baseline grew (${g.was} → ${g.n}): ${g.key}. The baseline may only shrink — fix the CSS instead.`);
      fail = true;
    }
  }
  if (added.length || stale.length || fail) process.exit(1);
  console.log('design-guard: OK (only baseline offenders remain).');
}
