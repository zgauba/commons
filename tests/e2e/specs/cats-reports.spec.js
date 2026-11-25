// CC-7b — stray-cat reports on the Cats page (plan docs/plans/CC-community-cats.md "CC-7 plan"): residents report a
// stray cat (no species choice, Where on the shared where.js, the photo prompt, My reports), and Cats coordinators /
// community admins work the queue on the Reports tab (Add as new cat → editor → report closed; Already known → tap
// the cat; Not a stray). Volunteers never get the tab; Cats off → no form. The server's rules are s38's; this stub
// mirrors the shapes only.
const { test, expect } = require("@playwright/test");
const { stubBackend, ok, raise, CONFIG, MEMBER } = require("./stub");
const { signIn, PET_PNG } = require("./backends");

test.use({ timezoneId: "Asia/Dubai" });
const CATS_ON = Object.assign({}, CONFIG, { modules: Object.assign({}, CONFIG.modules, { cats: { enabled: true } }) });
const A1 = "aaaaaaaa-0000-4000-8000-0000000000a1", K1 = "dddddddd-0000-4000-8000-0000000000a1",
      K2 = "dddddddd-0000-4000-8000-0000000000b2";
const RP1 = "77777777-aaaa-4aaa-8aaa-000000000001", RP2 = "77777777-aaaa-4aaa-8aaa-000000000002";
const named = (calls, name) => calls.filter((c) => c.name === name);
const RID = (n) => "77777777-aaaa-4aaa-8aaa-00000000001" + n;

function catRow(id, code, name, extra) {
  return Object.assign({ id, code, name, sex: "unknown", life_stage: "adult", coat: null, confirmed: true, story: null, status: "community",
    ear_tip: "unclear", sterilised: "unknown", area: "Souk", photos: [], old_id: null, area_id: A1, station_id: null, status_on: null,
    status_source: null, ear_side: null, sterilised_source: null, tnvr: "none", tnvr_on: null, tnvr_place: null, own_photos: [],
    merged_into: null, merged_at: null, merged_from: [], status_log: [] }, extra || {});
}

