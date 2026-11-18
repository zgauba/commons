// CC-1 — Cats foundation: the Cats page behind its module flag, the two Cats roles (coordinator 'cats', volunteer
// 'cats_vol') never showing Organizer Tools, the Admins screen inviting both while Cats is on, and an accepted Cats
// invite pointing at the Cats page. Plan: docs/plans/CC-community-cats.md (CC-1).
const { test, expect } = require("@playwright/test");
const { stubBackend, ok, raise, CONFIG, MEMBER } = require("./stub");
const { adminBackend, signIn } = require("./backends");

const CATS_ON = Object.assign({}, CONFIG, { modules: Object.assign({}, CONFIG.modules, { cats: { enabled: true } }) });
const TOKEN = "INVITEtoken_abcdefghij12";

// a member holding these admin scopes; Cats on unless cfg says otherwise
function member(scopes, cfg) {
  return {
    jc_config_get: () => ok(cfg || CATS_ON),
    jc_me_get: (a, c) => (c.signedIn ? ok(Object.assign({}, MEMBER, { admin_scopes: scopes })) : raise("NOT_SIGNED_IN")),
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

test("Admins screen with Cats off: no Cats levels, none asked for", async ({ page }) => {
  const { calls } = await stubBackend(page, { rpc: adminsBackend(CONFIG) });
  await signIn(page);
  await page.goto("admin/?tab=community");
  await page.locator("#adOpen").click();
  await expect(page.locator("h2.group")).toHaveCount(4);
  expect(calls.filter((c) => c.name === "jc_module_admins_list").map((c) => c.args.p_scope)).not.toContain("cats");
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
