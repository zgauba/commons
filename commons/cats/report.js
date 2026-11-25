/* Cats — residents report a stray cat (CC-7b; server 20261120100000_cc7a_cat_reports + the stray report RPCs).
   Moved from Pets (CC-7: Pets is just for pets; plan D1 cats only, D2 the form lives here, on the residents' Cats tab).
   Cats coordinators check every report before anything is public; they see the reporter's home, and a WhatsApp number
   only if given (cleared when the report closes). A photo is optional, and asked about again at Send: only if a
   coordinator adds the cat as a NEW cat does it become that cat's photo (D3), public to members. Where = the shared
   where.js flow (as every Cats editor) + a free-text place. My reports: what coordinators decided; while open, the
   number and the photo can be taken back. Loaded before cats.js; uses its globals (busy, cfg, current, draw, show). */
var rep = null;          /* the form: { id (made here: a retry never sends twice), note, place, w (where.js), photo, shrinking, wa, phone, confirm } */
var repDone = null;      /* the report just sent: { text } for the thank-you screen's WhatsApp message */
var myReps;              /* jc_stray_reports_mine: undefined = not read (or unreadable: asked again on the next draw) */
var myRepsBusy = false, myRepsSeq = 0, repShrinkSeq = 0;
function rpMsg(code){ jcSay("err", jcT("ca_rp_err_" + code) !== "ca_rp_err_" + code ? jcT("ca_rp_err_" + code) : jcErrTextFor("ca_err_", code)); }
function repId(){
  try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch(e){}
  var b = new Uint8Array(16); crypto.getRandomValues(b);
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  var h = Array.prototype.map.call(b, function(x){ return (x + 256).toString(16).slice(1); }).join("");
  return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
}
/* the WhatsApp number: international only (+971 50 …, or 00971 …), so the coordinator's link opens a chat */
function repPhone(v){
  var d = String(v || "").replace(/[\s().-]/g, "");
  if (/^00/.test(d)) d = "+" + d.slice(2);
  return /^\+[0-9]{8,15}$/.test(d) ? d : null;
}
/* seen: a missing cat a resident has seen (UI review #1) — { id, code, name }; the report names it in its note, and a
   coordinator links it with Already known. No cat field on the server yet, so nothing new is sent */
function openReport(seen){
  if (busy) return;
  rep = { id: repId(), note: "", place: "", w: { lat: null, lng: null, picking: false }, photo: null, shrinking: null,
          wa: false, phone: "", confirm: false, seen: seen && seen.id ? seen : null };
  show("report");
  try { window.scrollTo(0, 0); } catch(e){}
}
/* every report write: one at a time; busy always comes back down */
function repWrite(b, call, done, fail){
  if (busy) return;
  busy = true; if (b) b.disabled = true;
  var view = current;
  Promise.resolve().then(call).then(function(d){
    busy = false;
    if (current !== view) return;
    return done(d);
  }).catch(function(e){
    busy = false; if (b) b.disabled = false;
    if (current !== view) return;
    var code = (e && e.code) || "UNKNOWN";
    if (code === "MODULE_OFF") return show("off");
    if (fail && fail(code) === true) return;
    rpMsg(code);
  });
}

