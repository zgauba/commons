// node --test tests/ci/design-guard.test.mjs — each test fails if the guard stops catching what it's for.
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseCss, bareTarget, check, tally, compare, grew, readBaseline } from './design-guard.mjs';

test('a bare element is caught with or without a parent selector; a classed one is not', () => {
  assert.equal(bareTarget('select'), 'select');
  assert.equal(bareTarget('.panel textarea'), 'textarea');
  assert.equal(bareTarget('#ctForm input[type=time]'), 'input');
  assert.equal(bareTarget('.tog button:disabled'), 'button');
  assert.equal(bareTarget('.row > label'), 'label');
  assert.equal(bareTarget('label.check'), null);
  assert.equal(bareTarget('.mini'), null);
  assert.equal(bareTarget('.check input + span'), null);
  assert.equal(bareTarget('input[type="a b"]'), 'input');
});

test('nested pseudo-classes and :is()/:where() lists (review #3)', () => {
  assert.equal(bareTarget('.a textarea:not(:is(.x))'), 'textarea');
  assert.equal(bareTarget('.a :is(input, select)'), 'input');
  assert.equal(bareTarget(':where(.x, textarea)'), 'textarea');
  assert.equal(bareTarget('.a:is(input)'), null, 'a classed input, like label.check');
  assert.equal(bareTarget('.a :is(.b, .c)'), null);
});

test('module CSS styling a bare select fails; the same rule in assets/ is allowed', () => {
  const css = '.x select{font-size:16px; height:46px}';
  const mod = check([{ file: 'commons/cats/cats.css', text: css, module: true }]);
  assert.deepEqual(mod.bare.map((b) => b.key), ['bare|commons/cats/cats.css|.x select']);
  assert.equal(check([{ file: 'commons/assets/app.css', text: css, module: false }]).bare.length, 0);
});

test('comma lists are checked one selector at a time', () => {
  const r = check([{ file: 'commons/a/a.css', text: '.ok, .f textarea, .g{color:red}', module: true }]);
  assert.deepEqual(r.bare.map((b) => b.selector), ['.f textarea']);
});

test('@media is read; comments, @keyframes and @import are not rules and hide nothing (review #2)', () => {
  const { rules } = parseCss('/* select{} */\n@import url("x.css");\n@media (min-width:900px){ .a select{x:1} }\n@keyframes k{ from{a:1} to{a:2} }\n.b{c:1}');
  assert.deepEqual(rules.map((r) => r.selector), ['.a select', '.b']);
  assert.equal(rules[0].line, 3);
  const after = parseCss('@charset "utf-8";\n@import url("x.css");\n.a textarea{a:1;b:2;c:3}').rules;
  assert.deepEqual(after.map((r) => r.selector), ['.a textarea']);
});

test('nested CSS is refused, not silently skipped (review #4)', () => {
  const r = check([{ file: 'commons/c/c.css', text: '.card{ color:red; & input{a:1;b:2;c:3} }', module: true }]);
  assert.deepEqual(r.nested, [{ file: 'commons/c/c.css', line: 1 }]);
});

test('the same 3-declaration body in two files is a duplicate; in one file, or with 2 declarations, it is not', () => {
  const body = '{font:inherit; font-size:16px; color:var(--jc-ink)}';
  const two = check([
    { file: 'commons/pets/pets.css', text: '.p' + body, module: true },
    { file: 'commons/cats/cats.css', text: '.c ' + body.replace('; ', ';  '), module: true },
  ]);
  assert.equal(two.dup.length, 1);
  assert.match(two.dup[0].key, /^dup\|[0-9a-f]{10}\|commons\/cats\/cats\.css,commons\/pets\/pets\.css$/);
  assert.equal(check([{ file: 'x.css', text: '.a' + body + '.b' + body, module: true }]).dup.length, 0);
  assert.equal(check([{ file: 'a.css', text: '.a{x:1;y:2}', module: true }, { file: 'b.css', text: '.b{x:1;y:2}', module: true }]).dup.length, 0);
});

test('a repeat of a baselined offender is caught by its count (review #5)', () => {
  const text = '.panel textarea{a:1}\n@media (min-width:9px){ .panel textarea{b:1} }';
  const found = tally(check([{ file: 'commons/p/p.css', text, module: true }]));
  assert.equal(found.get('bare|commons/p/p.css|.panel textarea'), 2);
  const { added } = compare(found, readBaseline('1\tbare|commons/p/p.css|.panel textarea\n'));
  assert.equal(added.length, 1);
});

