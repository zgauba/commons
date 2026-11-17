// DL-1 — desktop layout (docs/plans/DL-desktop-layout.md). At ≥ 900 px: resident pages a 600 px column, Organizer
// Tools (<body class="wide">) up to 1200 px with forms kept at 600 px and card lists (.jcgrid) in columns; timelines
// stay one column; no sideways scroll in EN or AR. Below 900 px nothing changes (480 px, as before).
const { test, expect } = require("@playwright/test");
const { stubBackend, ok, CONFIG } = require("./stub");
const { eventsBackend, adminBackend, signIn } = require("./backends");

const MODULES = { events: { enabled: true }, bookings: { enabled: false }, pets: { enabled: true } };
const PET = (id, name, village, n) => ({ id, kind: "owned", species: "cat", name, description: null, wanderer: false,
  microchipped: false, missing: false, missing_since: null, last_seen_note: null, care_state: null, photo_path: null,
  mine: false, home: { village, type: "villa", building: null, number: n }, territory: null, territory_lat: null,
  territory_lng: null, care: null, last_seen: null, last_seen_at: null, status: "active",
  created_at: "2026-11-10T09:00:00Z", updated_at: "2026-11-10T09:00:00Z", sightings_7d: 0 });
const PETS = ["Rex", "Luna", "Mochi", "Bella"].map((nm, i) =>
  PET("44444444-dddd-4ddd-8ddd-00000000000" + i, nm, "seef-al-jubail", String(10 + i)));

async function setup(page, { admin = false, lang = "en" } = {}) {
  const rpc = Object.assign({}, eventsBackend().rpc, adminBackend({ scopes: admin ? ["community", "events"] : [] }).rpc, {
    jc_config_get: () => ok(Object.assign({}, CONFIG, { modules: MODULES })),
    jc_admin_pets_list: () => ok(PETS),
    jc_pets_group_get: () => ok({ link: null }),
  });
  if (!admin) delete rpc.jc_me_get;                     // stub.js's plain member
  await stubBackend(page, { rpc });
  await page.addInitScript((l) => { try { localStorage.setItem("jc_lang", l); } catch (e) {} }, lang);
  await signIn(page);
}
const mainWidth = (page) => page.locator("main").evaluate((m) => m.getBoundingClientRect().width);
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
// real layout, not the CSS text: how many different left edges the cards sit at
const columns = (loc) => loc.evaluate((n) => new Set([...n.children].map((c) => Math.round(c.getBoundingClientRect().left))).size);

test.describe("desktop (1280 × 800)", () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });

  for (const lang of ["en", "ar"]) {
    test(`resident page is a 600 px column, no sideways scroll (${lang})`, async ({ page }) => {
      await setup(page, { lang });
      await page.goto("home/");
      await expect(page.locator('[role="tabpanel"]')).toBeVisible();
      expect(await mainWidth(page)).toBe(600);
      expect(await noSideScroll(page)).toBe(true);
    });

    test(`Organizer Tools is wide: events list in columns, no sideways scroll (${lang})`, async ({ page }) => {
      await setup(page, { admin: true, lang });
      await page.goto("admin/?tab=events&show=all");      // all 3 events: enough cards for columns
      const list = page.locator("ul.aevents");
      await expect(list).toBeVisible();
      expect(await mainWidth(page)).toBe(1200);
      expect(await columns(list)).toBeGreaterThanOrEqual(2);
      expect(await noSideScroll(page)).toBe(true);
    });
  }

  test("Organizer Tools: pets list in columns; a form stays 600 px wide", async ({ page }) => {
    await setup(page, { admin: true });
    await page.goto("admin/?tab=pets");
    const list = page.locator("ul.sulist.jcgrid").first();
    await expect(list).toBeVisible();
    expect(await columns(list)).toBeGreaterThanOrEqual(2);
    await page.goto("admin/?tab=banner");
    const form = page.locator("#bannerText").locator("xpath=ancestor::*[contains(@class,'panel') or self::form][1]");
    await expect(form).toBeVisible();
    expect(await form.evaluate((n) => n.getBoundingClientRect().width)).toBeLessThanOrEqual(600);
  });

  test("a timeline list (no .jcgrid) stays one column", async ({ page }) => {
    await setup(page, { admin: true });
    await page.goto("admin/?tab=events");
    await expect(page.locator("ul.aevents")).toBeVisible();
    const shape = await page.evaluate(() => {
      const ul = document.createElement("ul"); ul.className = "sulist";
      ul.innerHTML = "<li>a</li><li>b</li>"; document.querySelector("main").appendChild(ul);
      const s = getComputedStyle(ul); return s.display + " " + s.flexDirection;
    });
    expect(shape).toBe("flex column");
  });
});

test.describe("phone (390 px): unchanged", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("Organizer Tools and resident pages stay 480 px or narrower, lists one column", async ({ page }) => {
    await setup(page, { admin: true });
    await page.goto("admin/?tab=events");
    const list = page.locator("ul.aevents");
    await expect(list).toBeVisible();
    expect(await list.evaluate((n) => getComputedStyle(n).display)).toBe("flex");
    expect(await mainWidth(page)).toBeLessThanOrEqual(480);
  });
});
