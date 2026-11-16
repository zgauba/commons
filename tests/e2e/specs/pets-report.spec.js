// Stray reports, PR 3 (plan docs/plans/report-a-stray.md): residents report a stray from the Strays tab. Checks said
// before sending; the WhatsApp number international only; the photo prompt at Send (Zee 2026-11-16) with "without the
// photo"; the thank-you screen's share (no reporter details); My reports (outcomes; number / photo taken back).
const { test, expect } = require("@playwright/test");
const { stubBackend } = require("./stub");
const { signIn, petsBackend: backend, PET_GROUP: GROUP, petId: ID } = require("./backends");

test.use({ timezoneId: "Europe/London" });
const NOW = Date.parse("2026-11-16T09:30:00Z");
const RID = (n) => "77777777-aaaa-4aaa-8aaa-00000000000" + n;
const named = (calls, name) => calls.filter((c) => c.name === name);

async function open(page, b) {
  await page.clock.install({ time: NOW });
  await page.addInitScript(() => {
    window.__copied = [];
    try { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: (t) => { window.__copied.push(t); return Promise.resolve(); } } }); } catch (e) {}
    window.addEventListener("click", (e) => { const a = e.target.closest && e.target.closest('a[target="_blank"]'); if (a) e.preventDefault(); }, true);
  });
  const stub = await stubBackend(page, { rpc: b.rpc, storage: b.storage });
  await signIn(page);
  await page.goto("pets/?tab=strays");
  await expect(page.locator("#rpOpen")).toBeVisible();
  return stub;
}
async function photo(page) {
  const b64 = await page.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 800; c.height = 600;
    const g = c.getContext("2d"); g.fillStyle = "#c58b4b"; g.fillRect(0, 0, 800, 600);
    return c.toDataURL("image/jpeg", 0.9).split(",")[1];
  });
  return { name: "IMG_0002.jpg", mimeType: "image/jpeg", buffer: Buffer.from(b64, "base64") };
}

