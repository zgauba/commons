// The local test server's port, one per checkout, so two worktrees can run browser tests at the same time.
// Playwright reads its config again in every worker process, so the port must come out the same each time:
// it's derived from this checkout's folder (found from this file, never from where the command runs).
//   E2E_PORT    set → that port; unset → 4300–4999 from the checkout folder   (suite, /shot, smoke, app-check)
//   SWEEP_PORT  set → that port; unset → 5000–5699 from the checkout folder   (/shot sweep)
// A port that's taken fails the run at once with "http://localhost:<port> is already used" (reuseExistingServer
// stays false: a server already there could be another checkout's). Nothing ever falls back to another port.
const crypto = require("crypto");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "..");

// Ports in 4300–5699 that can't work, checked 2026-11-24 by opening every port in Chromium and WebKit:
// 5060/5061 the browsers refuse (ERR_UNSAFE_PORT); 5000 is macOS's AirPlay Receiver, always taken on a Mac.
const REFUSED = [5060, 5061];
const AVOID = new Set([5000].concat(REFUSED));

function slot(root, base) {
  const h = crypto.createHash("sha1").update(root).digest();
  let p = base + (h.readUInt32BE(0) % 700);
  while (AVOID.has(p)) p++;   // stays fixed per checkout: the same hash always steps the same way
  return p;
}

function pick(name, base, env, root) {
  const v = env[name];
  if (v === undefined || v === "") return slot(root, base);
  const n = Number(v);
  if (!/^\d+$/.test(v) || n < 1024 || n > 65535) throw new Error(name + "=" + JSON.stringify(v) + " is not a port from 1024 to 65535");
  if (REFUSED.includes(n)) throw new Error(name + "=" + v + " is a port the browsers refuse to open (ERR_UNSAFE_PORT)");
  return n;
}

function baseURL(port) {
  return "http://localhost:" + port + "/commons/";
}

// `port`, not `url`: Playwright then checks the port with a plain connect. With `url` it sends an HTTP request
// first, which waits for as long as a holder that never answers keeps the port (seen 2026-11-24: 200 s, then ran).
// If Python still can't bind (the port was taken in between), the command names the port.
function webServer(port) {
  return {
    command: "python3 -m http.server " + port + " --bind 127.0.0.1 --directory ../.. || { echo \"test server: port " + port +
      " is taken (E2E_PORT / SWEEP_PORT pick another)\" >&2; exit 1; }",
    port,
    reuseExistingServer: false,
  };
}

function ports(env, root) {
  return { port: pick("E2E_PORT", 4300, env, root), sweepPort: pick("SWEEP_PORT", 5000, env, root) };
}

module.exports = Object.assign(ports(process.env, ROOT), { ports, webServer, baseURL, ROOT, AVOID });