// a member with these scopes; st = the server state the stub keeps
function backend(scopes, opts = {}) {
  const coord = scopes.includes("cats") || scopes.includes("community"), inProg = coord || scopes.includes("cats_vol");
  const st = { cats: [catRow(K1, "C-001", "Caramel")], mine: [], queue: [], objects: {}, n: 0, adds: [] };
  st.mine = (opts.mine || []).map((r) => Object.assign({ species: "cat", note: null, place: null, lat: null, lng: null, contact: null,
    state: "open", created_at: "2026-11-19T09:00:00Z", closed_at: null, photo_path: null, pet: null, cat: null }, r));
  st.queue = (opts.queue || []).map((r) => Object.assign({ species: "cat", note: null, place: null, lat: null, lng: null, contact: null,
    state: "open", created_at: "2026-11-19T08:00:00Z", closed_at: null, photo_path: null, pet: null, cat: null,
    reporter_home: { village: "north", type: "villa", building: null, number: 12 }, reporter_left: false }, r));
  const cfg = opts.cfg || CATS_ON;
  const off = () => (cfg.modules.cats && cfg.modules.cats.enabled ? null : raise("MODULE_OFF"));
  const mineCard = (r) => { const { contact, pending, reporter_home, reporter_left, ...c } = r; return Object.assign({}, c, { has_contact: !!contact }); };
  const rpc = {
    jc_config_get: () => ok(cfg),
    jc_me_get: (a, c) => (c.signedIn ? ok(Object.assign({}, MEMBER, { admin_scopes: scopes })) : raise("NOT_SIGNED_IN")),
    jc_cat_places: () => ok({ areas: [{ id: A1, name: "Souk" }], stations: [] }),
    jc_cats_public: () => ok({ cats: st.cats }),
    jc_cat_programme: () => (inProg ? ok({ can_edit: coord, areas: [{ id: A1, name: "Souk", archived: false, stations: 0 }], stations: [], people: [] }) : raise("NOT_ADMIN")),
    jc_cat_register: () => (inProg ? ok({ can_edit: coord, cats: st.cats }) : raise("NOT_ADMIN")),
    jc_cat_save: (a) => {
      const c = catRow(K2, "C-002", a.p_fields.name || null, { coat: a.p_fields.coat || null });
      st.cats.push(c); return ok({ can_edit: true, cats: st.cats });
    },
    jc_stray_report_add: (a) => {
      if (off()) return off();
      if (opts.reportError) return raise(opts.reportError);
      if (opts.reportFailOnce && !st.failedOnce) { st.failedOnce = true; return raise(opts.reportFailOnce); }
      const f = a.p_fields || {};
      if (f.species !== undefined && f.species !== "cat") return raise("BAD_FIELDS");
      if (f.lat == null && !f.place) return raise("BAD_FIELDS");
      const old = st.mine.find((r) => r.id === a.p_id);
      if (old) return ok(mineCard(old));
      const r = { id: a.p_id, species: "cat", note: f.note || null, place: f.place || null, lat: f.lat ?? null, lng: f.lng ?? null,
        contact: f.contact || null, state: "open", created_at: "2026-11-20T09:00:00Z", closed_at: null, photo_path: null, pet: null, cat: null };
      st.mine.unshift(r); st.adds.push(a);
      return ok(mineCard(r));
    },
    jc_stray_reports_mine: () => off() || ok(st.mine.map(mineCard)),
    jc_stray_report_contact_clear: (a) => { const r = st.mine.find((x) => x.id === a.p_id); if (!r) return raise("NOT_FOUND"); r.contact = null; return ok(mineCard(r)); },
    jc_stray_report_photo_begin: (a) => {
      const r = st.mine.find((x) => x.id === a.p_id && x.state === "open");
      if (!r) return raise("NOT_FOUND");
      st.n += 1; r.pending = "e2e/r/" + r.id + "/p" + st.n + "." + a.p_ext;
      return ok({ bucket: "pet-photos", path: r.pending, expires_in_seconds: 900 });
    },
    jc_stray_report_photo_commit: (a) => {
      const r = st.mine.find((x) => x.id === a.p_id);
      if (!r || !r.pending) return raise("NO_PENDING_PHOTO");
      r.photo_path = r.pending; r.pending = null; return ok(mineCard(r));
    },
    jc_stray_report_photo_remove: (a) => { const r = st.mine.find((x) => x.id === a.p_id); if (!r || !r.photo_path) return raise("NO_PHOTO"); r.photo_path = null; return ok(mineCard(r)); },
    jc_cat_activity: () => ok({ items: [], more: false }),
    jc_cat_reports_list: (a) => off() || (coord ? ok(st.queue.filter((r) => (a.p_show === "open") === (r.state === "open"))) : raise("NOT_ADMIN")),
    jc_cat_report_close: (a) => {
      if (off()) return off();
      if (!coord) return raise("NOT_ADMIN");
      const r = st.queue.find((x) => x.id === a.p_id);
      if (!r) return raise("NOT_FOUND");
      if (r.state !== "open") return raise("ALREADY_CLOSED");
      const k = a.p_cat ? st.cats.find((c) => c.id === a.p_cat) : null;
      if ((a.p_outcome === "not_stray") !== !a.p_cat || (a.p_cat && !k)) return raise("BAD_FIELDS");
      if (a.p_outcome === "added" && r.photo_path) { k.photos = k.photos.concat([r.photo_path]); k.own_photos = k.photos; }
      Object.assign(r, { state: a.p_outcome, closed_at: "2026-11-20T10:00:00Z", contact: null, photo_path: null, cat: k ? { id: k.id, name: k.name } : null });
      return ok(r);
    },
  };
  for (const [k, v] of Object.entries(opts.rpc || {})) rpc[k] = v;
  const storage = { upload: (a) => { if (opts.uploadFail) return { status: 400, body: { message: "nope" } }; st.objects[a.path] = a; return ok({ Key: a.path }); } };
  return { rpc, storage, st };
}
async function open(page, b, url) {
  await page.addInitScript(() => {
    window.addEventListener("click", (e) => { const a = e.target.closest && e.target.closest('a[target="_blank"]'); if (a) e.preventDefault(); }, true);
  });
  const stub = await stubBackend(page, { rpc: b.rpc, storage: b.storage });
  await signIn(page);
  await page.goto(url || "cats/");
  return stub;
}
async function photo(page) {
  const b64 = await page.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 800; c.height = 600;
    const g = c.getContext("2d"); g.fillStyle = "#c58b4b"; g.fillRect(0, 0, 800, 600);
    return c.toDataURL("image/jpeg", 0.9).split(",")[1];
  });
  return { name: "IMG_0003.jpg", mimeType: "image/jpeg", buffer: Buffer.from(b64, "base64") };
}

