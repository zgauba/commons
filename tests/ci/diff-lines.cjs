/**
 * Diff lines (PR4c, 2026-11-23). Unified diff (-U0) → every added line as { file, line, text }, with the real file name.
 * The one parser for git-guard's local secret scan and, through a byte copy at zgauba tests/ci/diff-lines.cjs, for
 * the CI secret-scan and repo-rules R9 (the three copies had drifted). Edit here, then copy it across:
 *   cp ~/.claude/scripts/hooks/lib/diff-lines.js ~/code/zgauba.github.io/tests/ci/diff-lines.cjs
 * test/mirror-drift.test.js fails until the copy matches. No dependencies: CommonJS, loaded by both.
 *
 * `+++ ` is a header only between `diff --git` and the first `@@`; inside a hunk it is an added line that starts with
 * "++". git C-quotes a name with ", \ or a control character ("b/a\"b.js"; core.quotePath=false covers only
 * non-ASCII), and ends a name that holds a space with a tab, after the closing quote when quoted.
 */

function unquote(q) {
  const bytes = [], esc = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13 };
  for (let i = 1; i < q.length && !(q[i] === '"' && i === q.length - 1); i++) {
    // a whole code point: an emoji is 2 UTF-16 units
    if (q[i] !== '\\') { const ch = String.fromCodePoint(q.codePointAt(i)); bytes.push(...Buffer.from(ch)); i += ch.length - 1; continue; }
    const c = q[++i];
    if (/[0-7]/.test(c)) { bytes.push(parseInt(q.slice(i, i + 3), 8)); i += 2; } else bytes.push(esc[c] ?? c.charCodeAt(0));
  }
  return Buffer.from(bytes).toString('utf8');
}

function addedLines(out) {
  const res = [];
  let file = null, line = 0, inHeader = false;
  for (const l of out.split('\n')) {
    if (l.startsWith('diff --git ')) { inHeader = true; file = null; continue; }
    const h = /^@@ -\d+(?:,\d+)? \+(\d+)/.exec(l);
    if (inHeader) {
      if (l.startsWith('+++ ')) {
        const p = l.slice(4);
        file = l === '+++ /dev/null' ? null : (p[0] === '"' ? unquote(p.replace(/\t$/, '')) : p.replace(/\t.*$/, '')).replace(/^b\//, '');
      }
      if (h) { line = Number(h[1]); inHeader = false; }
      continue;
    }
    if (h) { line = Number(h[1]); continue; }
    if (file && l.startsWith('+')) { res.push({ file, line, text: l.slice(1) }); line += 1; }
  }
  return res;
}

module.exports = { unquote, addedLines };