function reportView(){
  if (!rep) return show("home");
  takeMap();
  jcBack(function(){ if (busy) return; var from = rep.seen; rep = null; if (from) { catId = from.id; show("cat"); } else show("home"); });
  var r = rep, off = busy ? ' disabled' : '';
  var seenTag = r.seen ? [r.seen.code, r.seen.name].filter(Boolean).join(" · ") : "";
  var noteMax = r.seen ? Math.max(40, 280 - jcFmt("ca_rp_seen_note", { c: seenTag }).length - 1) : 280;
  var lock = busy || r.confirm ? ' disabled' : '';     /* the prompt is open: what was agreed to can't change behind it */
  var send = r.confirm
    ? '<div class="panel" id="rpConfirm" role="group" aria-labelledby="rpConfirmH" aria-describedby="rpC1 rpC2 rpC3"><b id="rpConfirmH" tabindex="-1">' + esc(jcT("ca_rp_confirm_h")) + '</b>' +
      '<p id="rpC1">' + esc(jcT("ca_rp_confirm_1")) + '</p><p id="rpC2">' + esc(jcT("ca_rp_confirm_2")) + '</p><p id="rpC3">' + esc(jcT("ca_rp_confirm_3")) + '</p>' +
      '<div class="row"><button class="btn" type="button" id="rpSendPhoto"' + off + '>' + esc(jcT("ca_rp_send_photo")) + '</button>' +
      '<button class="btn ghost" type="button" id="rpSendNoPhoto"' + off + '>' + esc(jcT("ca_rp_send_nophoto")) + '</button>' +
      '<button class="btn ghost" type="button" id="rpConfirmBack"' + off + '>' + esc(jcT("acct_back")) + '</button></div></div>'
    : '<button class="btn" type="submit" id="rpSend"' + (busy || r.shrinking || r.w.picking ? ' disabled' : '') + '>' + esc(jcT("ca_rp_send")) + '</button>';
  el("view").innerHTML = '<h1 dir="auto">' + esc(r.seen ? jcFmt("ca_rp_seen_title", { n: r.seen.name || r.seen.code }) : jcT("ca_rp_title")) + '</h1>' +
    (r.seen ? '<p class="notice" id="rpSeen">' + esc(jcFmt("ca_rp_seen_about", { c: "\u2068" + seenTag + "\u2069" })) + '</p>' : '') +
    '<p class="help">' + esc(jcT("ca_rp_help")) + '</p>' +
    (r.seen ? '' : '<p class="help" id="rpOther">' + esc(jcT("ca_rp_other")) + '</p>') + msgBox() +
    '<form class="panel" id="rpForm" novalidate>' +
    '<label>' + esc(jcT("ca_rp_note")) + '<textarea id="rpNote" maxlength="' + noteMax + '" dir="auto"' + lock + '></textarea></label>' +
    '<fieldset id="rpWhere"><legend>' + esc(jcT("ca_rp_where")) + '</legend>' + jcWhereHtml(r.w, "rpW", lock, {}) +
      (r.w.picking ? '' : '<label>' + esc(jcT("ca_rp_place")) + '<input type="text" id="rpPlace" maxlength="120" dir="auto" autocomplete="off"' + lock + '></label>' +
        '<p class="help">' + esc(jcT("ca_rp_where_help")) + '</p>') + '</fieldset>' +
    '<fieldset id="rpPhotoBox"><legend>' + esc(jcT("ca_rp_photo")) + '</legend><div class="ptphotoedit">' +
      (r.photo ? '<span class="ptph big has"><img id="rpPhotoNew" alt="" src="' + esc(r.photo) + '"></span>' : '') +
      '<input type="file" id="rpPhotoIn" class="sr-only" accept="image/*"' + lock + '>' +
      '<div class="row"><label class="btn ghost" id="rpPhotoPick" for="rpPhotoIn">' + esc(jcT(r.photo ? "pt_photo_change" : "pt_photo_add")) + '</label>' +
      (r.photo ? '<button class="btn ghost" type="button" id="rpPhotoDrop"' + lock + '>' + esc(jcT("pt_photo_drop")) + '</button>' : '') + '</div></div>' +
      '<p class="help" id="rpPhotoHelp" role="status">' + esc(jcT(r.shrinking ? "working" : r.photo ? "pt_photo_ready" : "ca_rp_photo_help")) + '</p>' +
      '<p class="help" id="rpPhotoWho">' + esc(jcT("ca_rp_photo_who")) + '</p></fieldset>' +
    '<fieldset id="rpWaBox"><legend>' + esc(jcT("ca_rp_wa")) + '</legend>' +
      '<label class="check"><input type="checkbox" id="rpWa" aria-controls="rpWaBox"' + (r.wa ? ' checked' : '') + lock + '> <span>' + esc(jcT("ca_rp_wa_q")) + '</span></label>' +
      (r.wa ? '<label>' + esc(jcT("ca_rp_phone")) + '<input type="tel" id="rpPhone" inputmode="tel" autocomplete="tel" maxlength="24" dir="ltr" placeholder="+971 50 123 4567"' + lock + '></label>' : '') +
      '<p class="help" id="rpWaHelp">' + esc(jcT("ca_rp_wa_help")) + '</p></fieldset>' +
    '<p class="help" id="rpPrivacy">' + esc(jcT("ca_rp_privacy")) + '</p>' + send + '</form>';
  el("rpNote").value = r.note; el("rpNote").addEventListener("input", function(){ r.note = el("rpNote").value; });
  if (el("rpPlace")) { el("rpPlace").value = r.place; el("rpPlace").addEventListener("input", function(){ r.place = el("rpPlace").value; }); }
  if (el("rpPhone")) { el("rpPhone").value = r.phone; el("rpPhone").addEventListener("input", function(){ r.phone = el("rpPhone").value; }); }
  el("rpWa").addEventListener("change", function(){ r.wa = el("rpWa").checked; draw(); });
  var c = (cfg && cfg.map) || {};
  jcWhereWire(r.w, "rpW", { draw: draw, alive: function(){ return current === "report" && rep === r; },
    center: [c.lat || 24.53, c.lng || 54.43], zoom: c.zoom || 16, onError: caMsg, setMap: function(m){ map = m; } });
  el("rpPhotoIn").addEventListener("change", function(){
    var file = el("rpPhotoIn").files && el("rpPhotoIn").files[0];
    if (!file || busy) return;
    var mine = ++repShrinkSeq, was = r.confirm;
    r.shrinking = mine; r.confirm = false;
    if (was) draw();                                     /* the prompt was for the old photo: gone at once */
    el("rpPhotoHelp").textContent = jcT("working");
    if (el("rpSend")) el("rpSend").disabled = true;
    jcPetPhotoShrink(file).then(function(url){
      if (r.shrinking !== mine) return;
      r.shrinking = null;
      if (rep !== r) return;
      r.photo = url;
      if (current === "report") { draw(); if (el("rpPhotoIn")) el("rpPhotoIn").focus(); }
    }, function(e){
      if (r.shrinking !== mine) return;
      r.shrinking = null;
      if (rep !== r || current !== "report") return;
      draw(); rpMsg((e && e.code) || "PHOTO_UNREADABLE");
    });
  });
  on("rpPhotoDrop", function(){ if (busy) return; r.photo = null; r.confirm = false; repShrinkSeq++; r.shrinking = null; draw(); if (el("rpPhotoIn")) el("rpPhotoIn").focus(); });
  on("rpSendPhoto", function(){ repSend(true); });
  on("rpSendNoPhoto", function(){ repSend(false); });
  on("rpConfirmBack", function(){ r.confirm = false; draw(); if (el("rpSend")) el("rpSend").focus(); });
  el("rpForm").addEventListener("submit", function(e){
    e.preventDefault();
    if (r.shrinking || r.w.picking || busy) return;
    if (!repCheck()) return;
    if (r.photo) { r.confirm = true; draw(); var h = el("rpConfirmH"); if (h) h.focus(); return; }   /* the photo prompt */
    repSend(false);
  });
}
/* said before sending: what the server would refuse */
function repCheck(){
  var r = rep;
  if (r.w.lat == null && !r.place.trim()) { rpMsg("NO_WHERE"); if (el("rpPlace")) el("rpPlace").focus(); return false; }
  if (r.wa && !repPhone(r.phone)) { rpMsg("PHONE"); if (el("rpPhone")) el("rpPhone").focus(); return false; }
  return true;
}
function repSend(withPhoto){
  var r = rep;
  if (!r || busy || r.shrinking || r.w.picking || !repCheck()) return;   /* never a photo other than the one agreed to */
  var fields = { species: "cat" };
  var note = r.note.trim();
  if (r.seen) note = jcFmt("ca_rp_seen_note", { c: [r.seen.code, r.seen.name].filter(Boolean).join(" · ") }) + (note ? " " + note : "");
  if (note) fields.note = note.slice(0, 280);           /* the server's cap: never cut silently mid-way on its side */
  if (r.place.trim()) fields.place = r.place.trim();
  if (r.w.lat != null) { fields.lat = r.w.lat; fields.lng = r.w.lng; }
  if (r.wa) fields.contact = repPhone(r.phone);
  var photo = withPhoto ? r.photo : null, where = r.place.trim(), seen = r.seen;
  repWrite(el(withPhoto ? "rpSendPhoto" : r.confirm ? "rpSendNoPhoto" : "rpSend"), function(){
    /* the same id on a retry: the server returns the first report, never a second */
    return rpc("jc_stray_report_add", { p_id: r.id, p_fields: fields }).then(function(){
      if (!photo) return {};
      return jcPetPhotoUpload(r.id, photo, true).then(function(){ return {}; }, function(e){ return { photoErr: (e && e.code) || "UNKNOWN" }; });
    });
  }, function(x){
    rep = null; myReps = undefined; myRepsSeq++; myRepsBusy = false;
    repDone = { text: seen ? jcFmt("ca_rp_wa_msg_seen", { n: seen.name || seen.code })
      : where ? jcFmt("ca_rp_wa_msg_place", { w: where }) : jcT("ca_rp_wa_msg") };
    show("repdone");
    try { window.scrollTo(0, 0); } catch(e){}
    if (x && x.photoErr) jcSay("err", jcFmt("ca_rp_photo_failed", { why: jcErrTextFor("ca_err_", x.photoErr) }));
    else jcShowOk(jcT("ca_rp_sent"));
  }, function(code){
    r.confirm = false; draw();
    if (code === "TOO_MANY_REPORTS" || code === "RATE_LIMITED") { rpMsg(code); return true; }
    return false;
  });
}
function repDoneView(){
  if (!repDone) return show("home");
  jcBack(function(){ repDone = null; tab = "cats"; show("home"); });
  el("view").innerHTML = '<h1>' + esc(jcT("ca_rp_done_title")) + '</h1>' + msgBox() +
    '<p class="desc">' + esc(jcT("ca_rp_done_body")) + '</p>' +
    '<h2 class="group" id="rpTellHead">' + esc(jcT("ca_rp_done_tell")) + '</h2>' +
    '<p class="wamsg" id="rpWaText" dir="auto">' + esc(repDone.text) + '</p>' +
    '<div class="acts"><a class="btn ghost" id="rpWaAny" target="_blank" rel="noopener noreferrer">' + esc(jcT("pt_wa_any")) + '</a></div>' +
    '<div class="row"><button class="btn ghost" type="button" id="rpToCats">' + esc(jcT("ca_rp_back")) + '</button></div>';
  el("rpWaAny").setAttribute("href", "https://wa.me/?text=" + encodeURIComponent(repDone.text));   /* an attribute, never markup */
  on("rpToCats", function(){ repDone = null; tab = "cats"; show("home"); });
}

