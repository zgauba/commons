/* Cats page — CC-4 visits + sightings (server 20261118220000_cc4_cat_visits_sightings.sql). Loaded BEFORE cats.js
   (definitions only, nothing runs at load: cats.js's boot may answer before a later script has run) and uses cats.js's
   state (reg, prog, cfg, busy, current, map) and helpers at call time; cats.js registers the three views. Programme only: residents never call these.
   - a feeding visit at a station: date, food / water / cleaned, headcount, the cats recognised (tap their pictures),
     unfamiliar cats, kittens, "flag a problem", note → jc_cat_visit_add;
   - a sighting of a register cat, or of one not identified yet (described), at a station or a pin or just an area →
     jc_cat_sighting_add;
   - the history lists (Activity tab, a station's, a cat's) → jc_cat_activity, 50 a page; Hide / Show again
     (coordinators, or the author for 24 h) → jc_cat_log_hide; coordinators link a sighting to a cat →
     jc_cat_sighting_link. Every rule is the server's; the page only words it.
   CC-5: vet visits (vet.js) share the lists (kind "vet", chip Vet) and the Log activity screen (coordinators). */

var vd = null;          /* the visit form's draft: { station_id, on, food, water, cleaned, headcount, unfamiliar, kittens, problemOn, problem, note, cats {id: true}, all, back } */
var sd = null;          /* the sighting form's draft: { cat_id, desc, when, station_id, area_id, w (where.js), note, back } */
var logs = {};          /* history lists by key ("all:<filter>", "st:<id>", "cat:<id>") → { items, more, loading, err } */
var actKind = "all";    /* the Activity tab's chip */
var stLogId = null;     /* the station whose history is open */
var LOG_KINDS = ["all", "visit", "sighting", "problem", "unidentified", "vet"];
var caMinis = { maps: [], obs: null };   /* the sightings' small maps (map.js jcMinisDraw); cats.js show() takes them down */

function logReset(){ logs = {}; }
/* the forms' refusals; BAD_STATION here means the station was archived meanwhile (code review L7) */
function logMsg(e){ var c = (e && e.code) || "UNKNOWN"; caMsg(c === "BAD_STATION" ? "BAD_STATION_LOG" : c); }
function logArgs(key){
  var p = key.split(":"), k = p[0], v = p[1] || null;
  return { p_station: k === "st" ? v : null, p_cat: k === "cat" ? v : null,
           p_kind: k === "all" && v !== "all" ? v : null, p_before: null, p_before_id: null };
}
/* fetch (or fetch more of) one list; redraw when it lands, if the person is still looking at it */
function logFetch(key, more){
  var L = logs[key] || (logs[key] = { items: [], more: false, loading: false, err: null });
  if (L.loading) return;
  var args = logArgs(key);
  /* keyset cursor (db review M1): the last entry's "at" exactly as the server sent it (never through Date) + its id */
  if (more && L.items.length) { args.p_before = L.items[L.items.length - 1].at; args.p_before_id = L.items[L.items.length - 1].id; }
  L.loading = true; L.err = null;
  rpc("jc_cat_activity", args).then(function(d){
    if (logs[key] !== L) return;
    var items = d && Array.isArray(d.items) ? d.items.filter(function(x){ return hObj(x) && typeof x.id === "string" && (x.kind === "visit" || x.kind === "sighting" || x.kind === "vet"); }) : [];
    L.items = more ? L.items.concat(items) : items; L.more = !!(d && d.more === true); L.loading = false; L.loaded = true;
    logPaint(key);
  }, function(e){
    if (logs[key] !== L) return;
    L.loading = false; L.err = (e && e.code) || "UNKNOWN"; logPaint(key);
  });
}
/* a list landing repaints only its own box, so the page's message ("Saved.") and the person's place stay */
function logPaint(key){
  var box = document.querySelector('.caLogBox[data-logkey="' + key + '"]');
  if (!box) return;
  jcMinisClear(caMinis);                     /* one list per screen: its old small maps go with it */
  box.innerHTML = logListBody(key);
  logWire(box);
  jcPetPhotoFill();
}
function logBox(key){ return '<div class="caLogBox jcstack" data-logkey="' + esc(key) + '">' + logListBody(key) + '</div>'; }
function logWhen(it){
  if ((it.kind === "visit" || it.kind === "vet") && typeof it.visited_on === "string") return dayOf(it.visited_on + "T12:00:00Z");
  return typeof it.at === "string" ? jcDayText(jcDateOf(it.at, cfg), { weekday: undefined, year: "numeric" }) + " " + jcClock(it.at, cfg) : "";
}
function logPlace(it){
  if (it.kind === "vet") return typeof it.clinic === "string" && it.clinic ? "\u2068" + it.clinic + "\u2069" : "";   /* CC-5: its clinic, typed text isolated */
  var s = hObj(it.station) ? [it.station.code, it.station.landmark].filter(Boolean).join(" · ") : "";
  if (s) return s;
  var a = typeof it.area_id === "string" ? areaName(prog, it.area_id) : "";
  return [a, finite(it.lat) && finite(it.lng) ? jcT("ca_l_pin") : ""].filter(Boolean).join(" · ");
}
function catLinks(list){
  return list.filter(function(c){ return hObj(c) && typeof c.id === "string"; }).map(function(c){
    return '<button class="mini" type="button" data-lcat="' + esc(c.id) + '">' + esc(c.name || c.code || "") + '</button>';
  }).join("");
}
/* one entry for jcEntriesHtml (DS-4b, D4 / D11: the Pets sightings card): meta "Feeding visit · when · where · by",
   the body, then Link / Hide at the foot. mini: this entry may draw its small map (the newest 10 with a pin) */
