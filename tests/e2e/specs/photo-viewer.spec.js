// PV-1 — shared photo viewer (docs/plans/PV-photo-viewer.md). Tap a saved photo → full screen; close by button, Escape
// or a tap outside the photo (never the end of a swipe), focus back on the photo; several photos: "n of t", previous /
// next by button, arrow keys and swipe, mirrored in Arabic. List cards keep opening the pet.
const { test, expect } = require("@playwright/test");
const { stubBackend, ok } = require("./stub");
const { signIn, petsBackend, adminBackend, petId: ID } = require("./backends");

const loaded = (loc) => loc.evaluate((s) => !!(s.classList.contains("has") && s.querySelector("img") && s.querySelector("img").naturalWidth > 0));
const viewer = (page) => page.locator("#jcPhotoView");

async function open(page, { q = "", lang = "en" } = {}) {
  const b = petsBackend();
  b.st.pets.find((p) => p.name === "Rex").photo_path = "jubail/x/rex.jpg";
  b.st.pets.find((p) => p.name === "Luna").photo_path = "jubail/x/luna.jpg";
  await page.addInitScript((l) => { try { localStorage.setItem("jc_lang", l); } catch (e) {} }, lang);
  const stub = await stubBackend(page, { rpc: b.rpc, storage: b.storage });
  await signIn(page);
  await page.goto("pets/" + q);
  return stub;
}

test("the pet's own photo opens full screen; Close, Escape and a tap outside the photo close it, focus returns", async ({ page }) => {
  await open(page, { q: "?pet=" + ID(1) });
  const photo = page.locator(".pthero .ptview");
  await expect(photo).toHaveAttribute("aria-label", "View photo");
  await photo.click();
  await expect(viewer(page)).toBeVisible();
  await expect.poll(() => loaded(viewer(page).locator(".ptph.full"))).toBe(true);
  await expect(viewer(page).locator(".pvcount")).toHaveCount(0);          // one photo: no counter, no arrows
  await expect(viewer(page).locator("#pvNext")).toHaveCount(0);
  await expect(page.locator("#pvClose")).toBeFocused();
  if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + "/pv-open.png" });
  await page.locator("#pvClose").click();
  await expect(viewer(page)).toBeHidden();
  await expect(photo).toBeFocused();

  await photo.click();
  await page.keyboard.press("Escape");
  await expect(viewer(page)).toBeHidden();

  await photo.click();
  await viewer(page).locator(".ptph.full img").click();                    // on the photo: stays open
  await expect(viewer(page)).toBeVisible();
  const box = await viewer(page).locator(".pvstage").boundingBox();
  await page.mouse.click(box.x + 4, box.y + 4);                           // beside the photo: closes
  await expect(viewer(page)).toBeHidden();

  await photo.click();
  const head = await viewer(page).locator(".pvhead").boundingBox();
  await page.mouse.click(head.x + 8, head.y + head.height / 2);           // the dark header strip: closes too (review)
  await expect(viewer(page)).toBeHidden();
});

test("a list card keeps opening the pet — its photo isn't a separate button", async ({ page }) => {
  await open(page);
  const card = page.locator(`[data-open="${ID(1)}"]`);
  await expect(card.locator(".ptph[data-photo]")).toBeVisible();
  await expect(card.locator(".ptview")).toHaveCount(0);
  await card.locator(".ptph").click();
  await expect(page.locator(".pthero")).toBeVisible();
  await expect(viewer(page)).toHaveCount(0);
});

