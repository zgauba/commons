// Tests for tests/ci/repo-rules.mjs: each rule catches a planted violation and lets its near-miss through,
// plus the CLI's zero-output guard, symlink refusal and annotation escaping. Run: node --test tests/ci/repo-rules.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { check, REFS } from './repo-rules.mjs';

const SCRIPT = fileURLToPath(new URL('./repo-rules.mjs', import.meta.url));
const rules = (...files) => check(files.map(([file, text]) => ({ file, text }))).violations.map((x) => x.rule);
const SP = 'supabase/signalpost/migrations/20270101000000_x.sql';
const JC = 'supabase/commons/migrations/20270101000000_x.sql';
const spHead = `-- Target: SignalPost (${REFS.signalpost})\n`;
const jcHead = `-- TARGET PROJECT: JubailCommons (${REFS.commons})\n`;

test('R1: jc_ under supabase/signalpost/ fails; jc_ under commons and jh_ under signalpost pass', () => {
  assert.deepEqual(rules([SP, spHead + 'create table public.jc_events (id int);']), ['R1']);
  assert.deepEqual(rules([JC, jcHead + 'create table public.jc_events (id int);']), []);
  assert.deepEqual(rules([SP, spHead + 'create table public.jh_homes (id int);']), []);
});

test('R2: header must name its own ref and not the other one; the two old files are exempt', () => {
  assert.deepEqual(rules([SP, '-- no ref here\nselect 1;']), ['R2']);
  assert.deepEqual(rules([JC, `-- ${REFS.signalpost}\nselect 1;`]), ['R2', 'R2']);           // wrong ref + missing own
  assert.deepEqual(rules([JC, `${jcHead}-- not ${REFS.signalpost}\n`]), ['R2']);            // both named
  assert.deepEqual(rules([JC, '\n'.repeat(15) + jcHead]), ['R2']);                           // ref past line 15
  assert.deepEqual(rules(['supabase/other/migrations/1_x.sql', jcHead]), ['R2']);            // unknown project
  assert.deepEqual(rules([JC, jcHead + 'select 1;']), []);
  assert.deepEqual(rules(['supabase/signalpost/migrations/20261102170000_jh_admin_tarpit.sql', '-- old\n']), []);
});

test('R3: create / replace / alter / drop of jh_signup fails; comments and other functions pass', () => {
  for (const sql of ['create or replace function public.jh_signup(p text) returns void as $$ $$ language sql;',
    'CREATE FUNCTION "jh_signup" (a int) returns int as $$ select 1 $$ language sql;',
    'drop function if exists public.jh_signup(text);', 'alter function jh_signup(text) owner to postgres;']) {
    assert.deepEqual(rules([SP, spHead + sql]), ['R3'], sql);
  }
  assert.deepEqual(rules([SP, spHead + '-- never redefine create function jh_signup( here\n/* create function jh_signup( */']), []);
  assert.deepEqual(rules([SP, spHead + 'create function public.jh_signup_v2(p text) returns void as $$ $$ language sql;']), []);
  assert.deepEqual(rules([SP, spHead + 'select public.jh_signup(1);']), []);
});

test('R4: phone numbers, tel: and WhatsApp links on the personal page fail; LinkedIn URLs and years pass', () => {
  for (const html of ['<a href="tel:+971501234567">call</a>', 'Call +971 50 123 4567', 'Mobile: 050-123-4567',
    '<a href="https://wa.me/971501234567">WhatsApp</a>', 'reach me on 971501234567', 'Tel 00971 50 123 4567']) {
    assert.ok(rules(['index.html', html]).includes('R4'), html);
  }
  assert.ok(rules(['jubail/index.html', 'Call +971 50 123 4567']).includes('R4'));
  assert.deepEqual(rules(['index.html', '<a href="https://www.linkedin.com/in/x-123456789012/">LinkedIn</a> since 2008, 20 → 165 clients, $135MM']), []);
  assert.deepEqual(rules(['commons/events/index.html', 'Call +971 50 123 4567']), []);         // personal page only
});

test('R5: "acquired" within 200 characters of Segmint fails; exit wording and far-away "acquired" pass', () => {
  assert.deepEqual(rules(['index.html', 'Built Client Success at Segmint, acquired by a larger company.']), ['R5']);
  assert.deepEqual(rules(['index.html', 'Segmint was Acquired in 2022']), ['R5']);
  assert.deepEqual(rules(['index.html', 'Built Client Success at Segmint through its exit.']), []);
  assert.deepEqual(rules(['index.html', 'Segmint' + ' '.repeat(250) + 'skills acquired over 18 years']), []);
});

