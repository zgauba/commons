// Which Playwright specs cover a change (harness-autonomy-plan B2, 2026-11-23) — used by .claude/verify.sh so the local
// verify gate runs seconds of browser tests, not the whole ~100 s suite, when one Commons module changed.
// A spec covers the modules its page.goto("<module>/…") calls open (commons/<module>/ — the modules don't load each
// other's files). When in doubt it runs more, never less:
//   - a spec with a goto it can't read (goto(path)) or no goto at all → runs on every app change
//   - commons/assets/, other commons/ root files, unknown commons/ folders, tests/e2e/ helpers or config → ALL specs
//   - a changed spec file → that spec
//   - files outside commons/ and tests/e2e/ → no browser tests (repo-rules / design-guard still run)
// CI still runs the full suite on every PR (commons-e2e.yml); this is only the fast local pre-check.
// Usage: <changed paths, one per line> | node tests/ci/affected-specs.mjs [--root <repo dir>]
//   prints NONE, ALL, or the spec file names (one per line); exits 1 if it can't read the specs.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* spec text → { modules: Set, any: bool } */
export function specTargets(text) {
  const modules = new Set();
  let any = false, n = 0;
  for (const m of text.matchAll(/\bgoto\(\s*(["'`])?([^"'`)]*)/g)) {
    n++;
    if (!m[1]) { any = true; continue; }                       // goto(path), goto(url || …)
    const seg = m[2].replace(/^\.\//, '').split(/[/?#]/)[0];
    if (seg === '') modules.add('.');                            // "./" — the landing page, commons/index.html
    else if (/^[a-z0-9-]+$/i.test(seg) && m[2].includes('/')) modules.add(seg);
    else any = true;
  }
  return { modules, any: any || n === 0 };
}

/* changed paths + specs ({ name, text }) + module folders → 'NONE' | 'ALL' | [spec names] */
export function select(changed, specs, modules) {
  const hit = new Set(), pick = new Set();
  for (const f of changed) {
    if (f.startsWith('tests/e2e/specs/') && f.endsWith('.spec.js')) { pick.add(path.posix.basename(f)); continue; }
    if (f.startsWith('tests/e2e/')) return 'ALL';
    if (!f.startsWith('commons/')) continue;
    const rest = f.slice('commons/'.length);
    if (rest === 'index.html') { hit.add('.'); continue; }
    const dir = rest.split('/')[0];
    if (rest.includes('/') && dir !== 'assets' && modules.has(dir)) hit.add(dir);
    else return 'ALL';                                            // assets, root files, a new or unknown folder
  }
  for (const n of [...pick]) if (!specs.some((s) => s.name === n)) pick.delete(n);   // a deleted spec has nothing to run
  if (hit.size) for (const s of specs) {
    const t = specTargets(s.text);
    if (t.any || [...t.modules].some((m) => hit.has(m))) pick.add(s.name);
  }
  return pick.size ? [...pick].sort() : 'NONE';
}

/* ---------- CLI ---------- */
const isMain = () => { try { return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } };
if (process.argv[1] && isMain()) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const ri = process.argv.indexOf('--root');
  const ROOT = ri > 0 ? path.resolve(process.argv[ri + 1] || '.') : path.resolve(here, '..', '..');
  const dir = path.join(ROOT, 'tests', 'e2e', 'specs');
  let specs, modules;
  try {
    specs = fs.readdirSync(dir).filter((f) => f.endsWith('.spec.js')).map((name) => ({ name, text: fs.readFileSync(path.join(dir, name), 'utf8') }));
    modules = new Set(fs.readdirSync(path.join(ROOT, 'commons'), { withFileTypes: true })
      .filter((e) => e.isDirectory() && fs.existsSync(path.join(ROOT, 'commons', e.name, 'index.html'))).map((e) => e.name));
  } catch (e) { console.error(`affected-specs: ${e.message}`); process.exit(1); }
  // zero-output guard: with no specs or modules read, "NONE" would be a silent pass
  if (specs.length < 10 || modules.size < 3) { console.error(`affected-specs read too little (${specs.length} specs, ${modules.size} modules) — broken, not passing.`); process.exit(1); }
  const changed = fs.readFileSync(0, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
  const out = select(changed, specs, modules);
  console.log(Array.isArray(out) ? out.join('\n') : out);
}