function logItem(it, mini){
  var off = busy ? ' disabled' : '', can = it.can_hide === true, coord = canEditCats(), h = [];
  var hid = it.hidden === true ? '<span class="chip">' + esc(jcT("ca_l_hidden")) + '</span>' : '';   /* shares the sighting's chip row */
  if (hid && it.kind !== "sighting") h.push('<div class="head">' + hid + '</div>');
  if (it.kind === "vet") h = h.concat(vetItemHtml(it));                                     /* CC-5, vet.js */
  else if (it.kind === "visit") {
    var checks = ["food", "water", "cleaned"].filter(function(k){ return it[k] === true; }).map(function(k){ return jcT("ca_v_" + k); });
    var counts = [["headcount", "ca_l_headcount"], ["unfamiliar", "ca_l_unfamiliar"], ["kittens", "ca_l_kittens"]].filter(function(p){
      return typeof it[p[0]] === "number"; }).map(function(p){
      return jcFmt(it[p[0]] === 1 && p[0] !== "unfamiliar" ? p[1] + "_1" : p[1], { n: it[p[0]] }); });
    if (checks.length) h.push('<div>' + esc(checks.join(" · ")) + '</div>');
    if (counts.length) h.push('<div>' + esc(counts.join(" · ")) + '</div>');
    var cats = Array.isArray(it.cats) ? it.cats : [];
    if (cats.length) h.push('<div class="head"><span class="meta">' + esc(jcT("ca_l_recognised")) + '</span>' + catLinks(cats) + '</div>');
    if (typeof it.problem === "string" && it.problem) h.push('<p class="notice warn caProblem" dir="auto"><b>' + esc(jcT("ca_l_problem")) + ':</b> ' + esc(it.problem) + '</p>');
  } else {
    if (hObj(it.cat)) h.push('<div class="head">' + hid + catLinks([it.cat]) + (it.linked === true ? '<span class="meta">' + esc(jcT("ca_l_linked")) + '</span>' : '') + '</div>');
    else h.push('<div class="head">' + hid + '<span class="chip" data-unid>' + esc(jcT("ca_l_unid")) + '</span></div>');
    if (typeof it.description === "string" && it.description) h.push('<div dir="auto">' + esc(it.description) + '</div>');
  }
  if (typeof it.note === "string" && it.note) h.push('<div dir="auto">' + esc(it.note) + '</div>');
  var pos = it.kind === "sighting" && finite(it.lat) && finite(it.lng);
  if (pos && mini) h.push(jcMiniHtml(it.lat, it.lng));
  if (coord && it.kind === "sighting" && typeof it.description === "string" && it.description) {
    var live = catsList(reg).filter(function(c){ return !merged(c); });
    h.push('<label>' + esc(jcT("ca_l_link_to")) + '<select data-lsel="' + esc(it.id) + '"' + off + '><option value="">' + esc(jcT(hObj(it.cat) ? "ca_l_unlink_opt" : "ca_pick")) + '</option>' +
      live.map(function(c){ return '<option value="' + esc(c.id) + '"' + (hObj(it.cat) && it.cat.id === c.id ? ' selected' : '') + '>' + esc([c.code, c.name].filter(Boolean).join(" · ")) + '</option>'; }).join("") +
      '</select></label>');
  }
  var acts = [];
  if (pos) acts.push(jcMapLink(it.lat, it.lng));
  if (it.kind === "vet" && it.doc_url) acts.push(vetDocLink(it.doc_url));
  if (coord && it.kind === "sighting" && typeof it.description === "string" && it.description)
    acts.push('<button class="mini" type="button" data-llink="' + esc(it.id) + '"' + off + '>' + esc(jcT("ca_l_link")) + '</button>');
  if (can) acts.push('<button class="mini" type="button" data-lhide="' + esc(it.kind + ":" + it.id) + '" data-on="' + (it.hidden === true ? "0" : "1") + '"' + off + '>' +
    esc(jcT(it.hidden === true ? "ca_l_show" : "ca_l_hide")) + '</button>');
  if (acts.length) h.push('<div class="acts">' + acts.join("") + '</div>');
  return { liAttrs: 'class="caLog" data-log="' + esc(it.id) + '" data-kind="' + esc(it.kind) + '"' + (it.hidden === true ? ' data-hidden' : ''),
    meta: [jcT(it.kind === "visit" ? "ca_l_visit" : it.kind === "vet" ? "ca_l_vet" : "ca_l_sighting"), logWhen(it), logPlace(it),
           typeof it.by === "string" && it.by ? jcFmt("ca_l_by", { n: it.by }) : ""].filter(Boolean).join(" · "),
    bodyHtml: h.join("") };
}
/* a station's list has a heading; the Activity tabs don't (it would repeat the tab name, D1) */
function logHeading(key){ return key.indexOf("st:") === 0 ? jcT("ca_l_history") : null; }
var LOG_MINIS = 10;
function logListBody(key){
  var L = logs[key], head = logHeading(key);
  var h2 = head ? '<h2 class="group">' + esc(head) + '</h2>' : '';
  if (!L || (!L.loaded && !L.err)) { if (!L || !L.loading) logFetch(key); return h2 + '<p class="help" data-logwait>' + esc(jcT("working")) + '</p>'; }
  /* code review M1/M2: a failed load says so and offers Retry (first page) or keeps "Show older" (later pages) */
  var err = L.err && !L.loading ? '<p class="notice" data-logerr>' + esc(jcErrTextFor("ca_err_", L.err)) + '</p>' : '';
  if (err && !L.items.length) return h2 + err + '<div class="acts"><button class="btn ghost" type="button" data-lretry="' + esc(key) + '">' + esc(jcT("ca_l_retry")) + '</button></div>';
  var left = typeof window.L !== "undefined" ? LOG_MINIS : 0;      /* window.L = Leaflet (L here is the list) */
  return err + jcEntriesHtml({ heading: head, items: L.items.map(function(it){
      var pin = it.kind === "sighting" && finite(it.lat) && finite(it.lng);
      return logItem(it, pin && left-- > 0);
    }), empty: jcT("ca_l_none"), emptyAttrs: 'data-lognone',
    afterHtml: L.more ? '<div class="acts"><button class="btn ghost" type="button" data-lmore="' + esc(key) + '"' + (L.loading ? ' disabled' : '') + '>' + esc(jcT("ca_l_more")) + '</button></div>' : '' });
}
/* code review M3: a hide / show / link changes one entry in place — the person keeps their place, the pages already loaded
   and focus. Lists on screen get the server's new entry; lists not on screen are dropped (re-read when next shown). */
