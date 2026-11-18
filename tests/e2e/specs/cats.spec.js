// CC-1 — Cats foundation: the Cats page behind its module flag, the two Cats roles (coordinator 'cats', volunteer
// 'cats_vol') never showing Organizer Tools, the Admins screen inviting both while Cats is on, and an accepted Cats
// invite pointing at the Cats page. Plan: docs/plans/CC-community-cats.md (CC-1).
const { test, expect } = require("@playwright/test");
const { stubBackend, ok, raise, CONFIG, MEMBER } = require("./stub");
const { adminBackend, signIn } = require("./backends");

const CATS_ON = Object.assign({}, CONFIG, { modules: Object.assign({}, CONFIG.modules, { cats: { enabled: true } }) });
const TOKEN = "INVITEtoken_abcdefghij12";

// CC-2 fixtures: the resident family (public stations only, no Station ID) and the programme family
const A_SOUK = "aaaaaaaa-0000-4000-8000-000000000001", A_SEEF = "aaaaaaaa-0000-4000-8000-000000000002";
const S1 = "bbbbbbbb-0000-4000-8000-000000000001", S2 = "bbbbbbbb-0000-4000-8000-000000000002";
const VERA = "cccccccc-0000-4000-8000-000000000001", CORA = "cccccccc-0000-4000-8000-000000000002";
const PLACES = { areas: [{ id: A_SOUK, name: "Souk" }],
  stations: [{ id: S1, area_id: A_SOUK, landmark: "Behind the souk", lat: 24.5301, lng: 54.4301 }] };
function progFor(coord) {
  const who = (id, role, name) => Object.assign(coord ? { user_id: id } : {}, { role, name });
  return {
    can_edit: coord,
    areas: [{ id: A_SEEF, name: "Seef", archived: false, stations: 1 }, { id: A_SOUK, name: "Souk", archived: false, stations: 1 }],
    stations: [
      { id: S1, code: "S-001", area_id: A_SOUK, lat: 24.5301, lng: 54.4301, landmark: "Behind the souk", access_notes: null,
        private: false, located_at: "2026-11-18T08:00:00Z", archived: false, people: [], moves: [] },
      { id: S2, code: "S-002", area_id: A_SEEF, lat: 24.5401, lng: 54.4401, landmark: "Next door", access_notes: "Ring twice",
        private: true, located_at: "2026-11-18T09:00:00Z", archived: false,
        people: [who(VERA, "lead", "Vera"), who(CORA, "backup", "Cora")],
        moves: [{ lat: 24.54, lng: 54.44, landmark: "A villa", from: "2026-11-01T08:00:00Z", until: "2026-11-18T09:00:00Z" }] },
    ],
    people: coord ? [{ user_id: CORA, scope: "cats", name: "Cora" }, { user_id: VERA, scope: "cats_vol", name: "Vera" }] : [],
  };
}

// CC-3 fixtures: the resident list (no old ID, station, TNVR, dates, sources) and the register
const K1 = "dddddddd-0000-4000-8000-000000000001", K2 = "dddddddd-0000-4000-8000-000000000002", K3 = "dddddddd-0000-4000-8000-000000000003";
const PH1 = "e2e/c/" + K1 + "/aaa.jpg", PH2 = "e2e/c/" + K1 + "/bbb.jpg";
const PUB = { cats: [
  { id: K1, code: "C-001", name: "Caramel", sex: "male", life_stage: "adult", coat: "Orange tabby", confirmed: true,
    story: "Very gentle, loves cuddles.", status: "community", ear_tip: "present", sterilised: "yes", area: "Souk", photos: [PH1, PH2] },
  { id: K2, code: "C-002", name: null, sex: "unknown", life_stage: "kitten", coat: "Black, white socks", confirmed: false,
    story: null, status: "missing", ear_tip: "unclear", sterilised: "unknown", area: "Seef", photos: [] }] };
