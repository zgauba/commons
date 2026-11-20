/* Cats — the reports queue (CC-7b; server 20261120100000_cc7a_cat_reports: jc_cat_reports_list / jc_cat_report_close).
   Cats coordinators + community admins only (the Reports tab shows when can_edit; the server checks again) — never
   volunteers: a report carries the reporter's home and WhatsApp number. Moved from Organizer Tools → Reported strays
   (the card is that screen's; it goes from there in CC-7c). Outcomes:
   - Add as new cat → the cat editor, with the report shown above it; saving adds the cat, then closes the report
     (the report's photo becomes the cat's, plan D3; a sighting at the report's pin);
   - Already known → tap the cat (the register's picker, as Log a visit) → linked + one sighting; the photo is not added;
   - Not a stray → closed.
   Loaded before cats.js; uses its globals (busy, reg, current, tab, draw, show, catId, catTab, openCatEditor). */
var rq = { show: "open", open: undefined, closed: null, known: null, pick: "", all: false, seq: 0, closedSeq: 0, note: null };
var rqFrom = null;                     /* the report behind "Add as new cat" while the editor is open */
var RQ_STATES = ["added", "known", "not_stray", "expired"];
function rqClean(list){ return Array.isArray(list) ? list.filter(function(r){ return hObj(r) && typeof r.id === "string"; }) : null; }
function rqMsg(code){ jcSay("err", jcT("ca_rq_err_" + code) !== "ca_rq_err_" + code ? jcT("ca_rq_err_" + code) : jcErrTextFor("ca_err_", code)); }
function rqOpenN(){ return Array.isArray(rq.open) ? rq.open.length : 0; }
/* the waiting list, read with the programme (the tab's count) and again after every close */
function rqLoad(){
  var seq = ++rq.seq;
  rpc("jc_cat_reports_list", { p_show: "open" }).then(function(d){
    if (seq !== rq.seq) return;
    rq.open = rqClean(d) || [];
    if (current === "home") draw();
  }, function(e){
    if (seq !== rq.seq) return;
    rq.open = { err: (e && e.code) || "UNKNOWN" };
    if (current === "home" && tab === "reports") draw();
  });
}
function rqLoadClosed(){
  var seq = ++rq.closedSeq;
  rq.closed = { loading: true };
  rpc("jc_cat_reports_list", { p_show: "closed" }).then(function(d){
    if (seq !== rq.closedSeq) return;
    rq.closed = rqClean(d) || [];
    if (current === "home" && tab === "reports") draw();
  }, function(e){
    if (seq !== rq.closedSeq) return;
    rq.closed = { err: (e && e.code) || "UNKNOWN" };
    if (current === "home" && tab === "reports") draw();
  });
}
function rqById(id){ return (Array.isArray(rq.open) ? rq.open : []).filter(function(r){ return r.id === id; })[0] || null; }
/* the reporter: their home now (the server reads it live), or that they left; never a name */
function rqWho(r){
  if (r.reporter_left === true) return jcT("ca_rq_who_left");
  var h = hObj(r.reporter_home) ? r.reporter_home : null;
  if (!h || h.number == null) return jcT("ca_rq_who_nohome");
  return jcFmt("ca_rq_who", { h: jcHomeLabel(h) + (h.village ? " · " + jcVillageName(cfg, h.village) : "") });
}
function rqDigits(c){
  var d = typeof c === "string" ? c.replace(/[^0-9]/g, "").replace(/^00/, "") : "";
  return d.length >= 8 && d.length <= 15 ? d : "";
}
/* the report itself: photo, note, place, who (the queue card under its date line, and the editor's "from a report" panel).
   Card = the shared dated-entry card (jcEntriesHtml), as the Activity tab; the photo a tile that opens the viewer */
