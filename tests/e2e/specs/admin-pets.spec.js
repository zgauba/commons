// R5d-1 — Organizer Tools → Pets (plan docs/plans/R5d-pets-organizer.md): who sees the tab, the animals A–Z
// (strays first, then the owners' villages A–Z, then name — NF-3), the Archived group, the pets WhatsApp group
// link (members-only, the server's rule said before sending), the jump in from an animal's Admin button.
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
  PET({ id: ID(3), name: "Ginger", kind: "stray", care_state: "needs_help", territory: "Behind the mosque", photo_path: null, sightings_7d: 3 }),
  PET({ id: ID(4), name: "Bella", species: "dog", home: HOME("seef-al-jubail", "12") }),
  PET({ id: ID(5), name: "Archie", kind: "stray", care_state: "known_fine", territory: "The marina" }),
  PET({ id: ID(6), name: "Old Tom", kind: "stray", care_state: "rehomed", status: "archived" }),
  PET({ id: ID(7), name: "Mochi", home: HOME("ain-al-maha", "12") }),
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
    // R5d-2b: the server's rules (R5a): strays only, name + species for a new one; returns the card
    jc_admin_stray_save: (a) => {
      st.saves.push(a);
      if (st.hold) return st.hold.then(() => raise(st.saveRaises || "UNKNOWN"));   // answers late (review M1)
      if (st.saveRaises) return raise(st.saveRaises);
      let c = a.p_pet ? st.list.find((p) => p.id === a.p_pet) : null;
      if (a.p_pet && (!c || c.kind !== "stray")) return raise("NOT_FOUND");
      if (!c) { c = PET({ id: ID(8), kind: "stray", care_state: "under_care", photo_path: null }); st.list.push(c); }
      Object.assign(c, a.p_fields);
      return ok(c);
    },
    jc_pet_photo_begin: (a) => ok({ path: "jubail/" + a.p_pet + "/r1.jpg" }),
    jc_pet_photo_commit: (a) => {
      if (opts.commitRaises) return raise(opts.commitRaises);
      st.list.find((p) => p.id === a.p_pet).photo_path = "jubail/" + a.p_pet + "/r1.jpg";
      return ok({});
    },
    jc_pet_photo_remove: (a) => { st.removes.push(a.p_pet); st.list.find((p) => p.id === a.p_pet).photo_path = null; return ok({}); },
  });
  // R5d-3a: care (strays, active only, as the server); the log comes back only through jc_pet_get
  Object.assign(ab.rpc, {
    jc_pet_get: (a) => {
      if (opts.getRaises) return raise(opts.getRaises);
      if (st.getHold) {                                                              // this read answers late, with the log as it was
        const hold = st.getHold, then = JSON.parse(JSON.stringify(st.logs[a.p_pet] || [])); st.getHold = null;
        const c = st.list.find((p) => p.id === a.p_pet);
        return hold.then(() => ok(Object.assign({}, c, { sightings: [], care_log: then })));
      }
      const c = st.list.find((p) => p.id === a.p_pet && p.status === "active");
      return c ? ok(Object.assign({}, c, { sightings: (st.sights[c.id] || []).filter((s) => !s.hidden).map(({ hidden, ...s }) => s),
                                            care_log: c.kind === "stray" ? (st.logs[c.id] || []).slice() : null })) : raise("NOT_FOUND");
    },
    jc_admin_pet_care_set: (a) => {
      st.cares.push(a);
      const c = st.list.find((p) => p.id === a.p_pet && p.kind === "stray" && p.status === "active");
      if (!c) return raise("NOT_FOUND");
      if (st.careRaises) return raise(st.careRaises);
      const care = Object.assign({}, c.care || {});
      if (a.p_status === "unknown") delete care[a.p_item]; else care[a.p_item] = { s: a.p_status, d: a.p_date, n: a.p_note };
      c.care = care;
      const { status, created_at, updated_at, sightings_7d, ...card } = c;           // the card, not the admin row
      return ok(card);
    },
    jc_admin_pet_care_add: (a) => {
      st.adds.push(a);
      (st.logs[a.p_pet] = st.logs[a.p_pet] || []).unshift({ kind: a.p_kind, note: a.p_note, at: "2026-11-14T10:00:00Z" });
      return ok({ pet_id: a.p_pet, logged: true });
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
  st.saves = []; st.removes = []; st.cares = []; st.adds = []; st.logs = {}; st.sights = {}; st.hides = []; st.archives = [];
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

test("the animals: strays first, then villages A–Z, then name; chips; Archived apart, names only", async ({ page }) => {
  await openPets(page, backend());
  await expect(page.locator("#paOff")).toContainText("Pets is switched off for residents");
  await expect(page.locator("#admPanel h2.group")).toHaveText(["Strays · 2",
    "Ain Al Maha · 2", "Seef Al Jubail · 2"]);
  expect(await rowIds(page, "#paList-strays")).toEqual([ID(5), ID(3)]);              // Archie, Ginger
  expect(await rowIds(page, "#paList-ain-al-maha")).toEqual([ID(2), ID(7)]);         // Luna, Mochi
  expect(await rowIds(page, "#paList-seef-al-jubail")).toEqual([ID(4), ID(1)]);      // Bella, Rex
  const ginger = page.locator(`[data-pet="${ID(3)}"]`);
  await expect(ginger.locator(".chip")).toHaveText(["Needs help", "No photo", "Seen 3× this week"]);
  await expect(ginger.locator(".chip.warn")).toHaveText("Needs help");
  await expect(ginger).toContainText("Cat · Stray");
  await expect(ginger).toContainText("Behind the mosque");
  await expect(page.locator(`[data-pet="${ID(2)}"] .chip.miss`)).toHaveText("Missing");
  await expect(page.locator(`[data-pet="${ID(2)}"]`)).toContainText("Villa 7");
  await expect(page.locator(`[data-pet="${ID(2)}"] a`)).toHaveAttribute("href", "../pets/?pet=" + ID(2));
  await expect(page.locator("#paArchived")).toHaveCount(0);                        // archived sit under their own chip (OT-3)
  await page.locator("#paShow-archived").click();
  await expect(page.locator("#paArchived li")).toHaveText(["Old Tom"]);
  await expect(page.locator("#paArchived a, #paArchived button")).toHaveCount(0);   // past the 30 days (no restorable_until): names only
});

test("Pets on for residents: no switched-off notice; no animals says so", async ({ page }) => {
  await openPets(page, backend({ petsOn: true, list: [] }));
  await expect(page.locator("#paOff")).toHaveCount(0);
  await expect(page.locator("#paNone")).toHaveText("No animals yet.");
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
  page.once("dialog", (d) => { expect(d.message()).toContain("Send to someone else"); d.accept(); });
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

test("hostile names, territory and link text stay text", async ({ page }) => {
  const evil = '<img src=x onerror="window.__xss=1">"\'';
  await openPets(page, backend({ link: null, list: [PET({ id: ID(1), name: evil, kind: "stray", care_state: "under_care", territory: evil })] }));
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
test("chips: All · Strays · Needs help · Homes' pets · Missing · Archived with counts; each shows its own; kept in the address", async ({ page }) => {
  await openPets(page, backend());
  await expect(page.locator("#paChips button")).toHaveText(["All 6", "Strays 2", "Needs help 1", "Homes' pets 4", "Missing 1", "Archived 1"]);
  await expect(page.locator("#paShow-all")).toHaveAttribute("aria-pressed", "true");
  await page.locator("#paShow-strays").click();
  await expect(page.locator("#paShow-strays")).toBeFocused();
  expect(await rowIds(page, "#paListBox")).toEqual([ID(5), ID(3)]);
  await expect(page).toHaveURL(/tab=pets&show=strays/);
  await page.locator("#paShow-missing").click();
  expect(await rowIds(page, "#paListBox")).toEqual([ID(2)]);
  await page.locator("#paShow-homes").click();
  expect(await rowIds(page, "#paListBox")).toEqual([ID(2), ID(7), ID(4), ID(1)]);   // villages A–Z, then name
  await page.reload();
  await expect(page.locator("#paShow-homes")).toHaveAttribute("aria-pressed", "true");
});

test("an empty chip says so in words", async ({ page }) => {
  await openPets(page, backend({ list: [PET({ id: ID(1), name: "Rex", home: HOME("seef-al-jubail", "40") })] }));
  await page.locator("#paShow-missing").click();
  await expect(page.locator("#paNone")).toHaveText("No pet is missing right now.");
  await page.locator("#paShow-strays").click();
  await expect(page.locator("#paNone")).toHaveText("No strays yet.");
});

test("search: name, home, area or village narrows every count; the box keeps focus; asks the server nothing", async ({ page }) => {
  const b = backend();
  const { calls } = await stubBackend(page, { rpc: b.rpc });
  await signIn(page);
  await page.goto("admin/?tab=pets");
  await expect(page.locator("#paChips")).toBeVisible();
  const n = calls.length;
  const box = page.locator("#paSearch");
  await box.fill("mosque");                                                         // a stray's area
  expect(await rowIds(page, "#paListBox")).toEqual([ID(3)]);
  await expect(page.locator("#paChips button")).toHaveText(["All 1", "Strays 1", "Needs help 1", "Homes' pets 0", "Missing 0", "Archived 0"]);
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
  await expect(page.locator("#paNone")).toHaveText("No animals here match \u201czzz\u201d.");
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
  await expect(page.locator("#paGroupOpen small")).toHaveText("Set: residents can send missing-pet and stray reports to it");
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

// ---- R5d-2b: the stray editor (plan docs/plans/R5d-2-strays-editor.md) ----
async function jpeg(page) {
  const b64 = await page.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 1600; c.height = 1200;
    const g = c.getContext("2d"), gr = g.createLinearGradient(0, 0, 1600, 1200);
    gr.addColorStop(0, "#c58b4b"); gr.addColorStop(1, "#2d5a3d");
    g.fillStyle = gr; g.fillRect(0, 0, 1600, 1200);
    g.fillStyle = "#fff"; g.font = "160px sans-serif"; g.fillText("Ginger", 400, 650);
    return c.toDataURL("image/jpeg", 0.9).split(",")[1];
  });
  return { name: "IMG_0002.jpg", mimeType: "image/jpeg", buffer: Buffer.from(b64, "base64") };
}
const loaded = (loc) => loc.evaluate((s) => !!(s.classList.contains("has") && s.querySelector("img") && s.querySelector("img").naturalWidth > 0));
const saves = (calls) => calls.filter((c) => c.name === "jc_admin_stray_save").map((c) => c.args);
// R5d-3a (Zee Q2): Edit lives inside Manage — from the list, or from Manage itself (after a save it's back there)
async function editStray(page, id) {
  // after a save, Manage shows "Working…" while the list is read again: wait for it to settle on Manage or the list
  await expect(page.locator("#pmEdit, #paChips").first()).toBeVisible();
  if (!(await page.locator("#pmEdit").count())) await page.locator(`li[data-pet="${id}"] [data-pamanage]`).click();
  await page.locator("#pmEdit").click();
  await expect(page.locator("#peForm")).toBeVisible();
  // care v2 (Zee Q5): an existing stray's status changes on Manage (auto-logged), not here
  await expect(page.locator("#peCare")).toHaveCount(0);
  await expect(page.locator("#peCareManage")).toHaveText("To change how they're doing, use Manage: each change goes in the log.");
}

test("R5d-2b: Edit only on active strays (a household's pet is theirs); Add a Stray opens an empty form", async ({ page }) => {
  await openPets(page, backend());
  await expect(page.locator("#paListBox [data-pamanage]")).toHaveCount(6);                   // every active animal (R5d-3b)
  await page.locator(`li[data-pet="${ID(1)}"] [data-pamanage]`).click();                     // Rex (a home's): no Edit Details
  await expect(page.locator("#pmArch")).toBeVisible();
  await expect(page.locator("#pmEdit")).toHaveCount(0);
  await page.locator("#jcBackBtn").click();
  await page.locator("#paShow-archived").click();
  await expect(page.locator("#paListBox [data-pamanage]")).toHaveCount(0);                    // Old Tom: names only
  await page.locator("#paShow-all").click();
  await page.locator("#paNew").click();
  await expect(page.locator("h1")).toHaveText("Add a stray");
  await expect(page.locator("#peName")).toHaveValue("");
  await expect(page.locator("#peSpecies [aria-pressed=true]")).toHaveCount(0);
  await expect(page.locator("#peCare [aria-pressed=true]")).toHaveText("Under care");       // the server's default
  // Rehomed vs Archive, said where the choice is made (stray-care review, 2026-11-15): adding only, since care v2
  await expect(page.locator("#peCareHelp")).toContainText("To remove them for good, use Archive on Manage.");
  await expect(page.locator("#pePinState")).toHaveText("No spot set.");
  await expect(page.locator("#pePinClear")).toBeHidden();
  await page.locator("#peCancel").click();
  await expect(page.locator("#paChips")).toBeVisible();
});

test("R5d-2b: add a stray — name and kind asked for first; the exact fields; the photo after; back on the list, focused", async ({ page }) => {
  const b = backend();
  const { calls } = await stubBackend(page, { rpc: b.rpc });
  await signIn(page);
  await page.goto("admin/?tab=pets");
  await page.locator("#paNew").click();
  await page.locator("#peSave").click();
  await expect(page.locator("#msg")).toHaveText("Give the animal a name.");
  await page.locator("#peName").fill("  Pepper ");
  await page.locator("#peSave").click();
  await expect(page.locator("#msg")).toHaveText("Choose what kind of animal it is.");
  expect(saves(calls)).toEqual([]);
  await page.locator('[data-pesp="cat"]').click();
  await page.locator('[data-pecare="needs_help"]').click();
  await page.locator("#peArea").fill("By the marina steps");
  await page.locator("#pePinHere").click();
  await expect(page.locator("#pePinState")).toHaveText("Spot set.");
  await page.locator("#pePhotoIn").setInputFiles(await jpeg(page));
  await expect(page.locator("#pePhotoNew")).toBeVisible();
  await expect(page.locator("#pePhotoHelp")).toHaveText("Photo ready — it's added when you save.");
  expect(calls.filter((c) => c.kind === "storage" || /photo/.test(c.name))).toEqual([]);      // nothing leaves before Save
  await page.locator("#peSave").click();
  await expect(page.locator("#msg")).toHaveText("Pepper was added.");
  const s = saves(calls);
  expect(s).toHaveLength(1);
  expect(s[0].p_pet).toBeNull();
  const { territory_lat, territory_lng, ...rest } = s[0].p_fields;
  expect(rest).toEqual({ name: "Pepper", species: "cat", care_state: "needs_help", territory: "By the marina steps" });   // no empty description
  expect(typeof territory_lat).toBe("number");
  expect(typeof territory_lng).toBe("number");
  const order = calls.filter((c) => /^jc_(admin_stray_save|pet_photo_)/.test(c.name) || c.name === "upload").map((c) => c.name);
  expect(order).toEqual(["jc_admin_stray_save", "jc_pet_photo_begin", "upload", "jc_pet_photo_commit"]);
  const up = calls.filter((c) => c.name === "upload").pop().args;
  expect(up.path).toBe("jubail/" + ID(8) + "/r1.jpg");
  expect(up.jpeg).toBe(true);
  const li = page.locator(`li[data-pet="${ID(8)}"]`);
  await expect(li).toHaveClass(/focus/);
  await expect(li).not.toContainText("No photo");
});

test("R5d-2b: an edit sends only what changed — a rename alone; a cleared area is null; a cleared spot is a pair of nulls", async ({ page }) => {
  const list = ANIMALS();
  Object.assign(list.find((p) => p.id === ID(3)), { description: "Ginger tabby, torn left ear", territory_lat: 24.531, territory_lng: 54.432 });
  const b = backend({ list });
  const { calls } = await stubBackend(page, { rpc: b.rpc });
  await signIn(page);
  await page.goto("admin/?tab=pets");
  await editStray(page, ID(3));
  await expect(page.locator("h1")).toHaveText("Edit Ginger");
  await expect(page.locator("#peDesc")).toHaveValue("Ginger tabby, torn left ear");
  await expect(page.locator("#peArea")).toHaveValue("Behind the mosque");
  await expect(page.locator("#pePinState")).toHaveText("Spot set.");
  await page.locator("#peName").fill("Ginger Tom");
  await page.locator("#peSave").click();
  await expect(page.locator("#msg")).toHaveText("Ginger Tom is saved.");
  expect(saves(calls)).toEqual([{ p_pet: ID(3), p_fields: { name: "Ginger Tom" } }]);
  await editStray(page, ID(3));
  await page.locator("#peArea").fill("   ");
  await page.locator("#pePinClear").click();
  await expect(page.locator("#pePinState")).toHaveText("No spot set.");
  await page.locator("#peSave").click();
  await expect(page.locator("#msg")).toHaveText("Ginger Tom is saved.");
  expect(saves(calls)[1]).toEqual({ p_pet: ID(3), p_fields: { territory: null, territory_lat: null, territory_lng: null } });
  await editStray(page, ID(3));
  await page.locator("#peSave").click();                                                 // nothing changed: nothing sent
  await expect(page.locator("#msg")).toHaveText("Ginger Tom is saved.");
  expect(saves(calls)).toHaveLength(2);
});

test("R5d-2b: a saved photo shows in Organizer Tools (CSP); Remove asks first, then the row says No photo", async ({ page }) => {
  const b = backend();
  const { calls } = await stubBackend(page, { rpc: b.rpc });
  const blocked = [];
  page.on("console", (m) => { if (/Content Security Policy|Refused to load/i.test(m.text())) blocked.push(m.text()); });
  await signIn(page);
  await page.goto("admin/?tab=pets");
  await editStray(page, ID(5));                    // Archie has p/x.jpg
  const ph = page.locator("#pePhotoBox .ptph[data-photo]");
  await expect.poll(() => loaded(ph)).toBe(true);
  expect(calls.filter((c) => c.name === "image").map((c) => c.args)).toEqual([{ bucket: "pet-photos", path: "p/x.jpg" }]);
  page.once("dialog", (d) => { expect(d.message()).toBe("Remove Archie's photo? Neighbors will stop seeing it."); d.dismiss(); });
  await page.locator("#pePhotoRemove").click();
  expect(b.st.removes).toEqual([]);
  page.once("dialog", (d) => d.accept());
  await page.locator("#pePhotoRemove").click();
  await expect(page.locator("#msg")).toHaveText("Archie's photo is removed.");
  expect(b.st.removes).toEqual([ID(5)]);
  await expect(page.locator("#pePhotoRemove")).toHaveCount(0);
  await page.locator("#peCancel").click();
  await expect(page.locator("h1")).toHaveText("Archie");                                // back on Manage
  await page.locator("#jcBackBtn").click();
  await expect(page.locator(`li[data-pet="${ID(5)}"]`)).toContainText("No photo");
  expect(blocked).toEqual([]);
});

test("R5d-2b: a photo that fails keeps the details and says so; one Save at a time", async ({ page }) => {
  const b = backend({ commitRaises: "PHOTO_UPLOAD_FAILED" });
  const { calls } = await stubBackend(page, { rpc: b.rpc });
  await signIn(page);
  await page.goto("admin/?tab=pets");
  await editStray(page, ID(3));
  await page.locator("#peDesc").fill("Shy, ginger");
  await page.locator("#pePhotoIn").setInputFiles(await jpeg(page));
  await expect(page.locator("#pePhotoNew")).toBeVisible();
  await page.locator("#peSave").dblclick();
  await expect(page.locator("#msg")).toHaveText("Ginger is saved, but the photo didn't upload: The upload didn't go through. Check your connection. Try again with Edit.");
  expect(saves(calls)).toEqual([{ p_pet: ID(3), p_fields: { description: "Shy, ginger" } }]);
  expect(calls.filter((c) => c.name === "jc_pet_photo_begin")).toHaveLength(1);
});

test("R5d-2b: an animal archived meanwhile → back to the list, said plainly; a bad field stays on the form", async ({ page }) => {
  const b = backend();
  await stubBackend(page, { rpc: b.rpc });
  await signIn(page);
  await page.goto("admin/?tab=pets");
  await editStray(page, ID(3));
  b.st.list.find((p) => p.id === ID(3)).kind = "owned";                                     // the server now refuses it
  await page.locator("#peName").fill("Ginger 2");
  await page.locator("#peSave").click();
  await expect(page.locator("#paChips")).toBeVisible();
  await expect(page.locator("#msg")).toHaveText("That animal isn't in the list any more.");
  b.st.saveRaises = "BAD_FIELDS";
  await editStray(page, ID(5));
  await page.locator("#peName").fill("Archie 2");
  await page.locator("#peSave").click();
  await expect(page.locator("#msg")).toHaveText(/Check the name \(up to 40 characters\)/);
  await expect(page.locator("#peName")).toHaveValue("Archie 2");
  await expect(page.locator("#peSave")).toBeEnabled();
});

test("R5d-2b: switching language keeps what's typed; the form in Arabic", async ({ page }) => {
  await openPets(page, backend());
  await page.locator("#paNew").click();
  await page.locator("#peName").fill("Pepper");
  await page.locator('[data-pesp="dog"]').click();
  await page.locator("#peDesc").fill("Brown, white paws");
  await page.locator("#langBtn").click();
  await expect(page.locator("h1")).toHaveText("إضافة حيوان ضالّ");
  await expect(page.locator("#peName")).toHaveValue("Pepper");
  await expect(page.locator("#peDesc")).toHaveValue("Brown, white paws");
  await expect(page.locator('[data-pesp="dog"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#pePinHere")).toHaveText("المكان هنا");
});

test("R5d-2b review M1: a save that fails after a language switch gives every control back (photo too)", async ({ page }) => {
  const b = backend();
  let release;
  b.st.hold = new Promise((r) => { release = r; });
  b.st.saveRaises = "BAD_FIELDS";
  await stubBackend(page, { rpc: b.rpc });
  await signIn(page);
  await page.goto("admin/?tab=pets");
  await editStray(page, ID(5));
  await page.locator("#peName").fill("Archie 2");
  await page.locator("#peSave").click();
  await page.locator("#langBtn").click();                                                 // redrawn while saving
  await expect(page.locator("#pePhotoIn")).toBeDisabled();
  release();
  await expect(page.locator("#msg")).toContainText("هناك خطأ في النموذج");
  await expect(page.locator("#pePhotoIn")).toBeEnabled();
  await expect(page.locator("#pePhotoRemove")).toBeEnabled();
  await expect(page.locator("#peSave")).toBeEnabled();
  await expect(page.locator("#peName")).toHaveValue("Archie 2");
});

// ---- R5d-3a: Manage one animal — care record + care log (plan docs/plans/R5d-3-care-moderation.md) ----
async function manageAny(page, b, id) {
  const r = await stubBackend(page, { rpc: b.rpc });
  await signIn(page);
  await page.goto("admin/?tab=pets");
  await page.locator(`li[data-pet="${id}"] [data-pamanage]`).click();
  await expect(page.locator("#pmArch")).toBeVisible();
  return r;
}
async function manage(page, b, id, q) {
  const r = await stubBackend(page, { rpc: b.rpc });
  await signIn(page);
  await page.goto("admin/?tab=pets" + (q || ""));
  await page.locator(`li[data-pet="${id}"] [data-pamanage]`).click();
  await expect(page.locator("#pmCare")).toBeVisible();
  return r;
}

test("R5d-3a: Manage on active animals; a stray's Admin button opens Manage; Back keeps the chip and search", async ({ page }) => {
  const b = backend();
  await stubBackend(page, { rpc: b.rpc });
  await signIn(page);
  await page.goto("admin/?tab=pets&pet=" + ID(3));                                        // Ginger (stray) from the Pets page
  await expect(page.locator("h1")).toHaveText("Ginger");
  await expect(page.locator("#pmCare li")).toHaveCount(4);
  await expect(page.locator("#pmOff")).toBeVisible();                                     // Pets off: the log waits (Zee Q1 = A)
  await page.locator("#jcBackBtn").click();
  await page.locator("#paShow-strays").click();
  await page.locator("#paSearch").fill("arch");
  await expect(page.locator("#paListBox [data-pamanage]")).toHaveCount(1);
  await page.locator(`li[data-pet="${ID(5)}"] [data-pamanage]`).click();
  await expect(page.locator("h1")).toHaveText("Archie");
  await page.locator("#jcBackBtn").click();
  await expect(page.locator("#paShow-strays")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#paSearch")).toHaveValue("arch");
  await expect(page.locator(`li[data-pet="${ID(5)}"]`)).toBeFocused();
  await page.locator("#paSearch").fill("");
  await page.locator("#paShow-all").click();
  await expect(page.locator(`li[data-pet="${ID(1)}"] [data-pamanage]`)).toHaveCount(1);  // Rex: a home's pet (moderation, 3b)
});

test("R5d-3a: care record — one item at a time, the exact call, redrawn from the card; a status is needed; Clear asks first", async ({ page }) => {
  const b = backend();
  const { calls } = await manage(page, b, ID(3));
  await expect(page.locator('#pmCare [data-care="sterilized"] .st')).toHaveText("Not recorded");
  await page.locator('[data-pmcare="sterilized"]').click();
  await page.locator("#pmCareSave").click();
  await expect(page.locator("#msg")).toHaveText("Choose a status, or tap Clear to remove the item.");
  await expect(page.locator("#pmCareClear")).toHaveCount(0);                             // nothing recorded: nothing to clear
  await page.locator('[data-pmst="done"]').click();
  await expect(page.locator("#msg")).toHaveText("");                                    // answered: the error goes
  await page.locator("#pmDate").fill("2026-10-02");
  await page.locator("#pmNote").fill("  Dr. Amal, Marina Vet ");
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/pm-care-edit.png", fullPage: true });
  await page.locator("#pmCareSave").click();
  await expect(page.locator("#msg")).toHaveText("Sterilized: saved.");
  expect(b.st.cares).toEqual([{ p_pet: ID(3), p_item: "sterilized", p_status: "done", p_date: "2026-10-02", p_note: "Dr. Amal, Marina Vet" }]);
  await expect(page.locator('#pmCare [data-care="sterilized"] .st')).toHaveText(/^Done · /);
  await expect(page.locator('#pmCare [data-care="sterilized"] .note')).toHaveText("Dr. Amal, Marina Vet");
  await expect(page.locator('[data-pmcare="sterilized"]')).toBeFocused();
  await page.locator('[data-pmcare="sterilized"]').click();
  await expect(page.locator("#pmDate")).toHaveValue("2026-10-02");                        // the stored values, to change
  page.once("dialog", (d) => { expect(d.message()).toBe("Clear “Sterilized” for Ginger? It goes back to “Not recorded”."); d.dismiss(); });
  await page.locator("#pmCareClear").click();
  expect(b.st.cares).toHaveLength(1);
  page.once("dialog", (d) => d.accept());
  await page.locator("#pmCareClear").click();
  await expect(page.locator("#msg")).toHaveText("Sterilized: cleared.");
  expect(b.st.cares[1]).toEqual({ p_pet: ID(3), p_item: "sterilized", p_status: "unknown", p_date: null, p_note: null });
  await expect(page.locator('#pmCare [data-care="sterilized"] .st')).toHaveText("Not recorded");
  expect(calls.filter((c) => c.name === "jc_pet_get")).toEqual([]);                      // Pets off: never asked
});

test("R5d-3a: care log (Pets on) — a line is added, the log is read again, the note is required, one Add at a time", async ({ page }) => {
  const b = backend({ petsOn: true });
  b.st.logs[ID(3)] = [{ kind: "vet", note: "Ear cleaned", at: "2026-11-01T09:00:00Z" }];
  const { calls } = await manage(page, b, ID(3));
  await expect(page.locator("#pmOff")).toHaveCount(0);
  await expect(page.locator("#pmLog li")).toHaveCount(1);
  await expect(page.locator("#pmLog li").first()).toContainText("Vet visit");
  // the log is public: the note box says so (stray-care review, 2026-11-15)
  await expect(page.locator("#pmLogPublic")).toHaveText("Residents see the log on the animal's page.");
  await expect(page.locator("#pmLogNote")).toHaveAttribute("aria-describedby", "pmLogPublic");
  await page.locator('[data-pmlog="note"]').click();                       // a Note IS the text: still required
  await page.locator("#pmLogAdd").click();
  await expect(page.locator("#msg")).toHaveText("Write a short note for the log.");
  await expect(page.locator("#pmLogNote")).toBeFocused();
  await page.locator('[data-pmlog="fed"]').click();
  await page.locator("#pmLogNote").fill("  Fed at the marina steps, ate well ");
  await page.locator("#pmLogAdd").dblclick();
  await expect(page.locator("#msg")).toHaveText("Added to the log.");
  expect(b.st.adds).toEqual([{ p_pet: ID(3), p_kind: "fed", p_note: "Fed at the marina steps, ate well" }]);
  await expect(page.locator("#pmLog li")).toHaveCount(2);
  await expect(page.locator("#pmLog li").first()).toContainText("Fed at the marina steps, ate well");
  await expect(page.locator("#pmLogNote")).toHaveValue("");
  expect(calls.filter((c) => c.name === "jc_pet_get")).toHaveLength(2);                  // opened + after the add
  // quick log (2026-11-15): Fed / Vet visit need no note — one tap, sent as null
  await expect(page.locator("#pmLogForm label")).toContainText("Note (optional for Fed and Vet visit)");
  await page.locator('[data-pmlog="vet"]').click();
  await page.locator("#pmLogAdd").click();
  await expect(page.locator("#msg")).toHaveText("Added to the log.");
  expect(b.st.adds[1]).toEqual({ p_pet: ID(3), p_kind: "vet", p_note: null });
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/pm-log.png", fullPage: true });
});

test("R5d-3a: with Pets off the log can still be added to; the notice says when it shows", async ({ page }) => {
  const b = backend();
  await manage(page, b, ID(5));
  await expect(page.locator("#pmOff")).toContainText("the care log and sightings show here once it's switched on");
  await page.locator("#pmLogNote").fill("Seen limping");
  await page.locator('[data-pmlog="note"]').click();
  await page.locator("#pmLogAdd").click();
  await expect(page.locator("#msg")).toHaveText("Added to the log.");
  expect(b.st.adds).toEqual([{ p_pet: ID(5), p_kind: "note", p_note: "Seen limping" }]);
  await expect(page.locator("#pmLog")).toHaveCount(0);
});

test("R5d-3a: Edit Details from Manage — Save and Cancel come back to Manage", async ({ page }) => {
  const b = backend();
  const { calls } = await manage(page, b, ID(3));
  await page.locator("#pmEdit").click();
  await page.locator("#peCancel").click();
  await expect(page.locator("h1")).toHaveText("Ginger");
  await page.locator("#pmEdit").click();
  await page.locator("#peName").fill("Ginger Tom");
  await page.locator("#peSave").click();
  await expect(page.locator("h1")).toHaveText("Ginger Tom");
  await expect(page.locator("#msg")).toHaveText("Ginger Tom is saved.");
  expect(saves(calls)).toEqual([{ p_pet: ID(3), p_fields: { name: "Ginger Tom" } }]);
});

test("R5d-3a: an animal archived meanwhile → the list, said plainly; a bad date stays on the form", async ({ page }) => {
  const b = backend();
  await manage(page, b, ID(3));
  b.st.careRaises = "BAD_FIELDS";
  await page.locator('[data-pmcare="dewormed"]').click();
  await page.locator('[data-pmst="due"]').click();
  await page.locator("#pmCareSave").click();
  await expect(page.locator("#msg")).toHaveText("Check the date (from 2000, at most two years ahead) and the note (up to 120 characters).");
  await expect(page.locator('[data-pmst="due"]')).toHaveAttribute("aria-pressed", "true");    // the draft stays
  b.st.careRaises = null;
  b.st.list.find((p) => p.id === ID(3)).status = "archived";
  await page.locator("#pmCareSave").click();
  await expect(page.locator("#paChips")).toBeVisible();
  await expect(page.locator("#msg")).toHaveText("That animal isn't in the list any more.");
});

test("R5d-3a: Manage in Arabic keeps an open item's draft", async ({ page }) => {
  await manage(page, backend(), ID(3));
  await page.locator('[data-pmcare="vaccination"]').click();
  await page.locator('[data-pmst="due"]').click();
  await page.locator("#pmNote").fill("Rabies booster");
  await page.locator("#langBtn").click();
  await expect(page.locator("#pmStateH")).toHaveText("كيف حاله");                           // care v2: the picker heads Manage
  await expect(page.locator("#view h2.group").nth(1)).toHaveText("سجل الرعاية");
  await expect(page.locator("#pmNote")).toHaveValue("Rabies booster");
  await expect(page.locator('[data-pmst="due"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#pmLogAdd")).toHaveText("إضافة إلى السجل");
});

test("R5d-3a review M1: the list can't be re-read after Edit Details → Retry and why, never 'Working…' forever", async ({ page }) => {
  const b = backend();
  await manage(page, b, ID(3));
  await page.locator("#pmEdit").click();
  await page.locator("#peName").fill("Ginger Tom");
  b.st.listRaises = "UNKNOWN";
  await page.locator("#peSave").click();
  await expect(page.locator("#pmListRetry")).toBeVisible();
  b.st.listRaises = null;
  await page.locator("#pmListRetry").click();
  await expect(page.locator("h1")).toHaveText("Ginger Tom");
});

test("R5d-3a review M3: a log line added while the first read is on its way still shows when it lands", async ({ page }) => {
  const b = backend({ petsOn: true });
  let release;
  b.st.getHold = new Promise((r) => { release = r; });
  await stubBackend(page, { rpc: b.rpc });
  await signIn(page);
  await page.goto("admin/?tab=pets");
  await page.locator(`li[data-pet="${ID(3)}"] [data-pamanage]`).click();
  await page.locator("#pmLogNote").fill("Fed by the mosque");
  await page.locator("#pmLogAdd").click();
  await expect(page.locator("#msg")).toHaveText("Added to the log.");
  await expect(page.locator("#pmLog li")).toHaveCount(1);                              // the fresh read
  release();                                                                            // the old read (empty log) lands late
  await page.waitForTimeout(300);
  await expect(page.locator("#pmLog li")).toHaveCount(1);
  await expect(page.locator("#pmLog li").first()).toContainText("Fed by the mosque");
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
  page.once("dialog", (d) => { expect(d.message()).toBe("Hide this sighting? Residents stop seeing it. You can show it again from Hidden sightings below."); d.dismiss(); });
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
  await manageAny(page, b, ID(5));                                                      // Archie, a stray
  await expect(page.locator("#pmArch")).toContainText("Archive Archie if they've passed away, been rehomed for good, or were added twice.");
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
  await expect(page.locator("#msg")).toHaveText("Archie is archived.");
  expect(b.st.archives).toEqual([{ p_pet: ID(5), p_reason: "Added twice — same cat as Ginger" }]);
  await expect(page.locator("#paChips")).toBeVisible();
  await expect(page.locator("#paShow-archived")).toContainText("2");
  await expect(page.locator(`li[data-pet="${ID(5)}"]`)).toHaveCount(0);
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

test("care v2: Manage shows an auto status row by its label; a log add over the limit says its own numbers", async ({ page }) => {
  const b = backend({ petsOn: true });
  b.st.logs[ID(3)] = [{ kind: "state", note: null, state: "rehomed", at: "2026-11-15T09:00:00Z" },
                      { kind: "state", note: "Moved to the clinic garden", state: null, at: "2026-11-14T09:00:00Z" }];
  b.rpc.jc_admin_pet_care_add = () => raise("RATE_LIMITED");
  await manage(page, b, ID(3));
  await expect(page.locator("#pmLog li")).toHaveCount(2);
  await expect(page.locator("#pmLog li").first()).toContainText("Status change");
  await expect(page.locator("#pmLog li").first()).toContainText("Rehomed");
  await expect(page.locator("#pmLog li").nth(1)).toContainText("Moved to the clinic garden");
  await page.locator('[data-pmlog="fed"]').click();
  await page.locator("#pmLogAdd").click();
  await expect(page.locator("#msg")).toHaveText("That's the limit for now: 60 log entries an hour for each organizer, 200 for the whole community. Try again in an hour.");
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

// ---------- care v2 PR 2 (plan docs/plans/pets-care-v2.md, Zee Q1–Q5, 2026-11-15) ----------
const T0 = new Date("2026-11-19T12:00:00Z");
const ago = (days) => new Date(T0.getTime() - days * 864e5).toISOString();

test("care v2: How they're doing on Manage — one tap, the exact call, the log read again; the same state sends nothing", async ({ page }) => {
  const b = backend({ petsOn: true });
  const { calls } = await manage(page, b, ID(3));                                       // Ginger, needs help
  await expect(page.locator("#pmState [aria-pressed=true]")).toHaveText("Needs help");
  await expect(page.locator("#pmStateHelp")).toContainText("Each change goes in the log residents see.");
  await page.locator('[data-pmstate="needs_help"]').click();                            // already: nothing sent
  await page.locator('[data-pmstate="under_care"]').dblclick();
  await expect(page.locator("#msg")).toHaveText("Ginger: Under care. Added to the log.");
  expect(saves(calls)).toEqual([{ p_pet: ID(3), p_fields: { care_state: "under_care" } }]);
  await expect(page.locator("#pmState [aria-pressed=true]")).toHaveText("Under care");
  await expect(page.locator('[data-pmstate="under_care"]')).toBeFocused();
  expect(calls.filter((c) => c.name === "jc_pet_get")).toHaveLength(2);                  // opened + after the change
  await page.locator("#jcBackBtn").click();
  await expect(page.locator(`li[data-pet="${ID(3)}"] .chip`).first()).toHaveText("Under care");   // the list agrees
});

test("care v2: a household's pet has no state picker; a stray's still works with Pets off; a failure says why", async ({ page }) => {
  const b = backend();
  const { calls } = await manageAny(page, b, ID(2));                                     // Luna, a home's pet
  await expect(page.locator("#pmState")).toHaveCount(0);
  await page.locator("#jcBackBtn").click();
  await page.locator(`li[data-pet="${ID(5)}"] [data-pamanage]`).click();                 // Archie, Pets off
  await page.locator('[data-pmstate="rehomed"]').click();
  await expect(page.locator("#msg")).toHaveText("Archie: Rehomed. Added to the log.");
  expect(calls.filter((c) => c.name === "jc_pet_get")).toEqual([]);                      // Pets off: never asked
  b.st.saveRaises = "UNKNOWN";
  await page.locator('[data-pmstate="known_fine"]').click();
  await expect(page.locator("#msg")).not.toHaveText(/Added to the log/);
  await expect(page.locator("#pmState [aria-pressed=true]")).toHaveText("Rehomed");     // unchanged on a failure
  await expect(page.locator('[data-pmstate="known_fine"]')).toBeEnabled();
  b.st.saveRaises = "NOT_FOUND";                                                         // archived meanwhile
  await page.locator('[data-pmstate="known_fine"]').click();
  await expect(page.locator("#paChips")).toBeVisible();
  await expect(page.locator("#msg")).toHaveText("That animal isn't in the list any more.");
});

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
  await expect(page.locator('#pmSight [data-sighting="42"]')).toHaveCount(1);
  const order = await page.locator("#pmSightNewH, #pmStateH, #pmCare, #pmSight").evaluateAll((ls) => ls.map((l) => l.id));
  expect(order).toEqual(["pmSightNewH", "pmStateH", "pmCare", "pmSight"]);               // new sightings first
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/pm-care-v2.png", fullPage: true });
  page.once("dialog", (d) => d.accept());
  await page.locator('[data-pmhide="41"]').click();
  await expect(page.locator("#msg")).toHaveText("Sighting hidden.");
  await expect(page.locator("#pmSightNew")).toHaveCount(0);                              // no new ones: the section goes
  await expect(page.locator('#pmSight [data-sighting="42"]')).toHaveCount(1);
});

test("care v2: the Needs help chip shows active strays that need help, kept in the address", async ({ page }) => {
  await openPets(page, backend());
  await page.locator("#paShow-help").click();
  expect(await rowIds(page, "#paListBox")).toEqual([ID(3)]);
  await expect(page).toHaveURL(/tab=pets&show=help/);
  await page.reload();
  await expect(page.locator("#paShow-help")).toHaveAttribute("aria-pressed", "true");
});

test("care v2: an empty Needs help chip says so in words", async ({ page }) => {
  const list = ANIMALS().map((p) => (p.id === ID(3) ? Object.assign(p, { care_state: "under_care" }) : p));
  await openPets(page, backend({ list }), "&show=help");
  await expect(page.locator("#paNone")).toHaveText("No animal needs help right now.");
});

test("care v2: Not fed (2+ days, only once ever fed) and Not seen (7+ days) on active strays that aren't rehomed", async ({ page }) => {
  await page.clock.setFixedTime(T0);
  const list = ANIMALS();
  Object.assign(list.find((p) => p.id === ID(3)), { last_fed_at: ago(3.5), last_contact_at: ago(8.2) });   // both
  Object.assign(list.find((p) => p.id === ID(5)), { last_fed_at: ago(1.5), last_contact_at: ago(1.5) });   // fed yesterday: none
  list.push(PET({ id: ID(8), name: "Pip", kind: "stray", care_state: "under_care", last_fed_at: null, last_contact_at: null }),   // never: none
            PET({ id: ID(9), name: "Rosie", kind: "stray", care_state: "rehomed", last_fed_at: ago(30), last_contact_at: ago(30) }));   // rehomed: none
  await openPets(page, backend({ list }));
  const chips = (id) => page.locator(`li[data-pet="${id}"] .chip`);
  await expect(chips(ID(3)).filter({ hasText: "Not fed in 3 days" })).toHaveClass(/warn/);
  await expect(chips(ID(3)).filter({ hasText: "Not seen in 8 days" })).toHaveCount(1);
  for (const id of [ID(5), ID(8), ID(9)]) await expect(chips(id).filter({ hasText: /Not (fed|seen)/ })).toHaveCount(0);
  await page.locator("#langBtn").click();
  await expect(chips(ID(3)).filter({ hasText: "أيام بلا إطعام: 3" })).toHaveCount(1);
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/pa-care-chips.png", fullPage: true });
});

// ---- soft archive PR 2: Restore within 30 days, Hidden sightings + Show again ----
test("soft archive: Restore with days left; asks first naming the animal; back in the list; past 30 days = names only", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-20T12:00:00Z"));
  const b = backend();
  b.st.list.push(PET({ id: ID(9), name: "Pepper", home: HOME("ain-al-maha", "7"), status: "archived",
                       archived_at: "2026-11-01T09:00:00Z", restorable_until: "2026-12-01T09:00:00Z" }));
  b.st.list.push(PET({ id: ID(0), name: "Zed", kind: "stray", status: "archived",
                       archived_at: "2026-10-21T13:00:00Z", restorable_until: "2026-11-20T13:00:00Z" }));
  await openPets(page, b);
  await page.locator("#paShow-archived").click();
  await expect(page.locator("#paArchived > li > span")).toHaveText(["Old Tom", "Pepper", "Zed"]);
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
  page.once("dialog", (d) => { expect(d.message()).toBe("Restore Zed? Residents see Zed in Pets again. A missing alert doesn't come back."); d.accept(); });
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
  await expect(page.locator("#pmHiddenToggle")).toHaveText("Hidden sightings (1)");
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
  await expect(page.locator("#pmHiddenToggle")).toHaveText("Hidden sightings (1)");
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