function logWrite(name, args, okKey, btn){
  if (busy) return;
  busy = true;
  if (btn) jcBusy(btn.id || (btn.id = "caLb" + Date.now()), true);
  rpc(name, args).then(function(d){
    busy = false;
    var it = d && (hObj(d.visit) ? d.visit : hObj(d.sighting) ? d.sighting : hObj(d.vet) ? d.vet : null);
    Object.keys(logs).forEach(function(k){
      var box = document.querySelector('.caLogBox[data-logkey="' + k + '"]');
      if (!box || !it) { delete logs[k]; return; }
      logs[k].items = logs[k].items.map(function(x){ return x.id === it.id && x.kind === it.kind ? it : x; });
      logPaint(k);
    });
    jcShowOk(jcT(okKey));
    var again = it && document.querySelector('.caLog[data-log="' + it.id + '"] ' + (name === "jc_cat_log_hide" ? "[data-lhide]" : "[data-llink]"));
    if (again) again.focus();
  }, function(e){
    busy = false;
    if (btn && document.body.contains(btn)) jcBusy(btn.id, false);
    caMsg((e && e.code) || "UNKNOWN");
  });
}
/* root: the list box just repainted, or the whole page after a draw */
function logWire(root){
  root = root || document;
  function onClick(sel, fn){ Array.prototype.forEach.call(root.querySelectorAll(sel), function(b){ b.addEventListener("click", function(){ fn(b); }); }); }
  onClick("[data-lmore]", function(b){ logFetch(b.dataset.lmore, true); logPaint(b.dataset.lmore); });
  onClick("[data-lretry]", function(b){ var k = b.dataset.lretry; delete logs[k]; logFetch(k); logPaint(k); });
  onClick("[data-lcat]", function(b){ catId = b.dataset.lcat; catTab = "about"; show("cat"); try { window.scrollTo(0, 0); } catch(e){} });
  onClick("[data-lhide]", function(b){
    var p = b.dataset.lhide.split(":");
    logWrite("jc_cat_log_hide", { p_kind: p[0], p_id: p[1], p_hidden: b.dataset.on === "1" }, b.dataset.on === "1" ? "ca_l_hidden_ok" : "ca_l_shown_ok", b);
  });
  onClick("[data-llink]", function(b){
    var s = root.querySelector('[data-lsel="' + b.dataset.llink + '"]');
    if (!s) return;
    logWrite("jc_cat_sighting_link", { p_sighting: b.dataset.llink, p_cat: s.value || null }, s.value ? "ca_l_linked_ok" : "ca_l_unlinked_ok", b);
  });
  jcMinisDraw(caMinis, root === document ? null : root);
}

