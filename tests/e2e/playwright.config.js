// Serves the repo root as-is (Pages has no build either) and runs against stubs —
// no test ever reaches the real Supabase project (see specs/stub.js).
const { defineConfig, devices } = require("@playwright/test");
const { port, webServer, baseURL } = require("./port.js");   // per checkout, see port.js

module.exports = defineConfig({
  testDir: "specs",
  fullyParallel: true,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: baseURL(port),
    serviceWorkers: "block",
  },
  projects: [
    { name: "mobile", use: { ...devices["iPhone 13"], browserName: "chromium" } },
    // Same iPhone viewport/UA on the real iOS engine (WebKit). Three shipped bugs were iPhone-Safari-only
    // and passed the Chromium project (Known Gap 17). Bare `npx playwright test` runs BOTH projects (needs webkit installed); `npm test` = Chromium only. Run on its own: `npx playwright test --project=webkit`.
    { name: "webkit", use: { ...devices["iPhone 13"], trace: "retain-on-failure" } },
  ],
  webServer: webServer(port),
});
