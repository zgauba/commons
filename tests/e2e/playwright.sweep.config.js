// Sweep config: runs existing specs (same stubs, never the real Supabase project) and keeps a
// picture of the end of every test, for module UI reviews. Driven by /shot sweep.
//   SWEEP_OUT   absolute folder for pictures + report (required; the session scratchpad, never the repo)
//   SWEEP_FULL  1 = full-page pictures instead of one screen
//   SWEEP_PORT  default 4174, so a sweep never collides with a suite or /shot running on 4173 in another
//               session. Five assertions pin "localhost:4173" (home, account, admin-admins, admin) and fail
//               off that port; their pictures are still taken.
// Chromium iPhone only: a review looks at layout, and WebKit doubles the time.
const base = require("./playwright.config.js");

const out = process.env.SWEEP_OUT;
if (!out || !out.startsWith("/")) throw new Error("SWEEP_OUT must be an absolute folder (the session scratchpad)");
const port = process.env.SWEEP_PORT || "4174";
const url = "http://localhost:" + port + "/commons/";

module.exports = Object.assign({}, base, {
  outputDir: out + "/raw",
  webServer: Object.assign({}, base.webServer, { command: base.webServer.command.replace("4173", port), url }),
  reporter: [["line"], ["json", { outputFile: out + "/report.json" }]],
  use: Object.assign({}, base.use, { baseURL: url, screenshot: { mode: "on", fullPage: process.env.SWEEP_FULL === "1" } }),
  projects: base.projects.filter((p) => p.name === "mobile"),
});