/* ---------- the Activity tab: one "Log activity" button (D10), the kinds, the list ---------- */
function logTabHtml(){
  var off = busy ? ' disabled' : '';
  return '<div class="acts"><button class="btn" type="button" id="caLogAct"' + off + '>' + esc(jcT("ca_l_log")) + '</button></div>' +
    '<p class="help" id="caLogHelp">' + esc(jcT("ca_l_tab_help")) + (canEditCats() ? ' ' + esc(jcT("ca_l_tab_help_coord")) : '') + '</p>' +
    jcChipsHtml({ id: "caLogChips", prefix: "caLk_", label: jcT("ca_tab_log"), current: actKind,
      items: LOG_KINDS.map(function(k){ return { key: k, text: jcT("ca_lk_" + k) }; }) }) +
    '<div id="caLogList">' + logBox("all:" + actKind) + '</div>';
}
function wireLogTab(){
  jcChipsWire("caLogChips", "caLk_", function(k){ actKind = k; draw(); });
  on("caLogAct", function(){ openVisit(null, { to: "log" }); });
  logWire();
}

/* ---------- a station's history ---------- */
function stationLogView(){
  var st = prog ? stationsOf(prog).filter(function(s){ return s.id === stLogId; })[0] : null;
  if (!st) return show("home");
  jcBack(function(){ show("home"); });
  var off = busy ? ' disabled' : '';
  el("view").innerHTML = '<h1 dir="auto">' + esc([st.code, st.landmark].filter(Boolean).join(" · ")) + '</h1>' + msgBox() +
    (st.archived === true ? '' : '<div class="acts"><button class="btn" type="button" id="caStVisit"' + off + '>' + esc(jcT("ca_l_add_visit")) + '</button></div>') +
    logBox("st:" + st.id);
  on("caStVisit", function(){ openVisit(st.id, { to: "stlog" }, true); });
  logWire();
}

/* ---------- a cat's Activity tab: "Report seeing ⟨name⟩" (Pets' button and wording, D4), then its entries ---------- */
function catLogHtml(c){
  if (!reg || merged(c)) return '';
  var off = busy ? ' disabled' : '';
  return '<div class="acts"><button class="btn ghost" type="button" id="caCatSeen"' + off + '>' + esc(jcFmt("ca_l_seen_btn", { n: catTitle(c) })) + '</button>' +
    (canEditCats() ? '<button class="btn ghost" type="button" id="caCatVet"' + off + '>' + esc(jcT("ca_vt_add")) + '</button>' : '') + '</div>' +
    '<div id="caCatLog">' + logBox("cat:" + c.id) + '</div>';
}
function wireCatLog(c){
  on("caCatSeen", function(){ openSighting(c.id, { to: "cat", cat: c.id }); });
  on("caCatVet", function(){ openVet({ to: "cat", cat: c.id }, c.id); });                     /* CC-5 */
  logWire();
}

