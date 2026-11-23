// Secret scan (harness-autonomy-plan PR 3a — the CI half of A1, 2026-11-23). The same check as the local
// git-guard secret scan, run on every PR: it reads the lines the PR adds and the files it adds, with the same
// patterns (secret-patterns.cjs is a byte-for-byte copy of ~/.claude/scripts/hooks/lib/secret-patterns.js; a drift
// test in claude-config fails when the two differ — copy the file across, never edit the mirror by hand).
// Findings print file, line and rule only, never the matched text: CI logs on a public repo are public.
// On a public repo this can only detect, not prevent: a key that reaches a PR branch is already exposed — rotate it.
// Stricter than the local scan in three ways (security review 2026-11-23): every commit is scanned, not only the net
// diff (a key added then removed is still in public history); binary detection and the PR's own .gitattributes are
// overridden (-a), so a NUL byte or `* -diff` can't hide a file; and `secret-scan:allow` counts only in test files
// (tests/**/*.test.* or *.spec.*), so a PR can't wave its own finding through anywhere else.
// Known limit: regexes read text, so a key in UTF-16, base64 or a compressed file is not found.
// Usage: node tests/ci/secret-scan.mjs --repo <git dir> --base <sha> --head <sha> --expect-files <n>   (no dependencies)
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { scanLine, isEnvFile } = require('./secret-patterns.cjs');

// Pinned prefixes, no renames, no external diff or textconv drivers (as the local scan), plus -a: every file as text.
export const DIFF = ['-a', '-U0', '--no-color', '--no-ext-diff', '--no-textconv', '--no-renames', '--src-prefix=a/', '--dst-prefix=b/'];
const ALLOW = 'secret-scan:allow';
export const allowHonoured = (file) => /^tests\/.+\.(test|spec)\.[cm]?[jt]s$/.test(file);

/* The diff parser is tests/ci/diff-lines.cjs: a byte copy of ~/.claude/scripts/hooks/lib/diff-lines.js, the one parser for
   the local git-guard scan, this scan and repo-rules R9 (PR4c; a drift test in claude-config fails when they differ —
   copy the file across, never edit the copy by hand). Re-exported for repo-rules and the tests. */
const { addedLines, unquote } = require('./diff-lines.cjs');
export { addedLines, unquote };

// added lines → findings
export function scanDiff(out) {
  const hits = [];
  for (const { file, line, text } of addedLines(out)) {
    for (const rule of scanLine(allowHonoured(file) ? text : text.split(ALLOW).join(''))) hits.push({ file, line, rule });
  }
  return hits;
}

export function scanNames(names) {
  return names.filter(isEnvFile).map((file) => ({ file, line: 0, rule: 'env-file' }));
}

// no system or global git config, no system attributes: only the flags above decide how the diff reads.
// stderr is captured, not inherited: git's own text (which can quote PR-controlled names) must not reach the CI log,
// where a line starting with "::" would be read as a workflow command. Callers print one escaped line instead.
const GIT_ENV = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_ATTR_NOSYSTEM: '1' };
export function git(repo, args) {
  return execFileSync('git', ['-C', repo, '-c', 'core.quotePath=false', ...args],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, env: GIT_ENV, stdio: ['ignore', 'pipe', 'pipe'] });
}
// text for a workflow-command message: % CR LF escaped, so nothing in it can start a new command (shared with repo-rules)
export const data = (s) => String(s).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');

// → { findings, files } ; throws if git fails (a failed diff must never read as "nothing added")
// The net diff (base...head) plus every non-merge commit in base..head; findings de-duplicated by file, line and rule.
export function scanRange(repo, base, head) {
  const net = `${base}...${head}`, commits = `${base}..${head}`;
  const split = (out) => out.split('\0').filter(Boolean);
  const all = split(git(repo, ['diff', '--name-only', '-z', '--no-renames', net]));
  const added = new Set([
    ...split(git(repo, ['diff', '--name-only', '-z', '--no-renames', '--diff-filter=ACMRT', net])),
    ...split(git(repo, ['log', '--no-merges', '--format=', '--name-only', '-z', '--no-renames', '--diff-filter=ACMRT', commits])),
  ]);
  const seen = new Set(), findings = [];
  for (const f of [...scanNames([...added]), ...scanDiff(git(repo, ['diff', ...DIFF, net])),
    ...scanDiff(git(repo, ['log', '--no-merges', '--format=', '-p', ...DIFF, commits]))]) {
    const k = `${f.file}\0${f.line}\0${f.rule}`;
    if (!seen.has(k)) { seen.add(k); findings.push(f); }
  }
  return { findings, files: all.length };
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repo = arg('--repo'), base = arg('--base'), head = arg('--head'), expect = Number(arg('--expect-files'));
  if (!repo || !base || !head || !Number.isInteger(expect) || expect < 0) {
    console.error('::error::secret-scan: usage --repo <dir> --base <sha> --head <sha> --expect-files <n>');
    process.exit(2);
  }
  let result;
  try {
    result = scanRange(repo, base, head);
  } catch (e) {
    console.error(`::error::secret-scan could not read the PR diff (${data(String(e.message).split('\n')[0])}) — failing closed.`);
    process.exit(1);
  }
  // Zero-output guard: GitHub says the PR changed files, so a diff with fewer files means the scan saw the wrong range.
  if (result.files < expect) {
    console.error(`::error::secret-scan saw ${result.files} changed file(s) but the PR has ${expect} — the scan read the wrong range; failing closed.`);
    process.exit(1);
  }
  if (!result.findings.length) {
    console.log(`secret-scan: ${result.files} changed file(s), no secrets found.`);
    process.exit(0);
  }
  for (const f of result.findings) {
    const file = f.file.replace(/[,:%\r\n]/g, '_');   // the path is PR-controlled: keep it from garbling the annotation
    const where = f.line ? `file=${file},line=${f.line}` : `file=${file}`;
    console.log(`::error ${where}::secret-scan: ${f.rule}`);
  }
  console.error(`::error::${result.findings.length} possible secret(s). Remove each and load it from the environment. This repo is public, so a key pushed to any branch is already exposed: rotate it. Deliberate fake in a test file: add "secret-scan:allow" to that line (it counts only in tests/**/*.test.* and *.spec.* files).`);
  process.exit(1);
}