/* the Cats tab's foot: the button + My reports (everyone: residents and the programme alike) */
function repCtaHtml(){
  return '<h2 class="group" id="rpCtaH">' + esc(jcT("ca_rp_cta_h")) + '</h2><p class="help" id="rpCtaHelp">' + esc(jcT("ca_rp_cta_help")) + '</p>' +
    '<div class="row"><button class="btn ghost" type="button" id="rpOpen"' + (busy ? ' disabled' : '') + '>' + esc(jcT("ca_rp_cta")) + '</button></div>' +
    '<div class="jcstack" id="rpMineBox">' + myRepsHtml() + '</div>';
}
function wireRepCta(){ on("rpOpen", function(){ openReport(); }); wireMyReps(); }
function loadMyReps(){
  myRepsBusy = true;
  var seq = ++myRepsSeq;                                 /* an older read never overwrites a newer state */
  rpc("jc_stray_reports_mine").then(function(d){
    if (seq !== myRepsSeq) return;
    myRepsBusy = false;
    myReps = Array.isArray(d) ? d.filter(function(x){ return hObj(x) && typeof x.id === "string"; }) : [];
    redrawMyReps();
  }, function(e){
    if (seq !== myRepsSeq) return;
    myRepsBusy = false;                                  /* unreadable: the section stays away; the next draw asks again */
    if (e && e.code === "MODULE_OFF") return show("off");
  });
}
function redrawMyReps(){
  var box = el("rpMineBox");
  if (!box || current !== "home" || tab !== "cats") return;
  box.innerHTML = myRepsHtml();
  wireMyReps();
  jcPetPhotoFill();
}
function repState(x){
  var cat = hObj(x.cat) && typeof x.cat.name === "string" && typeof x.cat.id === "string" ? x.cat : null;
  if ((x.state === "added" || x.state === "known") && cat) return { t: jcFmt("ca_rp_st_" + x.state, { n: cat.name }), cat: cat };
  if (x.state === "added" || x.state === "known") return { t: jcT("ca_rp_st_closed"), cat: null };   /* an older report linked in Pets */
  return { t: jcT("ca_rp_st_" + (["open", "not_stray", "expired"].indexOf(x.state) >= 0 ? x.state : "expired")), cat: null };
}
function myRepsHtml(){
  if (myReps === undefined && !myRepsBusy) loadMyReps();
  if (!Array.isArray(myReps) || !myReps.length) return '';
  return '<h2 class="group" id="rpMineH">' + esc(jcT("ca_rp_mine")) + '</h2><ul class="bklist" id="rpMine">' + myReps.map(function(x){
    var st = repState(x), open = x.state === "open", off = busy ? ' disabled' : '';
    return '<li data-myreport="' + esc(x.id) + '"><div class="meta">' + esc(dayOf(x.created_at)) + '</div>' +
      (open && x.photo_path ? jcPetPhotoHtml(x, 34, "tile", { view: true }) : '') +
      (x.place ? '<div class="meta" dir="auto">' + esc(x.place) + '</div>' : '') +
      '<div><b dir="auto">' + esc(st.t) + '</b></div>' +
      '<div class="acts">' + (st.cat ? '<button class="btn ghost small" type="button" data-rpcat="' + esc(st.cat.id) + '">' + esc(jcT("ca_rp_see")) + '</button>' : '') +
      (open && x.has_contact === true ? '<button class="mini" type="button" id="rpNum-' + esc(x.id) + '" data-rpnum="' + esc(x.id) + '"' + off + '>' + esc(jcT("ca_rp_num_remove")) + '</button>' : '') +
      (open && x.photo_path ? '<button class="mini danger" type="button" id="rpPh-' + esc(x.id) + '" data-rpphoto="' + esc(x.id) + '"' + off + '>' + esc(jcT("ca_rp_photo_remove")) + '</button>' : '') +
      '</div></li>';
  }).join("") + '</ul><p class="help">' + esc(jcT("ca_rp_mine_kept")) + '</p>';
}
function wireMyReps(){
  each("[data-rpcat]", function(b){ catId = b.dataset.rpcat; catTab = "about"; show("cat"); try { window.scrollTo(0, 0); } catch(e){} });
  function take(b, fn, okKey, q){
    var id = b.dataset.rpnum || b.dataset.rpphoto;
    if (q && !window.confirm(jcT(q))) return;
    repWrite(b, function(){ return rpc(fn, { p_id: id }); }, function(d){
      if (hObj(d) && Array.isArray(myReps)) myReps = myReps.map(function(x){ return x.id === id ? Object.assign({}, x, d) : x; });
      redrawMyReps(); jcShowOk(jcT(okKey));
    }, function(code){
      if (code === "NO_PHOTO" || code === "NOT_FOUND") { myReps = undefined; myRepsSeq++; myRepsBusy = false; redrawMyReps(); return true; }   /* closed or gone meanwhile */
      return false;
    });
  }
  each("[data-rpnum]", function(b){ take(b, "jc_stray_report_contact_clear", "ca_rp_num_removed"); });
  each("[data-rpphoto]", function(b){ take(b, "jc_stray_report_photo_remove", "ca_rp_photo_removed", "ca_rp_photo_remove_q"); });
}