function regFor(coord) {
  const full = (c, extra) => Object.assign({}, c, { old_id: null, area_id: null, station_id: null, status_on: null, status_source: null,
    ear_side: null, sterilised_source: null, tnvr: "none", tnvr_on: null, tnvr_place: null, own_photos: c.photos,
    merged_into: null, merged_at: null, merged_from: [], status_log: [] }, extra);
  const cats = [
    full(PUB.cats[0], { old_id: "JB-07", area_id: A_SOUK, station_id: S1, ear_side: "left", sterilised_source: "Clinic card",
      tnvr: "returned", tnvr_on: "2026-10-20", tnvr_place: "Souk station", status_on: "2026-11-15", status_source: "Lead feeder",
      merged_from: [{ id: K3, code: "C-003", name: "Caramel 2", old_id: null }],
      status_log: [{ status: "community", on: "2026-11-15", source: "Lead feeder", at: "2026-11-15T08:00:00Z", code: "C-001" },
                   { status: "clinic", on: "2026-11-10", source: "Vet", at: "2026-11-10T08:00:00Z", code: "C-003" }] }),
    full(PUB.cats[1], { area_id: A_SEEF }),
  ];
  if (coord) cats.push(full({ id: K3, code: "C-003", name: "Caramel 2", sex: "male", life_stage: "adult", coat: null, confirmed: false,
    story: null, status: "clinic", ear_tip: "unclear", sterilised: "unknown", area: null, photos: [] },
    { merged_into: { id: K1, code: "C-001", name: "Caramel" }, merged_at: "2026-11-16T08:00:00Z" }));
  return { can_edit: coord, cats };
}

// a member holding these admin scopes; Cats on unless cfg says otherwise
function member(scopes, cfg) {
  const inProg = scopes.some((s) => ["cats", "cats_vol", "community"].includes(s));
  return {
    jc_config_get: () => ok(cfg || CATS_ON),
    jc_me_get: (a, c) => (c.signedIn ? ok(Object.assign({}, MEMBER, { admin_scopes: scopes })) : raise("NOT_SIGNED_IN")),
    jc_cat_places: () => ok(PLACES),
    jc_cat_programme: () => (inProg ? ok(progFor(scopes.includes("cats") || scopes.includes("community"))) : raise("NOT_ADMIN")),
    jc_cats_public: () => ok(PUB),
    jc_cat_register: () => (inProg ? ok(regFor(scopes.includes("cats") || scopes.includes("community"))) : raise("NOT_ADMIN")),
  };
}

test("Cats off: the page says so, asks nothing of the server, and isn't in the bar", async ({ page }) => {
  const { calls } = await stubBackend(page, { rpc: member([], CONFIG) });
  await signIn(page);
  await page.goto("cats/");
  await expect(page.locator("#caOff")).toBeVisible();
  await expect(page.locator('#tabbar [data-tab="cats"]')).toHaveCount(0);
  expect(calls.some((c) => c.name === "jc_hit" && c.args.p_page === "cats")).toBe(false);
});

test("Cats on, a resident: the page, the bar button, the page hit; no role line; help", async ({ page }) => {
  const { calls } = await stubBackend(page, { rpc: member([]) });
  await signIn(page);
  await page.goto("cats/");
  await expect(page.locator("h1")).toHaveText("Community Cats");
  await expect(page.locator("#caSoon")).toContainText("The cat programme is moving here");
  await expect(page.locator(".caStation")).toHaveCount(1);
  await expect(page.locator("#caRole")).toHaveCount(0);
  await expect(page.locator('#tabbar [data-tab="cats"]')).toHaveAttribute("aria-current", "page");
  await expect(page.locator('#tabbar [data-tab="cats"]')).toHaveText("Cats");
  expect(calls.filter((c) => c.name === "jc_hit").map((c) => c.args.p_page)).toContain("cats");
  await page.locator("#jcHelpBtn").click();
  await expect(page.locator("#jcHelp h2")).toHaveText("Cats");
});

for (const [scope, line] of [["cats_vol", "You're a volunteer for this programme."], ["cats", "You're a coordinator for this programme."]]) {
  test(`a Cats ${scope === "cats" ? "coordinator" : "volunteer"} sees their role and never Organizer Tools`, async ({ page }) => {
    await stubBackend(page, { rpc: member([scope]) });
    await signIn(page);
    await expect(page.locator('#tabbar [data-tab="admin"]')).toHaveCount(0);      // the hub's bar
    await page.goto("cats/");
    await expect(page.locator("#caRole")).toHaveText(line);
    await expect(page.locator('#tabbar [data-tab="admin"]')).toHaveCount(0);
    await expect(page.locator('#tabbar [data-tab="cats"]')).toBeVisible();
  });
}

test("Arabic: the page and its role line", async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem("jc_lang", "ar"); } catch (e) {} });
  await stubBackend(page, { rpc: member(["cats_vol"]) });
  await signIn(page);
  await page.goto("cats/");
  await expect(page.locator("h1")).toHaveText("قطط المجتمع");
  await expect(page.locator("#caRole")).toHaveText("أنت متطوع في هذا البرنامج.");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});

