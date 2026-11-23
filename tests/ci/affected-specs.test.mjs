// Tests for tests/ci/affected-specs.mjs — it may run more specs than needed, never fewer.
// Run: node --test tests/ci/affected-specs.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { specTargets, select } from './affected-specs.mjs';

const SCRIPT = fileURLToPath(new URL('./affected-specs.mjs', import.meta.url));
const MODULES = new Set(['admin', 'cats', 'events', 'pets']);
const SPECS = [
  { name: 'cats.spec.js', text: 'await page.goto("cats/"); await page.goto("cats/?tab=log");' },
  { name: 'admin.spec.js', text: 'await page.goto("admin/?tab=community"); await page.goto(`events/?id=${ID}`);' },
  { name: 'landing.spec.js', text: 'await page.goto("./");' },
  { name: 'a11y.spec.js', text: 'for (const p of PAGES) await page.goto(p);' },
  { name: 'parity.spec.js', text: 'fs.readFileSync("assets/strings.js")' },
];

test('specTargets reads the module from each literal goto; dynamic or no goto means "any"', () => {
  assert.deepEqual([...specTargets(SPECS[1].text).modules].sort(), ['admin', 'events']);
  assert.equal(specTargets(SPECS[1].text).any, false);
  assert.deepEqual([...specTargets(SPECS[2].text).modules], ['.']);
  assert.equal(specTargets(SPECS[3].text).any, true);
  assert.equal(specTargets(SPECS[4].text).any, true);
  assert.equal(specTargets('page.goto("https://example.com")').any, true);        // not a module path
});

test('a module change runs the specs that open it plus the unmappable ones', () => {
  assert.deepEqual(select(['commons/cats/cats.js'], SPECS, MODULES), ['a11y.spec.js', 'cats.spec.js', 'parity.spec.js']);
  assert.deepEqual(select(['commons/events/events.css'], SPECS, MODULES), ['a11y.spec.js', 'admin.spec.js', 'parity.spec.js']);
  assert.deepEqual(select(['commons/index.html'], SPECS, MODULES), ['a11y.spec.js', 'landing.spec.js', 'parity.spec.js']);
});

test('shared or unknown app files and e2e helpers run everything', () => {
  for (const f of ['commons/assets/app.css', 'commons/_headers', 'commons/manifest.webmanifest', 'commons/newmodule/index.html',
    'tests/e2e/specs/stub.js', 'tests/e2e/playwright.config.js']) {
    assert.equal(select(['docs/a.md', f], SPECS, MODULES), 'ALL', f);
  }
});

test('a changed spec runs itself; nothing app-related changed runs nothing', () => {
  assert.deepEqual(select(['tests/e2e/specs/pets.spec.js'], SPECS, MODULES), ['pets.spec.js']);
  assert.equal(select(['docs/x.md', 'index.html', 'supabase/commons/migrations/1.sql', 'tests/ci/x.mjs'], SPECS, MODULES), 'NONE');
  assert.equal(select([], SPECS, MODULES), 'NONE');
});

test('CLI: refuses to answer when it read no specs (zero-output guard) and works on the real repo', () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'affected-'));
  fs.mkdirSync(path.join(empty, 'tests', 'e2e', 'specs'), { recursive: true });
  fs.mkdirSync(path.join(empty, 'commons'));
  const r = spawnSync(process.execPath, [SCRIPT, '--root', empty], { input: 'commons/cats/cats.js\n', encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /read too little/);
  const real = spawnSync(process.execPath, [SCRIPT], { input: 'commons/cats/cats.js\n', encoding: 'utf8' });
  assert.equal(real.status, 0, real.stderr);
  assert.match(real.stdout, /^cats\.spec\.js$/m);
  assert.doesNotMatch(real.stdout, /^admin\.spec\.js$/m);
});
