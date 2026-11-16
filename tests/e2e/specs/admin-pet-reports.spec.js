// Stray reports, PR 2 (plan docs/plans/report-a-stray.md): Organizer Tools → Pets → Reported strays. The waiting count on
// the Pets tab, the cards (never the reporter's name or number as text), Add as a stray (editor filled from the report,
// then the report closed), Already known (pick a stray), Not a stray (asks first), another organizer closing it first,
// the queue unreadable (the animals still show), and the Closed tab.
const { test, expect } = require("@playwright/test");
const { stubBackend, ok, raise } = require("./stub");
const { adminBackend, signIn } = require("./backends");

const ID = (n) => "55555555-eeee-4eee-8eee-00000000000" + n;
const RID = (n) => "66666666-ffff-4fff-8fff-00000000000" + n;
const PET = (o) => Object.assign({ kind: "stray", species: "cat", description: null, wanderer: false, microchipped: false,
  missing: false, missing_since: null, last_seen_note: null, care_state: "under_care", photo_path: "p/x.jpg", mine: false, home: null,
  territory: null, territory_lat: null, territory_lng: null, care: {}, last_seen: null, last_seen_at: null,
  status: "active", created_at: "2026-11-10T09:00:00Z", updated_at: "2026-11-10T09:00:00Z", sightings_7d: 0 }, o);
const ANIMALS = () => [
  PET({ id: ID(1), name: "Ginger" }),
  PET({ id: ID(2), name: "Archie" }),
  PET({ id: ID(3), name: "Old Tom", status: "archived" }),
  PET({ id: ID(4), name: "Rex", kind: "owned", species: "dog", care_state: null, home: { village: "ain-al-maha", type: "villa", building: null, number: "3" } }),
];
const REPORT = (o) => Object.assign({ species: "cat", note: null, lat: null, lng: null, place: null, state: "open",
  created_at: "2026-11-16T07:00:00Z", closed_at: null, photo_path: null, pet: null, contact: null,
  reporter_home: { village: "ain-al-maha", type: "villa", building: null, number: "12" }, reporter_left: false }, o);
const REPORTS = () => [
  REPORT({ id: RID(1), note: "Thin ginger cat", place: "By the clubhouse", lat: 24.53, lng: 54.43, contact: "+971501234567",
           photo_path: "testville/r/" + RID(1) + "/a.jpg" }),
  REPORT({ id: RID(2), species: "dog", place: "Beach path", reporter_home: null, reporter_left: true }),
];

function backend(opts = {}) {
  const ab = adminBackend({ scopes: ["pets"] });
  const st = { list: ANIMALS(), reports: opts.reports || REPORTS(), closes: [], saves: [], closed: opts.closed || [] };
  Object.assign(ab.rpc, {
    jc_admin_pets_list: () => ok(st.list),
    jc_pets_group_get: () => ok({ link: null }),
    jc_admin_stray_reports_list: (a) => (opts.listRaises ? raise(opts.listRaises)
      : ok(a.p_show === "open" ? st.reports.filter((r) => r.state === "open") : st.closed)),
    jc_admin_stray_report_close: (a) => {
      st.closes.push(a);
      if (opts.closeRaises) return raise(opts.closeRaises);
      const r = st.reports.find((x) => x.id === a.p_id);
      if (!r) return raise("NOT_FOUND");
      Object.assign(r, { state: a.p_outcome, contact: null, closed_at: "2026-11-16T08:00:00Z" });
      return ok(r);
    },
    jc_admin_stray_save: (a) => {
      st.saves.push(a);
      const c = PET(Object.assign({ id: ID(8), name: "x" }, a.p_fields, { photo_path: null }));
      st.list.push(c);
      return ok(c);
    },
  });
  return { ab, st, rpc: ab.rpc };
}
async function openPets(page, b) {
  const s = await stubBackend(page, { rpc: b.rpc });
  await signIn(page);
  await page.goto("admin/?tab=pets");
  await expect(page.locator("#paChips")).toBeVisible();
  return s;
}
async function openReports(page, b) {
  const s = await openPets(page, b);
  await page.locator("#paRepOpen").click();
  await expect(page.locator("h1")).toHaveText("Reported strays");
  return s;
}
const card = (page, id) => page.locator(`[data-report="${id}"]`);