// the Admins screen: the community admin's view of the per-scope lists
function adminsBackend(cfg, acceptable) {
  const ab = adminBackend({ scopes: acceptable ? [] : ["community"] });
  const st = ab.st;
  const links = {};
  return Object.assign({}, ab.rpc, {
    jc_config_get: () => ok(cfg),
    jc_module_admins_list: (a) => (st.scopes.includes("community") ? ok({ scope: a.p_scope, admins: [], links: links[a.p_scope] || [] }) : raise("NOT_ADMIN")),
    jc_module_admin_link_create: (a) => {
      links[a.p_scope] = [{ id: "l-" + a.p_scope, created_at: "2026-11-18T09:00:00Z", expires_at: "2026-11-21T09:00:00Z" }];
      return ok({ token: "TOKEN_" + a.p_scope + "_abcdefghijklmnop", scope: a.p_scope, expires_at: "2026-11-21T09:00:00Z" });
    },
    jc_module_admin_accept: (a) => {
      const s = (acceptable || {})[a.p_token];
      if (!s) return raise("BAD_LINK");
      st.scopes = st.scopes.concat([s]);
      return ok({ scope: s });
    },
  });
}

test("Admins screen: Cats coordinators and volunteers listed only while Cats is on; a volunteer link", async ({ page }) => {
  const { calls } = await stubBackend(page, { rpc: adminsBackend(CATS_ON) });
  await signIn(page);
  await page.goto("admin/?tab=community");
  await page.locator("#adOpen").click();
  await expect(page.locator("h2.group")).toHaveText(["Community admins", "Event organizers", "Bookings admins", "Pets admins",
                                                     "Cats coordinators", "Cats volunteers"]);
  await expect(page.locator('[data-scope="cats_vol"] .help').first()).toContainText("No Organizer Tools");
  await page.locator('[data-admake="cats_vol"]').click();
  await expect(page.locator('[data-adurl="cats_vol"]')).toContainText("#admininvite=TOKEN_cats_vol_");
  expect(calls.filter((c) => c.name === "jc_module_admin_link_create").pop().args).toEqual({ p_scope: "cats_vol" });
});

test("Admins screen with Cats off: no Cats levels while nobody holds one", async ({ page }) => {
  await stubBackend(page, { rpc: adminsBackend(CONFIG) });
  await signIn(page);
  await page.goto("admin/?tab=community");
  await page.locator("#adOpen").click();
  await expect(page.locator("h2.group")).toHaveCount(4);
});

test("Admins screen with Cats off: a volunteer still holding the role is listed and removable", async ({ page }) => {
  const VOL = { user_id: "u-5", name: "Mona", village: "ain-al-maha", type: "villa", building: null, number: "5",
                granted_at: "2026-11-18T10:00:00Z", last_used_at: "2026-11-18T10:00:00Z", via: ["invite"], idle: false };
  const rpc = adminsBackend(CONFIG);
  const list = rpc.jc_module_admins_list;
  rpc.jc_module_admins_list = (a, c) => (a.p_scope === "cats_vol" ? ok({ scope: "cats_vol", admins: [VOL], links: [] }) : list(a, c));
  await stubBackend(page, { rpc });
  await signIn(page);
  await page.goto("admin/?tab=community");
  await page.locator("#adOpen").click();
  await expect(page.locator("h2.group")).toHaveText(["Community admins", "Event organizers", "Bookings admins", "Pets admins", "Cats volunteers"]);
  await expect(page.locator('[data-adrm="cats_vol"][data-user="u-5"]')).toBeVisible();
});

test("accepting a Cats volunteer invite names the role and points to the Cats page", async ({ page }) => {
  await stubBackend(page, { rpc: adminsBackend(CATS_ON, { [TOKEN]: "cats_vol" }) });
  await signIn(page);
  await page.goto("admin/#admininvite=" + TOKEN);
  await page.locator("#invYes").click();
  await expect(page.locator("#msg")).toHaveText("Done. You've joined the Cats volunteers.");
  await expect(page.locator("#invGo")).toHaveText("Open Cats");
  await expect(page.locator("#invGo")).toHaveAttribute("href", "../cats/");
});

