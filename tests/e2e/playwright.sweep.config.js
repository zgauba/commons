// Sweep config: runs existing specs (same stubs, never the real Supabase project) and keeps a
// picture of the end of every test, for module UI reviews. Driven by /shot sweep.
//   SWEEP_OUT   absolute folder for pictures + report (required; the session scratchpad, never the repo)
//   SWEEP_FULL  1 = full-page pictures instead of one screen
//   SWEEP_PORT  overrides the sweep's own per-checkout port (5000–5699, see port.js), kept apart from the
//               suite's so a sweep never collides with a suite or /shot, here or in another worktree.
// Chromium iPhone only: a review looks at layout, and WebKit doubles the time.
const base = require("./playwright.config.js");
const { sweepPort, webServer, baseURL } = require("./port.js");

const out = process.env.SWEEP_OUT;
if (!out || !out.startsWith("/")) throw new Error("SWEEP_OUT must be an absolute folder (the session scratchpad)");
const server = webServer(sweepPort);
const url = baseURL(sweepPort);

module.exports = Object.assign({}, base, {
  outputDir: out + "/raw",
  webServer: server,
  reporter: [["line"], ["json", { outputFile: out + "/report.json" }]],
  use: Object.assign({}, base.use, { baseURL: url, screenshot: { mode: "on", fullPage: process.env.SWEEP_FULL === "1" } }),
  projects: base.projects.filter((p) => p.name === "mobile"),
});