test("report a stray: said before sending (kind, where); a place is enough; the thank-you screen; My reports shows it waiting", async ({ page }) => {
  const b = backend();
  const { calls } = await open(page, b);
  await expect(page.locator("#rpCtaHelp")).toContainText("isn't listed");
  await page.locator("#rpOpen").click();
  await expect(page.locator("h1")).toHaveText("Report a stray");
  await expect(page.locator("#rpPrivacy")).toHaveText("Pets organizers see this report and which home you're in. Other residents don't. The report is deleted 30 days after it's closed.");
  await page.locator("#rpSend").click();
  await expect(page.locator("#msg")).toHaveText("Choose what kind of animal it is.");
  await page.locator('[data-rsp="dog"]').click();
  await page.locator("#rpSend").click();
  await expect(page.locator("#msg")).toHaveText("Add a pin or describe where you saw it.");
  expect(named(calls, "jc_stray_report_add")).toEqual([]);
  await page.locator("#rpNote").fill("  Brown, limping  ");
  await page.locator("#rpPlace").fill("Behind the clubhouse");
  await page.locator("#rpSend").click();
  await expect(page.locator("h1")).toHaveText("Thanks for reporting");
  await expect(page.locator("#msg")).toHaveText("Report sent.");
  const add = named(calls, "jc_stray_report_add")[0].args;
  expect(add.p_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(add.p_fields).toEqual({ species: "dog", note: "Brown, limping", place: "Behind the clubhouse" });   // no number unless ticked
  await page.locator("#rpToStrays").click();
  await expect(page.locator("#rpMine li")).toHaveCount(1);
  await expect(page.locator("#rpMine li")).toContainText("Waiting for the organizers");
  await expect(page.locator("#rpMine li")).toContainText("Behind the clubhouse");
});

test("the thank-you screen: tell the pets group (the message says what and where, never who)", async ({ page }) => {
  const b = backend();
  await open(page, b);
  await page.locator("#rpOpen").click();
  await page.locator('[data-rsp="cat"]').click();
  await page.locator("#rpPlace").fill("The marina");
  await page.locator("#rpSend").click();
  await expect(page.locator("#ptWaText")).toHaveText("I've reported a stray Cat near The marina on Commons for the Pets organizers.");
  await expect(page.locator("#ptWaGroup")).toHaveAttribute("href", GROUP);
  await page.locator("#ptWaGroup").click();
  expect(await page.evaluate(() => window.__copied)).toEqual(["I've reported a stray Cat near The marina on Commons for the Pets organizers."]);
});

test("WhatsApp number: only when ticked; international only (a local 050… is refused before sending); 00971 → +971", async ({ page }) => {
  const b = backend();
  const { calls } = await open(page, b);
  await page.locator("#rpOpen").click();
  await page.locator('[data-rsp="cat"]').click();
  await page.locator("#rpPlace").fill("Gate 2");
  await expect(page.locator("#rpPhone")).toHaveCount(0);
  await page.locator("#rpWa").check();
  await expect(page.locator("#rpWaHelp")).toContainText("Only the Pets organizers see your number");
  await page.locator("#rpPhone").fill("050 123 4567");
  await page.locator("#rpSend").click();
  await expect(page.locator("#msg")).toHaveText("Use the international format, e.g. +971 50 123 4567.");
  expect(named(calls, "jc_stray_report_add")).toEqual([]);
  await page.locator("#rpPhone").fill("00971 (50) 123-4567");
  await page.locator("#rpSend").click();
  await expect(page.locator("h1")).toHaveText("Thanks for reporting");
  expect(named(calls, "jc_stray_report_add")[0].args.p_fields.contact).toBe("+971501234567");
});

test("the photo prompt at Send: Back changes nothing; Send without the photo sends no photo", async ({ page }) => {
  const b = backend();
  const { calls } = await open(page, b);
  await page.locator("#rpOpen").click();
  await page.locator('[data-rsp="cat"]').click();
  await page.locator("#rpPlace").fill("Beach path");
  await expect(page.locator("#rpPhotoWho")).toContainText("every neighbour on Commons sees it");
  await page.locator("#rpPhotoIn").setInputFiles(await photo(page));
  await expect(page.locator("#rpPhotoNew")).toBeVisible();
  await page.locator("#rpSend").click();
  await expect(page.locator("#rpConfirmH")).toHaveText("Before you send the photo");
  await expect(page.locator("#rpConfirmH")).toBeFocused();
  await expect(page.locator("#rpConfirm")).toContainText("your photo may become its photo, and then every neighbour on Commons sees it");
  await expect(page.locator("#rpConfirm")).toContainText("If they use it, it stays with the animal; if not, it's discarded.");
  await expect(page.locator("#rpConfirm")).toHaveAttribute("aria-describedby", "rpC1 rpC2 rpC3");
  // locked behind the prompt: what was agreed to can't change (review M1)
  await expect(page.locator("#rpPhotoIn")).toBeDisabled();
  await expect(page.locator('[data-rsp="dog"]')).toBeDisabled();
  await expect(page.locator("#rpPlace")).toBeDisabled();
  expect(named(calls, "jc_stray_report_add")).toEqual([]);                          // nothing sent at the prompt
  await page.locator("#rpConfirmBack").click();
  await expect(page.locator("#rpConfirm")).toHaveCount(0);
  await expect(page.locator("#rpSend")).toBeFocused();
  await expect(page.locator("#rpPhotoNew")).toBeVisible();                            // the photo is still there
  await page.locator("#rpSend").click();
  await page.locator("#rpSendNoPhoto").click();
  await expect(page.locator("h1")).toHaveText("Thanks for reporting");
  expect(named(calls, "jc_stray_report_add")).toHaveLength(1);
  expect(named(calls, "jc_stray_report_photo_begin")).toEqual([]);
});

test("the photo prompt: Send with the photo uploads it to the report; My reports shows it and can remove it (asks first)", async ({ page }) => {
  const b = backend();
  const { calls } = await open(page, b);
  await page.locator("#rpOpen").click();
  await page.locator('[data-rsp="cat"]').click();
  await page.locator("#rpPlace").fill("Beach path");
  await page.locator("#rpPhotoIn").setInputFiles(await photo(page));
  await expect(page.locator("#rpPhotoNew")).toBeVisible();
  await page.locator("#rpSend").click();
  await page.locator("#rpSendPhoto").click();
  await expect(page.locator("h1")).toHaveText("Thanks for reporting");
  await expect(page.locator("#msg")).toHaveText("Report sent.");
  const id = named(calls, "jc_stray_report_add")[0].args.p_id;
  expect(named(calls, "jc_stray_report_photo_begin")[0].args).toEqual({ p_id: id, p_ext: "jpg" });
  expect(named(calls, "jc_stray_report_photo_commit")[0].args).toEqual({ p_id: id });
  expect(b.st.reports[0].photo_path).toMatch(/^jubail\/r\//);
  await page.locator("#rpToStrays").click();
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

test("My reports: what organizers decided; the number can be taken back while it's open", async ({ page }) => {
  const b = backend({ reports: [
    { id: RID(1), species: "cat", place: "Gate 2", contact: "+971501234567" },
    { id: RID(2), species: "dog", state: "added", closed_at: "2026-11-15T12:00:00Z", pet: { id: ID(3), name: "Ginger" } },
    { id: RID(3), species: "cat", state: "not_stray", closed_at: "2026-11-15T12:00:00Z" },
  ] });
  const { calls } = await open(page, b);
  await expect(page.locator("#rpMineH")).toHaveText("My reports");
  await expect(page.locator(`[data-myreport="${RID(2)}"]`)).toContainText("Added as Ginger");
  await expect(page.locator(`[data-myreport="${RID(3)}"]`)).toContainText("Closed: not a stray");
  await expect(page.locator(`[data-myreport="${RID(2)}"] [data-rpnum]`)).toHaveCount(0);   // closed: nothing to take back
  await expect(page.locator("#rpMine")).not.toContainText("971");                            // the number is never shown back
  await page.locator(`[data-myreport="${RID(1)}"] [data-rpnum]`).click();
  await expect(page.locator("#msg")).toHaveText("Your number was removed.");
  expect(named(calls, "jc_stray_report_contact_clear")[0].args).toEqual({ p_id: RID(1) });
  await expect(page.locator(`[data-myreport="${RID(1)}"] [data-rpnum]`)).toHaveCount(0);
  await page.locator(`[data-myreport="${RID(2)}"] [data-rpopen]`).click();
  await expect(page.locator("h1")).toHaveText("Ginger");
});

test("too many reports today: said plainly; the form stays", async ({ page }) => {
  const b = backend({ reportError: "TOO_MANY_REPORTS" });
  await open(page, b);
  await page.locator("#rpOpen").click();
  await page.locator('[data-rsp="cat"]').click();
  await page.locator("#rpPlace").fill("Gate");
  await page.locator("#rpSend").click();
  await expect(page.locator("#msg")).toHaveText("You've sent a lot of reports today. Thank you, that's enough for now.");
  await expect(page.locator("#rpPlace")).toHaveValue("Gate");
});

test("Back from the form returns to Strays and sends nothing", async ({ page }) => {
  const b = backend();
  const { calls } = await open(page, b);
  await page.locator("#rpOpen").click();
  await page.locator("#jcBackBtn").click();
  await expect(page.locator("#rpOpen")).toBeVisible();
  expect(named(calls, "jc_stray_report_add")).toEqual([]);
});

test("a doubled tap on Send sends one report", async ({ page }) => {
  const b = backend();
  const { calls } = await open(page, b);
  await page.locator("#rpOpen").click();
  await page.locator('[data-rsp="cat"]').click();
  await page.locator("#rpPlace").fill("Gate");
  await page.locator("#rpSend").evaluate((btn) => { btn.click(); btn.click(); });
  await expect(page.locator("h1")).toHaveText("Thanks for reporting");
  expect(named(calls, "jc_stray_report_add")).toHaveLength(1);
});

test("a failed send keeps the form; the retry carries the same report id (the server returns the first, never a second)", async ({ page }) => {
  const b = backend({ reportFailOnce: "UNKNOWN" });
  const { calls } = await open(page, b);
  await page.locator("#rpOpen").click();
  await page.locator('[data-rsp="cat"]').click();
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

test("the photo fails after the report went in: says the organizers have it, no need to send again", async ({ page }) => {
  const b = backend({ uploadFail: true });
  const { calls } = await open(page, b);
  await page.locator("#rpOpen").click();
  await page.locator('[data-rsp="cat"]').click();
  await page.locator("#rpPlace").fill("Gate");
  await page.locator("#rpPhotoIn").setInputFiles(await photo(page));
  await expect(page.locator("#rpPhotoNew")).toBeVisible();
  await page.locator("#rpSend").click();
  await page.locator("#rpSendPhoto").click();
  await expect(page.locator("h1")).toHaveText("Thanks for reporting");
  await expect(page.locator("#msg")).toContainText("The organizers have your report, without the photo");
  await expect(page.locator("#msg")).toContainText("No need to send it again.");
  expect(named(calls, "jc_stray_report_add")).toHaveLength(1);
});

test("the community's daily limit: said plainly", async ({ page }) => {
  await open(page, backend({ reportError: "RATE_LIMITED" }));
  await page.locator("#rpOpen").click();
  await page.locator('[data-rsp="cat"]').click();
  await page.locator("#rpPlace").fill("Gate");
  await page.locator("#rpSend").click();
  await expect(page.locator("#msg")).toHaveText("Organizers have a lot of reports today. Please try again tomorrow.");
});
