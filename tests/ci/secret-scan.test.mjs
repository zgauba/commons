// Tests for tests/ci/secret-scan.mjs. Every fake secret is assembled at run time, so no literal key sits in this
// file for the local secret scan or GitHub push protection to trip on.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scanDiff, scanNames, addedLines, unquote } from './secret-scan.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'secret-scan.mjs');
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ iss: 'supabase', role })}.${'s'.repeat(43)}`;
const SERVICE = jwt('service_role');
const ANON = jwt('anon');
const NAMED = ['SUPABASE', 'SERVICE', 'KEY'].join('_') + '=' + 'x9'.repeat(16);

const diff = (file, added) => [
  `diff --git a/${file} b/${file}`, 'index 0000000..1111111 100644', `--- a/${file}`, `+++ b/${file}`,
  `@@ -1,0 +5,${added.length} @@`, ...added.map((l) => '+' + l),
].join('\n');

test('a service-role JWT on an added line is found, with its file and line', () => {
  assert.deepStrictEqual(scanDiff(diff('commons/app.js', ['const a = 1;', `const k = "${SERVICE}";`])),
    [{ file: 'commons/app.js', line: 6, rule: 'supabase-service-role-jwt' }]);
});

test('the anon JWT and an allow-listed line in a test file are not findings', () => {
  assert.deepStrictEqual(scanDiff(diff('tests/e2e/login.spec.js', [`const anon = "${ANON}";`, `${NAMED} // secret-scan:allow`])), []);
});

test('secret-scan:allow outside a test file does not hide a finding (a PR cannot wave itself through)', () => {
  for (const file of ['commons/app.js', 'tests/f.txt', 'tests/e2e/fixtures/keys.js']) {
    assert.deepStrictEqual(scanDiff(diff(file, [`${NAMED} // secret-scan:allow`])), [{ file, line: 5, rule: 'named-secret' }], file);
  }
});

test('a provider-named secret is found; an added line that starts with "++" inside a hunk is still scanned', () => {
  const hits = scanDiff(diff('x.txt', ['ok', `+${NAMED}`]));
  assert.deepStrictEqual(hits, [{ file: 'x.txt', line: 6, rule: 'named-secret' }]);
});

test('a deleted file (+++ /dev/null) is not scanned', () => {
  const out = ['diff --git a/old b/old', 'deleted file mode 100644', '--- a/old', '+++ /dev/null', '@@ -1 +0,0 @@', `-${NAMED}`].join('\n');
  assert.deepStrictEqual(scanDiff(out), []);
});

test('.env files are findings; .env.example is not', () => {
  assert.deepStrictEqual(scanNames(['.env', 'commons/.env.local', '.dev.vars', '.env.example', 'README.md']).map((f) => f.file),
    ['.env', 'commons/.env.local', '.dev.vars']);
});

// End to end: a throwaway git repo with a base commit and a PR commit, scanned through the CLI as CI runs it.
// Each argument is one PR commit: { path: text } writes a file, { path: null } deletes it.
function repoWith(...commits) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'secret-scan-'));
  const g = (...a) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { encoding: 'utf8' }).trim();
  g('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(dir, 'README.md'), 'base\n');
  g('add', '.'); g('commit', '-qm', 'base');
  const base = g('rev-parse', 'HEAD');
  for (const files of commits) {
    for (const [f, text] of Object.entries(files)) {
      const p = path.join(dir, f);
      if (text === null) { fs.rmSync(p); continue; }
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, text);
    }
    g('add', '-A'); g('commit', '-qm', 'pr');
  }
  return { dir, base, head: g('rev-parse', 'HEAD') };
}
const run = (r, expect) => spawnSync('node', [SCRIPT, '--repo', r.dir, '--base', r.base, '--head', r.head, '--expect-files', String(expect)], { encoding: 'utf8' });

test('CLI: a PR adding a service-role JWT fails, and the output never contains the key', () => {
  const r = repoWith({ 'commons/config.js': `export const KEY = "${SERVICE}";\n` });
  const p = run(r, 1);
  assert.strictEqual(p.status, 1);
  assert.match(p.stdout, /::error file=commons\/config\.js,line=1::secret-scan: supabase-service-role-jwt/);
  assert.ok(!(p.stdout + p.stderr).includes(SERVICE.split('.')[1]), 'key text leaked into the log');
});

test('CLI: a PR adding a .env file fails', () => {
  const p = run(repoWith({ '.env': 'X=1\n' }), 1);
  assert.strictEqual(p.status, 1);
  assert.match(p.stdout, /file=\.env::secret-scan: env-file/);
});

test('CLI: a clean PR passes', () => {
  const p = run(repoWith({ 'docs/note.md': 'hello\n' }), 1);
  assert.strictEqual(p.status, 0, p.stderr);
  assert.match(p.stdout, /1 changed file\(s\), no secrets found/);
});

test('CLI: zero-output guard — fewer files in the diff than GitHub reports fails closed', () => {
  const p = run(repoWith({ 'docs/note.md': 'hello\n' }), 3);
  assert.strictEqual(p.status, 1);
  assert.match(p.stderr, /saw 1 changed file\(s\) but the PR has 3/);
});