// ---------- CC-2: areas + feeding stations ----------
test("a resident sees public stations only: no Station ID, notes, people or editors; never asks for the programme", async ({ page }) => {
  const { calls } = await stubBackend(page, { rpc: member([]) });
  await signIn(page);
  await page.goto("cats/");
  const card = page.locator(`.caStation[data-station="${S1}"]`);
  await expect(card).toContainText("Behind the souk");
  await expect(page.locator("h2.group")).toHaveText(["Souk"]);
  await expect(card).not.toContainText("S-001");
  await expect(card.getByRole("link", { name: "Directions" })).toHaveAttribute("rel", "noopener noreferrer");
  await expect(page.locator("[data-edit], #caAdd, [data-private], .caPeople, .caNotes")).toHaveCount(0);
  expect(calls.some((c) => c.name === "jc_cat_programme")).toBe(false);
});

test("a volunteer sees every station (private ones too) with who feeds there, but no editors", async ({ page }) => {
  await stubBackend(page, { rpc: member(["cats_vol"]) });
  await signIn(page);
  await page.goto("cats/");
  await page.locator("#caTab_stations").click();                         // CC-3: Cats is the first tab
  const s2 = page.locator(`.caStation[data-station="${S2}"]`);
  await expect(s2).toContainText("S-002 · Next door");
  await expect(s2.locator("[data-private]")).toHaveText("Private location");
  await expect(s2.locator('[data-role="lead"]')).toHaveText("Lead: Vera");
  await expect(s2.locator('[data-role="backup"]')).toHaveText("Backups: Cora");
  await expect(s2.locator(".caNotes")).toHaveText("Ring twice");
  await expect(page.locator("[data-edit], #caAdd, #caTab_areas")).toHaveCount(0);
});

test("a coordinator adds a station: area, pin, private choice all required; the server gets exactly the form", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 24.5333, longitude: 54.4333 });
  const rpc = member(["cats"]);
  let sent = null;
  rpc.jc_cat_station_save = (a) => { sent = a; return ok(progFor(true)); };
  await stubBackend(page, { rpc });
  await signIn(page);
  await page.goto("cats/");
  await page.locator("#caTab_stations").click();                         // CC-3: Cats is the first tab
  await page.locator("#caAdd").click();
  await expect(page.locator("h1")).toHaveText("New feeding station");
  await page.locator("#caSave").click();
  await expect(page.locator("#msg")).toHaveText("Choose an area.");
  await page.locator("#caArea").selectOption(A_SEEF);
  await page.locator("#caSave").click();
  await expect(page.locator("#msg")).toHaveText("Add the station's location pin.");
  await page.locator("#caWAdd").click();
  await expect(page.locator("#caWOk")).toBeEnabled();
  await page.locator("#caWOk").click();
  await expect(page.locator("#caWPos")).toContainText("Location pin set.");
  await expect(page.locator("#caWClear")).toHaveCount(0);                 // required: a set pin can only be moved
  await page.locator("#caSave").click();
  await expect(page.locator("#msg")).toHaveText("Choose who can see this station.");
  await page.locator("#caLandmark").fill("Upper terraces");
  await page.locator("#caNotes").fill("Gate code from the lead");
  await page.locator('input[name="caVis"][value="private"]').check();
  await page.locator(`[data-person="${VERA}"]`).selectOption("lead");
  await page.locator("#caSave").click();
  await expect(page.locator("#msg")).toHaveText("Saved.");
  expect(sent.p_station).toBeNull();
  expect(sent.p_fields).toMatchObject({ area_id: A_SEEF, landmark: "Upper terraces", access_notes: "Gate code from the lead",
                                        private: true, people: [{ user_id: VERA, role: "lead" }] });
  expect(Math.abs(sent.p_fields.lat - 24.5333)).toBeLessThan(0.001);
  expect(Math.abs(sent.p_fields.lng - 54.4333)).toBeLessThan(0.001);
});

