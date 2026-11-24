// The local test server's port, one per checkout, so two worktrees can run browser tests at the same time.
// Playwright reads its config again in every worker process, so the port must come out the same each time:
// it's derived from this checkout's folder (found from this file, never from where the command runs).
//   E2E_PORT    set → that port; unset → 4300–4999 from the checkout folder   (suite, /shot, smoke, app-check)
//   SWEEP_PORT  set → that port; unset → 5000–5699 from the checkout folder   (/shot sweep)
// A port that's taken fails the run with "http://localhost:<port>/commons/ is already used" (reuseExistingServer
// stays false: a server already there could be another checkout's). Nothing ever falls back to another port.
const crypto = require("crypto");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

function slot(root, base) {
  const h = crypto.createHash("sha1").update(root).digest();
  return base + (h.readUInt32BE(0) % 700);
}

function pick(name, base, env, root) {
  const v = env[name];
  if (v === undefined || v === "") return slot(root, base);
  const n = Number(v);
  if (!/^\d+$/.test(v) || n < 1024 || n > 65535) throw new Error(name + "=" + JSON.stringify(v) + " is not a port from 1024 to 65535");
  return n;
}

function webServer(port) {
  return {
    command: "python3 -m http.server " + port + " --bind 127.0.0.1 --directory ../..",
    url: "http://localhost:" + port + "/commons/",
    reuseExistingServer: false,
  };
}

function ports(env, root) {
  return { port: pick("E2E_PORT", 4300, env, root), sweepPort: pick("SWEEP_PORT", 5000, env, root) };
}

module.exports = Object.assign(ports(process.env, ROOT), { ports, webServer, ROOT });