test("a resident reports a stray cat from the Cats tab: no species, a place is enough, the photo prompt, My reports", async ({ page }) => {
  const b = backend([]);
  const { calls } = await open(page, b);
  await expect(page.locator("#rpOpen")).toHaveText("Report a stray cat");
  await page.locator("#rpOpen").click();
  await expect(page.locator("h1")).toHaveText("Report a stray cat");
  await expect(page.locator("#rpOther")).toContainText("Stray dog or another animal");
  await expect(page.locator("[data-rsp]")).toHaveCount(0);                    // D1: no species choice
  await expect(page.locator("#rpPrivacy")).toContainText("Cats coordinators see this report");
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/cc7b-report-form-en.png", fullPage: true });
  await expect(page.locator("#rpPhotoWho")).toContainText("as a new cat");    // security M2: "add", never "match"
  await page.locator("#rpSend").click();
  await expect(page.locator("#msg")).toContainText("Add a pin or describe where you saw it.");
  expect(named(calls, "jc_stray_report_add")).toHaveLength(0);
  await page.locator("#rpNote").fill("Ginger, thin");
  await page.locator("#rpPlace").fill("Behind the souk");
  await page.locator("#rpWa").check();
  await page.locator("#rpPhone").fill("050 123");
  await page.locator("#rpSend").click();
  await expect(page.locator("#msg")).toContainText("international format");
  await page.locator("#rpPhone").fill("+971 50 123 4567");
  await page.locator("#rpPhotoIn").setInputFiles(await photo(page));
  await expect(page.locator("#rpPhotoNew")).toBeVisible();
  await page.locator("#rpSend").click();
  await expect(page.locator("#rpConfirm")).toBeVisible();
  await expect(page.locator("#rpC2")).toContainText("as a new cat");
  await page.locator("#rpSendPhoto").click();
  await expect(page.locator("h1")).toHaveText("Thanks for reporting");
  const add = named(calls, "jc_stray_report_add")[0].args;
  expect(add.p_fields).toEqual({ species: "cat", note: "Ginger, thin", place: "Behind the souk", contact: "+971501234567" });
  expect(named(calls, "jc_stray_report_photo_commit")).toHaveLength(1);
  await expect(page.locator("#rpWaText")).toHaveText("I've reported a stray cat near Behind the souk on Commons for the Cats coordinators.");
  await expect(page.locator("#rpWaAny")).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=/);
  await page.locator("#rpToCats").click();
  await expect(page.locator("#rpMine li")).toHaveCount(1);
  await expect(page.locator("#rpMine li")).toContainText("Waiting for the coordinators");
  await page.locator("[data-rpnum]").click();
  await expect(page.locator("#msg")).toContainText("Your number was removed.");
  await expect(page.locator("[data-rpnum]")).toHaveCount(0);
});

// the Pets tab's "Report a stray cat" link (CC-7c: was on the Strays tab) is ../cats/?report=1 — pets.spec.js checks the link
test("?report=1 (the Pets tab's link) opens the Cats form; Back returns to the Cats tab", async ({ page }) => {
  const b = backend([]);
  await open(page, b, "cats/?report=1");
  await expect(page.locator("h1")).toHaveText("Report a stray cat");
  await page.locator("#jcBackBtn").click();
  await expect(page.locator("#rpOpen")).toBeVisible();
});

test("Where uses the shared pin flow (Add Location Pin → Use this spot); a pin alone is enough", async ({ page }) => {
  const b = backend([]);
  const { calls } = await open(page, b, "cats/?report=1");
  await page.locator("#rpWAdd").click();
  await expect(page.locator("#rpWMap")).toBeVisible();
  await expect(page.locator("#rpPlace")).toHaveCount(0);                     // one thing at a time while picking
  await page.locator("#rpWMap").dragTo(page.locator("#rpWMap"), { sourcePosition: { x: 100, y: 100 }, targetPosition: { x: 140, y: 120 } });
  await page.locator("#rpWOk").click();
  await expect(page.locator("#rpWPos")).toBeVisible();
  await page.locator("#rpSend").click();
  await expect(page.locator("h1")).toHaveText("Thanks for reporting");
  const f = named(calls, "jc_stray_report_add")[0].args.p_fields;
  expect(typeof f.lat).toBe("number");
  expect(f.place).toBeUndefined();
});

test("Cats off: no Cats page form (the Pets tab's link is hidden too — pets.spec.js)", async ({ page }) => {
  const cfg = Object.assign({}, CONFIG, { modules: Object.assign({}, CONFIG.modules, { pets: { enabled: true }, cats: { enabled: false } }) });
  const b = backend([], { cfg });
  await open(page, b, "cats/?report=1");
  await expect(page.locator("#caOff")).toBeVisible();
  await expect(page.locator("#rpForm")).toHaveCount(0);
});

const QUEUE = [
  { id: RP1, note: "Ginger, thin", place: "Behind the souk", lat: 24.531, lng: 54.431, contact: "+971501234567", photo_path: "e2e/r/" + RP1 + "/p.jpg" },
  { id: RP2, place: "Marina steps" }];

