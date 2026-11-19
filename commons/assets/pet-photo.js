/* Pet photos, shared by the Pets page and Organizer Tools (R5d-2a: moved out of pets.js unchanged).
   Load after api.js (rpc, jcDb, jcErr, JC_URL, esc, jcObj) and icons.js (jcIcon), before the page script.
   A page that shows photos needs the signed pet-photos origin in its CSP img-src. */

/* ---------- photos (R5c) ----------
   Private bucket: the server picks the path (jc_pet_photo_begin), the household uploads, the server checks and
   swaps it in (jc_pet_photo_commit). Shown through short-lived signed URLs, asked once per path per page view;
   until (or unless) one loads, the paw stays. Photos are shrunk on the phone first (≤ 1280 px JPEG). */
var JC_PET_PHOTO_MAX = 1280, JC_PET_PHOTO_TTL = 3600;
var JC_PET_PHOTO_IN_MAX = 25e6, JC_PET_PHOTO_PX_MAX = 50e6;        /* refuse before decoding: a huge file / bitmap can kill the tab */
var jcPetPhotoUrls = {}, jcPetPhotoAsked = {};                 /* path → { url, exp } · path → true while being signed */
/* opt.view: the saved photo becomes a button that opens the photo viewer (PV-1) — true, or a list of paths (several
   photos, this one first). Never inside another button (a list card): the card opens the pet instead. */
function jcPetPhotoHtml(p, size, cls, opt){
  var path = typeof p.photo_path === "string" && p.photo_path ? p.photo_path : null;
  if (!path) return cls === "tile" ? '<span class="ptph tile">' + jcIcon("pets", size) + '</span>' : jcIcon("pets", size);
  var h = '<span class="ptph ' + cls + '" data-photo="' + esc(path) + '">' + jcIcon("pets", size) + '</span>';
  if (!opt || !opt.view) return h;
  var paths = Array.isArray(opt.view) ? opt.view : [path];
  return '<button type="button" class="ptview ' + cls + '" data-view="' + esc(JSON.stringify(paths)) + '" data-view-at="' +
    Math.max(0, paths.indexOf(path)) + '" aria-label="' + esc(jcT("pv_view")) + '">' + h + '</button>';
}
/* a signed URL is good for an hour; re-sign 5 minutes early so a long-open page never keeps a dead one (review) */
function jcPetPhotoUrl(path){ var u = jcPetPhotoUrls[path]; return u && u.exp > Date.now() ? u.url : null; }
function jcPetPhotoPlace(){
  Array.prototype.forEach.call(document.querySelectorAll("[data-photo]"), function(s){
    var path = s.dataset.photo, u = jcPetPhotoUrl(path);
    if (!u || s.querySelector("img")) return;
    var img = document.createElement("img");
    img.alt = ""; img.decoding = "async";
    img.addEventListener("load", function(){ s.classList.add("has"); });
    img.addEventListener("error", function(){
      img.remove(); s.classList.remove("has");                                     /* the paw stays */
      var c = jcPetPhotoUrls[path];
      if (c && c.url === u && !c.retried) { jcPetPhotoUrls[path] = { url: u, exp: 0, retried: true }; jcPetPhotoFill(); }   /* one fresh signing */
    });
    img.src = u;
    s.appendChild(img);
  });
}
function jcPetPhotoFill(){
  var need = [];
  Array.prototype.forEach.call(document.querySelectorAll("[data-photo]"), function(s){
    var path = s.dataset.photo;
    if (!jcPetPhotoUrl(path) && !jcPetPhotoAsked[path] && need.indexOf(path) < 0) need.push(path);
  });
  jcPetPhotoPlace();
  if (!need.length) return;
  need.forEach(function(path){ jcPetPhotoAsked[path] = true; });
  var exp = Date.now() + (JC_PET_PHOTO_TTL - 300) * 1000;
  function done(){ need.forEach(function(path){ delete jcPetPhotoAsked[path]; }); }
  jcDb.storage.from("pet-photos").createSignedUrls(need, JC_PET_PHOTO_TTL).then(function(r){
    done();
    (r && Array.isArray(r.data) ? r.data : []).forEach(function(x){
      if (x && !x.error && typeof x.path === "string" && typeof x.signedUrl === "string" && x.signedUrl.indexOf(JC_URL + "/") === 0) {
        var was = jcPetPhotoUrls[x.path];
        if (was && was.retried && was.url === x.signedUrl) return;                  /* same dead URL: leave the paw */
        jcPetPhotoUrls[x.path] = { url: x.signedUrl, exp: exp, retried: !!(was && was.retried) };
      }
    });
    jcPetPhotoPlace();
  }, function(){ done(); /* unreadable now: the paw stays; tried again on the next redraw */ });
}
var JC_PET_PHOTO_TYPES = /^image\/(jpeg|png|webp|heic|heif|gif)$/;
/* the picked file → a JPEG data URL ≤ 1280 px. Drawing an <img> onto a canvas applies the photo's EXIF rotation and
   leaves the EXIF (incl. GPS) behind: only the canvas output is ever sent. */
