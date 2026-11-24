// tests/e2e/port.js: one fixed test-server port per checkout (contract e2e-port rows 2 and 7).
// Run: node --test tests/ci/e2e-port.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, copyFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const PORT_JS = path.join(ROOT, 'tests', 'e2e', 'port.js');
const { ports, webServer } = require(PORT_JS);

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

test('the server serves the repo root on that port and is never reused', () => {
  const w = webServer(4567);
  assert.equal(w.url, 'http://localhost:4567/commons/');
  assert.match(w.command, /http\.server 4567 --bind 127\.0\.0\.1 --directory \.\.\/\.\.$/);
  assert.equal(w.reuseExistingServer, false);
});
