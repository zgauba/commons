/* Cats page — CC-5 vet log (server 20261119180000_cc5_cat_vet_log.sql). Loaded BEFORE log.js and cats.js (definitions
   only, nothing runs at load) and uses their state and helpers at call time.
   - coordinators log a vet visit on the one "Log activity" screen (kind "Vet visit"): the cats, date (= date given),
     clinic, what was done, vaccine + name, next dose due, invoice number, the Drive link, "show the invoice to
     residents", note → jc_cat_vet_add;
   - a vet entry in the history lists (vetItemHtml, used by log.js logItem);
   - the cat page: the programme's vaccines as record rows, residents' "Vaccinated", shared invoices.
   Every rule is the server's; the page only words it. */

var VET_DONE = ["checkup", "sterilisation", "vaccination", "deworming", "parasites", "treatment", "surgery", "microchip", "other"];
var VET_VAC = ["rabies", "core", "other"];
/* the server's link rule (security review L1): a Drive file / folder or a Docs / Sheets / Slides document */
var VET_URL = /^https:\/\/(drive\.google\.com\/(file\/d\/|open\?id=|drive\/(u\/[0-9]+\/)?folders\/)|docs\.google\.com\/(document|spreadsheets|presentation)\/d\/)[^\s<>"'\\]*$/;
var wd = null;          /* the vet form's draft: { on, clinic, done {key: true}, vaccine, vname, due, inv, url, shared, note, cats {id: true}, all, station_id: "", back } */

function vetOk(u){ return typeof u === "string" && u.length <= 500 && VET_URL.test(u); }
/* "Open the document" — only a link the server's rule allows is ever made a link (checked again here) */
function vetDocLink(u){
  return vetOk(u) ? '<a class="mini" target="_blank" rel="noopener noreferrer" href="' + esc(u) + '">' + esc(jcT("ca_vt_open_doc")) + '</a>' : '';
}
function vetDone(list){
  return (Array.isArray(list) ? list : []).filter(function(k){ return VET_DONE.indexOf(k) >= 0; }).map(function(k){ return jcT("ca_vt_d_" + k); }).join(" · ");
}
function vetVacName(v, name){ return [lab("ca_vt_v_", VET_VAC, v), typeof name === "string" && name ? "\u2068" + name + "\u2069" : ""].filter(Boolean).join(" · "); }
function vetDueText(due, overdue){
  var d = dateText(due);
  return d ? jcFmt(overdue === true ? "ca_vt_due_past" : "ca_vt_due", { d: d }) : "";
}

/* ---------- one entry in the Activity / cat lists (log.js logItem calls this) ---------- */
function vetItemHtml(it){
  var h = [], done = vetDone(it.done);
  if (it.shared === true) h.push('<div class="head"><span class="chip" data-vtshared>' + esc(jcT("ca_vt_shared_chip")) + '</span></div>');
  if (done) h.push('<div>' + esc(done) + '</div>');
  if (it.vaccine) h.push('<div>' + esc([vetVacName(it.vaccine, it.vaccine_name), vetDueText(it.next_due, it.overdue)].filter(Boolean).join(" · ")) + '</div>');
  else if (it.next_due) h.push('<div>' + esc(vetDueText(it.next_due, it.overdue)) + '</div>');
  var cats = Array.isArray(it.cats) ? it.cats : [];
  if (cats.length) h.push('<div class="head"><span class="meta">' + esc(jcT("ca_vt_cats_l")) + '</span>' + catLinks(cats) + '</div>');
  if (typeof it.invoice_no === "string" && it.invoice_no) h.push('<div dir="auto">' + esc(jcFmt("ca_vt_invoice_l", { n: it.invoice_no })) + '</div>');
  return h;
}

/* ---------- the cat page ---------- */
/* programme: the latest entry per vaccine as record rows (state is a word: "next due …" / "overdue since …") */
function vetVaccinesHtml(c){
  var list = Array.isArray(c.vaccines) ? c.vaccines.filter(function(v){ return hObj(v) && VET_VAC.indexOf(v.vaccine) >= 0; }) : [];
  if (!list.length) return '';
  return '<ul class="care" id="caVacc">' + list.map(function(v){
    var due = vetDueText(v.next_due, v.overdue), given = dateText(v.given);
    return '<li><span class="nm" dir="auto">' + esc(vetVacName(v.vaccine, v.name)) + '</span>' +
      /* code review M1: the state is a phrase in the reader's language — first-strong isolate, never forced left-to-right */
      (due ? '<span class="st ' + (v.overdue === true ? 'st-due' : 'st-done') + '">\u2068' + esc(due) + '\u2069</span>' : '') +
      (given ? '<span class="note">' + esc(jcFmt("ca_vt_given", { d: given })) + '</span>' : '') + '</li>';
  }).join("") + '</ul>';
}
/* everyone: invoices a coordinator chose to show to residents */
function vetInvoicesHtml(c){
  var list = Array.isArray(c.invoices) ? c.invoices.filter(hObj) : [];
  if (!list.length) return '';
  return '<h2 class="group">' + esc(jcT("ca_vt_invoices")) + '</h2><ul class="care" id="caInvoices">' + list.map(function(x){
    var note = [vetDone(x.done), typeof x.invoice_no === "string" && x.invoice_no ? jcFmt("ca_vt_invoice_l", { n: x.invoice_no }) : ""].filter(Boolean).join(" · ");
    return '<li><span class="nm">' + esc(dateText(x.on)) + '</span>' + (note ? '<span class="note" dir="auto">' + esc(note) + '</span>' : '') +
      (vetOk(x.doc_url) ? '<span class="acts">' + vetDocLink(x.doc_url) + '</span>' : '') + '</li>';
  }).join("") + '</ul>';
}

/* ---------- the vet visit form (coordinators) ---------- */
function openVet(back, catIdOrNull){
  var cats = {};
  if (catIdOrNull) cats[catIdOrNull] = true;
  wd = { on: jcTzToday(cfg), clinic: "", done: {}, vaccine: "", vname: "", due: "", inv: "", url: "", shared: false, note: "",
         cats: cats, all: false, station_id: "", back: back || { to: "log" } };
  show("vet");
  try { window.scrollTo(0, 0); } catch(e){}
}
/* the server's rule: the visit date + 5 years by the calendar (29 Feb → 28 Feb), as Postgres adds '5 years' (code review L4) */
function vetPlus5(d){
  var y = Number(d.slice(0, 4)) + 5, md = d.slice(5);
  var t = y + "-" + md;
  return jcIsDate(t) ? t : y + "-02-28";
}
function vetBack(){ var b = wd ? wd.back : null; wd = null; logBack(b || { to: "log" }); }
function vetText(id, key, v, max, off, type){
  return '<label>' + esc(jcT(key)) + '<input type="' + (type || "text") + '" id="' + id + '" maxlength="' + max + '" dir="auto" autocomplete="off" value="' + esc(v) + '"' + off + '></label>';
}
function vetView(){
  if (!wd || !reg || !prog || !canEditCats()) { wd = null; return show("home"); }
  jcBack(vetBack);
  var w = wd, off = busy ? ' disabled' : '', today = jcTzToday(cfg);
  el("view").innerHTML = '<h1>' + esc(jcT("ca_l_log")) + '</h1>' + msgBox() +
    '<form class="panel" id="caVetForm" novalidate>' + kindHtml("vet", off) +
    '<fieldset id="caVCats">' + picksHtml(w, off, "ca_vt_cats", "ca_vt_cats_help") + '</fieldset>' +
    '<label>' + esc(jcT("ca_vt_on")) + '<input type="date" id="caVtOn" min="2000-01-01" max="' + today + '" value="' + esc(w.on) + '"' + off + '></label>' +
    vetText("caVtClinic", "ca_vt_clinic", w.clinic, 120, off) +
    '<fieldset><legend>' + esc(jcT("ca_vt_done")) + '</legend>' + VET_DONE.map(function(k){
      return '<label class="check"><input type="checkbox" data-vtdone="' + k + '"' + (w.done[k] ? ' checked' : '') + off + '> <span>' + esc(jcT("ca_vt_d_" + k)) + '</span></label>';
    }).join("") + '</fieldset>' +
    /* D9: ticking Vaccination shows the vaccine fields in place (hidden, not removed) */
    '<div class="jcstack" id="caVtVacBox"' + (w.done.vaccination ? '' : ' hidden') + '>' +
      jcPillsHtml({ id: "caVtVac", legend: jcT("ca_vt_vaccine"), attr: "data-vtvac", idPrefix: "caVtVac_", pressed: w.vaccine, off: off,
        items: VET_VAC.map(function(v){ return { value: v, text: jcT("ca_vt_v_" + v) }; }) }) +
      vetText("caVtVName", "ca_vt_vname", w.vname, 80, off) + '</div>' +
    '<label>' + esc(jcT("ca_vt_due_l")) + '<input type="date" id="caVtDue" value="' + esc(w.due) + '"' + off + '></label>' +
    vetText("caVtInv", "ca_vt_inv", w.inv, 60, off) +
    '<label>' + esc(jcT("ca_vt_url")) + '<input type="url" id="caVtUrl" maxlength="500" inputmode="url" autocomplete="off" aria-describedby="caVtUrlHelp" value="' + esc(w.url) + '"' + off + '></label>' +
    '<p class="help" id="caVtUrlHelp">' + esc(jcT("ca_vt_url_help")) + '</p>' +
    '<label class="check"><input type="checkbox" id="caVtShared" aria-describedby="caVtSharedHelp"' + (w.shared ? ' checked' : '') + off + '> <span>' + esc(jcT("ca_vt_shared")) + '</span></label>' +
    '<p class="help" id="caVtSharedHelp">' + esc(jcT("ca_vt_shared_help")) + '</p>' +
    '<label>' + esc(jcT("ca_v_note")) + '<textarea id="caVtNote" maxlength="500" dir="auto"' + off + '></textarea></label>' +
    '<button class="btn" type="submit" id="caVtSave"' + off + '>' + esc(jcT("ct_save")) + '</button></form>';
  wireKind("vet", function(){ return ""; }, w.back);
  wirePicks(w);
  el("caVtOn").addEventListener("change", function(){ w.on = el("caVtOn").value; });
  [["caVtClinic", "clinic"], ["caVtVName", "vname"], ["caVtInv", "inv"], ["caVtUrl", "url"]].forEach(function(p){
    el(p[0]).addEventListener("input", function(){ w[p[1]] = el(p[0]).value; });
  });
  el("caVtDue").addEventListener("change", function(){ w.due = el("caVtDue").value; });
  each("[data-vtdone]", function(b){
    w.done[b.dataset.vtdone] = b.checked;
    if (b.dataset.vtdone === "vaccination") el("caVtVacBox").hidden = !b.checked;
  }, "change");
  each("[data-vtvac]", function(b){
    w.vaccine = b.dataset.vtvac;
    Array.prototype.forEach.call(document.querySelectorAll("[data-vtvac]"), function(x){ x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
  });
  el("caVtShared").addEventListener("change", function(){ w.shared = el("caVtShared").checked; });
  el("caVtNote").value = w.note; el("caVtNote").addEventListener("input", function(){ w.note = el("caVtNote").value; });
  el("caVetForm").addEventListener("submit", function(e){
    e.preventDefault();
    if (busy) return;
    var cats = Object.keys(w.cats).filter(function(k){ return w.cats[k]; });
    var done = VET_DONE.filter(function(k){ return w.done[k]; });
    var url = w.url.trim(), inv = w.inv.trim(), vac = w.done.vaccination ? w.vaccine : "";
    var stop = function(code, id){ caMsg(code); var x = el(id) || document.querySelector(id); if (x) x.focus(); };
    if (!cats.length) return stop("NO_CAT_VET", el("caVAll") ? "caVAll" : "[data-pick]");
    if (!jcIsDate(w.on) || w.on > today || w.on < "2000-01-01") return stop("BAD_DATE_VET", "caVtOn");
    if (!done.length) return stop("BAD_DONE", "[data-vtdone]");
    if (w.done.vaccination && VET_VAC.indexOf(vac) < 0) return stop("BAD_VACCINE", "caVtVac_rabies");
    if (w.due && (!jcIsDate(w.due) || w.due <= w.on || w.due > vetPlus5(w.on))) return stop("BAD_DUE", "caVtDue");
    if (url && !vetOk(url)) return stop("BAD_LINK", "caVtUrl");
    if (w.shared && !inv && !url) return stop("NO_INVOICE", "caVtInv");
    busy = true; draw();
    rpc("jc_cat_vet_add", { p_fields: {
      visited_on: w.on, clinic: w.clinic.trim() || null, done: done, vaccine: vac || null,
      vaccine_name: vac ? (w.vname.trim() || null) : null, next_due: w.due || null, invoice_no: inv || null, doc_url: url || null,
      shared: w.shared, note: w.note.trim() || null, cats: cats } }).then(function(){
      busy = false; logReset(); vetBack(); jcShowOk(jcT("ca_vt_saved"));
      /* the cats' vaccines changed: re-read the register quietly; the cat page redraws when it lands (as save() does) */
      rpc("jc_cat_register").then(function(r){ reg = r; if (current === "cat") { draw(); jcShowOk(jcT("ca_vt_saved")); } }, function(){});
    }, function(err){ busy = false; draw(); var c = (err && err.code) || "UNKNOWN"; caMsg(c === "NO_CAT" ? "NO_CAT_VET" : c === "BAD_DATE" ? "BAD_DATE_VET" : c); });
  });
  jcPetPhotoFill();
}