function rqBodyHtml(r){
  return (r.photo_path ? jcPetPhotoHtml(r, 34, "tile", { view: true }) : '') +
    (r.note ? '<div dir="auto">' + esc(r.note) + '</div>' : '') +
    (r.place ? '<div class="meta" dir="auto">' + esc(jcFmt("ca_rq_place", { p: r.place })) + '</div>' : '') +
    '<div class="meta">' + esc(rqWho(r)) + '</div>';
}
function rqEntry(r){ return { liAttrs: 'data-report="' + esc(r.id) + '"', meta: dayOf(r.created_at), bodyHtml: rqCard(r) }; }
function rqCard(r){
  var pos = finite(r.lat) && finite(r.lng), off = busy ? ' disabled' : '';
  var h = rqBodyHtml(r);
  if (r.state !== "open") {
    var cat = hObj(r.cat) && typeof r.cat.id === "string" && typeof r.cat.name === "string" ? r.cat : null;
    return h + '<div class="ctchips"><span class="chip">' + esc(jcT("ca_rq_state_" + (RQ_STATES.indexOf(r.state) >= 0 ? r.state : "expired"))) + '</span></div>' +
      (cat ? '<div class="acts"><button class="mini" type="button" data-rqcat="' + esc(cat.id) + '" dir="auto">' + esc(cat.name) + '</button></div>' : '');
  }
  var links = (pos ? jcMapLink(r.lat, r.lng) : '') +
    /* the number itself is never printed: a link the coordinator taps (an attribute, set below) */
    (rqDigits(r.contact) ? '<a target="_blank" rel="noopener noreferrer" data-rqwa="' + esc(r.id) + '">' + esc(jcT("ca_rq_wa")) + '</a>' : '');
  if (links) h += '<div class="acts">' + links + '</div>';
  if (rq.known === r.id) {
    var cats = catsList(reg).filter(function(c){ return !merged(c); });
    var shown = rq.all ? cats : cats.filter(function(c){ return c.id === rq.pick; }).concat(cats.filter(function(c){ return c.id !== rq.pick; }).slice(0, 12));
    return h + '<fieldset class="panel" id="rqKnown"><legend>' + esc(jcT("ca_rq_known_which")) + '</legend>' +
      '<p class="help">' + esc(jcT("ca_rq_known_help")) + '</p>' +
      (shown.length ? '<div class="caPicks">' + shown.map(function(c){ return pickHtml(c, rq.pick === c.id, off); }).join("") + '</div>'
        : '<p class="help">' + esc(jcT("ca_cats_none")) + '</p>') +
      (!rq.all && cats.length > shown.length ? '<div class="acts"><button class="mini" type="button" id="rqAll"' + off + '>' + esc(jcFmt("ca_v_all", { n: cats.length - shown.length })) + '</button></div>' : '') +
      '<div class="row"><button class="btn" type="button" id="rqKnownGo"' + off + '>' + esc(jcT("ca_rq_known_go")) + '</button>' +
      '<button class="btn ghost" type="button" id="rqKnownKeep">' + esc(jcT("ct_cancel")) + '</button></div></fieldset>';
  }
  return h + '<div class="row">' +
    '<button class="btn small" type="button" data-rqadd="' + esc(r.id) + '"' + off + '>' + esc(jcT("ca_rq_add")) + '</button>' +
    '<button class="btn ghost small" type="button" data-rqknown="' + esc(r.id) + '"' + off + '>' + esc(jcT("ca_rq_known")) + '</button>' +
    '<button class="mini danger" type="button" id="rqNot-' + esc(r.id) + '" data-rqnot="' + esc(r.id) + '"' + off + '>' + esc(jcT("ca_rq_not")) + '</button></div>';
}
function reportsTabHtml(){
  if (rq.open === undefined) rqLoad();
  var open = Array.isArray(rq.open) ? rq.open : null, closed = Array.isArray(rq.closed) ? rq.closed : null, body;
  var chips = jcChipsHtml({ id: "rqChips", prefix: "rqShow-", label: jcT("ca_rq_filter"), current: rq.show,
    items: [{ key: "open", text: jcT("ca_rq_open"), n: open ? open.length : 0 }, { key: "closed", text: jcT("ca_rq_closed"), n: closed ? closed.length : null }] });
  var list = rq.show === "open" ? open : closed;
  if (rq.show === "open" && !open) body = rq.open && rq.open.err
    ? '<p class="help" id="rqUnread">' + esc(jcT("ca_rq_unread")) + '</p><div class="row"><button class="btn ghost" type="button" id="rqRetry">' + esc(jcT("adm_ad_retry")) + '</button></div>'
    : '<p class="help">' + esc(jcT("working")) + '</p>';
  else if (rq.show === "closed" && !closed) body = rq.closed && rq.closed.err
    ? '<div class="row"><button class="btn ghost" type="button" id="rqRetry">' + esc(jcT("adm_ad_retry")) + '</button></div>'
    : '<p class="help">' + esc(jcT("working")) + '</p>';
  else if (!list.length) body = '<p class="help" id="rqNone" role="status">' + esc(jcT(rq.show === "open" ? "ca_rq_none" : "ca_rq_none_closed")) + '</p>';
  else body = jcEntriesHtml({ id: "rqList", items: list.map(rqEntry),
    afterHtml: rq.show === "closed" ? '<p class="help">' + esc(jcT("ca_rq_closed_kept")) + '</p>' : '' });
  return '<p class="help">' + esc(jcT("ca_rq_help")) + '</p><div class="evtools">' + chips + '</div>' + body;
}
function wireReportsTab(){
  if (rq.note && Array.isArray(rq.open)) { rqMsg(rq.note); rq.note = null; }   /* said once the queue was read again (a redraw clears the message box) */
  if (rq.show === "closed" && rq.closed === null) rqLoadClosed();
  jcChipsWire("rqChips", "rqShow-", function(k){ if (busy || (k !== "open" && k !== "closed")) return; rq.show = k; rq.known = null; draw(); });
  on("rqRetry", function(){ if (rq.show === "open") { rq.open = undefined; } else rq.closed = null; draw(); });
  Array.prototype.forEach.call(document.querySelectorAll("[data-rqwa]"), function(a){
    var r = rqById(a.dataset.rqwa), d = r && rqDigits(r.contact);
    if (d) a.setAttribute("href", "https://wa.me/" + d); else a.remove();
  });
  each("[data-rqcat]", function(b){ catId = b.dataset.rqcat; catTab = "about"; show("cat"); try { window.scrollTo(0, 0); } catch(e){} });
  each("[data-rqadd]", function(b){ var r = rqById(b.dataset.rqadd); if (r && !busy) { openCatEditor(null); rqFrom = r; draw(); } });
  each("[data-rqknown]", function(b){
    if (busy) return;
    rq.known = b.dataset.rqknown; rq.pick = ""; rq.all = false; draw();
    var f = document.querySelector("#rqKnown [data-pick]"); if (f) f.focus();
  });
  each("[data-rqnot]", function(b){
    var r = rqById(b.dataset.rqnot);
    if (r && !busy && window.confirm(jcT("ca_rq_not_q"))) rqClose(r, "not_stray", null, b);   /* code review L3: busy before asking */
  });
  each("#rqKnown [data-pick]", function(b){
    rq.pick = rq.pick === b.dataset.pick ? "" : b.dataset.pick;
    Array.prototype.forEach.call(document.querySelectorAll("#rqKnown [data-pick]"), function(x){ x.setAttribute("aria-pressed", String(x.dataset.pick === rq.pick)); });
  });
  on("rqAll", function(){ rq.all = true; draw(); var f = document.querySelector("#rqKnown [data-pick]"); if (f) f.focus(); });
  on("rqKnownKeep", function(){
    var id = rq.known; rq.known = null; draw();
    var b = id && document.querySelector('[data-rqknown="' + CSS.escape(id) + '"]'); if (b) b.focus();
  });
  on("rqKnownGo", function(){
    var r = rqById(rq.known);
    if (!r) return;
    if (!rq.pick) { rqMsg("NO_PICK"); var f = document.querySelector("#rqKnown [data-pick]"); if (f) f.focus(); return; }
    rqClose(r, "known", rq.pick, el("rqKnownGo"));
  });
  jcPetPhotoFill();
}
/* after a card goes: the next report's first action, else the "none waiting" line */
function rqFocusNext(){
  var b = document.querySelector("#rqList [data-rqadd]"), n = el("rqNone");
  if (b) b.focus(); else if (n) { n.setAttribute("tabindex", "-1"); n.focus(); }
}
function rqClose(r, outcome, cat, btn){
  if (busy) return;
  busy = true; if (btn) btn.disabled = true;
  rpc("jc_cat_report_close", { p_id: r.id, p_outcome: outcome, p_cat: cat || null }).then(function(){
    busy = false;
    rq.known = null; rq.pick = ""; rq.closed = null; rq.seq++;          /* code review L4: an older read never re-adds it */
    if (Array.isArray(rq.open)) rq.open = rq.open.filter(function(x){ return x.id !== r.id; });
    /* code review M1: "known" wrote a sighting — the activity lists and the cat's last-seen are read again */
    if (cat) { logReset(); rpc("jc_cat_register").then(function(d){ reg = d; }, function(){}); }
    var c = cat ? catFind(reg, cat) : null;
    if (current === "home" && tab === "reports") {
      draw();
      jcShowOk(outcome === "known" ? jcFmt("ca_rq_known_done", { n: c ? catTitle(c) : "" }) : jcT("ca_rq_not_done"));
      rqFocusNext();
    }
  }, function(e){
    busy = false;
    var code = (e && e.code) || "UNKNOWN";
    if (code === "MODULE_OFF") return show("off");
    if (current !== "home" || tab !== "reports") return;
    /* handled by another coordinator meanwhile, or the cat merged / gone: read the queue again, then say why */
    if (code === "ALREADY_CLOSED" || code === "NOT_FOUND" || code === "MERGED") {
      rq.known = null; rq.note = code; rq.closed = null; rq.open = undefined;
      if (code === "MERGED") rpc("jc_cat_register").then(function(d){ reg = d; draw(); }, function(){});
      return draw();
    }
    draw(); rqMsg(code);
  });
}
/* the cat editor, opened from "Add as new cat": the report above the form */
function rqFromHtml(){
  var r = rqFrom;
  return '<div class="panel" id="rqFrom" role="note"><p><b>' + esc(jcT(r.photo_path ? "ca_rq_from_photo" : "ca_rq_from")) + '</b></p>' +
    '<div class="meta">' + esc(dayOf(r.created_at)) + '</div>' + rqBodyHtml(r) + '</div>';
}
/* the new cat saved (catEditView found its id): close the report as added, then show the cat with the moved photo */
function rqAfterAdd(fresh){
  var r = rqFrom;
  rqFrom = null;
  catId = fresh.id; catTab = "about"; current = "cat";
  busy = true;
  rpc("jc_cat_report_close", { p_id: r.id, p_outcome: "added", p_cat: fresh.id }).then(function(){
    if (Array.isArray(rq.open)) rq.open = rq.open.filter(function(x){ return x.id !== r.id; });
    rq.closed = null; rq.seq++; logReset();                          /* code review L4 + M1 (the sighting) */
    return rpc("jc_cat_register").then(function(d){ reg = d; }, function(){}).then(function(){
      busy = false;
      if (current === "cat") { draw(); jcShowOk(jcFmt("ca_rq_added", { n: catTitle(fresh) })); }
    });
  }, function(e){
    busy = false;
    var code = (e && e.code) || "UNKNOWN";
    rq.open = undefined;
    if (current === "cat") { draw(); jcSay("err", jcFmt(code === "ALREADY_CLOSED" ? "ca_rq_add_handled" : "ca_rq_add_open", { n: catTitle(fresh) })); }
  });
}