test('CLI: an unreadable range fails closed, with one escaped line and no raw git text in the log', () => {
  const r = repoWith({ 'docs/note.md': 'hello\n' });
  const p = run({ ...r, head: 'f'.repeat(40) }, 1);
  assert.strictEqual(p.status, 1);
  assert.match(p.stderr, /^::error::secret-scan could not read the PR diff \(.*\) — failing closed\.\n$/);
  assert.ok(!/fatal:/.test(p.stdout + p.stderr), 'git stderr reached the log');
});

// Bypasses found in the security review (2026-11-23); each must fail the scan.
test('CLI: a key in a file git sees as binary (NUL byte) is still found', () => {
  const p = run(repoWith({ 'commons/blob.txt': `\0${NAMED}\n` }), 1);
  assert.strictEqual(p.status, 1, p.stdout + p.stderr);
  assert.match(p.stdout, /file=commons\/blob\.txt,line=1::secret-scan: named-secret/);
});

test('CLI: a PR .gitattributes marking every file -diff does not hide a key', () => {
  const p = run(repoWith({ '.gitattributes': '* -diff\n', 'commons/config.js': `${NAMED}\n` }), 2);
  assert.strictEqual(p.status, 1, p.stdout + p.stderr);
  assert.match(p.stdout, /file=commons\/config\.js,line=1::secret-scan: named-secret/);
});

test('CLI: a key added in one commit and removed in a later one is still found', () => {
  const p = run(repoWith({ 'commons/config.js': `${NAMED}\n` }, { 'commons/config.js': 'clean\n' }), 1);
  assert.strictEqual(p.status, 1, p.stdout + p.stderr);
  assert.match(p.stdout, /file=commons\/config\.js,line=1::secret-scan: named-secret/);
});

test('CLI: a .env file added and then deleted is still found', () => {
  const p = run(repoWith({ '.env': 'X=1\n', 'docs/a.md': 'a\n' }, { '.env': null }), 1);
  assert.strictEqual(p.status, 1, p.stdout + p.stderr);
  assert.match(p.stdout, /file=\.env::secret-scan: env-file/);
});

test('CLI: an annotation-breaking file name is neutralised', () => {
  const p = run(repoWith({ 'commons/a,b::c.env.js': `${NAMED}\n` }), 1);
  assert.strictEqual(p.status, 1);
  assert.match(p.stdout, /::error file=commons\/a_b__c\.env\.js,line=1::secret-scan: named-secret/);
});

// PR4c: one parser for secret-scan and R9. git C-quotes names with ", \ or a control character, and ends a name that holds
// a space with a tab, after the closing quote when quoted.
const qdiff = (quoted, added) => [`diff --git ${quoted.replace('b/', 'a/')} ${quoted}`, 'new file mode 100644', '--- /dev/null',
  `+++ ${quoted}`, `@@ -0,0 +1,${added.length} @@`, ...added.map((l) => '+' + l)].join('\n');

test('addedLines returns every added line of a multi-file diff, with file and new line number', () => {
  const out = [diff('a.js', ['1', '2']), diff('docs/b.md', ['3']), qdiff('"b/c\\"d.js"', ['4', '5'])].join('\n');
  assert.deepStrictEqual(addedLines(out).map((l) => [l.file, l.line, l.text]),
    [['a.js', 5, '1'], ['a.js', 6, '2'], ['docs/b.md', 5, '3'], ['c"d.js', 1, '4'], ['c"d.js', 2, '5']]);
});

test('a quoted name with a space keeps no quote or tab', () => {
  assert.deepStrictEqual(addedLines(qdiff('"b/x y\\"z.js"\t', ['k'])).map((l) => l.file), ['x y"z.js']);
});

test('secret-scan:allow is honoured on a quoted-name test file and refused on a quoted-name non-test file', () => {
  assert.deepStrictEqual(scanDiff(qdiff('"b/tests/e2e/a\\"b.spec.js"', [`${NAMED} // secret-scan:allow`])), []);
  assert.deepStrictEqual(scanDiff(qdiff('"b/commons/a\\"b.js"', [`${NAMED} // secret-scan:allow`])),
    [{ file: 'commons/a"b.js', line: 1, rule: 'named-secret' }]);
});

test('CLI: a key in a file whose name git quotes is reported under its real name', () => {
  const p = run(repoWith({ 'commons/a"b.js': `${NAMED}\n`, 'commons/t\tab.js': `${NAMED}\n`, 'commons/s p"q.js': `${NAMED}\n` }), 3);
  assert.strictEqual(p.status, 1, p.stdout + p.stderr);
  for (const f of ['commons/a"b.js', 'commons/t\tab.js', 'commons/s p"q.js']) {
    assert.ok(p.stdout.includes(`::error file=${f},line=1::secret-scan: named-secret`), `${JSON.stringify(f)} not named:\n${p.stdout}`);
  }
});

test('unquote keeps characters outside the BMP (an emoji is two UTF-16 units)', () => {
  assert.strictEqual(unquote('"b/commons/\u{1F600}\\"e.js"'), 'b/commons/\u{1F600}"e.js');
  assert.strictEqual(unquote('"b/\\360\\237\\230\\200\\"e.js"'), 'b/\u{1F600}"e.js');
});
