// Turns a sweep's report.json into numbered pictures + index.md, in the same folder.
// Usage: node shots/sweep-index.js <SWEEP_OUT>
const fs = require("fs");
const path = require("path");

const out = process.argv[2];
if (!out) { console.error("usage: node shots/sweep-index.js <SWEEP_OUT>"); process.exit(2); }
const report = JSON.parse(fs.readFileSync(path.join(out, "report.json"), "utf8"));

const rows = [];
function walk(suite, file, titles) {
  const f = suite.file || file;
  const t = suite.title && suite.title !== f ? titles.concat(suite.title) : titles;
  for (const spec of suite.specs || []) {
    for (const test of spec.tests || []) {
      const result = (test.results || [])[test.results.length - 1] || {};
      const pics = (result.attachments || []).filter((a) => a.contentType === "image/png" && a.path);
      rows.push({ file: f, title: t.concat(spec.title).join(" › "), status: result.status || test.status, pics });
    }
  }
  for (const s of suite.suites || []) walk(s, f, t);
}
for (const s of report.suites || []) walk(s, s.file, []);
// A run that never started (port busy, bad filter) writes a report with errors and no tests — say so, don't index nothing.
if (!rows.length) {
  console.error("No tests ran." + ((report.errors || []).map((e) => "\n  " + (e.message || "").split("\n")[0]).join("")));
  process.exit(1);
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
const lines = ["# Sweep index", "", "| # | Spec | Test | Result | Picture |", "|---|---|---|---|---|"];
let n = 0, missing = 0, failed = 0;
for (const r of rows) {
  n++;
  const num = String(n).padStart(3, "0");
  const names = r.pics.map((p, i) => {
    const name = num + "-" + slug(path.basename(r.file, ".spec.js")) + "-" + slug(r.title) + (i ? "-" + (i + 1) : "") + ".png";
    fs.copyFileSync(p.path, path.join(out, name));
    return name;
  });
  if (!names.length) missing++;
  if (r.status !== "passed" && r.status !== "skipped") failed++;
  lines.push("| " + num + " | " + r.file + " | " + r.title.replace(/\|/g, "\\|") + " | " + r.status + " | " + (names.join(", ") || "**none**") + " |");
}
lines.push("", n + " tests · " + (n - missing) + " with a picture · " + missing + " without · " + failed + " not passed");
fs.writeFileSync(path.join(out, "index.md"), lines.join("\n") + "\n");
console.log(lines[lines.length - 1]);
console.log("index: " + path.join(out, "index.md"));