/* ---------- Log activity: one screen, Feeding visit or Sighting (D10) ----------
   back: where the back arrow / Save return — { to: "log" | "home" | "stlog" | "cat", cat }. The kind pills swap the form and keep
   the station chosen. */
function logBack(b){
  b = b || { to: "home" };
  if (b.to === "cat" && b.cat) { catId = b.cat; show("cat"); }
  else if (b.to === "stlog") show("stlog");
  else { if (b.to === "log") tab = "log"; show("home"); }
}
function kindHtml(k, off){
  var items = [{ value: "visit", text: jcT("ca_l_visit") }, { value: "sighting", text: jcT("ca_l_sighting") }];
  if (canEditCats()) items.push({ value: "vet", text: jcT("ca_l_vet") });                    /* CC-5: coordinators */
  return jcPillsHtml({ id: "caKind", legend: jcT("ca_l_kind"), attr: "data-lkind", idPrefix: "caKind_", pressed: k, off: off, items: items });
}
/* stationNow(): the station chosen at the moment of the switch */
function wireKind(k, stationNow, back){
  each("[data-lkind]", function(b){
    if (b.dataset.lkind === k) return;
    var st = stationNow();
    if (b.dataset.lkind === "sighting") openSighting(null, back, st);
    else if (b.dataset.lkind === "vet") openVet(back);
    else openVisit(st || null, back);
    var x = el("caKind_" + b.dataset.lkind); if (x) x.focus();
  });
}
function stationName(id){ var x = stationsOf(prog).filter(function(s){ return s.id === id; })[0]; return x ? [x.code, x.landmark].filter(Boolean).join(" · ") : ""; }
function stationOpts(sel, none){
  return '<option value="">' + esc(jcT(none)) + '</option>' + stationsOf(prog).filter(function(x){ return x.archived !== true || x.id === sel; }).map(function(x){
    return '<option value="' + esc(x.id) + '"' + (x.id === sel ? ' selected' : '') + '>' + esc([x.code, x.landmark].filter(Boolean).join(" · ")) + '</option>';
  }).join("");
}

/* ---------- the visit form ---------- */
/* fixed: opened from a station (its card or its history) — the form names the station instead of asking (plan D10) */
function openVisit(stationId, back, fixed){
  vd = { station_id: stationId || "", fixed: !!(fixed && stationId), on: jcTzToday(cfg), food: false, water: false, cleaned: false, headcount: "", unfamiliar: "", kittens: "",
         problemOn: false, problem: "", note: "", cats: {}, all: false, back: back || { to: "home" } };
  show("visit");
  try { window.scrollTo(0, 0); } catch(e){}
}
function visitBack(){ var b = vd ? vd.back : null; vd = null; logBack(b); }
function pickHtml(c, on, off){
  return '<button type="button" class="caPick" data-pick="' + esc(c.id) + '" aria-pressed="' + (on ? "true" : "false") + '"' + off + '>' +
    jcPetPhotoHtml({ photo_path: strs(c.photos)[0] || null }, 22, "thumb") + '<span dir="auto">' + esc(catTitle(c)) + '</span></button>';
}
function numHtml(id, key, v, max, off){
  return '<label>' + esc(jcT(key)) + '<input type="number" id="' + id + '" inputmode="numeric" min="0" max="' + max + '" step="1" value="' + esc(v) + '"' + off + '></label>';
}
/* the cats to tap: this station's first, then its area's, then (on "Show all") the rest. legendKey / helpKey: the vet
   form's own words (CC-5; it has no station, so every cat is behind "Show all" until picked) */