test("a coordinator: the Reports tab with its count; Already known → tap the cat → linked; Not a stray → closed", async ({ page }) => {
  const b = backend(["cats"], { queue: QUEUE });
  const { calls } = await open(page, b);
  await expect(page.locator("#caTab_reports")).toHaveText("Reports (2)");
  await page.locator("#caTab_reports").click();
  await expect(page.locator("#rqList > li")).toHaveCount(2);
  const first = page.locator('[data-report="' + RP1 + '"]');
  await expect(first).toContainText("Where: Behind the souk");
  await expect(first).toContainText("From ");
  await expect(first.locator("[data-rqwa]")).toHaveAttribute("href", "https://wa.me/971501234567");
  await page.evaluate(() => document.fonts.ready);
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/cc7b-reports-tab-en.png", fullPage: true });
  await expect(first).not.toContainText("971");                               // the number is a link, never printed
  await first.locator("[data-rqknown]").click();
  await expect(page.locator("#rqKnown")).toContainText("The report's photo isn't added.");
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/cc7b-known-picker-en.png", fullPage: true });
  await page.locator("#rqKnownGo").click();
  await expect(page.locator("#msg")).toContainText("Tap the cat first.");
  await page.locator('#rqKnown [data-pick="' + K1 + '"]').click();
  await page.locator("#rqKnownGo").click();
  await expect(page.locator("#msg")).toContainText("Report linked to Caramel and closed.");
  expect(named(calls, "jc_cat_report_close").map((c) => c.args)).toEqual([{ p_id: RP1, p_outcome: "known", p_cat: K1 }]);
  await expect(page.locator("#caTab_reports")).toHaveText("Reports (1)");
  page.once("dialog", (d) => d.accept());
  await page.locator('[data-rqnot="' + RP2 + '"]').click();
  await expect(page.locator("#rqNone")).toHaveText("No reports waiting.");
  await page.locator("#rqShow-closed").click();
  await expect(page.locator("#rqList > li")).toHaveCount(2);
  await expect(page.locator('[data-report="' + RP1 + '"] [data-rqcat]')).toHaveText("Caramel");
});

test("Arabic: typed Latin text in a report card lines up right with the rest of the card (shared .bklist rule)", async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem("jc_lang", "ar"); } catch (e) {} });
  const b = backend(["cats"], { queue: QUEUE });
  await open(page, b);
  await page.locator("#caTab_reports").click();
  const card = page.locator('[data-report="' + RP1 + '"]');
  const note = card.locator('> div[dir="auto"]', { hasText: "Ginger, thin" });
  await expect(note).toBeVisible();
  // the text itself sits at the card's right edge, not the left (dir="auto" makes the box LTR)
  const edge = await note.evaluate((d) => { const r = document.createRange(); r.selectNodeContents(d);
    const t = r.getBoundingClientRect(), b = d.getBoundingClientRect(); return { gapRight: b.right - t.right, gapLeft: t.left - b.left }; });
  expect(edge.gapRight).toBeLessThan(2);
  expect(edge.gapLeft).toBeGreaterThan(20);
  await page.evaluate(() => document.fonts.ready);
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/cc7-reports-tab-ar.png", fullPage: true });
});

test("a coordinator: Add as new cat → the editor shows the report → Save adds the cat and closes the report as added", async ({ page }) => {
  const b = backend(["cats"], { queue: QUEUE });
  const { calls } = await open(page, b, "cats/?tab=reports");
  await expect(page.locator("#rqList > li")).toHaveCount(2);
  await page.locator('[data-rqadd="' + RP1 + '"]').click();
  await expect(page.locator("#rqFrom")).toContainText("the report's photo becomes the cat's photo");
  await expect(page.locator("#rqFrom")).toContainText("Ginger, thin");
  await expect(page.locator("#caCName")).toHaveValue("");                     // nothing the resident typed is copied in
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/cc7b-add-from-report-en.png", fullPage: true });
  await page.locator("#caCName").fill("Ginger");
  await page.locator("#caCatForm button[type=submit]").click();
  await expect(page.locator("#msg")).toContainText("Ginger was added and the report closed.");
  expect(named(calls, "jc_cat_report_close").map((c) => c.args)).toEqual([{ p_id: RP1, p_outcome: "added", p_cat: K2 }]);
  expect(b.st.cats.find((c) => c.id === K2).photos).toEqual(["e2e/r/" + RP1 + "/p.jpg"]);
});

test("a coordinator: a report handled meanwhile by another coordinator → the queue is read again and says why", async ({ page }) => {
  const b = backend(["cats"], { queue: QUEUE, rpc: { jc_cat_report_close: () => raise("ALREADY_CLOSED") } });
  const { calls } = await open(page, b, "cats/?tab=reports");
  page.once("dialog", (d) => d.accept());
  await page.locator('[data-rqnot="' + RP2 + '"]').click();
  await expect(page.locator("#msg")).toContainText("Another coordinator already handled that report.");
  expect(named(calls, "jc_cat_reports_list").filter((c) => c.args.p_show === "open").length).toBeGreaterThanOrEqual(2);
});

test("a volunteer never gets the Reports tab (and never asks for the queue)", async ({ page }) => {
  const b = backend(["cats_vol"], { queue: QUEUE });
  const { calls } = await open(page, b, "cats/?tab=reports");
  await expect(page.locator("#caTab_log")).toBeVisible();
  await expect(page.locator("#caTab_reports")).toHaveCount(0);
  expect(named(calls, "jc_cat_reports_list")).toHaveLength(0);
});