test("the Pets tab says how many reports are waiting; the cards show where, who (a home, never a name) and a WhatsApp link", async ({ page }) => {
  await openPets(page, backend());
  await expect(page.locator("#paRepOpen")).toContainText("2 waiting for you");
  await expect(page.locator("#paRepOpen")).toHaveClass(/hot/);
  await page.locator("#paRepOpen").click();
  await expect(page.locator("#prShow-open")).toHaveText("Waiting 2");
  await expect(page.locator("#prList [data-report]")).toHaveCount(2);
  const one = card(page, RID(1));
  await expect(one).toContainText("Cat");
  await expect(one).toContainText("Thin ginger cat");
  await expect(one).toContainText("Where: By the clubhouse");
  await expect(one).toContainText("From Villa 12 · Ain Al Maha");
  await expect(one.locator("[data-photo]")).toHaveAttribute("data-photo", "testville/r/" + RID(1) + "/a.jpg");
  await expect(one.locator("[data-prwa]")).toHaveAttribute("href", "https://wa.me/971501234567");
  await expect(page.locator("#view")).not.toContainText("971501234567");          // the number is a link, never text
  await expect(one.locator("a", { hasText: "Open in Google Maps" })).toHaveAttribute("href", /query=24\.53%2C54\.43/);
  const two = card(page, RID(2));
  await expect(two).toContainText("The resident who sent it has left");
  await expect(two.locator("[data-prwa]")).toHaveCount(0);
  await page.locator("#jcBackBtn").click();
  await expect(page.locator("#paChips")).toBeVisible();
});

test("no reports: the row says none waiting, not highlighted; the screen says so", async ({ page }) => {
  await openPets(page, backend({ reports: [] }));
  await expect(page.locator("#paRepOpen")).toContainText("None waiting");
  await expect(page.locator("#paRepOpen")).not.toHaveClass(/hot/);
  await page.locator("#paRepOpen").click();
  await expect(page.locator("#prNone")).toHaveText("No reports waiting.");
});

test("the queue unreadable: the animals still show; the row says so", async ({ page }) => {
  await openPets(page, backend({ listRaises: "UNKNOWN" }));
  await expect(page.locator("#paRepOpen")).toContainText("Couldn't load the reports");
  await expect(page.locator(`[data-pet="${ID(1)}"]`)).toBeVisible();
});

test("Not a stray: asks first; Cancel sends nothing; OK closes it and the card goes", async ({ page }) => {
  const b = backend();
  await openReports(page, b);
  page.once("dialog", (d) => d.dismiss());
  await card(page, RID(2)).locator("[data-prnot]").click();
  expect(b.st.closes).toEqual([]);
  page.once("dialog", (d) => { expect(d.message()).toContain("not a stray"); d.accept(); });
  await card(page, RID(2)).locator("[data-prnot]").click();
  await expect(page.locator("#msg")).toHaveText("Report closed.");
  expect(b.st.closes).toEqual([{ p_id: RID(2), p_outcome: "not_stray", p_pet: null }]);
  await expect(card(page, RID(2))).toHaveCount(0);
  await expect(page.locator("#prShow-open")).toHaveText("Waiting 1");
});

test("Already known: only active strays, A–Z; nothing chosen is refused before sending; linking closes it", async ({ page }) => {
  const b = backend();
  await openReports(page, b);
  await card(page, RID(1)).locator("[data-prknown]").click();
  await expect(page.locator("#prPick option")).toHaveText(["Choose a stray", "Archie", "Ginger"]);   // no archived, no owned
  await expect(page.locator("#prKnown")).toContainText("this report's photo becomes its photo");
  await page.locator("#prKnownGo").click();
  await expect(page.locator("#msg")).toHaveText("Choose the stray first.");
  expect(b.st.closes).toEqual([]);
  await page.locator("#prPick").selectOption(ID(2));
  await page.locator("#prKnownGo").click();
  await expect(page.locator("#msg")).toHaveText("Report linked to Archie and closed.");
  expect(b.st.closes).toEqual([{ p_id: RID(1), p_outcome: "known", p_pet: ID(2) }]);
});

