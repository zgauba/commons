// OT-1 — Organizer Tools → Events: All · Now · Upcoming · Past chips with counts, a title search, the chip kept in the
// address, and an event followed to its new chip after a save or a step (Zee 2026-11-14).
const { test, expect } = require("@playwright/test");
const { stubBackend } = require("./stub");
const { adminBackend, signIn } = require("./backends");

// dates far ahead / behind so the groups never drift with the real clock
const EXTRA = [
  { id: "77777777-7777-4777-8777-777777777771", slug: "summer-fair", title_en: "Summer Fair", title_ar: "مهرجان الصيف",
    starts_at: "2099-06-01T12:00:00Z", status: "live", signups_open: true, payload_schema: { fields: {} }, entries: 0 },
  { id: "77777777-7777-4777-8777-777777777772", slug: "cafe-night", title_en: "Café Night", title_ar: null,
    starts_at: "2099-01-10T12:00:00Z", status: "live", coming_soon: true, signups_open: false, payload_schema: { fields: {} }, entries: 0 },
  { id: "77777777-7777-4777-8777-777777777773", slug: "eid-2025", title_en: "Eid 2025", title_ar: null,
    starts_at: "2025-03-30T12:00:00Z", status: "archived", signups_open: false, payload_schema: { fields: {} }, entries: 40 },
];
const slugs = (page) => page.locator(".aevents li").evaluateAll((li) => li.map((x) => x.dataset.event));
const chips = (page) => page.locator("#evChips button");

async function open(page, q = "", opts = {}) {
  const ab = adminBackend(Object.assign({ scopes: ["events"], extraEvents: EXTRA }, opts));
  const stub = await stubBackend(page, { rpc: ab.rpc });
  await signIn(page);
  await page.goto("admin/" + q);
  await expect(page.locator("#evChips")).toBeVisible();
  return stub;
}

test("chips: All · Now · Upcoming · Past with counts; opens on Now; each chip lists its own, in date order", async ({ page }) => {
  await open(page);
  await expect(chips(page)).toHaveText(["All 6", "Now 1", "Upcoming 3", "Past 2"]);
  await expect(page.locator("#evShow-now")).toHaveAttribute("aria-pressed", "true");
  expect(await slugs(page)).toEqual(["test-event"]);

  await page.locator("#evShow-upcoming").click();
  await expect(page.locator("#evShow-upcoming")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#evShow-upcoming")).toBeFocused();
  expect(await slugs(page)).toEqual(["national-day-2026", "cafe-night", "summer-fair"]);   // draft, coming soon, later date: soonest first
  await expect(page).toHaveURL(/[?&]show=upcoming/);

  await page.locator("#evShow-past").click();
  expect(await slugs(page)).toEqual(["halloween-2026", "eid-2025"]);                     // newest first

  await page.locator("#evShow-all").click();
  expect(await slugs(page)).toEqual(["test-event", "national-day-2026", "cafe-night", "summer-fair", "halloween-2026", "eid-2025"]);
});

test("the chip is kept in the address: a reload comes back to it", async ({ page }) => {
  await open(page, "?tab=events&show=past");
  await expect(page.locator("#evShow-past")).toHaveAttribute("aria-pressed", "true");
  expect(await slugs(page)).toEqual(["halloween-2026", "eid-2025"]);
  await page.locator("#evShow-all").click();
  await page.reload();
  await expect(page.locator("#evShow-all")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".aevents li")).toHaveCount(6);
});

test("an unknown ?show= falls back to the default", async ({ page }) => {
  await open(page, "?show=bogus");
  await expect(page.locator("#evShow-now")).toHaveAttribute("aria-pressed", "true");
});

test("nothing on now: it opens on Upcoming; an empty chip says so in words", async ({ page }) => {
  await open(page, "", { extraEvents: [], liveStartsAt: "2099-01-01T00:00:00Z" });
  await expect(chips(page)).toHaveText(["All 3", "Now 0", "Upcoming 2", "Past 1"]);
  await expect(page.locator("#evShow-upcoming")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#evShow-now").click();
  await expect(page.locator("#evNone")).toHaveText("Nothing is on right now.");
});

test("search: narrows every chip's count, matches Arabic titles and ignores accents; no match says so", async ({ page }) => {
  await open(page, "?show=all");
  const box = page.locator("#evSearch");
  await box.fill("cafe");                                           // finds "Café Night"
  await expect(chips(page)).toHaveText(["All 1", "Now 0", "Upcoming 1", "Past 0"]);
  expect(await slugs(page)).toEqual(["cafe-night"]);
  await expect(box).toBeFocused();                                  // typing never loses the box
  await box.fill("الصيف");
  expect(await slugs(page)).toEqual(["summer-fair"]);
  await box.fill("zzz");
  await expect(page.locator("#evNone")).toHaveText("No events here match “zzz”.");
  await expect(chips(page)).toHaveText(["All 0", "Now 0", "Upcoming 0", "Past 0"]);
  await box.fill("");
  await expect(page.locator(".aevents li")).toHaveCount(6);
});

test("a hostile title stays text in the list and the search message", async ({ page }) => {
  await open(page, "?show=all", { extraEvents: [Object.assign({}, EXTRA[0], { title_en: "<img src=x onerror=window.__x=1>" })] });
  await expect(page.locator('li[data-event="summer-fair"]')).toContainText("<img src=x onerror=window.__x=1>");
  await page.locator("#evSearch").fill("<b>");
  await expect(page.locator("#evNone")).toHaveText("No events here match “<b>”.");
  expect(await page.evaluate(() => window.__x)).toBeUndefined();
});

test("a new draft, a publish and a close each follow the event to its chip", async ({ page }) => {
  await open(page);                                                 // on Now
  // close the live one → Past
  await page.locator('li[data-event="test-event"] [data-act="close"]').click();
  await page.locator("#closeSlug").fill("test-event");
  await page.locator("#closeGo").click();
  await expect(page.locator("#msg")).toHaveText("Closed. 3 homes took part.");
  await expect(page.locator("#evShow-past")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('li[data-event="test-event"]')).toBeVisible();
  await expect(page).toHaveURL(/[?&]show=past/);
  // a new blank draft → Upcoming
  await page.locator("#newEv").click();
  await page.locator("[data-tpl=blank]").click();
  await page.locator("#title_en").fill("Book Swap");
  await page.locator("#save").click();
  await expect(page.locator("#msg")).toContainText("Saved as a draft");
  await expect(page.locator("#evShow-upcoming")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('li[data-event="book-swap"]')).toBeVisible();
});

test("on All, a step stays on All", async ({ page }) => {
  await open(page, "?show=all");
  page.once("dialog", (d) => d.accept());
  await page.locator('li[data-event="national-day-2026"] [data-act="publish"]').click();
  await expect(page.locator("#msg")).toHaveText("Published — residents can see it now.");
  await expect(page.locator("#evShow-all")).toHaveAttribute("aria-pressed", "true");
});

test("Arabic: the chips and search read in Arabic", async ({ page }) => {
  await open(page);
  await page.locator("#langBtn").click();
  await expect(chips(page)).toHaveText(["الكل 6", "الآن 1", "القادمة 3", "السابقة 2"]);
  await expect(page.locator("#evSearch")).toHaveAttribute("placeholder", "ابحث في الفعاليات");
});
