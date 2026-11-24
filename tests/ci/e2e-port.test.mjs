// tests/e2e/port.js: one fixed test-server port per checkout (contract e2e-port rows 2 and 7).
// Run: node --test tests/ci/e2e-port.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT_JS = path.join(ROOT, 'tests', 'e2e', 'port.js');
const { ports, webServer, baseURL, AVOID } = require(PORT_JS);

const env = (extra = {}) => {
  const e = { ...process.env, ...extra };
  if (!('E2E_PORT' in extra)) delete e.E2E_PORT;
  if (!('SWEEP_PORT' in extra)) delete e.SWEEP_PORT;
  return e;
};
const portsFrom = (file, cwd, extra) => JSON.parse(execFileSync(process.execPath,
  ['-p', `const m = require(${JSON.stringify(file)}); JSON.stringify({ port: m.port, sweepPort: m.sweepPort })`], { cwd, env: env(extra) }));

test('same checkout: same ports whether run from the repo root or tests/e2e', () => {
  const a = portsFrom(PORT_JS, ROOT);
  const b = portsFrom(PORT_JS, path.join(ROOT, 'tests', 'e2e'));
  assert.equal(a.port, b.port);
  assert.equal(a.sweepPort, b.sweepPort);
  assert.deepEqual(ports({}, ROOT), { port: a.port, sweepPort: a.sweepPort });
});

test('the port comes from where port.js lives, not where the command runs', () => {
  const other = realpathSync(mkdtempSync(path.join(tmpdir(), 'e2e-port-')));
  mkdirSync(path.join(other, 'tests', 'e2e'), { recursive: true });
  const copy = path.join(other, 'tests', 'e2e', 'port.js');
  copyFileSync(PORT_JS, copy);
  const there = portsFrom(copy, ROOT);   // run from THIS checkout, but loading the other checkout's port.js
  assert.deepEqual(there, ports({}, other));
});

test('two checkouts get different ports, suite in 4300–4999 and sweep in 5000–5699', () => {
  const a = ports({}, '/Users/x/code/zgauba.github.io');
  const b = ports({}, '/Users/x/code/zgauba.github.io/.claude/worktrees/e2e-port-b');
  assert.notEqual(a.port, b.port);
  assert.notEqual(a.sweepPort, b.sweepPort);
  for (const p of [a, b]) {
    assert.ok(p.port >= 4300 && p.port <= 4999, String(p.port));
    assert.ok(p.sweepPort >= 5000 && p.sweepPort <= 5699, String(p.sweepPort));
  }
});

test('E2E_PORT and SWEEP_PORT override, each on its own', () => {
  const p = ports({ E2E_PORT: '4555' }, ROOT);
  assert.equal(p.port, 4555);
  assert.equal(p.sweepPort, ports({}, ROOT).sweepPort);
  assert.equal(ports({ SWEEP_PORT: '5123' }, ROOT).sweepPort, 5123);
});

test('a bad override throws naming the value; it never falls back to another port', () => {
  assert.throws(() => ports({ E2E_PORT: 'abc' }, ROOT), /E2E_PORT="abc"/);
  assert.throws(() => ports({ E2E_PORT: '80' }, ROOT), /E2E_PORT="80"/);
  assert.throws(() => ports({ E2E_PORT: '70000' }, ROOT), /E2E_PORT="70000"/);
  assert.throws(() => ports({ SWEEP_PORT: '4174x' }, ROOT), /SWEEP_PORT="4174x"/);
});

test('a checkout whose hash lands on 5000 / 5060 / 5061 gets the next usable port, and keeps it', () => {
  // the plain hash slot, as port.js computed it before the skip; find a folder that lands on each bad port
  const raw = (root, base) => base + (createHash('sha1').update(root).digest().readUInt32BE(0) % 700);
  for (const bad of [5000, 5060, 5061]) {
    let root = null;
    for (let i = 0; i < 200000 && !root; i++) if (raw('/checkouts/' + i, 5000) === bad) root = '/checkouts/' + i;
    assert.ok(root, 'no folder found that hashes to ' + bad);
    const got = ports({}, root).sweepPort;
    assert.equal(got, bad === 5000 ? 5001 : 5062, root);
    assert.equal(ports({}, root).sweepPort, got);
  }
  assert.deepEqual([...AVOID].sort(), [5000, 5060, 5061]);
});

test('an override the browsers refuse throws instead of failing every page later', () => {
  assert.throws(() => ports({ SWEEP_PORT: '5060' }, ROOT), /SWEEP_PORT=5060 .*refuse/);
  assert.throws(() => ports({ E2E_PORT: '5061' }, ROOT), /E2E_PORT=5061 .*refuse/);
});

test('the server serves the repo root on that port and is never reused', () => {
  const w = webServer(4567);
  // `port` (a plain connect check), never `url`: an HTTP check hangs while a silent holder keeps the port
  assert.equal(w.port, 4567);
  assert.equal(w.url, undefined);
  assert.equal(baseURL(4567), 'http://localhost:4567/commons/');
  assert.match(w.command, /^python3 -m http\.server 4567 --bind 127\.0\.0\.1 --directory \.\.\/\.\. \|\| /);
  assert.match(w.command, /port 4567 is taken/);   // a holder that isn't our server still gets the port named
  assert.equal(w.reuseExistingServer, false);
});