test("Arabic: the report form and the Reports tab", async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem("jc_lang", "ar"); } catch (e) {} });
  const b = backend(["cats"], { queue: QUEUE });
  await open(page, b, "cats/?tab=reports");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.locator("#caTab_reports")).toHaveText("البلاغات (2)");
  await expect(page.locator("#rqList > li")).toHaveCount(2);
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/cc7b-reports-tab-ar.png", fullPage: true });
  await page.locator("#caTab_cats").click();
  await page.locator("#rpOpen").click();
  await expect(page.locator("h1")).toHaveText("الإبلاغ عن قطة ضالّة");
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/cc7b-report-form-ar.png", fullPage: true });
});

// ---------- ported from pets-report.spec.js (the form moved from Pets to Cats in CC-7b; same ids, cat only) ----------
async function formOpen(page, b) { const stub = await open(page, b); await page.locator("#rpOpen").click(); return stub; }

test("the form: a place is enough; the note is trimmed; no number unless ticked; My reports shows the place", async ({ page }) => {
  const b = backend([]);
  const { calls } = await formOpen(page, b);
  await page.locator("#rpNote").fill("  Brown, limping  ");
  await page.locator("#rpPlace").fill("Behind the clubhouse");
  await page.locator("#rpSend").click();
  await expect(page.locator("h1")).toHaveText("Thanks for reporting");
  await expect(page.locator("#msg")).toHaveText("Report sent.");
  const add = named(calls, "jc_stray_report_add")[0].args;
  expect(add.p_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(add.p_fields).toEqual({ species: "cat", note: "Brown, limping", place: "Behind the clubhouse" });
  await page.locator("#rpToCats").click();
  await expect(page.locator("#rpMine li")).toContainText("Behind the clubhouse");
  // Cats UI review #3: the "deleted after 30 days" line never touches the card above it
  const list = await page.locator("#rpMine").boundingBox(), kept = await page.locator("#rpMineBox > p.help").boundingBox();
  expect(kept.y - (list.y + list.height)).toBeGreaterThanOrEqual(8);
});

test("WhatsApp number: only when ticked; 00971 → +971; the help names the Cats coordinators", async ({ page }) => {
  const b = backend([]);
  const { calls } = await formOpen(page, b);
  await page.locator("#rpPlace").fill("Gate 2");
  await expect(page.locator("#rpPhone")).toHaveCount(0);
  await page.locator("#rpWa").check();
  await expect(page.locator("#rpWaHelp")).toContainText("Only the Cats coordinators see your number");
  await page.locator("#rpPhone").fill("00971 (50) 123-4567");
  await page.locator("#rpSend").click();
  await expect(page.locator("h1")).toHaveText("Thanks for reporting");
  expect(named(calls, "jc_stray_report_add")[0].args.p_fields.contact).toBe("+971501234567");
});

test("the photo prompt: locked behind it; Back changes nothing; Send without the photo sends no photo", async ({ page }) => {
  const b = backend([]);
  const { calls } = await formOpen(page, b);
  await page.locator("#rpPlace").fill("Beach path");
  await page.locator("#rpPhotoIn").setInputFiles(await photo(page));
  await expect(page.locator("#rpPhotoNew")).toBeVisible();
  await page.locator("#rpSend").click();
  await expect(page.locator("#rpConfirmH")).toBeFocused();
  await expect(page.locator("#rpConfirm")).toContainText("If they use it, it stays with the cat; if not, it's discarded.");
  await expect(page.locator("#rpConfirm")).toHaveAttribute("aria-describedby", "rpC1 rpC2 rpC3");
  await expect(page.locator("#rpPhotoIn")).toBeDisabled();
  await expect(page.locator("#rpPlace")).toBeDisabled();
  expect(named(calls, "jc_stray_report_add")).toEqual([]);
  await page.locator("#rpConfirmBack").click();
  await expect(page.locator("#rpSend")).toBeFocused();
  await expect(page.locator("#rpPhotoNew")).toBeVisible();
  await page.locator("#rpSend").click();
  await page.locator("#rpSendNoPhoto").click();
  await expect(page.locator("h1")).toHaveText("Thanks for reporting");
  expect(named(calls, "jc_stray_report_photo_begin")).toEqual([]);
});

test("Send with the photo uploads it to the report; My reports shows it and withdraws it (asks first)", async ({ page }) => {
  const b = backend([]);
  const { calls } = await formOpen(page, b);
  await page.locator("#rpPlace").fill("Beach path");
  await page.locator("#rpPhotoIn").setInputFiles(await photo(page));
  await expect(page.locator("#rpPhotoNew")).toBeVisible();
  await page.locator("#rpSend").click();
  await page.locator("#rpSendPhoto").click();
  await expect(page.locator("h1")).toHaveText("Thanks for reporting");
  const id = named(calls, "jc_stray_report_add")[0].args.p_id;
  expect(named(calls, "jc_stray_report_photo_begin")[0].args).toEqual({ p_id: id, p_ext: "jpg" });
  expect(named(calls, "jc_stray_report_photo_commit")[0].args).toEqual({ p_id: id });
  await page.locator("#rpToCats").click();
  const li = page.locator(`[data-myreport="${id}"]`);
  await expect(li.locator("[data-photo]")).toBeVisible();
  page.once("dialog", (d) => d.dismiss());
  await li.locator("[data-rpphoto]").click();
  expect(named(calls, "jc_stray_report_photo_remove")).toEqual([]);
  page.once("dialog", (d) => d.accept());
  await li.locator("[data-rpphoto]").click();
  await expect(page.locator("#msg")).toHaveText("Photo withdrawn.");
  await expect(li.locator("[data-rpphoto]")).toHaveCount(0);
});

test("My reports: what coordinators decided (the cat, linked); an older Pets-linked report just says Closed; the number never shown", async ({ page }) => {
  const b = backend([], { mine: [
    { id: RID(1), place: "Gate 2", contact: "+971501234567" },
    { id: RID(2), state: "added", closed_at: "2026-11-19T12:00:00Z", cat: { id: K1, name: "Caramel" } },
    { id: RID(3), state: "not_stray", closed_at: "2026-11-19T12:00:00Z" },
    { id: RID(4), state: "known", closed_at: "2026-11-19T12:00:00Z", pet: { id: "x", name: "Old stray" } }] });
  const { calls } = await open(page, b);
  await expect(page.locator("#rpMineH")).toHaveText("My reports");
  await expect(page.locator(`[data-myreport="${RID(2)}"]`)).toContainText("Added as Caramel");
  await expect(page.locator(`[data-myreport="${RID(3)}"]`)).toContainText("Closed: not a stray");
  await expect(page.locator(`[data-myreport="${RID(4)}"]`)).toContainText("Closed");
  await expect(page.locator(`[data-myreport="${RID(4)}"]`)).not.toContainText("Old stray");
  await expect(page.locator("#rpMine")).not.toContainText("971");
  await page.locator(`[data-myreport="${RID(1)}"] [data-rpnum]`).click();
  await expect.poll(() => named(calls, "jc_stray_report_contact_clear").map((c) => c.args)).toEqual([{ p_id: RID(1) }]);
  await page.locator(`[data-myreport="${RID(2)}"] [data-rpcat]`).click();
  await expect(page.locator("h1")).toHaveText("Caramel");
});

for (const [code, text] of [["TOO_MANY_REPORTS", "You've sent a lot of reports today. Thank you, that's enough for now."],
                            ["RATE_LIMITED", "Coordinators have a lot of reports today. Please try again tomorrow."]]) {
  test(`${code}: said plainly; the form stays`, async ({ page }) => {
    await formOpen(page, backend([], { reportError: code }));
    await page.locator("#rpPlace").fill("Gate");
    await page.locator("#rpSend").click();
    await expect(page.locator("#msg")).toHaveText(text);
    await expect(page.locator("#rpPlace")).toHaveValue("Gate");
  });
}

test("Back from the form returns to the Cats tab and sends nothing; a doubled tap on Send sends one report", async ({ page }) => {
  const b = backend([]);
  const { calls } = await formOpen(page, b);
  await page.locator("#jcBackBtn").click();
  await expect(page.locator("#rpOpen")).toBeVisible();
  expect(named(calls, "jc_stray_report_add")).toEqual([]);
  await page.locator("#rpOpen").click();
  await page.locator("#rpPlace").fill("Gate");
  await page.locator("#rpSend").evaluate((btn) => { btn.click(); btn.click(); });
  await expect(page.locator("h1")).toHaveText("Thanks for reporting");
  expect(named(calls, "jc_stray_report_add")).toHaveLength(1);
});

test("a failed send keeps the form; the retry carries the same report id", async ({ page }) => {
  const b = backend([], { reportFailOnce: "UNKNOWN" });
  const { calls } = await formOpen(page, b);
  await page.locator("#rpPlace").fill("Gate");
  await page.locator("#rpSend").click();
  await expect(page.locator("#rpSend")).toBeEnabled();
  await expect(page.locator("#rpPlace")).toHaveValue("Gate");
  await page.locator("#rpSend").click();
  await expect(page.locator("h1")).toHaveText("Thanks for reporting");
  const ids = named(calls, "jc_stray_report_add").map((c) => c.args.p_id);
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
});

test("the photo fails after the report went in: says the coordinators have it, no need to send again", async ({ page }) => {
  const b = backend([], { uploadFail: true });
  const { calls } = await formOpen(page, b);
  await page.locator("#rpPlace").fill("Gate");
  await page.locator("#rpPhotoIn").setInputFiles(await photo(page));
  await expect(page.locator("#rpPhotoNew")).toBeVisible();
  await page.locator("#rpSend").click();
  await page.locator("#rpSendPhoto").click();
  await expect(page.locator("h1")).toHaveText("Thanks for reporting");
  await expect(page.locator("#msg")).toContainText("The coordinators have your report, without the photo");
  expect(named(calls, "jc_stray_report_add")).toHaveLength(1);
});

// ---------- code review (CC-7b) ----------
test("code review M1: after Already known, the Activity tab is read again (the close wrote a sighting)", async ({ page }) => {
  const b = backend(["cats"], { queue: QUEUE });
  const { calls } = await open(page, b);
  await page.locator("#caTab_log").click();
  await expect.poll(() => named(calls, "jc_cat_activity").length).toBeGreaterThan(0);
  const before = named(calls, "jc_cat_activity").length;
  await page.locator("#caTab_reports").click();
  await page.locator('[data-rqknown="' + RP1 + '"]').click();
  await page.locator('#rqKnown [data-pick="' + K1 + '"]').click();
  await page.locator("#rqKnownGo").click();
  await expect(page.locator("#msg")).toContainText("Report linked to Caramel");
  await page.locator("#caTab_log").click();
  await expect.poll(() => named(calls, "jc_cat_activity").length).toBeGreaterThan(before);
});

test("code review: Add as new cat → Back → a plain new cat from the Cats tab never closes the report", async ({ page }) => {
  const b = backend(["cats"], { queue: QUEUE });
  const { calls } = await open(page, b, "cats/?tab=reports");
  await page.locator('[data-rqadd="' + RP1 + '"]').click();
  await expect(page.locator("#rqFrom")).toBeVisible();
  await page.locator("#jcBackBtn").click();
  await page.locator("#caTab_cats").click();
  await page.locator("#caAddCat").click();
  await expect(page.locator("#rqFrom")).toHaveCount(0);
  await page.locator("#caCName").fill("Plain");
  await page.locator("#caCatForm button[type=submit]").click();
  await expect(page.locator("#msg")).toBeVisible();
  expect(named(calls, "jc_cat_save")).toHaveLength(1);
  expect(named(calls, "jc_cat_report_close")).toEqual([]);
});

test("code review: a doubled tap on Not a stray closes once", async ({ page }) => {
  const b = backend(["cats"], { queue: QUEUE });
  const { calls } = await open(page, b, "cats/?tab=reports");
  page.on("dialog", (d) => d.accept());
  await page.locator('[data-rqnot="' + RP2 + '"]').evaluate((btn) => { btn.click(); btn.click(); });
  await expect(page.locator("#msg")).toContainText("Report closed.");
  expect(named(calls, "jc_cat_report_close")).toHaveLength(1);
});

test("code review: the cat saved but the close failed → says so (use Already known, not Add again); the cat exists", async ({ page }) => {
  const b = backend(["cats"], { queue: QUEUE, rpc: { jc_cat_report_close: () => raise("UNKNOWN") } });
  await open(page, b, "cats/?tab=reports");
  await page.locator('[data-rqadd="' + RP1 + '"]').click();
  await page.locator("#caCName").fill("Ginger");
  await page.locator("#caCatForm button[type=submit]").click();
  await expect(page.locator("#msg")).toContainText("Ginger was added, but the report is still open");
  await expect(page.locator("#msg")).toContainText("Already known");
  expect(b.st.cats.some((c) => c.id === K2)).toBe(true);
});

// CC-7c: moved from photo-viewer.spec.js ("Organizer Tools: a stray report's photo opens the viewer") — the queue
// that shows a report's photo is the Cats page's Reports tab now
test("a coordinator: a report's photo on the Reports tab opens the photo viewer; Escape closes it, focus returns", async ({ page }) => {
  const b = backend(["cats"], { queue: QUEUE });
  b.storage.image = (path) => (path === QUEUE[0].photo_path ? PET_PNG : null);
  await open(page, b, "cats/?tab=reports");
  const ph = page.locator('[data-report="' + RP1 + '"] .ptview');
  await ph.click();
  const viewer = page.locator("#jcPhotoView");
  await expect(viewer).toBeVisible();
  await expect.poll(() => viewer.locator(".ptph.full").evaluate((s) => !!(s.classList.contains("has") && s.querySelector("img") &&
    s.querySelector("img").naturalWidth > 0))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(viewer).toBeHidden();
  await expect(ph).toBeFocused();
});

// UI review 2026-11-20 #1: a resident on a missing cat's page tells the coordinators through the report form
test("UI review #1: I've seen ⟨cat⟩ on a missing cat opens the report form naming it; the note says so; Back returns to the cat", async ({ page }) => {
  const b = backend([]);
  b.st.cats.push(catRow(K2, "C-002", "Smudge", { status: "missing" }));
  const { calls } = await open(page, b);
  await page.locator(`[data-cat="${K2}"]`).click();
  await expect(page.locator("#caAlarm #caSeenRep")).toHaveText("I've seen Smudge");
  await expect(page.locator("#caAlarmSeen")).toHaveCount(0);                                 // residents: no programme sighting
  await page.locator("#caSeenRep").click();
  await expect(page.locator("h1")).toHaveText("I've seen Smudge");
  await expect(page.locator("#rpSeen")).toHaveText("About \u2068C-002 · Smudge\u2069, listed as missing. Say where and when you saw it.");
  await expect(page.locator("#rpOther")).toHaveCount(0);
  const prefix = "Seen: C-002 · Smudge (listed as missing).";
  await expect(page.locator("#rpNote")).toHaveAttribute("maxlength", String(280 - prefix.length - 1));   // prefix + note ≤ 280
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/uirev-seen-form.png", fullPage: true });
  await page.locator("#jcBackBtn").click();
  await expect(page.locator(".pthero h1")).toHaveText("Smudge");                              // back on the cat, nothing sent
  expect(named(calls, "jc_stray_report_add")).toHaveLength(0);
  await page.locator("#caSeenRep").click();
  await page.locator("#rpNote").fill("By the bins");
  await page.locator("#rpPlace").fill("Souk car park");
  await page.locator("#rpSend").click();
  await expect(page.locator("h1")).toHaveText("Thanks for reporting");
  expect(named(calls, "jc_stray_report_add")[0].args.p_fields)
    .toEqual({ species: "cat", note: "Seen: C-002 · Smudge (listed as missing). By the bins", place: "Souk car park" });   // exact
  await expect(page.locator("#rpWaText")).toHaveText("I've seen Smudge, listed as missing, and told the Cats coordinators on Commons.");
});

test("UI review #1: a seen report with no note of its own sends exactly the cat line", async ({ page }) => {
  const b = backend([]);
  b.st.cats.push(catRow(K2, "C-002", "Smudge", { status: "missing" }));
  const { calls } = await open(page, b);
  await page.locator(`[data-cat="${K2}"]`).click();
  await page.locator("#caSeenRep").click();
  await page.locator("#rpPlace").fill("Souk car park");
  await page.locator("#rpSend").click();
  await expect(page.locator("h1")).toHaveText("Thanks for reporting");
  expect(named(calls, "jc_stray_report_add")[0].args.p_fields)
    .toEqual({ species: "cat", note: "Seen: C-002 · Smudge (listed as missing).", place: "Souk car park" });
});

test("UI review #1: a stray report opened from the Cats tab is unchanged (no cat line, the other-animal line kept)", async ({ page }) => {
  const b = backend([]);
  await open(page, b);
  await page.locator("#rpOpen").click();
  await expect(page.locator("#rpSeen")).toHaveCount(0);
  await expect(page.locator("#rpOther")).toBeVisible();
  await expect(page.locator("#rpNote")).toHaveAttribute("maxlength", "280");
});

test("UI review #5: a report's Add as new cat has its own row; Already known and Not a stray share the next, one line each", async ({ page }) => {
  const b = backend(["cats"], { queue: QUEUE });
  await open(page, b);
  await page.locator("#caTab_reports").click();
  const card = page.locator('[data-report="' + RP1 + '"]');
  const box = async (sel) => card.locator(sel).boundingBox();
  const add = await box("[data-rqadd]"), known = await box("[data-rqknown]"), not = await box("[data-rqnot]");
  expect(known.y).toBeGreaterThan(add.y + add.height - 1);                                    // the next row
  expect(Math.abs(known.height - not.height)).toBeLessThan(2);                                // same size: no 36px mini
  expect(known.height).toBeLessThan(60);                                                      // one line, not two
  expect(not.height).toBeLessThan(60);
  // side by side when they fit, else the second on its own row — never squeezed onto two lines (CI WebKit's wider font)
  expect(Math.abs(known.y - not.y) < 2 || not.y >= known.y + known.height - 1).toBe(true);
});

test("UI review #5 follow-up: with a wider font the two buttons stack rather than wrap their text", async ({ page }) => {
  const b = backend(["cats"], { queue: QUEUE });
  await open(page, b);
  await page.locator("#caTab_reports").click();
  await page.addStyleTag({ content: '[data-report] [data-rqknown], [data-report] [data-rqnot]{font-size:24px; letter-spacing:.15em}' });   // what a wide fallback font does
  const card = page.locator('[data-report="' + RP1 + '"]');
  for (const sel of ["[data-rqknown]", "[data-rqnot]"]) {
    const box = await card.locator(sel).boundingBox();
    expect(box.height).toBeLessThan(70);                                                       // one line at 24px, not two
  }
});