test("a coordinator edits a station: its people pre-chosen, earlier locations listed, two leads refused", async ({ page }) => {
  const rpc = member(["cats"]);
  const sent = [];
  rpc.jc_cat_station_save = (a) => { sent.push(a); return ok(progFor(true)); };
  await stubBackend(page, { rpc });
  await signIn(page);
  await page.goto("cats/");
  await page.locator("#caTab_stations").click();                         // CC-3: Cats is the first tab
  await page.locator(`[data-edit="${S2}"]`).click();
  await expect(page.locator("h1")).toHaveText("Edit S-002");
  await expect(page.locator(`[data-person="${VERA}"]`)).toHaveValue("lead");
  await expect(page.locator('input[name="caVis"][value="private"]')).toBeChecked();
  await expect(page.locator("#caMoves li")).toHaveCount(1);
  await expect(page.locator("#caMoves li")).toContainText("A villa");
  await page.locator(`[data-person="${CORA}"]`).selectOption("lead");
  await page.locator("#caSave").click();
  await expect(page.locator("#msg")).toHaveText("A station has one lead.");
  expect(sent).toHaveLength(0);
  await page.locator(`[data-person="${CORA}"]`).selectOption("feeder");
  await page.locator("#caSave").click();
  await expect(page.locator("#msg")).toHaveText("Saved.");
  expect(sent[0]).toMatchObject({ p_station: S2, p_fields: { area_id: A_SEEF, lat: 24.5401, lng: 54.4401, private: true,
    people: [{ user_id: VERA, role: "lead" }, { user_id: CORA, role: "feeder" }] } });
});

test("a coordinator's Areas tab: add, rename, archive; the server's refusal is said in words", async ({ page }) => {
  const rpc = member(["cats"]);
  const sent = [];
  rpc.jc_cat_area_save = (a) => { sent.push(a); return a.p_archived ? raise("AREA_IN_USE") : ok(progFor(true)); };
  await stubBackend(page, { rpc });
  await signIn(page);
  await page.goto("cats/");
  await page.locator("#caTab_areas").click();
  await expect(page.locator(".caArea")).toHaveCount(2);
  await page.locator("#caAreaNew").fill("  Maha ");
  await page.locator("#caAreaAdd").click();
  await expect(page.locator("#msg")).toHaveText("Saved.");
  // the name is plain text until Rename is tapped (Zee 2026-11-18); Cancel puts it back untouched
  await expect(page.locator("[data-aname]")).toHaveCount(0);
  await page.locator(`[data-arename="${A_SOUK}"]`).click();
  await expect(page.locator(`[data-aname="${A_SOUK}"]`)).toBeFocused();
  await expect(page.locator(`[data-aarch="${A_SOUK}"]`)).toHaveCount(0);
  await page.locator(`[data-aname="${A_SOUK}"]`).fill("Typo");
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/cats-area-rename.png", fullPage: true });
  await page.locator(`[data-acancel="${A_SOUK}"]`).click();
  await expect(page.locator("[data-aname]")).toHaveCount(0);
  await expect(page.locator(`[data-arename="${A_SOUK}"]`)).toBeFocused();
  await page.locator(`[data-arename="${A_SOUK}"]`).click();
  await page.locator(`[data-aname="${A_SOUK}"]`).fill("Old Souk");
  await page.locator(`[data-asave="${A_SOUK}"]`).click();
  await expect(page.locator("[data-aname]")).toHaveCount(0);
  await expect(page.locator(`[data-arename="${A_SOUK}"]`)).toBeFocused();
  await page.locator(`[data-aarch="${A_SEEF}"]`).click();
  await expect(page.locator("#msg")).toHaveText("This area still has stations. Move or archive them first.");
  expect(sent).toEqual([{ p_area: null, p_name: "Maha", p_archived: null }, { p_area: A_SOUK, p_name: "Old Souk", p_archived: null },
                        { p_area: A_SEEF, p_name: null, p_archived: true }]);
});

test("nothing touches: area cards, the help line, and Save / Cancel each have space between them", async ({ page }) => {
  await stubBackend(page, { rpc: member(["cats"]) });
  await signIn(page);
  await page.goto("cats/");
  await page.locator("#caTab_areas").click();
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/cats-areas.png", fullPage: true });
  const gap = async (a, b) => { const x = await a.boundingBox(), y = await b.boundingBox(); return y.y - (x.y + x.height); };
  const panel = page.locator('[role="tabpanel"]');
  expect(await gap(panel.locator("> p.help").first(), page.locator(".caArea").first())).toBeGreaterThanOrEqual(8);
  expect(await gap(page.locator(".caArea").nth(0), page.locator(".caArea").nth(1))).toBeGreaterThanOrEqual(8);
  const btns = page.locator(".caArea").first().locator("button");
  const r = await btns.nth(0).boundingBox(), r2 = await btns.nth(1).boundingBox();
  expect(r2.x - (r.x + r.width)).toBeGreaterThanOrEqual(6);
  await page.locator("#caTab_stations").click();
  await page.locator(`[data-edit="${S1}"]`).click();
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/cats-station-editor.png", fullPage: true });
  const s = await page.locator("#caSave").boundingBox(), c = await page.locator("#caCancel").boundingBox();
  expect(Math.abs(c.x - (s.x + s.width))).toBeGreaterThanOrEqual(6);
});

