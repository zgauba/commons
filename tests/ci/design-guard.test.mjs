// node --test tests/ci/design-guard.test.mjs — each test fails if the guard stops catching what it's for.
import { test } from 'node:test';
import assert from 'node:assert';
import { parseCss, bareTarget, check, compare, readBaseline } from './design-guard.mjs';

test('a bare element is caught with or without a parent selector; a classed one is not', () => {
  assert.equal(bareTarget('select'), 'select');
  assert.equal(bareTarget('.panel textarea'), 'textarea');
  assert.equal(bareTarget('#ctForm input[type=time]'), 'input');
  assert.equal(bareTarget('.tog button:disabled'), 'button');
  assert.equal(bareTarget('.row > label'), 'label');
  assert.equal(bareTarget('label.check'), null);
  assert.equal(bareTarget('.mini'), null);
  assert.equal(bareTarget('.check input + span'), null);
});

test('module CSS styling a bare select fails; the same rule in assets/ is allowed', () => {
  const css = '.x select{font-size:16px; height:46px}';
  const mod = check([{ file: 'commons/cats/cats.css', text: css, module: true }]);
  assert.deepEqual(mod.bare.map((b) => b.key), ['bare|commons/cats/cats.css|.x select']);
  const shared = check([{ file: 'commons/assets/app.css', text: css, module: false }]);
  assert.equal(shared.bare.length, 0);
});

test('comma lists are checked one selector at a time', () => {
  const r = check([{ file: 'commons/a/a.css', text: '.ok, .f textarea, .g{color:red}', module: true }]);
  assert.deepEqual(r.bare.map((b) => b.selector), ['.f textarea']);
});

test('rules inside @media are read; comments and @keyframes are not rules', () => {
  const rules = parseCss('/* select{} */\n@media (min-width:900px){ .a select{x:1} }\n@keyframes k{ from{a:1} to{a:2} }\n.b{c:1}');
  assert.deepEqual(rules.map((r) => r.selector), ['.a select', '.b']);
  assert.equal(rules[0].line, 2);
});

test('the same 3-declaration body in two files is a duplicate; in one file, or with 2 declarations, it is not', () => {
  const body = '{font:inherit; font-size:16px; color:var(--jc-ink)}';
  const two = check([
    { file: 'commons/pets/pets.css', text: '.p' + body, module: true },
    { file: 'commons/cats/cats.css', text: '.c ' + body.replace('; ', ';  '), module: true },   // whitespace and order don't hide it
  ]);
  assert.equal(two.dup.length, 1);
  assert.match(two.dup[0].key, /^dup\|[0-9a-f]{10}\|commons\/cats\/cats\.css,commons\/pets\/pets\.css$/);
  assert.equal(check([{ file: 'x.css', text: '.a' + body + '.b' + body, module: true }]).dup.length, 0);
  assert.equal(check([{ file: 'a.css', text: '.a{x:1;y:2}', module: true }, { file: 'b.css', text: '.b{x:1;y:2}', module: true }]).dup.length, 0);
});

test('baseline: a new offender is "added"; a fixed one left in the baseline is "stale"', () => {
  const base = readBaseline('# comment\nbare|f|.a select\nbare|f|.b select\n');
  const { added, stale } = compare(['bare|f|.a select', 'bare|f|.c select'], base);
  assert.deepEqual(added, ['bare|f|.c select']);
  assert.deepEqual(stale, ['bare|f|.b select']);
});