for (const lang of ["en", "ar"]) {
  test(`several photos: counter, buttons, arrow keys and swipe (mirrored in ${lang}); a swipe never closes it`, async ({ page }) => {
    await open(page, { q: "?pet=" + ID(1), lang });
    await expect(page.locator(".pthero .ptview")).toBeVisible();
    // two photos on one button, as Cats (CC-3) will render them
    await page.evaluate(() => {
      const d = document.createElement("div");
      d.innerHTML = jcPetPhotoHtml({ photo_path: "jubail/x/rex.jpg" }, 34, "tile", { view: ["jubail/x/rex.jpg", "jubail/x/luna.jpg"] });
      d.firstChild.id = "pvTwo"; document.querySelector("main").appendChild(d.firstChild);
    });
    const ar = lang === "ar", of = (n) => (ar ? `${n} من 2` : `${n} of 2`);
    const fwd = ar ? "ArrowLeft" : "ArrowRight", back = ar ? "ArrowRight" : "ArrowLeft";
    await page.locator("#pvTwo").click();
    const count = viewer(page).locator(".pvcount");
    await expect(count).toHaveText(of(1));
    await expect(page.locator("#pvPrev")).toBeDisabled();
    await page.locator("#pvNext").click();
    await expect(count).toHaveText(of(2));
    await expect(viewer(page).locator(".ptph.full")).toHaveAttribute("data-photo", "jubail/x/luna.jpg");
    await expect(page.locator("#pvNext")).toBeDisabled();
    await page.keyboard.press(back);
    await expect(count).toHaveText(of(1));
    await page.keyboard.press(fwd);
    await expect(count).toHaveText(of(2));
    // swipe toward "previous" (right in English, left in Arabic), ending on the dark area: changes photo, stays open
    const box = await viewer(page).locator(".pvstage").boundingBox(), y = box.y + 6;
    const [x0, x1] = ar ? [box.x + box.width - 20, box.x + 20] : [box.x + 20, box.x + box.width - 20];
    await page.mouse.move(x0, y); await page.mouse.down(); await page.mouse.move(x1, y, { steps: 5 }); await page.mouse.up();
    await expect(count).toHaveText(of(1));
    await expect(viewer(page)).toBeVisible();
    // a pinch (second finger down, fingers spread 120 px) neither changes the photo nor closes it (review)
    // both fingers travel toward "next" (mirrored in Arabic), so a broken guard — whichever finger it reads — moves to photo 2
    await viewer(page).evaluate((d, [x, y, s]) => {
      const st = d.querySelector(".pvstage"), ev = (type, id, primary, cx) => st.dispatchEvent(new PointerEvent(type,
        { bubbles: true, pointerId: id, isPrimary: primary, pointerType: "touch", clientX: cx, clientY: y }));
      ev("pointerdown", 1, true, x); ev("pointerdown", 2, false, x + 20 * s);
      ev("pointerup", 2, false, x - 120 * s); ev("pointerup", 1, true, x - 100 * s);
      st.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x - 100 * s, clientY: y }));
    }, [box.x + box.width / 2, y, ar ? -1 : 1]);
    await expect(count).toHaveText(of(1));
    await expect(viewer(page)).toBeVisible();
    // a short drag (too short to change photo) ending on the dark area: still not a closing tap
    await page.mouse.move(box.x + 20, y); await page.mouse.down(); await page.mouse.move(box.x + 45, y, { steps: 3 }); await page.mouse.up();
    await expect(count).toHaveText(of(1));
    await expect(viewer(page)).toBeVisible();
    if (process.env.SHOT_DIR) await page.screenshot({ path: process.env.SHOT_DIR + `/pv-two-${lang}.png` });
  });
}

test("Organizer Tools: a stray report's photo opens the viewer", async ({ page }) => {
  const ab = adminBackend({ scopes: ["pets"] });
  const RID = "66666666-ffff-4fff-8fff-000000000001";
  Object.assign(ab.rpc, {
    jc_admin_pets_list: () => ok([]),
    jc_pets_group_get: () => ok({ link: null }),
    jc_admin_stray_reports_list: () => ok([{ id: RID, species: "cat", note: "Thin ginger cat", lat: null, lng: null, place: null,
      state: "open", created_at: "2026-11-16T07:00:00Z", closed_at: null, photo_path: "testville/r/" + RID + "/a.jpg", pet: null,
      contact: null, reporter_home: null, reporter_left: true }]),
  });
  await stubBackend(page, { rpc: ab.rpc });
  await signIn(page);
  await page.goto("admin/?tab=pets");
  await page.locator("#paRepOpen").click();
  const photo = page.locator(`[data-report="${RID}"] .ptview`);
  await photo.click();
  await expect(viewer(page)).toBeVisible();
  await expect.poll(() => loaded(viewer(page).locator(".ptph.full"))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(viewer(page)).toBeHidden();
  await expect(photo).toBeFocused();
});