test("leaving the station editor while Find Me is still looking: no error on the next screen; Move pin keeps focus", async ({ page }) => {
  await stubBackend(page, { rpc: member(["cats"]) });
  await signIn(page);
  await page.goto("cats/");
  await page.locator("#caTab_stations").click();                         // CC-3: Cats is the first tab
  await page.locator(`[data-edit="${S1}"]`).click();
  await page.locator("#caWMove").click();
  await expect(page.locator("#caWHelp")).toBeFocused();                          // review L2
  await page.locator("#caWCancel").click();
  await page.evaluate(() => { navigator.geolocation.getCurrentPosition = (ok, bad) => { window.lateFail = () => bad({ code: 1 }); }; });
  await page.locator("#caWMove").click();
  await page.locator("#locateBtn").click();
  await page.locator("#caCancel").click();
  await expect(page.locator(".caStation").first()).toBeVisible();
  await page.evaluate(() => window.lateFail());
  await expect(page.locator("#msg")).toHaveText("");                             // review M1
});

// ---------- CC-3: the cat register ----------
async function smallJpeg(page) {
  const b64 = await page.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 400; c.height = 300;
    const g = c.getContext("2d"); g.fillStyle = "#c58b4b"; g.fillRect(0, 0, 400, 300); g.fillStyle = "#fff"; g.fillRect(50, 50, 120, 90);
    return c.toDataURL("image/jpeg", 0.9).split(",")[1];
  });
  return { name: "cat.jpg", mimeType: "image/jpeg", buffer: Buffer.from(b64, "base64") };
}

