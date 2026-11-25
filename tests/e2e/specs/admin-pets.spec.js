// R5d-1 — Organizer Tools → Pets (plan docs/plans/R5d-pets-organizer.md): who sees the tab, the pets A–Z (the
// owners' villages A–Z, then name — NF-3), the Archived group, the pets WhatsApp group link (members-only, the
// server's rule said before sending), the jump in from a pet's Admin button.
// CC-7c (docs/plans/CC-community-cats.md "CC-7 plan"): strays left Pets — no stray editor, care record, care log,
// Strays / Needs help chips or Reported strays here any more. The server still sends strays until CC-7d archives
// them: the fixture keeps two (Archie active, Zed archived) and the page must never show them.
const { test, expect } = require("@playwright/test");
const { stubBackend, ok, raise, CONFIG } = require("./stub");
const { adminBackend, signIn } = require("./backends");

const ID = (n) => "44444444-dddd-4ddd-8ddd-00000000000" + n;
const PET = (o) => Object.assign({ kind: "owned", species: "cat", description: null, wanderer: false, microchipped: false,
  missing: false, missing_since: null, last_seen_note: null, care_state: null, photo_path: "p/x.jpg", mine: false, home: null,
  territory: null, territory_lat: null, territory_lng: null, care: null, last_seen: null, last_seen_at: null,
  status: "active", created_at: "2026-11-10T09:00:00Z", updated_at: "2026-11-10T09:00:00Z", sightings_7d: 0 }, o);
const HOME = (village, number) => ({ village, type: "villa", building: null, number });
// the server's order (status, missing, name) is not the page's: the page sorts
const ANIMALS = () => [
  PET({ id: ID(1), name: "Rex", species: "dog", home: HOME("seef-al-jubail", "40") }),
  PET({ id: ID(2), name: "Luna", home: HOME("ain-al-maha", "7"), missing: true }),
  PET({ id: ID(3), name: "Ginger", home: HOME("ain-al-maha", "9"), photo_path: null, sightings_7d: 3 }),
  PET({ id: ID(4), name: "Bella", species: "dog", home: HOME("seef-al-jubail", "12") }),
  PET({ id: ID(5), name: "Archie", kind: "stray", care_state: "known_fine", territory: "The marina" }),        // a stray: never shown
  PET({ id: ID(6), name: "Old Tom", home: HOME("seef-al-jubail", "3"), status: "archived" }),
  PET({ id: ID(7), name: "Mochi", home: HOME("ain-al-maha", "12") }),
  PET({ id: ID(8), name: "Smokey", kind: "stray", care_state: "rehomed", status: "archived",                    // a stray: never shown
       archived_at: "2026-11-19T09:00:00Z", restorable_until: "2026-12-19T09:00:00Z" }),
];
const LINK = "https://chat.whatsapp.com/AbCdEfGhIjKlMnOpQr12";

function backend(opts = {}) {
  const ab = adminBackend({ scopes: opts.scopes || ["pets"] });
  const st = { list: opts.list || ANIMALS(), link: opts.link === undefined ? LINK : opts.link, sets: [] };
  const pets = () => ab.st.scopes.includes("pets") || ab.st.scopes.includes("community");
  Object.assign(ab.rpc, {
    jc_admin_pets_list: () => (!pets() ? raise("NOT_ADMIN") : st.listRaises ? raise(st.listRaises) : ok(st.list)),
    jc_pets_group_get: () => (opts.groupOff ? raise(opts.groupOff) : ok({ link: st.link })),
    jc_admin_pets_group_set: (a) => {
      st.sets.push(a.p_link);
      if (opts.setRaises) return raise(opts.setRaises);
      st.link = a.p_link || null;
      return ok({ link: st.link });
    },
  });
  // R5d-3a: Manage reads the pet (its sightings) through jc_pet_get
  Object.assign(ab.rpc, {
    jc_pet_get: (a) => {
      if (opts.getRaises) return raise(opts.getRaises);
      const c = st.list.find((p) => p.id === a.p_pet && p.status === "active");
      return c ? ok(Object.assign({}, c, { sightings: (st.sights[c.id] || []).filter((s) => !s.hidden).map(({ hidden, ...s }) => s), care_log: null }))
               : raise("NOT_FOUND");
    },
  });
  // R5d-3b: moderation (any animal in the community)
  Object.assign(ab.rpc, {
    jc_admin_sighting_hide: (a) => {
      st.hides.push(a);
      const s = Object.values(st.sights).flat().find((x) => x.id === a.p_sighting && !x.hidden);
      if (!s) return raise("NOT_FOUND");
      s.hidden = true;
      return ok({ sighting_id: a.p_sighting, hidden: true });
    },
    jc_admin_pet_archive: (a) => {
      st.archives.push(a);
      const r = (a.p_reason || "").trim();
      if (r.length < 3 || r.length > 200) return raise("REASON_REQUIRED");
      const c = st.list.find((p) => p.id === a.p_pet && p.status === "active");
      if (!c) return raise("NOT_FOUND");
      Object.assign(c, { status: "archived", missing: false, photo_path: null });
      return ok(st.list);
    },
    // soft archive: restore within 30 days (the server's rules: RESTORE_EXPIRED past it); hidden sightings + unhide
    jc_admin_pet_restore: (a) => {
      st.restores.push(a);
      if (st.restoreRaises) return raise(st.restoreRaises);
      const c = st.list.find((p) => p.id === a.p_pet && p.status === "archived");
      if (!c) return raise("NOT_FOUND");
      if (!c.restorable_until) return raise("RESTORE_EXPIRED");
      Object.assign(c, { status: "active", archived_at: null, restorable_until: null });
      return ok(st.list);
    },
    jc_admin_pet_hidden_sightings: (a) =>
      ok((st.sights[a.p_pet] || []).filter((s) => s.hidden).map(({ hidden, by_me, ...s }) => s)),
    jc_admin_sighting_unhide: (a) => {
      st.unhides.push(a);
      const s = Object.values(st.sights).flat().find((x) => x.id === a.p_sighting && x.hidden);
      if (!s) return raise("NOT_FOUND");
      s.hidden = false;
      return ok({ sighting_id: a.p_sighting, hidden: false });
    },
  });
  st.restores = []; st.unhides = [];
  st.sights = {}; st.hides = []; st.archives = [];
  if (opts.petsOn) ab.rpc.jc_config_get = () => ok(Object.assign({}, CONFIG, { modules: Object.assign({}, CONFIG.modules, { pets: { enabled: true } }) }));
  return { ab, st, rpc: ab.rpc };
}
async function openPets(page, b, q) {
  await stubBackend(page, { rpc: b.rpc });
  await signIn(page);
  await page.goto("admin/?tab=pets" + (q || ""));
  await expect(page.locator("#paChips")).toBeVisible();
}
// OT-3: the group link lives on its own screen, from a settings row on the Pets tab
async function openGroup(page, b) {
  await openPets(page, b);
  await page.locator("#paGroupOpen").click();
  await expect(page.locator("h1")).toHaveText("Pets WhatsApp group");
  await expect(page.locator("#paGroup")).toBeVisible();
}
const rowIds = (page, sel) => page.locator(sel + " [data-pet]").evaluateAll((ls) => ls.map((l) => l.dataset.pet));

