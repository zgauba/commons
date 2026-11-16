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
function jcPetPhotoHtml(p, size, cls){
  var path = typeof p.photo_path === "string" && p.photo_path ? p.photo_path : null;
  if (!path) return cls === "tile" ? '<span class="ptph tile">' + jcIcon("pets", size) + '</span>' : jcIcon("pets", size);
  return '<span class="ptph ' + cls + '" data-photo="' + esc(path) + '">' + jcIcon("pets", size) + '</span>';
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
/* report: true → the photo of a resident's stray report (jc_stray_report_photo_begin / _commit, keyed p_id) */
function jcPetPhotoUpload(id, dataUrl, report){
  var begin = report ? rpc("jc_stray_report_photo_begin", { p_id: id, p_ext: "jpg" }) : rpc("jc_pet_photo_begin", { p_pet: id, p_ext: "jpg" });
  return begin.then(function(b){
    if (!jcObj(b) || typeof b.path !== "string") throw jcErr("UNKNOWN");
    var bin = atob(dataUrl.slice(dataUrl.indexOf(",") + 1)), buf = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    /* raw bytes, not a Blob: a Blob would go up as a multipart form */
    return jcDb.storage.from("pet-photos").upload(b.path, buf.buffer, { contentType: "image/jpeg", upsert: false }).then(function(r){
      if (!r || r.error) throw jcErr("PHOTO_UPLOAD_FAILED");
      return report ? rpc("jc_stray_report_photo_commit", { p_id: id }) : rpc("jc_pet_photo_commit", { p_pet: id });
    });
  });
}

/* ---------- care log (care v2, 2026-11-15): one rule for both pages ----------
   An auto-logged status change carries the state (no note) and shows its label in the reader's language;
   any other row shows its note. Needs strings.js (jcT) and api.js (esc). */
var JC_CARE_STATES = ["needs_help", "under_care", "known_fine", "rehomed"];
function jcCareLogBody(c){
  if (c.kind === "state" && JC_CARE_STATES.indexOf(c.state) >= 0) return '<div>' + esc(jcT("pt_care_" + c.state)) + '</div>';
  return c.note ? '<div dir="auto">' + esc(c.note) + '</div>' : '';
}