test("a resident sees the cats (resident view only), searches, opens a cat; never asks for the register", async ({ page }) => {
  const rpc = member([]);
  // a server slip must not reach the screen: programme-only keys and a merged record in the resident list are ignored
  rpc.jc_cats_public = () => ok({ cats: [Object.assign({}, PUB.cats[0], { old_id: "JB-07", status_source: "Lead feeder", status_log: [{ status: "clinic", on: "2026-11-10" }] }),
                                         PUB.cats[1]] });
  const { calls } = await stubBackend(page, { rpc });
  await signIn(page);
  await page.goto("cats/");
  await expect(page.locator(".caCat")).toHaveCount(2);
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/cats-resident-list.png", fullPage: true });
  await expect(page.locator(`.caCat[data-cat="${K2}"]`)).toContainText("C-002");             // no name: the Cat ID
  await expect(page.locator(`.caCat[data-cat="${K2}"]`)).toContainText("Missing");
  await expect(page.locator(`.caCat[data-cat="${K2}"] [data-prov]`)).toHaveText("Provisional ID");
  await page.locator("#caQ").fill("socks");
  await expect(page.locator(".caCat")).toHaveCount(1);
  await page.locator("#caQ").fill("nothing like it");
  await expect(page.locator("#caCatsNone")).toHaveText("No cat matches that search.");
  await page.locator("#caQ").fill("");
  await page.locator(`.caCat[data-cat="${K1}"]`).click();
  await expect(page.locator("h1")).toHaveText("Caramel");
  await expect(page.locator(".caStory")).toHaveText("Very gentle, loves cuddles.");
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/cats-resident-cat.png", fullPage: true });
  await expect(page.locator(".caFacts")).toContainText("Ear-tipped");
  await expect(page.locator(".caFacts")).toContainText("Sterilised");
  await expect(page.locator(".caPhotos [data-view]")).toHaveCount(2);
  await expect(page.locator("#caEditCat, #caHist, #caAlso")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText("JB-07");
  await expect(page.locator("body")).not.toContainText("Lead feeder");
  expect(calls.some((c) => c.name === "jc_cat_register" || c.name === "jc_cat_programme")).toBe(false);
  await page.locator("#jcBackBtn").click();
  await expect(page.locator(".caCat")).toHaveCount(2);
});

test("a volunteer reads the full record (old ID, station, TNVR, history) but gets no editor and no merged records", async ({ page }) => {
  await stubBackend(page, { rpc: member(["cats_vol"]) });
  await signIn(page);
  await page.goto("cats/");
  await expect(page.locator("#caTab_cats")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#caAddCat, [data-unmerge]")).toHaveCount(0);
  await page.locator("#caQ").fill("JB-07");                                                    // old ID is searchable
  await expect(page.locator(".caCat")).toHaveCount(1);
  await page.locator(`.caCat[data-cat="${K1}"]`).click();
  await expect(page.locator(".caFacts")).toContainText("JB-07");
  await expect(page.locator(".caFacts")).toContainText("S-001 · Behind the souk");
  await expect(page.locator(".caFacts")).toContainText("Returned");
  await expect(page.locator(".caFacts")).toContainText("Clinic card");
  await expect(page.locator("#caHist li")).toHaveCount(2);
  await expect(page.locator("#caHist li").nth(1)).toContainText("C-003");
  await expect(page.locator("#caAlso")).toContainText("C-003");
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/cats-volunteer-cat.png", fullPage: true });
  await expect(page.locator("#caEditCat")).toHaveCount(0);
});

test("a coordinator adds a cat: name or coat required, the server gets the form, then photos can be added", async ({ page }) => {
  const rpc = member(["cats"]);
  let sent = null;
  const K4 = "dddddddd-0000-4000-8000-000000000004";
  rpc.jc_cat_save = (a) => {
    sent = a;
    const r = regFor(true);
    r.cats.push(Object.assign({}, r.cats[1], { id: K4, code: "C-004", name: "Gwen", photos: [], own_photos: [] }));
    return ok(r);
  };
  rpc.jc_cat_photo_begin = (a) => ok({ bucket: "pet-photos", path: "e2e/c/" + a.p_cat + "/new.jpg", expires_in_seconds: 900 });
  rpc.jc_cat_photo_commit = () => ok(regFor(true));
  const { calls } = await stubBackend(page, { rpc });
  await signIn(page);
  await page.goto("cats/");
  await page.locator("#caAddCat").click();
  await expect(page.locator("h1")).toHaveText("New cat");
  await expect(page.locator("#caCatPriv")).toContainText("seen by the programme only");
  await expect(page.locator("#caPhotoHelp")).toHaveText("Save the cat first, then add its photos.");
  await page.locator("#caCatSave").click();
  await expect(page.locator("#msg")).toHaveText("Give the cat a name or describe its coat.");
  expect(sent).toBeNull();
  await page.locator("#caCName").fill(" Gwen ");
  await page.locator("#caCOld").fill("JB-12");
  await page.locator("#caCArea").selectOption(A_SOUK);
  await page.locator("#caCStation").selectOption(S1);
  await page.locator("#caCEar").selectOption("present");
  await page.locator("#caCSide").selectOption("right");
  await page.locator("#caCStatus").selectOption("foster");
  await page.locator("#caCStOn").fill("2026-11-12");
  await page.locator("#caCatSave").click();
  await expect(page.locator("#msg")).toHaveText("Saved. You can add photos now.");
  expect(sent.p_cat).toBeNull();
  expect(sent.p_fields).toMatchObject({ name: "Gwen", old_id: "JB-12", coat: null, area_id: A_SOUK, station_id: S1, ear_tip: "present",
    ear_side: "right", status: "foster", status_on: "2026-11-12", confirmed: false, tnvr: "none" });
  await expect(page.locator("h1")).toHaveText("Edit C-004");
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/cats-coordinator-editor.png", fullPage: true });
  await page.locator("#caPhotoIn").setInputFiles(await smallJpeg(page));
  await expect(page.locator("#msg")).toHaveText("Photo added.");
  const order = calls.filter((c) => /^jc_cat_photo_/.test(c.name) || c.name === "upload").map((c) => c.name);
  expect(order).toEqual(["jc_cat_photo_begin", "upload", "jc_cat_photo_commit"]);
  expect(calls.filter((c) => c.name === "jc_cat_photo_commit").pop().args).toEqual({ p_cat: K4, p_path: "e2e/c/" + K4 + "/new.jpg" });
});

test("a coordinator edits, removes a photo, merges a duplicate and undoes a merge", async ({ page }) => {
  const rpc = member(["cats"]);
  const sent = [];
  for (const n of ["jc_cat_save", "jc_cat_photo_remove", "jc_cat_merge", "jc_cat_unmerge"]) rpc[n] = (a) => { sent.push([n, a]); return ok(regFor(true)); };
  await stubBackend(page, { rpc });
  let dialogs = 0, answer = false;
  page.on("dialog", (d) => { dialogs++; return answer ? d.accept() : d.dismiss(); });
  await signIn(page);
  await page.goto("cats/");
  await expect(page.locator(`[data-merged="${K3}"]`)).toContainText("Merged into C-001");
  await page.locator(`[data-unmerge="${K3}"]`).click();                                         // dismissed: nothing sent
  await expect.poll(() => dialogs).toBe(1);
  expect(sent).toHaveLength(0);
  answer = true;
  await page.locator(`[data-unmerge="${K3}"]`).click();
  await expect(page.locator("#msg")).toHaveText("Merge undone.");
  await page.locator(`.caCat[data-cat="${K2}"]`).click();
  await page.locator("#caEditCat").click();
  await expect(page.locator("h1")).toHaveText("Edit C-002");
  await expect(page.locator("#caCSide")).toHaveCount(0);                                        // no ear tip, no side
  await page.locator("#caCConf").check();
  await page.locator("#caCatSave").click();
  await expect(page.locator("#msg")).toHaveText("Saved.");
  await expect(page.locator("h1")).toHaveText("C-002");                                          // back on the cat's page
  await page.locator(`#jcBackBtn`).click();
  await page.locator(`.caCat[data-cat="${K1}"]`).click();
  await page.locator("#caEditCat").click();
  await expect(page.locator("[data-phrm]")).toHaveCount(2);
  await page.locator(`[data-phrm="${PH2}"]`).click();
  await expect(page.locator("#msg")).toHaveText("Photo removed.");
  await page.locator("#caMergeBtn").click();
  await expect(page.locator("#msg")).toHaveText("Choose the cat to merge into.");
  await page.locator("#caMergeTo").selectOption(K2);
  await page.locator("#caMergeBtn").click();
  await expect(page.locator("#msg")).toHaveText("Merged.");
  await expect(page.locator("h1")).toHaveText("C-002");                                          // lands on the surviving cat
  expect(dialogs).toBe(4);                                                                       // unmerge ×2, remove, merge
  expect(sent.map((x) => x[0])).toEqual(["jc_cat_unmerge", "jc_cat_save", "jc_cat_photo_remove", "jc_cat_merge"]);
  expect(sent[0][1]).toEqual({ p_cat: K3 });
  expect(sent[1][1]).toMatchObject({ p_cat: K2, p_fields: { confirmed: true, name: null, coat: "Black, white socks", area_id: A_SEEF } });
  expect(sent[2][1]).toEqual({ p_path: PH2 });
  expect(sent[3][1]).toEqual({ p_from: K1, p_into: K2 });
});

test("a server refusal on a cat is said in words (Arabic too)", async ({ page }) => {
  await page.addInitScript(() => { try { localStorage.setItem("jc_lang", "ar"); } catch (e) {} });
  const rpc = member(["cats"]);
  rpc.jc_cat_save = () => raise("BAD_STATION");
  await stubBackend(page, { rpc });
  await signIn(page);
  await page.goto("cats/");
  await page.locator(`.caCat[data-cat="${K1}"]`).click();
  await page.locator("#caEditCat").click();
  await page.locator("#caCatSave").click();
  await expect(page.locator("#msg")).toHaveText("اختر نقطة في المنطقة المعتادة للقطة (أو بدون نقطة).");
});

test("a photo the phone can't read is said in words; Stations / Areas writes refresh the cats", async ({ page }) => {
  const rpc = member(["cats"]);
  let regCalls = 0;
  const reg = rpc.jc_cat_register;
  rpc.jc_cat_register = (a, c) => { regCalls++; return reg(a, c); };
  rpc.jc_cat_area_save = () => ok(progFor(true));
  await stubBackend(page, { rpc });
  await signIn(page);
  await page.goto("cats/");
  await page.locator(`.caCat[data-cat="${K1}"]`).click();
  await page.locator("#caEditCat").click();
  await page.locator("#caPhotoIn").setInputFiles({ name: "x.jpg", mimeType: "image/jpeg", buffer: Buffer.from("not a photo") });
  await expect(page.locator("#msg")).toHaveText("That photo couldn't be read. Try another one.");
  await page.locator("#caCatCancel").click();
  await page.locator("#jcBackBtn").click();
  await page.locator("#caTab_areas").click();
  const before = regCalls;
  await page.locator("#caAreaNew").fill("Maha");
  await page.locator("#caAreaAdd").click();
  await expect(page.locator("#msg")).toHaveText("Saved.");
  await expect.poll(() => regCalls).toBe(before + 1);
});