test("who sees Pets: pets and community admins; courts-only and events-only don't", async ({ page }) => {
  const b = backend({ scopes: ["bookings"] });
  const { calls } = await stubBackend(page, { rpc: b.rpc });
  await signIn(page);
  await page.goto("admin/?tab=pets");
  await expect(page.locator('[role="tab"]')).toHaveText(["Bookings", "Community"]);   // ?tab=pets falls back
  await expect(page.locator("#paGroup")).toHaveCount(0);
  expect(calls.filter((c) => c.name === "jc_admin_pets_list" || c.name === "jc_pets_group_get")).toEqual([]);   // never asked
  b.ab.st.scopes = ["events"];
  await page.goto("admin/?tab=pets");
  await expect(page.locator('[role="tab"]')).toHaveText(["Events", "Community", "Announcement"]);
  b.ab.st.scopes = ["pets"];
  await page.goto("admin/?tab=pets");
  await expect(page.locator('[role="tab"]')).toHaveText(["Pets", "Community"]);
  b.ab.st.scopes = ["community"];
  await page.goto("admin/?tab=pets");
  await expect(page.locator('[role="tab"]')).toHaveText(["Events", "Bookings", "Pets", "Community", "Announcement"]);
  await expect(page.locator("#atab-pets")).toHaveAttribute("aria-selected", "true");
});

test("the pets: villages A–Z, then name; chips; Archived apart, names only; strays the server still sends never show", async ({ page }) => {
  await openPets(page, backend());
  await expect(page.locator("#paOff")).toContainText("Pets is switched off for residents");
  await expect(page.locator("#admPanel h2.group")).toHaveText(["Ain Al Maha · 3", "Seef Al Jubail · 2"]);
  expect(await rowIds(page, "#paList-ain-al-maha")).toEqual([ID(3), ID(2), ID(7)]);  // Ginger, Luna, Mochi
  expect(await rowIds(page, "#paList-seef-al-jubail")).toEqual([ID(4), ID(1)]);      // Bella, Rex
  await expect(page.locator(`[data-pet="${ID(5)}"]`)).toHaveCount(0);               // Archie, a stray (CC-7c)
  await expect(page.locator("#view")).not.toContainText("Stray");
  const ginger = page.locator(`[data-pet="${ID(3)}"]`);
  await expect(ginger.locator(".chip")).toHaveText(["No photo", "Seen 3× this week"]);
  await expect(ginger).toContainText("Cat · Pet");
  await expect(ginger).toContainText("Villa 9");
  await expect(page.locator(`[data-pet="${ID(2)}"] .chip.miss`)).toHaveText("Missing");
  await expect(page.locator(`[data-pet="${ID(2)}"]`)).toContainText("Villa 7");
  await expect(page.locator(`[data-pet="${ID(2)}"] a`)).toHaveAttribute("href", "../pets/?pet=" + ID(2));
  await expect(page.locator("#paArchived")).toHaveCount(0);                        // archived sit under their own chip (OT-3)
  await page.locator("#paShow-archived").click();
  await expect(page.locator("#paArchived li")).toHaveText(["Old Tom"]);              // not Smokey, an archived stray
  await expect(page.locator("#paArchived a, #paArchived button")).toHaveCount(0);   // past the 30 days (no restorable_until): names only
});