test('baseline: more than listed is "added"; fewer is "stale"; old count-less lines read as 1', () => {
  const base = readBaseline('# comment\n1\tbare|f|.a select\nbare|f|.b select\n2\tdup|h|a,b\n');
  const found = new Map([['bare|f|.a select', 1], ['bare|f|.c select', 1], ['dup|h|a,b', 1]]);
  const { added, stale } = compare(found, base);
  assert.deepEqual(added.map((a) => a.key), ['bare|f|.c select']);
  assert.deepEqual(stale.map((s) => [s.key, s.n]).sort(), [['bare|f|.b select', 0], ['dup|h|a,b', 1]]);
});

test('the PR may not grow the baseline against the base branch (security review)', () => {
  const baseB = readBaseline('1\tbare|f|.a select\n2\tdup|h|a,b\n');
  assert.deepEqual(grew(readBaseline('1\tbare|f|.a select\n1\tdup|h|a,b\n'), baseB), []);
  assert.deepEqual(grew(readBaseline('2\tbare|f|.a select\n1\tbare|f|.new select\n'), baseB).map((g) => g.key),
    ['bare|f|.a select', 'bare|f|.new select']);
});

/* DS-3a: a dup is matched by its rule body (hash), not by the exact file list — so removing one copy is a fix,
   promoting a copy into commons/assets/ is allowed, and a copy landing in another module still fails */
test('dup: removing one copy is "stale" (a fix), never "added"', () => {
  const base = readBaseline('4\tdup|h|commons/admin/admin.css,commons/assets/app.css,commons/events/events.css,commons/home/home.css\n');
  const found = new Map([['dup|h|commons/admin/admin.css,commons/assets/app.css', 2]]);
  const { added, stale } = compare(found, base);
  assert.deepEqual(added, []);
  assert.deepEqual(stale.map((s) => [s.n, s.to]), [[2, 'dup|h|commons/admin/admin.css,commons/assets/app.css']]);
  assert.deepEqual(grew(readBaseline('2\tdup|h|commons/admin/admin.css,commons/assets/app.css\n'), base), []);
});

test('dup: a module copy moving into commons/assets/ is a promotion; a copy into another module fails', () => {
  const base = readBaseline('2\tdup|h|commons/admin/admin.css,commons/pets/pets.css\n');
  const promoted = new Map([['dup|h|commons/admin/admin.css,commons/assets/app.css', 2]]);
  assert.deepEqual(compare(promoted, base).added, []);
  assert.deepEqual(grew(readBaseline('2\tdup|h|commons/admin/admin.css,commons/assets/app.css\n'), base), []);
  const spread = new Map([['dup|h|commons/admin/admin.css,commons/cats/cats.css', 2]]);
  assert.deepEqual(compare(spread, base).added.map((a) => a.key), ['dup|h|commons/admin/admin.css,commons/cats/cats.css']);
  assert.equal(grew(readBaseline('2\tdup|h|commons/admin/admin.css,commons/cats/cats.css\n'), base).length, 1);
  const more = new Map([['dup|h|commons/admin/admin.css,commons/pets/pets.css', 3]]);
  assert.equal(compare(more, base).added.length, 1);
  assert.equal(compare(new Map([['dup|z|a,b', 2]]), base).added.length, 1);
});

test('dup: a body gone from every file is "stale" (delete the line)', () => {
  const base = readBaseline('2\tdup|h|commons/admin/admin.css,commons/pets/pets.css\n');
  const { added, stale } = compare(new Map(), base);
  assert.deepEqual(added, []);
  assert.deepEqual(stale.map((s) => [s.key, s.n, s.to]), [['dup|h|commons/admin/admin.css,commons/pets/pets.css', 0, undefined]]);
});

// Security review 2026-11-23: symlinks must never let the guard pass without checking anything.
const GUARD = fileURLToPath(new URL('./design-guard.mjs', import.meta.url));

test('run through a symlinked script path, the guard still runs (it used to exit 0 silently)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-'));
  fs.mkdirSync(path.join(dir, 'commons'));
  fs.symlinkSync(GUARD, path.join(dir, 'guard.mjs'));
  const p = spawnSync('node', [path.join(dir, 'guard.mjs'), '--root', dir], { encoding: 'utf8' });
  assert.strictEqual(p.status, 1);
  assert.match(p.stderr, /read too little/);
});

test('a symlink under commons/ fails the guard instead of being skipped', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dg-'));
  fs.mkdirSync(path.join(dir, 'commons'));
  fs.symlinkSync(os.tmpdir(), path.join(dir, 'commons', 'hidden'));
  const p = spawnSync('node', [GUARD, '--root', dir], { encoding: 'utf8' });
  assert.strictEqual(p.status, 1);
  assert.match(p.stderr, /commons\/hidden is a symlink/);
});