function picksHtml(v, off, legendKey, helpKey){
  var st = stationsOf(prog).filter(function(s){ return s.id === v.station_id; })[0] || null;
  var live = catsList(reg).filter(function(c){ return !merged(c); });
  var here = st ? live.filter(function(c){ return c.station_id === st.id; }) : [];
  var near = st ? live.filter(function(c){ return c.station_id !== st.id && c.area_id === st.area_id; }) : [];
  var rest = live.filter(function(c){ return here.indexOf(c) < 0 && near.indexOf(c) < 0; });
  var shown = here.concat(near).concat(v.all ? rest : rest.filter(function(c){ return v.cats[c.id]; }));
  var picked = Object.keys(v.cats).filter(function(k){ return v.cats[k]; }).length;
  return '<legend>' + esc(jcT(legendKey || "ca_v_cats")) + '</legend>' +
    '<p class="help" id="caVPicked" role="status" data-help="' + esc(helpKey || "ca_v_cats_help") + '">' +
      esc(picked ? jcFmt("ca_v_picked", { n: picked }) : jcT(helpKey || "ca_v_cats_help")) + '</p>' +
    (shown.length ? '<div class="caPicks">' + shown.map(function(c){ return pickHtml(c, !!v.cats[c.id], off); }).join("") + '</div>' : '') +
    (rest.length && !v.all ? '<div class="acts"><button class="mini" type="button" id="caVAll"' + off + '>' + esc(jcFmt("ca_v_all", { n: rest.length })) + '</button></div>' : '');
}
function wirePicks(v){
  each("[data-pick]", function(b){
    v.cats[b.dataset.pick] = !v.cats[b.dataset.pick];
    b.setAttribute("aria-pressed", v.cats[b.dataset.pick] ? "true" : "false");
    var n = Object.keys(v.cats).filter(function(k){ return v.cats[k]; }).length;
    el("caVPicked").textContent = n ? jcFmt("ca_v_picked", { n: n }) : jcT(el("caVPicked").dataset.help || "ca_v_cats_help");
  });
  on("caVAll", function(){ v.all = true; draw(); var f = document.querySelector("[data-pick]"); if (f) f.focus(); });
}
function visitView(){
  if (!vd || !reg || !prog) { vd = null; return show("home"); }
  jcBack(visitBack);
  var v = vd, off = busy ? ' disabled' : '', today = jcTzToday(cfg);
  el("view").innerHTML = '<h1>' + esc(jcT("ca_l_log")) + '</h1>' + msgBox() +
    '<form class="panel" id="caVisitForm" novalidate>' + kindHtml("visit", off) +
    (v.fixed ? '<p class="help" id="caVStLine" dir="auto">' + esc(stationName(v.station_id)) + '</p>'
      : '<label>' + esc(jcT("ca_v_station")) + '<select id="caVSt"' + off + '>' + stationOpts(v.station_id, "ca_pick") + '</select></label>') +
    '<label>' + esc(jcT("ca_v_on")) + '<input type="date" id="caVOn" min="' + jcDateAdd(today, -14) + '" max="' + today + '" value="' + esc(v.on) + '"' + off + '></label>' +
    '<fieldset><legend>' + esc(jcT("ca_v_checks")) + '</legend>' + ["food", "water", "cleaned"].map(function(k){
      return '<label class="check"><input type="checkbox" data-vchk="' + k + '"' + (v[k] ? ' checked' : '') + off + '> <span>' + esc(jcT("ca_v_" + k)) + '</span></label>';
    }).join("") + '</fieldset>' +
    numHtml("caVHead", "ca_v_headcount", v.headcount, 200, off) +
    '<fieldset id="caVCats">' + picksHtml(v, off) + '</fieldset>' +
    numHtml("caVUnf", "ca_v_unfamiliar", v.unfamiliar, 50, off) + numHtml("caVKit", "ca_v_kittens", v.kittens, 50, off) +
    '<label class="check"><input type="checkbox" id="caVProb"' + (v.problemOn ? ' checked' : '') + off + '> <span>' + esc(jcT("ca_v_flag")) + '</span></label>' +
    (v.problemOn ? '<label>' + esc(jcT("ca_v_problem")) + '<textarea id="caVProbTxt" maxlength="500" dir="auto"' + off + '></textarea></label>' : '') +
    '<label>' + esc(jcT("ca_v_note")) + '<textarea id="caVNote" maxlength="500" dir="auto"' + off + '></textarea></label>' +
    '<button class="btn" type="submit" id="caVSave"' + off + '>' + esc(jcT("ct_save")) + '</button></form>';
  wireKind("visit", function(){ return v.station_id; }, v.back);
  /* D9: a new station redraws only the cats to tap — never the form, never a re-focus (iPhone re-opens the picker) */
  if (el("caVSt")) el("caVSt").addEventListener("change", function(){
    v.station_id = el("caVSt").value;
    el("caVCats").innerHTML = picksHtml(v, off); wirePicks(v); jcPetPhotoFill();
  });
  el("caVOn").addEventListener("change", function(){ v.on = el("caVOn").value; });
  each("[data-vchk]", function(b){ v[b.dataset.vchk] = b.checked; }, "change");
  [["caVHead", "headcount"], ["caVUnf", "unfamiliar"], ["caVKit", "kittens"]].forEach(function(p){
    el(p[0]).addEventListener("input", function(){ v[p[1]] = el(p[0]).value; });
  });
  wirePicks(v);
  el("caVProb").addEventListener("change", function(){ v.problemOn = el("caVProb").checked; draw(); var t = el("caVProbTxt") || el("caVProb"); t.focus(); });
  var pt = el("caVProbTxt");
  if (pt) { pt.value = v.problem; pt.addEventListener("input", function(){ v.problem = pt.value; }); }
  el("caVNote").value = v.note; el("caVNote").addEventListener("input", function(){ v.note = el("caVNote").value; });
  el("caVisitForm").addEventListener("submit", function(e){
    e.preventDefault();
    if (busy) return;
    if (!v.station_id) { caMsg("NO_STATION"); el("caVSt").focus(); return; }
    if (!jcIsDate(v.on) || v.on > today || v.on < jcDateAdd(today, -14)) { caMsg("BAD_DATE"); el("caVOn").focus(); return; }
    var nums = {}, bad = null;
    [["headcount", 200, "caVHead"], ["unfamiliar", 50, "caVUnf"], ["kittens", 50, "caVKit"]].forEach(function(p){
      var s = String(v[p[0]]).trim();
      if (s === "") { nums[p[0]] = null; return; }
      var n = Number(s);
      if (!/^\d+$/.test(s) || n > p[1]) { if (!bad) bad = p[2]; return; }
      nums[p[0]] = n;
    });
    if (bad) { caMsg("BAD_COUNT"); el(bad).focus(); return; }
    if (v.problemOn && !v.problem.trim()) { caMsg("NO_PROBLEM"); el("caVProbTxt").focus(); return; }
    busy = true; draw();
    rpc("jc_cat_visit_add", { p_station: v.station_id, p_fields: {
      visited_on: v.on, food: v.food, water: v.water, cleaned: v.cleaned,
      headcount: nums.headcount, unfamiliar: nums.unfamiliar, kittens: nums.kittens,
      problem: v.problemOn ? v.problem.trim() : null, note: v.note.trim() || null,
      cats: Object.keys(v.cats).filter(function(k){ return v.cats[k]; }) } }).then(function(){
      busy = false; logReset(); visitBack(); jcShowOk(jcT("ca_v_saved"));
    }, function(err){ busy = false; draw(); logMsg(err); });
  });
  jcPetPhotoFill();
}