test("CC-7c: no Reported strays row, no Add a Stray, no Strays / Needs help / Homes' pets chips; old ?show= links are All; no stray RPC", async ({ page }) => {
  const b = backend();
  const { calls } = await stubBackend(page, { rpc: b.rpc });
  await signIn(page);
  await page.goto("admin/?tab=pets&show=strays");
  await expect(page.locator("#paChips")).toBeVisible();
  await expect(page.locator("#paChips button")).toHaveText(["All 5", "Missing 1", "Archived 1"]);
  await expect(page.locator("#paShow-all")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#paShow-strays, #paShow-help, #paShow-homes")).toHaveCount(0);
  await page.goto("admin/?tab=pets&show=homes");                                       // the retired Homes' pets chip
  await expect(page.locator("#paChips")).toBeVisible();
  await expect(page.locator("#paShow-all")).toHaveAttribute("aria-pressed", "true");
  expect(await rowIds(page, "#paListBox")).toEqual([ID(3), ID(2), ID(7), ID(4), ID(1)]);
  await expect(page.locator("#paGroupRows li")).toHaveCount(1);                       // the WhatsApp group row only
  await expect(page.locator("#paRepOpen, #paNew")).toHaveCount(0);
  await expect(page.locator("#view")).not.toContainText("Reported strays");
  await page.goto("admin/?tab=pets&show=help");
  await expect(page.locator("#paShow-all")).toHaveAttribute("aria-pressed", "true");
  await page.locator(`li[data-pet="${ID(3)}"] [data-pamanage]`).click();
  await expect(page.locator("#pmArch")).toBeVisible();
  await expect(page.locator("#pmEdit, #pmState, #pmCare, #pmLogForm")).toHaveCount(0);   // Manage: no stray editor / care
  expect(calls.filter((c) => /stray|_care_/.test(c.name))).toEqual([]);
});

test("CC-7c: an old link to a stray's Manage (?pet=) says it isn't in the list", async ({ page }) => {
  await stubBackend(page, { rpc: backend().rpc });
  await signIn(page);
  await page.goto("admin/?tab=pets&pet=" + ID(5));                                // Archie, a stray the server still sends
  await expect(page.locator("#paChips")).toBeVisible();
  await expect(page.locator("#msg")).toHaveText("That animal isn't in the list any more.");
  await expect(page.locator("h1")).not.toHaveText("Archie");
});

test("Pets on for residents: no switched-off notice; no animals says so", async ({ page }) => {
  await openPets(page, backend({ petsOn: true, list: [] }));
  await expect(page.locator("#paOff")).toHaveCount(0);
  await expect(page.locator("#paNone")).toHaveText("No pets yet.");
});

test("group link: shown; a non-WhatsApp link is refused before sending; saving sends exactly the link; Remove asks first", async ({ page }) => {
  const b = backend({ link: null });
  await openGroup(page, b);
  await expect(page.locator("#paLink")).toHaveValue("");
  await expect(page.locator("#paLinkClear")).toHaveCount(0);
  await page.locator("#paLink").fill("https://example.com/AbCdEfGhIjKlMnOpQr12");
  await page.locator("#paLinkSave").click();
  await expect(page.locator("#msg")).toHaveText("That isn't a WhatsApp group invite link. It starts with https://chat.whatsapp.com/");
  expect(b.st.sets).toEqual([]);
  await page.locator("#paLink").fill("  " + LINK + " ");
  await page.locator("#paLinkSave").click();
  await expect(page.locator("#msg")).toHaveText("Group link saved.");
  expect(b.st.sets).toEqual([LINK]);
  await expect(page.locator("#paLink")).toHaveValue(LINK);
  page.once("dialog", (d) => d.dismiss());
  await page.locator("#paLinkClear").click();
  expect(b.st.sets).toEqual([LINK]);                                                // said no: nothing sent
  page.once("dialog", (d) => { expect(d.message()).toContain("Send to Someone Else"); d.accept(); });
  await page.locator("#paLinkClear").click();
  await expect(page.locator("#msg")).toHaveText("Group link removed.");
  expect(b.st.sets).toEqual([LINK, ""]);
  await expect(page.locator("#paLink")).toHaveValue("");
});

test("group link: the server's BAD_LINK in the Pets words (not the invite-link ones); unreadable while Pets is off says so", async ({ page }) => {
  await openGroup(page, backend({ setRaises: "BAD_LINK", groupOff: "MODULE_OFF" }));
  await expect(page.locator("#paGroup .help")).toHaveText("The current link can't be read while Pets is switched off. Saving a new one replaces it.");
  await page.locator("#paLink").fill(LINK);
  await page.locator("#paLinkSave").click();
  await expect(page.locator("#msg")).toHaveText("That isn't a WhatsApp group invite link. It starts with https://chat.whatsapp.com/");
  await expect(page.locator("#paLinkSave")).toBeEnabled();
});

test("an empty Save never clears the link blind (reviews M1): unreadable or none set → asks for one; a link set → the Remove question", async ({ page }) => {
  const b = backend({ groupOff: "NOT_MEMBER" });                                    // a code-only admin with no home
  await openGroup(page, b);
  await expect(page.locator("#paGroup .help")).toHaveText("The current link couldn't be read just now. Saving a new one replaces it.");
  await page.locator("#paLinkSave").click();
  await expect(page.locator("#msg")).toHaveText("Paste the group's invite link first. To take the link away, use Remove Link.");
  expect(b.st.sets).toEqual([]);
});

test("an empty Save with a link set asks the Remove question first", async ({ page }) => {
  const b = backend();
  await openGroup(page, b);
  await expect(page.locator("#paLink")).toHaveValue(LINK);
  await expect(page.locator("#paLink")).toHaveAttribute("type", "text");            // styled like every input (review M)
  await expect(page.locator("#paLink")).toHaveAttribute("inputmode", "url");
  await page.locator("#paLink").fill("");
  page.once("dialog", (d) => d.dismiss());
  await page.locator("#paLinkSave").click();
  expect(b.st.sets).toEqual([]);
  page.once("dialog", (d) => d.accept());
  await page.locator("#paLinkSave").click();
  await expect(page.locator("#msg")).toHaveText("Group link removed.");
  expect(b.st.sets).toEqual([""]);
});

test("hostile names, homes and link text stay text", async ({ page }) => {
  const evil = '<img src=x onerror="window.__xss=1">"\'';
  await openPets(page, backend({ link: null, list: [PET({ id: ID(1), name: evil, home: { village: "ain-al-maha", type: "villa", building: evil, number: evil } })] }));
  await expect(page.locator(`[data-pet="${ID(1)}"] b`)).toHaveText(evil);
  await expect(page.locator(`[data-pet="${ID(1)}"]`)).toContainText(evil);
  await page.locator("#paSearch").fill(evil);                                        // the no-match line too
  await page.locator("#paSearch").fill("");
  await page.locator("#paGroupOpen").click();
  await page.locator("#paLink").fill(evil);
  await page.locator("#paLinkSave").click();                                        // refused before sending
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  await expect(page.locator("#view img")).toHaveCount(0);
});

test("from an animal's Admin button: its Manage opens, once; Back shows its row; one that's gone says so", async ({ page }) => {
  await stubBackend(page, { rpc: backend().rpc });
  await signIn(page);
  await page.goto("admin/?tab=pets&pet=" + ID(7));                                 // Mochi, a home's pet (R5d-3b)
  await expect(page.locator("h1")).toHaveText("Mochi");
  await expect(page).toHaveURL(/\?tab=pets$/);                                      // once: the link is dropped
  await page.locator("#jcBackBtn").click();
  await expect(page.locator(`[data-pet="${ID(7)}"]`)).toBeFocused();              // keyboard / screen reader too
  await page.goto("admin/?tab=pets&pet=" + ID(9));
  await expect(page.locator("#msg")).toHaveText("That animal isn't in the list any more.");
});

test("the pets right ends while the list is on its way: back to the lock, nothing of it shown", async ({ page }) => {
  const b = backend();
  b.rpc.jc_admin_pets_list = () => { b.ab.st.scopes = []; return raise("NOT_ADMIN"); };
  await stubBackend(page, { rpc: b.rpc });
  await signIn(page);
  await page.goto("admin/?tab=pets");
  await expect(page.locator("#go")).toBeVisible();                                   // the lock: they can't enter any more
  await expect(page.locator("#msg")).not.toBeEmpty();
  await expect(page.locator("#paGroup")).toHaveCount(0);
  await expect(page.locator("[data-pet]")).toHaveCount(0);
});

// ── OT-3: chips, search, the group screen ──
test("chips: All · Missing · Archived with counts; each shows its own; kept in the address", async ({ page }) => {
  await openPets(page, backend());
  await expect(page.locator("#paChips button")).toHaveText(["All 5", "Missing 1", "Archived 1"]);
  await expect(page.locator("#paShow-all")).toHaveAttribute("aria-pressed", "true");
  expect(await rowIds(page, "#paListBox")).toEqual([ID(3), ID(2), ID(7), ID(4), ID(1)]);   // villages A–Z, then name
  await page.locator("#paShow-missing").click();
  await expect(page.locator("#paShow-missing")).toBeFocused();
  expect(await rowIds(page, "#paListBox")).toEqual([ID(2)]);
  await expect(page).toHaveURL(/tab=pets&show=missing/);
  await page.reload();
  await expect(page.locator("#paShow-missing")).toHaveAttribute("aria-pressed", "true");
});

test("an empty chip says so in words", async ({ page }) => {
  await openPets(page, backend({ list: [PET({ id: ID(1), name: "Rex", home: HOME("seef-al-jubail", "40") })] }));
  await page.locator("#paShow-missing").click();
  await expect(page.locator("#paNone")).toHaveText("No pet is missing right now.");
  await page.locator("#paShow-archived").click();
  await expect(page.locator("#paNone")).toHaveText("Nothing archived.");
});

test("search: name, home or village narrows every count; the box keeps focus; asks the server nothing", async ({ page }) => {
  const b = backend();
  const { calls } = await stubBackend(page, { rpc: b.rpc });
  await signIn(page);
  await page.goto("admin/?tab=pets");
  await expect(page.locator("#paChips")).toBeVisible();
  const n = calls.length;
  const box = page.locator("#paSearch");
  await box.fill("ginger");                                                         // a name
  expect(await rowIds(page, "#paListBox")).toEqual([ID(3)]);
  await expect(page.locator("#paChips button")).toHaveText(["All 1", "Missing 0", "Archived 0"]);
  await expect(box).toBeFocused();
  await box.fill("villa 12");                                                       // a home
  expect(await rowIds(page, "#paListBox")).toEqual([ID(7), ID(4)]);
  await box.fill("seef");                                                           // a village
  expect(await rowIds(page, "#paListBox")).toEqual([ID(4), ID(1)]);
  await box.fill("tom");
  await page.locator("#paShow-archived").click();
  await expect(page.locator("#paArchived li")).toHaveText(["Old Tom"]);
  await expect(page.locator("#paSearch")).toHaveValue("tom");                       // kept across the chip
  await page.locator("#paSearch").fill("zzz");
  await expect(page.locator("#paNone")).toHaveText("No pets here match \u201czzz\u201d.");
  expect(calls.length).toBe(n);
});

test("an animal's Admin button wins over a chip or a search: Back always finds it", async ({ page }) => {
  await stubBackend(page, { rpc: backend().rpc });
  await signIn(page);
  await page.goto("admin/?tab=pets&show=missing&pet=" + ID(1));                    // Rex isn't missing
  await expect(page.locator("h1")).toHaveText("Rex");
  await page.locator("#jcBackBtn").click();
  await expect(page.locator("#paShow-all")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(`[data-pet="${ID(1)}"]`)).toBeFocused();
});

test("the group row says whether a link is set; the screen explains it, step by step, and Test It opens the group", async ({ page }) => {
  const b = backend({ link: null });
  await openPets(page, b);
  await expect(page.locator("#paGroupOpen small")).toHaveText("Not set yet: residents can only send reports to one person at a time");
  await page.locator("#paGroupOpen").click();
  await expect(page.locator("#view h2.group")).toHaveText(["What it does", "How to get the link", "Who sees it"]);
  await expect(page.locator("#paHow li")).toHaveCount(5);
  await expect(page.locator("#paHow li").nth(2)).toContainText("Invite to group via link");
  await expect(page.locator("#paLinkTest")).toHaveCount(0);
  await page.locator("#paLink").fill(LINK);
  await page.locator("#paLinkSave").click();
  await expect(page.locator("#msg")).toHaveText("Group link saved.");
  await expect(page.locator("h1")).toHaveText("Pets WhatsApp group");              // stays on the screen
  await expect(page.locator("#paLinkTest")).toHaveAttribute("href", LINK);
  await expect(page.locator("#paLinkTest")).toHaveAttribute("target", "_blank");
  await page.locator("#jcBackBtn").click();
  await expect(page.locator("#atab-pets")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#paGroupOpen small")).toHaveText("Set: residents can send missing-pet reports to it");
});

test("the group screen in Arabic", async ({ page }) => {
  await openGroup(page, backend());
  await page.locator("#langBtn").click();
  await expect(page.locator("h1")).toHaveText("مجموعة واتساب للحيوانات");
  await expect(page.locator("#paHow li").first()).toHaveText("افتح واتساب وادخل إلى مجموعة الحيوانات.");
});

test("a stored link that isn't a WhatsApp group link never becomes a clickable Test It (review M)", async ({ page }) => {
  await openGroup(page, backend({ link: "javascript:window.__x=1" }));
  await expect(page.locator("#paLink")).toHaveValue("javascript:window.__x=1");   // shown as text, so it can be replaced
  await expect(page.locator("#paLinkTest")).toHaveCount(0);
  await expect(page.locator("#view a[href^='javascript']")).toHaveCount(0);
});

// ---- R5d-3a: Manage one pet (plan docs/plans/R5d-3-care-moderation.md). CC-7c: the stray editor (R5d-2b), the care
// record, the care log and the state picker left with the strays; Manage = sightings, hide / show again, archive ----
async function manageAny(page, b, id) {
  const r = await stubBackend(page, { rpc: b.rpc });
  await signIn(page);
  await page.goto("admin/?tab=pets");
  await page.locator(`li[data-pet="${id}"] [data-pamanage]`).click();
  await expect(page.locator("#pmArch")).toBeVisible();
  return r;
}

test("R5d-3a: Manage on every active pet (never an archived one); Back keeps the chip and search", async ({ page }) => {
  await openPets(page, backend());
  await expect(page.locator("#paListBox [data-pamanage]")).toHaveCount(5);                   // every active pet (R5d-3b)
  await page.locator("#paShow-missing").click();
  await page.locator("#paSearch").fill("lu");
  await expect(page.locator("#paListBox [data-pamanage]")).toHaveCount(1);
  await page.locator(`li[data-pet="${ID(2)}"] [data-pamanage]`).click();
  await expect(page.locator("h1")).toHaveText("Luna");
  await expect(page.locator("#pmEdit")).toHaveCount(0);                                     // a household's pet is theirs to edit
  await page.locator("#jcBackBtn").click();
  await expect(page.locator("#paShow-missing")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#paSearch")).toHaveValue("lu");
  await expect(page.locator(`li[data-pet="${ID(2)}"]`)).toBeFocused();
  await page.locator("#paSearch").fill("");
  await page.locator("#paShow-archived").click();
  await expect(page.locator("#paListBox [data-pamanage]")).toHaveCount(0);                   // Old Tom: names only
});

test("R5d-3a: Manage can't read the pet just now → why, and Try Again reads it again", async ({ page }) => {
  const o = { petsOn: true, getRaises: "UNKNOWN" };                                         // read at call time
  const b = backend(o);
  const { calls } = await manageAny(page, b, ID(3));
  await expect(page.locator("#msg")).not.toBeEmpty();
  await expect(page.locator("#pmRetry")).toBeVisible();
  o.getRaises = null;
  const before = calls.filter((c) => c.name === "jc_pet_get").length;
  await page.locator("#pmRetry").click();
  await expect(page.locator("#pmSightNone")).toHaveText("No sightings yet.");
  await expect(page.locator("#pmRetry")).toHaveCount(0);
  expect(calls.filter((c) => c.name === "jc_pet_get").length).toBe(before + 1);
});

// ---- R5d-3b: moderation on Manage — hide a sighting, archive with a reason ----
const SIGHTS = () => [
  { id: 41, note: "Under the blue car by the mosque", lat: 24.531, lng: 54.432, seen_at: "2026-11-13T18:20:00Z", by_me: false },
  { id: 42, note: "lol fake", lat: null, lng: null, seen_at: "2026-11-12T08:00:00Z", by_me: false },
];

test("R5d-3b: a home's pet on Manage — no care or editing, sightings wait while Pets is off, Archive names the home", async ({ page }) => {
  await manageAny(page, backend(), ID(2));                                              // Luna, Villa 7, missing
  await expect(page.locator(".sub")).toContainText("Villa 7");
  await expect(page.locator("#pmEdit, #pmCare, #pmLogForm")).toHaveCount(0);
  await expect(page.locator("#pmOff")).toHaveText("Pets is switched off for residents, so sightings show here once it's switched on.");
  await expect(page.locator("#pmSightOff")).toBeVisible();
  await expect(page.locator("#pmArch")).toContainText("Luna is Villa 7's pet. Archiving removes Luna from their My Pets");
  await expect(page.locator("#pmArch")).toContainText("ends a missing alert. They aren't told. For 30 days, a Pets organizer can restore Luna from the Archived list, unless the household changes.");
  await page.locator("#pmArchOpen").click();
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/pm-archive-owned.png", fullPage: true });
});

test("R5d-3b: hide a sighting (Pets on) — asks first, the exact call, read again; one already hidden counts as hidden", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-21T12:00:00Z"));                      // both sightings older than 7 days (care v2)
  const b = backend({ petsOn: true });
  b.st.sights[ID(3)] = SIGHTS();
  const { calls } = await manageAny(page, b, ID(3));
  await expect(page.locator("#pmSight li")).toHaveCount(2);
  await expect(page.locator('#pmSight [data-sighting="41"] a')).toHaveAttribute("href", /query=24\.531%2C54\.432/);
  page.once("dialog", (d) => { expect(d.message()).toBe("Hide this sighting? Residents stop seeing it. You can show it again from Hidden Sightings below."); d.dismiss(); });
  await page.locator('[data-pmhide="42"]').click();
  expect(b.st.hides).toEqual([]);
  page.once("dialog", (d) => d.accept());
  await page.locator('[data-pmhide="42"]').click();
  await expect(page.locator("#msg")).toHaveText("Sighting hidden.");
  expect(b.st.hides).toEqual([{ p_sighting: 42 }]);
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/pm-sightings.png", fullPage: true });
  await expect(page.locator("#pmSight li")).toHaveCount(1);
  expect(calls.filter((c) => c.name === "jc_pet_get")).toHaveLength(2);
  b.st.sights[ID(3)][0].hidden = true;                                                   // another organizer hid it meanwhile
  page.once("dialog", (d) => d.accept());
  await page.locator('[data-pmhide="41"]').click();
  await expect(page.locator("#msg")).toHaveText("Sighting hidden.");
  await expect(page.locator("#pmSightNone")).toHaveText("No sightings yet.");
});

test("R5d-3b: archive — a reason is needed (3+), Keep closes it, the exact call; back on the list, counts updated", async ({ page }) => {
  const b = backend();
  await manageAny(page, b, ID(7));                                                      // Mochi, Villa 12 (CC-7c: was Archie, a stray)
  await expect(page.locator("#pmArch")).toContainText("Mochi is Villa 12's pet. Archiving removes Mochi from their My Pets");
  await page.locator("#pmArchOpen").click();
  await expect(page.locator("#pmWhy")).toBeFocused();
  await page.locator("#pmWhy").fill("no");
  await page.locator("#pmArchGo").click();
  await expect(page.locator("#msg")).toHaveText("Write a reason of at least 3 characters (up to 200).");
  expect(b.st.archives).toEqual([]);
  await page.locator("#pmArchKeep").click();
  await expect(page.locator("#pmWhy")).toHaveCount(0);
  await page.locator("#pmArchOpen").click();
  await expect(page.locator("#pmWhy")).toHaveValue("");                                  // Keep forgets it
  await page.locator("#pmWhy").fill("  Added twice — same cat as Ginger ");
  await page.locator("#pmArchGo").dblclick();
  await expect(page.locator("#msg")).toHaveText("Mochi is archived.");
  expect(b.st.archives).toEqual([{ p_pet: ID(7), p_reason: "Added twice — same cat as Ginger" }]);
  await expect(page.locator("#paChips")).toBeVisible();
  await expect(page.locator("#paShow-archived")).toContainText("2");
  await expect(page.locator(`li[data-pet="${ID(7)}"]`)).toHaveCount(0);
});

test("R5d-3b: archive a home's pet that someone already archived → the list, said plainly", async ({ page }) => {
  const b = backend();
  await manageAny(page, b, ID(4));                                                      // Bella, Villa 12
  b.st.list.find((p) => p.id === ID(4)).status = "archived";
  await page.locator("#pmArchOpen").click();
  await page.locator("#pmWhy").fill("Family moved away");
  await page.locator("#pmArchGo").click();
  await expect(page.locator("#paChips")).toBeVisible();
  await expect(page.locator("#msg")).toHaveText("That animal isn't in the list any more.");
});

test("R5d-3b: Archive in Arabic keeps the reason being typed", async ({ page }) => {
  await manageAny(page, backend(), ID(1));
  await page.locator("#pmArchOpen").click();
  await page.locator("#pmWhy").fill("Duplicate entry");
  await page.locator("#langBtn").click();
  await expect(page.locator("#pmArchGo")).toHaveText("أرشفة Rex");
  await expect(page.locator("#pmWhy")).toHaveValue("Duplicate entry");
});

test("R5d rate limit: over the limit, archive and hide say so in words (the server's RATE_LIMITED)", async ({ page }) => {
  const b = backend({ petsOn: true });
  b.st.sights[ID(3)] = SIGHTS();
  b.rpc.jc_admin_pet_archive = () => raise("RATE_LIMITED");
  b.rpc.jc_admin_sighting_hide = () => raise("RATE_LIMITED");
  await manageAny(page, b, ID(3));
  page.once("dialog", (d) => d.accept());
  await page.locator('[data-pmhide="41"]').click();
  await expect(page.locator("#msg")).toHaveText("That's the limit for now: 20 an hour for each organizer, 60 for the whole community. Try again in an hour.");
  await page.locator("#pmArchOpen").click();
  await page.locator("#pmWhy").fill("Added twice");
  await page.locator("#pmArchGo").click();
  await expect(page.locator("#msg")).toHaveText(/^That's the limit for now/);
  await expect(page.locator("#pmWhy")).toHaveValue("Added twice");                       // the reason stays for later
});

// ---------- care v2 PR 2 (plan docs/plans/pets-care-v2.md, Zee Q1–Q5, 2026-11-15); CC-7c: its stray parts left ----------
const T0 = new Date("2026-11-19T12:00:00Z");

test("care v2: new sightings (last 7 days) sit at the top of Manage; older ones stay below; Hide works in both", async ({ page }) => {
  await page.clock.setFixedTime(T0);
  const b = backend({ petsOn: true });
  b.st.sights[ID(3)] = SIGHTS();                                                         // 41: 5.7 days ago · 42: 7.2 days ago
  b.st.sights[ID(3)].push({ id: 43, note: "Clock skew", lat: null, lng: null, seen_at: "2026-11-20T12:00:00Z", by_me: false });
  await manageAny(page, b, ID(3));
  await expect(page.locator('#pmSight [data-sighting="43"]')).toHaveCount(1);           // a future time is never "new"
  await expect(page.locator("#pmSightNewH")).toHaveText("New sightings (last 7 days)");
  await expect(page.locator("#pmSightNew [data-sighting]")).toHaveCount(1);
  await expect(page.locator('#pmSightNew [data-sighting="41"]')).toContainText("Under the blue car");
  // UI review P3: the hide help never touches the list under it
  const gap = await page.locator("#pmSightNew").evaluate((ul) => ul.getBoundingClientRect().top - ul.previousElementSibling.getBoundingClientRect().bottom);
  expect(gap).toBeGreaterThanOrEqual(11.5);
  await expect(page.locator('#pmSight [data-sighting="42"]')).toHaveCount(1);
  const order = await page.locator("#pmSightNewH, #pmSight, #pmArch").evaluateAll((ls) => ls.map((l) => l.id));
  expect(order).toEqual(["pmSightNewH", "pmSight", "pmArch"]);                           // new sightings first
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/pm-care-v2.png", fullPage: true });
  page.once("dialog", (d) => d.accept());
  await page.locator('[data-pmhide="41"]').click();
  await expect(page.locator("#msg")).toHaveText("Sighting hidden.");
  await expect(page.locator("#pmSightNew")).toHaveCount(0);                              // no new ones: the section goes
  await expect(page.locator('#pmSight [data-sighting="42"]')).toHaveCount(1);
});

// ---- soft archive PR 2: Restore within 30 days, Hidden sightings + Show again ----
test("soft archive: Restore with days left; asks first naming the animal; back in the list; past 30 days = names only", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-20T12:00:00Z"));
  const b = backend();
  b.st.list.push(PET({ id: ID(9), name: "Pepper", home: HOME("ain-al-maha", "7"), status: "archived",
                       archived_at: "2026-11-01T09:00:00Z", restorable_until: "2026-12-01T09:00:00Z" }));
  b.st.list.push(PET({ id: ID(0), name: "Zed", home: HOME("seef-al-jubail", "5"), status: "archived",
                       archived_at: "2026-10-21T13:00:00Z", restorable_until: "2026-11-20T13:00:00Z" }));
  await openPets(page, b);
  await page.locator("#paShow-archived").click();
  await expect(page.locator("#paArchived > li > span")).toHaveText(["Old Tom", "Pepper", "Zed"]);   // never Smokey (a stray, CC-7c)
  await expect(page.locator(`li[data-pet="${ID(6)}"] button`)).toHaveCount(0);           // past the window
  await expect(page.locator(`li[data-pet="${ID(9)}"] .meta`)).toHaveText("11 days left to restore");
  await expect(page.locator(`li[data-pet="${ID(0)}"] .meta`)).toHaveText("Last day to restore");
  page.once("dialog", (d) => { expect(d.message()).toBe("Restore Pepper? Pepper goes back to their household's My Pets and to Pets for everyone. A missing alert doesn't come back."); d.dismiss(); });
  await page.locator(`#paRestore-${ID(9)}`).click();
  expect(b.st.restores).toEqual([]);
  page.once("dialog", (d) => d.accept());
  await page.locator(`#paRestore-${ID(9)}`).click();
  await expect(page.locator("#msg")).toHaveText("Pepper is back.");
  expect(b.st.restores).toEqual([{ p_pet: ID(9) }]);
  await expect(page.locator(`#paArchived li[data-pet="${ID(9)}"]`)).toHaveCount(0);
  await expect(page.locator("#paShow-archived")).toContainText("2");
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/pa-restore.png", fullPage: true });
  page.once("dialog", (d) => { expect(d.message()).toBe("Restore Zed? Zed goes back to their household's My Pets and to Pets for everyone. A missing alert doesn't come back."); d.accept(); });
  await page.locator(`#paRestore-${ID(0)}`).click();
  await page.locator("#paShow-all").click();
  await expect(page.locator(`li[data-pet="${ID(0)}"] [data-pamanage]`)).toBeVisible();
});

test("soft archive: Restore refused — expired / the household changed, or the home is full — said plainly; the list read again", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-20T12:00:00Z"));
  const b = backend();
  b.st.list.push(PET({ id: ID(9), name: "Pepper", home: HOME("ain-al-maha", "7"), status: "archived",
                       archived_at: "2026-11-01T09:00:00Z", restorable_until: "2026-12-01T09:00:00Z" }));
  const { calls } = await stubBackend(page, { rpc: b.rpc });
  await signIn(page);
  await page.goto("admin/?tab=pets&show=archived");
  b.st.restoreRaises = "TOO_MANY_PETS";
  page.on("dialog", (d) => d.accept());
  await page.locator(`#paRestore-${ID(9)}`).click();
  await expect(page.locator("#msg")).toHaveText("That household already lists 10 pets, so this one can't come back until they remove one.");
  await expect(page.locator(`#paRestore-${ID(9)}`)).toBeEnabled();
  b.st.restoreRaises = "RESTORE_EXPIRED";
  const before = calls.filter((c) => c.name === "jc_admin_pets_list").length;
  await page.locator(`#paRestore-${ID(9)}`).click();
  await expect(page.locator("#msg")).toHaveText("That animal can't be restored any more: the 30 days are over, or the household has changed.");
  await expect.poll(() => calls.filter((c) => c.name === "jc_admin_pets_list").length).toBe(before + 1);
});

test("soft archive: Hidden sightings on Manage — folded, Show again (no confirm), read again; gone when none are hidden", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-21T12:00:00Z"));
  const b = backend({ petsOn: true });
  b.st.sights[ID(3)] = SIGHTS();
  b.st.sights[ID(3)][1].hidden = true;
  const get = b.rpc.jc_pet_get; let gate = null;
  b.rpc.jc_pet_get = (a) => (gate ? gate.then(() => get(a)) : get(a));
  await manageAny(page, b, ID(3));
  await expect(page.locator("#pmSight li")).toHaveCount(1);
  await expect(page.locator("#pmHiddenToggle")).toHaveText("Hidden Sightings (1)");
  await expect(page.locator("#pmHiddenToggle")).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("#pmHidden")).toHaveCount(0);
  await page.locator("#pmHiddenToggle").click();
  await expect(page.locator("#pmHiddenToggle")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#pmHidden li")).toHaveCount(1);
  await expect(page.locator("#pmHidden li")).toContainText("lol fake");
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/pm-hidden.png", fullPage: true });
  let release; gate = new Promise((r) => { release = r; });                             // the re-read answers late
  await page.locator('[data-pmunhide="42"]').click();
  await expect(page.locator("#msg")).toHaveText("Sighting shown again.");
  expect(b.st.unhides).toEqual([{ p_sighting: 42 }]);
  await expect(page.locator('[data-pmunhide="42"]')).toHaveCount(0);                     // not left in the fold while reading (review M)
  gate = null; release();
  await expect(page.locator("#pmSight li")).toHaveCount(2);
  await expect(page.locator("#pmHiddenToggle")).toHaveCount(0);
  // hide → it lands under Hidden sightings
  page.once("dialog", (d) => d.accept());
  await page.locator('[data-pmhide="41"]').click();
  await expect(page.locator("#pmHiddenToggle")).toHaveText("Hidden Sightings (1)");
});

test("soft archive: Show again on one someone else already showed → read again, no error", async ({ page }) => {
  const b = backend({ petsOn: true });
  b.st.sights[ID(3)] = SIGHTS();
  b.st.sights[ID(3)][1].hidden = true;
  await manageAny(page, b, ID(3));
  await page.locator("#pmHiddenToggle").click();
  b.st.sights[ID(3)][1].hidden = false;                                                   // another organizer, meanwhile
  await page.locator('[data-pmunhide="42"]').click();
  await expect(page.locator("#msg")).toHaveText("Sighting shown again.");
  await expect(page.locator("#pmHiddenToggle")).toHaveCount(0);
});
