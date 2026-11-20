// CC-7c (docs/plans/CC-community-cats.md "CC-7 plan"): Organizer Tools → Pets → Reported strays is gone — stray-cat
// reports are worked on the Cats page's Reports tab (CC-7b, cats-reports.spec.js). What stays to prove here: an old
// ?open=reports link (the retired Strays tab's waiting line, bookmarks) lands on the Cats queue, and Organizer Tools →
// Pets offers no way back into the old screen and never asks the server for the old queue.
const { test, expect } = require("@playwright/test");
const { stubBackend, ok } = require("./stub");
const { adminBackend, signIn } = require("./backends");

function backend() {
  const ab = adminBackend({ scopes: ["pets"] });
  Object.assign(ab.rpc, {
    jc_admin_pets_list: () => ok([]),
    jc_pets_group_get: () => ok({ link: null }),
  });
  return ab;
}

test("an old ?open=reports link goes to the Cats page's Reports tab — nothing of Organizer Tools drawn or asked", async ({ page }) => {
  const { calls } = await stubBackend(page, { rpc: backend().rpc });
  await signIn(page);
  await page.goto("admin/?tab=pets&open=reports");
  await expect(page).toHaveURL(/\/commons\/cats\/\?tab=reports$/);
  expect(calls.filter((c) => /^jc_admin_/.test(c.name))).toEqual([]);           // left before reading anything of its own
  expect(calls.filter((c) => /stray/.test(c.name))).toEqual([]);
});

test("Organizer Tools → Pets: no Reported strays row, no Strays / Needs help / Homes' pets chip, no Add a Stray; the old queue is never read", async ({ page }) => {
  const { calls } = await stubBackend(page, { rpc: backend().rpc });
  await signIn(page);
  await page.goto("admin/?tab=pets");
  await expect(page.locator("#paChips")).toBeVisible();
  await expect(page.locator("#paRepOpen")).toHaveCount(0);
  await expect(page.locator("#paGroupRows li")).toHaveCount(1);                  // the WhatsApp group row only
  await expect(page.locator("#paChips button")).toHaveText(["All 0", "Missing 0", "Archived 0"]);
  await expect(page.locator("#paNew")).toHaveCount(0);
  await expect(page.locator("#view")).not.toContainText(/stray/i);
  await page.locator("#langBtn").click();
  await expect(page.locator("#paChips button")).toHaveCount(3);
  expect(calls.filter((c) => /stray/.test(c.name))).toEqual([]);
});