/* ---------- the sighting form ---------- */
function openSighting(catIdOrNull, back, stationId){
  var now = new Date(), pad = function(n){ return ("0" + n).slice(-2); };
  sd = { cat_id: catIdOrNull || "", desc: "", note: "", station_id: stationId || "", area_id: "",
         when: now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate()) + "T" + pad(now.getHours()) + ":" + pad(now.getMinutes()),
         w: { lat: null, lng: null, picking: false }, back: back || { to: "log" } };
  show("sighting");
  try { window.scrollTo(0, 0); } catch(e){}
}
function sightBack(){ var b = sd ? sd.back : null; sd = null; logBack(b || { to: "log" }); }
function sightingView(){
  if (!sd || !reg || !prog) { sd = null; return show("home"); }
  takeMap();
  jcBack(sightBack);
  var s = sd, off = busy ? ' disabled' : '';
  var live = catsList(reg).filter(function(c){ return !merged(c); });
  var areas = areasOf(prog).filter(function(a){ return a.archived !== true; });
  /* D9: choosing the cat or the station only shows / hides the part that depends on it (hidden, not removed) */
  el("view").innerHTML = '<h1>' + esc(jcT("ca_l_log")) + '</h1>' + msgBox() +
    '<form class="panel" id="caSightForm" novalidate>' + kindHtml("sighting", off) +
    '<label>' + esc(jcT("ca_s_cat")) + '<select id="caSCat"' + off + '><option value="">' + esc(jcT("ca_s_unknown")) + '</option>' +
      live.map(function(c){ return '<option value="' + esc(c.id) + '"' + (c.id === s.cat_id ? ' selected' : '') + '>' + esc([c.code, c.name].filter(Boolean).join(" · ")) + '</option>'; }).join("") + '</select></label>' +
    '<div class="jcstack" id="caSDescBox"' + (s.cat_id ? ' hidden' : '') + '><label>' + esc(jcT("ca_s_desc")) +
      '<input type="text" id="caSDesc" maxlength="200" dir="auto" autocomplete="off" aria-describedby="caSDescHelp"' + off + '></label>' +
      '<p class="help" id="caSDescHelp">' + esc(jcT("ca_s_desc_help")) + '</p></div>' +
    '<label>' + esc(jcT("ca_s_when")) + '<input type="datetime-local" id="caSWhen" value="' + esc(s.when) + '"' + off + '></label>' +
    '<label>' + esc(jcT("ca_s_station")) + '<select id="caSSt"' + off + '>' + stationOpts(s.station_id, "ca_s_no_station") + '</select></label>' +
    '<div class="jcstack" id="caSPlaceBox"' + (s.station_id ? ' hidden' : '') + '>' +
      '<fieldset id="caSWhere"><legend>' + esc(jcT("ca_where")) + '</legend>' + jcWhereHtml(s.w, "caSW", off) + '</fieldset>' +
      '<label>' + esc(jcT("ca_area")) + '<select id="caSArea"' + off + '><option value="">' + esc(jcT("ca_none_opt")) + '</option>' +
        areas.map(function(a){ return '<option value="' + esc(a.id) + '"' + (a.id === s.area_id ? ' selected' : '') + '>' + esc(a.name) + '</option>'; }).join("") + '</select></label>' +
      '<p class="help">' + esc(jcT("ca_s_place_help")) + '</p></div>' +
    '<label>' + esc(jcT("ca_v_note")) + '<textarea id="caSNote" maxlength="500" dir="auto"' + off + '></textarea></label>' +
    '<button class="btn" type="submit" id="caSSave"' + (busy || s.w.picking ? ' disabled' : '') + '>' + esc(jcT("ct_save")) + '</button></form>';
  wireKind("sighting", function(){ return s.station_id; }, s.back);
  el("caSCat").addEventListener("change", function(){ s.cat_id = el("caSCat").value; el("caSDescBox").hidden = !!s.cat_id; });
  var dsc = el("caSDesc");
  dsc.value = s.desc; dsc.addEventListener("input", function(){ s.desc = dsc.value; });
  el("caSWhen").addEventListener("change", function(){ s.when = el("caSWhen").value; });
  el("caSSt").addEventListener("change", function(){
    s.station_id = el("caSSt").value;
    if (s.w.picking) { s.w.picking = false; s.w.tok = null; draw(); return; }      /* the pin map can't stay open, hidden */
    el("caSPlaceBox").hidden = !!s.station_id;
  });
  el("caSArea").addEventListener("change", function(){ s.area_id = el("caSArea").value; });
  el("caSNote").value = s.note; el("caSNote").addEventListener("input", function(){ s.note = el("caSNote").value; });
  var c = (cfg && cfg.map) || {};
  jcWhereWire(s.w, "caSW", { draw: draw, alive: function(){ return current === "sighting" && sd === s; },
    center: [c.lat || 24.53, c.lng || 54.43], zoom: c.zoom || 16, onError: caMsg, setMap: function(m){ map = m; } });
  el("caSightForm").addEventListener("submit", function(e){
    e.preventDefault();
    if (busy || s.w.picking) return;
    if (!s.cat_id && !s.desc.trim()) { caMsg("NO_CAT"); el("caSDesc").focus(); return; }
    var t = Date.parse(s.when);
    if (!isFinite(t) || t > Date.now() + 300000 || t < Date.now() - 14 * 864e5) { caMsg("BAD_DATE"); el("caSWhen").focus(); return; }
    if (!s.station_id && s.w.lat == null && !s.area_id) { caMsg("NO_PLACE"); el("caSSt").focus(); return; }
    var f = { seen_at: new Date(t).toISOString(), note: s.note.trim() || null };
    if (s.cat_id) f.cat_id = s.cat_id; else f.description = s.desc.trim();
    if (s.station_id) f.station_id = s.station_id;
    else { if (s.w.lat != null) { f.lat = s.w.lat; f.lng = s.w.lng; } if (s.area_id) f.area_id = s.area_id; }
    busy = true; draw();
    rpc("jc_cat_sighting_add", { p_fields: f }).then(function(){
      busy = false; logReset(); sightBack(); jcShowOk(jcT("ca_s_saved"));
    }, function(err){ busy = false; draw(); logMsg(err); });
  });
}