test("Add as a stray: the editor is filled from the report; saving adds the stray, then closes the report", async ({ page }) => {
  const b = backend();
  await openReports(page, b);
  await card(page, RID(1)).locator("[data-pradd]").click();
  await expect(page.locator("#peFromRep")).toContainText("the report's photo becomes its photo");
  await expect(page.locator('[data-pesp="cat"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#peDesc")).toHaveValue("Thin ginger cat");
  await expect(page.locator("#peArea")).toHaveValue("By the clubhouse");
  await page.locator("#peName").fill("Biscuit");
  await page.locator("#peSave").click();
  await expect(page.locator("#msg")).toContainText("Biscuit");
  expect(b.st.saves[0].p_pet).toBeNull();
  expect(b.st.saves[0].p_fields).toMatchObject({ name: "Biscuit", species: "cat", description: "Thin ginger cat",
                                                  territory: "By the clubhouse", territory_lat: 24.53, territory_lng: 54.43 });
  expect(b.st.closes).toEqual([{ p_id: RID(1), p_outcome: "added", p_pet: ID(8) }]);
  await expect(page.locator("h1")).toHaveText("Reported strays");                    // back in the queue, read again
  await expect(page.locator("#prShow-open")).toHaveText("Waiting 1");
  await expect(page.locator("#msg")).toContainText("Biscuit");
});

test("Add as a stray when another organizer already handled it: added, and says so (not 'still open')", async ({ page }) => {
  const b = backend({ closeRaises: "ALREADY_CLOSED" });
  await openReports(page, b);
  await card(page, RID(2)).locator("[data-pradd]").click();
  await page.locator("#peName").fill("Sandy");
  await page.locator("#peSave").click();
  await expect(page.locator("#msg")).toHaveText("Sandy was added. Another organizer had already handled the report.");
});

test("Already known, closed by someone else meanwhile: read again, says why", async ({ page }) => {
  const b = backend({ closeRaises: "ALREADY_CLOSED" });
  await openReports(page, b);
  await card(page, RID(1)).locator("[data-prknown]").click();
  await page.locator("#prPick").selectOption(ID(1));
  await page.locator("#prKnownGo").click();
  await expect(page.locator("#msg")).toHaveText("Another organizer already closed this report.");
  await expect(page.locator("#prKnown")).toHaveCount(0);
});

test("a resident's text is shown as text, never markup", async ({ page }) => {
  const evil = '<img src=x onerror="window.__x=1">"><script>window.__x=2</script>';
  await openReports(page, backend({ reports: [REPORT({ id: RID(7), note: evil, place: evil })] }));
  await expect(card(page, RID(7))).toContainText('<img src=x onerror="window.__x=1">');
  await expect(card(page, RID(7)).locator("img, script")).toHaveCount(0);
  expect(await page.evaluate(() => window.__x)).toBeUndefined();
});

test("a number written 00971… still opens WhatsApp as +971", async ({ page }) => {
  await openReports(page, backend({ reports: [REPORT({ id: RID(8), place: "Gate", contact: "00971501234567" })] }));
  await expect(card(page, RID(8)).locator("[data-prwa]")).toHaveAttribute("href", "https://wa.me/971501234567");
});

test("Add as a stray, the close fails: the stray is kept and the page says the report is still open", async ({ page }) => {
  const b = backend({ closeRaises: "UNKNOWN" });
  await openReports(page, b);
  await card(page, RID(2)).locator("[data-pradd]").click();
  await expect(page.locator("#peFromRep")).toHaveText("From a resident's report. Saving adds the stray and closes the report.");
  await page.locator("#peName").fill("Sandy");
  await page.locator("#peSave").click();
  await expect(page.locator("#msg")).toHaveText("Sandy was added, but the report is still open. Close it from Reported strays.");
  expect(b.st.saves).toHaveLength(1);
});

test("Cancel in the editor goes back to the reports", async ({ page }) => {
  await openReports(page, backend());
  await card(page, RID(1)).locator("[data-pradd]").click();
  await page.locator("#peCancel").click();
  await expect(page.locator("h1")).toHaveText("Reported strays");
});

test("another organizer closed it first: the list is read again and says why", async ({ page }) => {
  const b = backend({ closeRaises: "ALREADY_CLOSED" });
  const { calls } = await openReports(page, b);
  page.once("dialog", (d) => d.accept());
  const before = calls.filter((c) => c.name === "jc_admin_stray_reports_list").length;
  await card(page, RID(2)).locator("[data-prnot]").click();
  await expect(page.locator("#msg")).toHaveText("Another organizer already closed this report.");
  await expect.poll(() => calls.filter((c) => c.name === "jc_admin_stray_reports_list").length).toBeGreaterThan(before);
});

test("Closed: read only when chosen; outcome chips and the stray's link; no actions", async ({ page }) => {
  const b = backend({ closed: [REPORT({ id: RID(5), state: "added", closed_at: "2026-11-15T08:00:00Z", pet: { id: ID(1), name: "Ginger" } }),
                               REPORT({ id: RID(6), state: "expired", closed_at: "2026-11-14T08:00:00Z" })] });
  const { calls } = await openReports(page, b);
  expect(calls.filter((c) => c.name === "jc_admin_stray_reports_list" && c.args && c.args.p_show === "closed")).toEqual([]);
  await page.locator("#prShow-closed").click();
  await expect(card(page, RID(5)).locator(".chip")).toHaveText("Added as a stray");
  await expect(card(page, RID(5)).locator("a")).toHaveAttribute("href", "../pets/?pet=" + ID(1));
  await expect(card(page, RID(6)).locator(".chip")).toHaveText("Expired (60 days)");
  await expect(page.locator("#prList button")).toHaveCount(0);
});