test('R6: relocating / planning to move on the personal page fail; other pages pass', () => {
  for (const html of ['Relocating to Abu Dhabi', 'open to relocation', 'planning to move in 2027', 'moving to the UAE']) {
    assert.deepEqual(rules(['index.html', html]), ['R6'], html);
  }
  assert.deepEqual(rules(['index.html', 'Based in Abu Dhabi.']), []);
  assert.deepEqual(rules(['docs/notes.html', 'Relocating']), []);
});

test('R7: credit links to /jubail/ fail; links to the root and to /jubail-halloween pass', () => {
  for (const s of ['<a href="https://zgauba.github.io/jubail/">Zeeshan</a>', '<a href="https://zgauba.github.io/jubail">Z</a>',
    "'<a href=\"/jubail/\">'", '<a href="../jubail/index.html">']) {
    assert.deepEqual(rules(['commons/assets/api.js', s]), ['R7'], s);
  }
  assert.deepEqual(rules(['jubail-halloween/index.html', '<a href="https://zgauba.github.io/jubail/">Z</a>']), ['R7']);
  assert.deepEqual(rules(['commons/assets/api.js', '<a href="https://zgauba.github.io/">Zeeshan</a> zgauba.github.io/jubail-halloween']), []);
});

test('R8: "soccer" in Commons copy fails; football and code comments outside copy pass', () => {
  assert.deepEqual(rules(['commons/assets/strings.js', 'sport_1: "Soccer",']), ['R8']);
  assert.deepEqual(rules(['commons/events/index.html', '<p>Kids soccer at 5</p>']), ['R8']);
  assert.deepEqual(rules(['commons/assets/strings.js', 'sport_1: "Football",']), []);
  assert.deepEqual(rules(['commons/assets/api.js', '// say football, never soccer']), []);
});

/* ---------- CLI ---------- */
function repo({ migrations = 40, extra = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-rules-'));
  const put = (f, t) => { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t); };
  for (let i = 0; i < migrations; i++) put(`supabase/commons/migrations/2027010100${String(i).padStart(4, '0')}_m.sql`, jcHead + 'select 1;\n');
  put('index.html', '<p>Zeeshan</p>');
  put('jubail/index.html', '<a href="../">moved</a>');
  for (const m of ['home', 'events', 'cats', 'pets']) put(`commons/${m}/index.html`, '<p>Football</p>');
  put('commons/assets/strings.js', 'export const S = {};');
  for (const [f, t] of Object.entries(extra)) put(f, t);
  return dir;
}
const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });

test('CLI: a clean repo passes; a violation exits 1 with a file + line annotation', () => {
  const ok = run('--root', repo());
  assert.equal(ok.status, 0, ok.stderr);
  const bad = run('--root', repo({ extra: { 'commons/home/index.html': '<p>\nSoccer</p>' } }));
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /::error file=commons\/home\/index\.html,line=2::R8: /);
});

test('CLI: reading too little fails instead of passing (zero-output guard)', () => {
  const r = run('--root', repo({ migrations: 3 }));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /read too little \(migrations 3 < 40\)/);
  assert.equal(run('--root', fs.mkdtempSync(path.join(os.tmpdir(), 'repo-rules-empty-'))).status, 1);
});

test('CLI: a symlink anywhere in the checked folders fails closed', () => {
  const dir = repo();
  fs.symlinkSync('/etc', path.join(dir, 'commons', 'linked'));
  const r = run('--root', dir);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /commons\/linked is a symlink/);
});

test('CLI: a file name cannot inject a workflow command into the annotation', () => {
  const r = run('--root', repo({ extra: { 'commons/x,y:z%/index.html': 'soccer' } }));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /file=commons\/x%2Cy%3Az%25\/index\.html,line=1::R8/);
});

test('CLI: runs when invoked through a symlinked path', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-rules-link-'));
  const link = path.join(dir, 'repo-rules.mjs');
  fs.symlinkSync(SCRIPT, link);
  const r = spawnSync(process.execPath, [link, '--root', repo()], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /repo-rules: OK/);
});