function jcPetPhotoShrink(file){
  return new Promise(function(done, fail){
    var bad = function(){ fail(jcErr("PHOTO_UNREADABLE")); };
    if (!file || (file.type && !JC_PET_PHOTO_TYPES.test(file.type)) || file.size > JC_PET_PHOTO_IN_MAX) return bad();
    var r = new FileReader();
    r.onerror = bad;
    r.onload = function(){
      var img = new Image();
      img.onerror = bad;
      img.onload = function(){
        try {
          var w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h || w * h > JC_PET_PHOTO_PX_MAX) return bad();
          var k = Math.min(1, JC_PET_PHOTO_MAX / Math.max(w, h)), c = document.createElement("canvas");
          c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
          var g = c.getContext("2d");
          if (!g) return bad();
          g.drawImage(img, 0, 0, c.width, c.height);
          var url = c.toDataURL("image/jpeg", 0.82);
          c.width = c.height = 0;                                                /* iOS keeps canvas memory otherwise */
          var n = Math.floor((url.length - url.indexOf(",") - 1) * 3 / 4);
          if (url.indexOf("data:image/jpeg") !== 0 || n < 1024 || n > 2000000) return bad();   /* blank or too big */
          done(url);
        } catch (e) { bad(); }
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  });
}
/* report: true → the photo of a resident's stray report (jc_stray_report_photo_begin / _commit, keyed p_id);
   "cat" → one more photo of a programme cat (CC-3: jc_cat_photo_begin / _commit, keyed p_cat + the path) */
function jcPetPhotoUpload(id, dataUrl, report){
  var begin = report === "cat" ? rpc("jc_cat_photo_begin", { p_cat: id, p_ext: "jpg" })
            : report ? rpc("jc_stray_report_photo_begin", { p_id: id, p_ext: "jpg" }) : rpc("jc_pet_photo_begin", { p_pet: id, p_ext: "jpg" });
  return begin.then(function(b){
    if (!jcObj(b) || typeof b.path !== "string") throw jcErr("UNKNOWN");
    var bin = atob(dataUrl.slice(dataUrl.indexOf(",") + 1)), buf = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    /* raw bytes, not a Blob: a Blob would go up as a multipart form */
    return jcDb.storage.from("pet-photos").upload(b.path, buf.buffer, { contentType: "image/jpeg", upsert: false }).then(function(r){
      if (!r || r.error) throw jcErr("PHOTO_UPLOAD_FAILED");
      return report === "cat" ? rpc("jc_cat_photo_commit", { p_cat: id, p_path: b.path })
           : report ? rpc("jc_stray_report_photo_commit", { p_id: id }) : rpc("jc_pet_photo_commit", { p_pet: id });
    });
  });
}

/* ---------- photo viewer (PV-1, 2026-11-18) ----------
   Tap a photo → full screen. Close button, Escape (native <dialog>), or a tap outside the photo (a tap, never the end
   of a swipe). Several photos: "2 of 4", previous / next, arrow keys, swipe — all mirrored in Arabic. The photo is the
   same signed URL the page already holds (jcPetPhotoFill): no extra download.
   Zoom (DS-3c): the Zoom In button or a double-tap on the photo = 2.5×, toward the tapped point; drag to look around
   (kept inside the photo). While zoomed a drag never changes the photo and a tap never closes; a new photo starts unzoomed. */
var JC_PV_ZOOM = 2.5;
var jcPv = { paths: [], i: 0, from: null, swiped: false, z: 1, tx: 0, ty: 0, lastTap: 0 };
function jcPvImg(){ var d = document.getElementById("jcPhotoView"); return d ? d.querySelector(".ptph.full img") : null; }
/* keep the zoomed photo covering the stage: it can move only as far as it is bigger than the visible area, per axis */
function jcPvClamp(){
  var img = jcPvImg(), st = document.querySelector("#jcPhotoView .pvstage");
  if (!img || !st || jcPv.z <= 1) { jcPv.tx = jcPv.ty = 0; return; }
  var mx = Math.max(0, (img.offsetWidth * jcPv.z - st.clientWidth) / 2), my = Math.max(0, (img.offsetHeight * jcPv.z - st.clientHeight) / 2);
  jcPv.tx = Math.max(-mx, Math.min(mx, jcPv.tx)); jcPv.ty = Math.max(-my, Math.min(my, jcPv.ty));
}
function jcPvApply(){
  var img = jcPvImg(), st = document.querySelector("#jcPhotoView .pvstage"), b = document.getElementById("pvZoom"), on = jcPv.z > 1;
  if (st) st.classList.toggle("zoomed", on);
  if (b) b.setAttribute("aria-pressed", on ? "true" : "false");     /* one label, its state in aria-pressed (review M2) */
  if (img) img.style.transform = on ? "translate(" + jcPv.tx + "px, " + jcPv.ty + "px) scale(" + jcPv.z + ")" : "";
}
/* on: zoom in (toward the client point cx, cy if given: that point stays under the finger) or out */
function jcPvZoom(on, cx, cy){
  var img = jcPvImg();
  if (on && !img) return;                                   /* the photo hasn't loaded yet: nothing to zoom (review M1) */
  jcPv.z = on ? JC_PV_ZOOM : 1; jcPv.tx = jcPv.ty = 0;
  if (on && img && cx != null) {
    var r = img.getBoundingClientRect();
    jcPv.tx = -(cx - (r.left + r.width / 2)) * (jcPv.z - 1); jcPv.ty = -(cy - (r.top + r.height / 2)) * (jcPv.z - 1);
  }
  jcPvClamp(); jcPvApply();
}
function jcPvRtl(){ return document.documentElement.getAttribute("dir") === "rtl"; }
function jcPvClose(){ var d = document.getElementById("jcPhotoView"); if (!d) return; if (d.close) d.close(); else { d.removeAttribute("open"); jcPvBack(); } }
function jcPvBack(){ var b = jcPv.from; jcPv.from = null; if (b && b.isConnected) b.focus(); }
function jcPvStep(n){ var j = jcPv.i + n; if (j < 0 || j >= jcPv.paths.length) return; jcPv.i = j; jcPvDraw(); }   /* draw unzooms */
function jcPvDraw(){
  var d = document.getElementById("jcPhotoView"), t = jcPv.paths.length, many = t > 1;
  var a = document.activeElement, had = a && a !== d && d.contains(a) ? a.id : "";   /* keep focus on the same button */
  jcPv.z = 1; jcPv.tx = jcPv.ty = 0; jcPv.lastTap = 0;
  d.innerHTML = '<div class="pvhead">' + (many ? '<span class="pvcount" aria-live="polite">' + esc(jcFmt("pv_count", { n: jcPv.i + 1, t: t })) + '</span>' : '<span></span>') +
    '<span class="row"><button type="button" class="lang" id="pvZoom" aria-pressed="false">' + esc(jcT("pv_zoom")) + '</button>' +
    '<button type="button" class="lang" id="pvClose">' + esc(jcT("ev_labels_close")) + '</button></span></div>' +
    '<div class="pvstage"><span class="ptph full" data-photo="' + esc(jcPv.paths[jcPv.i]) + '">' + jcIcon("pets", 48) + '</span></div>' +
    (many ? '<div class="pvnav"><button type="button" class="btn ghost" id="pvPrev" aria-label="' + esc(jcT("pv_prev")) + '"' + (jcPv.i === 0 ? ' disabled' : '') + '><span class="pvchev">‹</span></button>' +
            '<button type="button" class="btn ghost" id="pvNext" aria-label="' + esc(jcT("pv_next")) + '"' + (jcPv.i === t - 1 ? ' disabled' : '') + '><span class="pvchev">›</span></button></div>' : '');
  document.getElementById("pvClose").addEventListener("click", jcPvClose);
  document.getElementById("pvZoom").addEventListener("click", function(){ jcPvZoom(jcPv.z <= 1); });
  if (many) {
    document.getElementById("pvPrev").addEventListener("click", function(){ jcPvStep(-1); });
    document.getElementById("pvNext").addEventListener("click", function(){ jcPvStep(1); });
  }
  var f = had && document.getElementById(had);
  (f && !f.disabled ? f : document.getElementById("pvClose")).focus();
  jcPetPhotoFill();
}
function jcPhotoView(paths, i, from){
  paths = (Array.isArray(paths) ? paths : []).filter(function(p){ return typeof p === "string" && p; });
  if (!paths.length) return;
  var d = document.getElementById("jcPhotoView");
  if (!d) {
    d = document.createElement("dialog");
    d.id = "jcPhotoView"; d.className = "photoview";
    document.body.appendChild(d);
    var sx = null, sy = null, tx0 = 0, ty0 = 0, pan = false;
    var stageOf = function(){ return d.querySelector(".pvstage"); };
    /* one finger only: a second finger (a pinch) cancels the swipe and is never a closing tap (review) */
    d.addEventListener("pointerdown", function(e){
      if (!e.isPrimary) { sx = null; jcPv.swiped = true; return; }
      sx = e.clientX; sy = e.clientY; tx0 = jcPv.tx; ty0 = jcPv.ty; jcPv.swiped = false;
      pan = jcPv.z > 1 && !!(e.target.closest && e.target.closest(".pvstage"));       /* a drag that starts on the stage */
    });
    /* zoomed: a drag that started on the stage moves the photo (kept inside it), wherever the finger goes */
    d.addEventListener("pointermove", function(e){
      if (sx === null || !e.isPrimary || !pan) return;
      if (e.pointerType === "mouse" && !(e.buttons & 1)) { sx = null; return; }        /* button let go outside the window (L3) */
      jcPv.tx = tx0 + (e.clientX - sx); jcPv.ty = ty0 + (e.clientY - sy); jcPvClamp();
      var st = stageOf(); if (st) st.classList.add("drag");
      jcPvApply();
    });
    d.addEventListener("pointercancel", function(){ sx = null; var st = stageOf(); if (st) st.classList.remove("drag"); });
    d.addEventListener("dragstart", function(e){ e.preventDefault(); });   /* the browser's own image drag would cancel a pan */
    d.addEventListener("pointerup", function(e){
      var st = stageOf(); if (st) st.classList.remove("drag");                         /* also after a pinch cancelled the pan (L2) */
      if (sx === null || !e.isPrimary) return;
      var dx = e.clientX - sx, dy = e.clientY - sy; sx = null;
      if (Math.abs(dx) >= 10 || Math.abs(dy) >= 10) jcPv.swiped = true;                /* moved: never a closing tap */
      if (jcPv.z > 1) return;                                                          /* zoomed: a drag pans, never steps */
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) jcPvStep((dx < 0) !== jcPvRtl() ? 1 : -1);
    });
    d.addEventListener("click", function(e){
      if (jcPv.swiped) { jcPv.swiped = false; return; }
      var t = e.target;
      if (t.tagName === "IMG" && t.closest(".pvstage")) {                              /* two taps on the photo within 350 ms */
        var now = Date.now();
        if (now - jcPv.lastTap < 350) { jcPv.lastTap = 0; jcPvZoom(jcPv.z <= 1, e.clientX, e.clientY); }
        else jcPv.lastTap = now;
        return;
      }
      if (jcPv.z > 1) return;                               /* zoomed: a tap never closes */
      /* anywhere dark (stage, header, arrow row): not the photo or a button */
      if (!(t.closest && t.closest("button, img"))) jcPvClose();
    });
    /* arrows: zoomed, look around (40 px a press — the keyboard's pan, review M3); otherwise ← / → change photo */
    d.addEventListener("keydown", function(e){
      var k = e.key, step = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }[k];
      if (!step) return;
      if (jcPv.z > 1) { e.preventDefault(); jcPv.tx += step[0]; jcPv.ty += step[1]; jcPvClamp(); jcPvApply(); return; }
      if (k !== "ArrowLeft" && k !== "ArrowRight") return;
      e.preventDefault();
      jcPvStep((k === "ArrowRight") !== jcPvRtl() ? 1 : -1);
    });
    d.addEventListener("close", jcPvBack);
  }
  jcPv.paths = paths; jcPv.i = Math.min(Math.max(0, i | 0), paths.length - 1); jcPv.from = from || null;
  d.setAttribute("aria-label", jcT("pt_photo"));
  if (d.showModal) { if (!d.open) d.showModal(); } else d.setAttribute("open", "");
  jcPvDraw();
}
document.addEventListener("click", function(e){
  var b = e.target.closest && e.target.closest("[data-view]");
  if (!b) return;
  var paths;
  try { paths = JSON.parse(b.dataset.view); } catch (x) { return; }
  jcPhotoView(paths, parseInt(b.dataset.viewAt, 10) || 0, b);
});

/* ---------- care log (care v2, 2026-11-15): one rule for both pages ----------
   An auto-logged status change carries the state (no note) and shows its label in the reader's language;
   any other row shows its note. Needs strings.js (jcT) and api.js (esc). */
var JC_CARE_STATES = ["needs_help", "under_care", "known_fine", "rehomed"];
function jcCareLogBody(c){
  if (c.kind === "state" && JC_CARE_STATES.indexOf(c.state) >= 0) return '<div>' + esc(jcT("pt_care_" + c.state)) + '</div>';
  return c.note ? '<div dir="auto">' + esc(c.note) + '</div>' : '';
}
