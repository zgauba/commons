// Design guard (DS-5 E3 + E4, 2026-11-19) — docs/design.md §8 "Never" #1 and #2, enforced.
//   E3 bare: module CSS (commons/<module>/*.css, not commons/assets/) may not target a bare select / input /
//            textarea / label / button — with or without a parent selector (".panel textarea" counts).
//   E4 dup:  the same rule body (≥ 3 declarations) may not appear in two different CSS files.
// Today's offenders are listed in design-guard-baseline.txt. The baseline may only SHRINK: a new offender
// fails, and so does a baseline line that no longer matches anything (fixed → delete the line).
// Usage: node tests/ci/design-guard.mjs [--write-baseline]   (no dependencies)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const BARE = new Set(['select', 'input', 'textarea', 'label', 'button']);
export const MIN_DECLS = 3;

/* rules → [{ selector, body, line }]; descends into @media / @supports, skips other at-rules' blocks */
export function parseCss(text) {
  const src = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));   // keep line numbers
  const rules = [];
  (function walk(from, to) {
    let i = from;
    while (i < to) {
      const open = src.indexOf('{', i);
      if (open < 0 || open >= to) return;
      const head = src.slice(i, open).trim();
      let depth = 1, j = open + 1;
      while (j < to && depth) { if (src[j] === '{') depth++; else if (src[j] === '}') depth--; j++; }
      if (/^@(media|supports|layer|container)\b/.test(head)) walk(open + 1, j - 1);
      else if (head && !head.startsWith('@')) {
        const line = src.slice(0, i + (src.slice(i, open).length - src.slice(i, open).trimStart().length)).split('\n').length;
        rules.push({ selector: head.replace(/\s+/g, ' '), body: src.slice(open + 1, j - 1), line });
      }
      i = j;
    }
  })(0, src.length);
  return rules;
}

function splitTop(s, sepRe) {      // split on a separator outside () and []
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(' || ch === '[') depth++;
    if (ch === ')' || ch === ']') depth--;
    if (depth === 0 && sepRe.test(ch)) { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/* the element a selector finally targets, if it is a bare one: ".panel textarea" → "textarea"; "label.check" → null */
export function bareTarget(selector) {
  const last = splitTop(selector, /[\s>+~]/).pop() || '';
  const base = last.replace(/\[[^\]]*\]/g, '').replace(/::?[a-z-]+(\([^)]*\))?/gi, '');
  return /^[a-z]+$/i.test(base) && BARE.has(base.toLowerCase()) ? base.toLowerCase() : null;
}

export function normBody(body) {
  return body.split(';').map((d) => d.trim().replace(/\s+/g, ' ').replace(/\s*:\s*/, ':')).filter(Boolean).sort();
}

/* files: [{ file, text, module }] → { bare: [{key, file, line, selector}], dup: [{key, where}], counts } */
export function check(files) {
  const bare = [], seen = new Map();
  let rules = 0;
  for (const f of files) {
    for (const r of parseCss(f.text)) {
      rules++;
      if (f.module) {
        for (const sel of splitTop(r.selector, /,/)) {
          const t = bareTarget(sel);
          if (t) bare.push({ key: `bare|${f.file}|${sel}`, file: f.file, line: r.line, selector: sel });
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
  return { bare, dup, counts: { files: files.length, rules } };
}

export function compare(found, baselineKeys) {
  const keys = new Set(found);
  return {
    added: found.filter((k) => !baselineKeys.has(k)),
    stale: [...baselineKeys].filter((k) => !keys.has(k)),
  };
}

export function readBaseline(text) {
  return new Set(text.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')));
}

/* ---------- CLI ---------- */
const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..', '..');
const BASELINE = path.join(here, 'design-guard-baseline.txt');
const MIN_FILES = 8, MIN_RULES = 200;   // zero-output guard: a guard that read nothing must not pass

function collect() {
  const commons = path.join(ROOT, 'commons');
  const out = [];
  for (const dir of fs.readdirSync(commons, { withFileTypes: true })) {
    if (!dir.isDirectory() || dir.name === 'vendor') continue;
    const d = path.join(commons, dir.name);
    for (const name of fs.readdirSync(d)) {
      if (!name.endsWith('.css')) continue;
      out.push({ file: `commons/${dir.name}/${name}`, text: fs.readFileSync(path.join(d, name), 'utf8'), module: dir.name !== 'assets' });
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const res = check(collect());
  const found = [...new Set([...res.bare.map((b) => b.key), ...res.dup.map((d) => d.key)])].sort();
  console.log(`design-guard: read ${res.counts.files} CSS files, ${res.counts.rules} rules; ${res.bare.length} bare-element, ${res.dup.length} duplicate.`);
  if (res.counts.files < MIN_FILES || res.counts.rules < MIN_RULES) {
    console.error(`::error::design-guard read too little (${res.counts.files} files / ${res.counts.rules} rules, need ≥ ${MIN_FILES} / ${MIN_RULES}) — the guard is broken, not passing.`);
    process.exit(1);
  }
  if (process.argv.includes('--write-baseline')) {
    const head = '# design-guard baseline (DS-5): today\'s offenders. May only SHRINK — delete a line when you fix it (DS-3).\n' +
      '# bare|<file>|<selector>   module CSS styling a bare select/input/textarea/label/button\n' +
      '# dup|<hash>|<files>       the same rule body (≥ 3 declarations) in several files\n';
    fs.writeFileSync(BASELINE, head + found.join('\n') + '\n');
    console.log(`Wrote ${found.length} lines to ${path.relative(ROOT, BASELINE)}`);
    process.exit(0);
  }
  const { added, stale } = compare(found, readBaseline(fs.existsSync(BASELINE) ? fs.readFileSync(BASELINE, 'utf8') : ''));
  for (const k of added) {
    const b = res.bare.find((x) => x.key === k);
    if (b) console.error(`::error file=${b.file},line=${b.line}::Module CSS styles a bare element: "${b.selector}". Use or fix the shared style in commons/assets/app.css (docs/design.md §8 #1).`);
    else {
      const d = res.dup.find((x) => x.key === k);
      console.error(`::error::The same rule is in ${d.where.length} places — ${d.where.map((w) => `${w.file}:${w.line} "${w.selector}"`).join(' · ')}. Make it one shared rule (docs/design.md §8 #2, §10).`);
    }
  }
  for (const k of stale) console.error(`::error::Baseline line no longer matches anything — it was fixed; delete it from tests/ci/design-guard-baseline.txt: ${k}`);
  if (added.length || stale.length) process.exit(1);
  console.log('design-guard: OK (only baseline offenders remain).');
}
