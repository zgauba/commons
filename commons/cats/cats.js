/* Cats page — the community cat programme. Plan: docs/plans/CC-community-cats.md.
   CC-1 foundation (the page behind the 'cats' module flag — off = nothing asked of the server — and the role line);
   CC-2 areas + feeding stations (server 20261118140000_cc2_cat_areas_stations.sql).
   Two server families, never one filtered here (plan premortem #6):
   - residents: jc_cat_places — public stations only (no Station ID, notes, people or history); shown as a list;
   - the programme (coordinators 'cats', volunteers 'cats_vol', community admins): jc_cat_programme — every station
     incl. private pins, access notes, who feeds where (names only), earlier locations. can_edit (coordinators and
     community admins) shows the editors; every write is checked by the server again.
   CC-3 the cat register (server 20261118180000_cc3_cat_register.sql), again two families:
   - residents: jc_cats_public — name, photos, area, status, ear tip, sterilised, story (no old ID, station, TNVR, dates,
     sources, history, merged duplicates);
   - the programme: jc_cat_register — the full record + status history; coordinators also see merged duplicates (undo)
     and get the editor (jc_cat_save), photos (jc_cat_photo_begin / _commit / _remove, up to 4) and merge / undo.
   Roles come from jc_me_get.admin_scopes (display only). CC-4 visits + sightings live in log.js (Activity tab, a station's
   history, a cat's history, the two forms). The vet log (CC-5) follows. */

var state = null, cfg = null, current = null;
var msgBox = jcMsgBox, ar = jcIsAr, on = jcOn, each = jcEach, hObj = jcObj, finite = jcFinite;
var places = null, prog = null, loadErr = null, busy = false, map = null;
var tab = "cats";                     /* the programme's tabs: cats · log (CC-4 Activity) · stations · areas (coordinators) */
var reg = null, pubCats = null;       /* CC-3: the register (programme) · the residents' cat list */
var catQ = "", catId = null;          /* the cats search · the open cat */
var catTab = "about";                 /* the cat page's tab: about · log (programme) */
var ced = null;                       /* the cat editor's draft: { id | null, f: {field: value}, merge_into, shrinking } */
var ed = null;                        /* the station editor's draft: { id | null, area_id, w (where.js), landmark, notes, private (null = not chosen), people {user_id: role}, archived } */
var newArea = "";
var renaming = null;                  /* the area being renamed: { id, name } (only one at a time) */
function caMsg(code){ jcShowErrFor("ca_err_", code); }
function scopes(){ return (state && state.me && state.me.admin_scopes) || []; }
function inProgramme(){ var sc = scopes(); return sc.indexOf("cats") >= 0 || sc.indexOf("cats_vol") >= 0 || sc.indexOf("community") >= 0; }
function canEdit(){ return !!(prog && prog.can_edit === true); }
/* the one line about the person's role here, or none */
function roleKey(){
  var sc = scopes();
  return sc.indexOf("cats") >= 0 ? "ca_role_cats" : sc.indexOf("cats_vol") >= 0 ? "ca_role_cats_vol"
       : sc.indexOf("community") >= 0 ? "ca_role_admin" : null;
}
function isArea(a){ return hObj(a) && typeof a.id === "string" && typeof a.name === "string"; }
function isStation(s){ return hObj(s) && typeof s.id === "string" && typeof s.area_id === "string" && finite(s.lat) && finite(s.lng); }
function areasOf(d){ return (d && Array.isArray(d.areas) ? d.areas : []).filter(isArea); }
function stationsOf(d){ return (d && Array.isArray(d.stations) ? d.stations : []).filter(isStation); }
function areaName(d, id){ var a = areasOf(d).filter(function(x){ return x.id === id; })[0]; return a ? a.name : ""; }
function dayOf(iso){ return jcDayText(jcDateOf(iso, cfg), { weekday: undefined, year: "numeric" }); }
function takeMap(){ if (map) { jcMapRemove(map); map = null; } if (ed && ed.w) ed.w.map = null; if (sd && sd.w) sd.w.map = null; }
function draw(){ show(current); }

/* ---------- data ---------- */
function load(){
  loadErr = null;
  function asResident(){
    return Promise.all([rpc("jc_cat_places"), rpc("jc_cats_public")]).then(function(r){ places = r[0]; pubCats = r[1]; });
  }
  var call = inProgramme() ? Promise.all([rpc("jc_cat_programme"), rpc("jc_cat_register")]).then(function(r){ prog = r[0]; reg = r[1]; }, function(e){
    if (e && e.code === "NOT_ADMIN") { prog = null; reg = null; return asResident(); }   /* role just removed */
    throw e;
  }) : asResident();
  return call.catch(function(e){ loadErr = (e && e.code) || "UNKNOWN"; });
}
/* every station / area write returns the programme view; every cat write returns the register (CC-3) */
function save(name, args, okKey, after){
  if (busy) return;
  busy = true; draw();
  rpc(name, args).then(function(d){
    busy = false;
    if (/^jc_cat_(save|merge|unmerge|photo_)/.test(name)) reg = d;
    else {
      prog = d;
      /* review M2: an area rename / station change shows on the cats too (their area name, usual station) */
      /* quietly: the station / area screen is the one showing (and its "Saved."); the Cats tab draws from it next */
      if (reg) rpc("jc_cat_register").then(function(r){ reg = r; }, function(){});
    }
    if (after) after();
    draw(); jcShowOk(jcT(okKey));
  }, function(e){ busy = false; draw(); caMsg((e && e.code) || "UNKNOWN"); });
}

/* ---------- pieces ---------- */
function peopleLine(s){
  var by = { lead: [], feeder: [], backup: [] };
  (Array.isArray(s.people) ? s.people : []).forEach(function(p){
    if (hObj(p) && Object.prototype.hasOwnProperty.call(by, p.role)) by[p.role].push(typeof p.name === "string" && p.name ? p.name : jcT("ca_someone"));
  });
  return ["lead", "feeder", "backup"].filter(function(r){ return by[r].length; }).map(function(r){
    return '<span class="caPeople" data-role="' + r + '"><b>' + esc(jcT("ca_r_" + r + "s")) + ':</b> <span dir="auto">' + esc(by[r].join(", ")) + '</span></span>';
  }).join(" · ");
}
/* DS-4c: stations as the Pets Strays tab — a map of the stations above a nearest-first list of list cards
   (sorted-by line, Use Where I Am), archived ones last. The map: Street / Satellite, Full Screen, Find Me (the kit). */
var smap = null, sLayer = "sat", sfull = jcMapFull(function(){ return smap; }, null);
function dropSmap(){ sfull.reset(); if (smap) { var m = smap; smap = null; jcMapRemove(m); } }
function stationAt(s){ return { lat: s.lat, lng: s.lng }; }
function stationTitle(s, programme){ return programme && s.code ? s.code + (s.landmark ? " · " + s.landmark : "") : (s.landmark || jcT("ca_station")); }
function stationCard(d, s, programme){
  var dist = s.archived === true ? null : jcDistOf(jcOrigin(), stationAt(s));
  var acts = [jcDirLink(s.lat, s.lng)];
  if (programme && s.archived !== true) acts.push('<button class="mini" type="button" data-visit="' + esc(s.id) + '">' + esc(jcT("ca_l_add_visit")) + '</button>');   /* CC-4 */
  if (programme) acts.push('<button class="mini" type="button" data-stlog="' + esc(s.id) + '">' + esc(jcT("ca_l_history")) + '</button>');
  if (programme && canEdit()) acts.push('<button class="mini" type="button" data-edit="' + esc(s.id) + '">' + esc(jcT("ca_edit")) + '</button>');
  return '<li class="caStation" data-station="' + esc(s.id) + '">' +
    '<div class="head"><b dir="auto">' + esc(stationTitle(s, programme)) + '</b>' +          /* D6: the chip right after the title */
    (programme && s.private === true ? '<span class="chip" data-private>' + esc(jcT("ca_private")) + '</span>' : '') + '</div>' +
    '<div class="meta" dir="auto">' + esc(areaName(d, s.area_id)) + '</div>' +
    (dist !== null ? '<div class="meta"><bdi dir="ltr">' + esc(jcFmt("sort_dist", { d: jcFmtDist(dist) })) + '</bdi></div>' : '') +
    (programme && peopleLine(s) ? '<div>' + peopleLine(s) + '</div>' : '') +
    (programme && typeof s.access_notes === "string" && s.access_notes ? '<div class="caNotes" dir="auto">' + esc(s.access_notes) + '</div>' : '') +
    '<div class="acts">' + acts.join("") + '</div></li>';
}
/* the server's area order, then nearest first from the phone / the home pin when there is one */
function stationOrder(d, list){
  var byArea = [];
  areasOf(d).forEach(function(a){ list.forEach(function(s){ if (s.area_id === a.id) byArea.push(s); }); });
  list.forEach(function(s){ if (byArea.indexOf(s) < 0) byArea.push(s); });
  return jcNear(byArea, jcOrigin(), stationAt);
}
function stationListHtml(d, live, programme){
  return jcSortedHtml({ id: "caSorted", fallback: "ca_sorted_area" }) +
    '<ul class="bklist" id="caStList">' + stationOrder(d, live).map(function(s){ return stationCard(d, s, programme); }).join("") + '</ul>';
}
/* the whole Stations tab body below its buttons / help line */
function stationsBlock(d, live, gone, programme, noneKey){
  return (live.length && typeof L !== "undefined" ? jcMapHtml("caMap", sLayer, { attrs: ' role="region" aria-label="' + esc(jcT("ca_map_label")) + '"' }) : '') +
    (live.length ? '<div class="jcstack" id="caStBox">' + stationListHtml(d, live, programme) + '</div>' : '<p class="help" id="caNone">' + esc(jcT(noneKey)) + '</p>') +
    (gone.length ? '<h2 class="group">' + esc(jcT("ca_archived_h")) + '</h2><ul class="bklist" id="caStGone">' + gone.map(function(s){ return stationCard(d, s, true); }).join("") + '</ul>' : '');
}
function stationsData(){
  var programme = !!prog, d = programme ? prog : places, all = stationsOf(d);
  return { d: d, programme: programme, live: all.filter(function(s){ return s.archived !== true; }), gone: programme ? all.filter(function(s){ return s.archived === true; }) : [] };
}
/* Find Me / Use Where I Am: re-sort the list under the map; the map stays as it is */
function redrawStList(){
  var box = el("caStBox");
  if (!box || current !== "home" || tab !== "stations") return;
  var x = stationsData(), r = jcFocusKeep();
  box.innerHTML = stationListHtml(x.d, x.live, x.programme);
  wireStationActs(box); wireStSort();
  r();
}
function wireStSort(){ jcSortedWire({ onChange: redrawStList, onError: caMsg, alive: function(){ return current === "home" && tab === "stations"; } }); }
function wireStationActs(root){
  root = root || document;
  function onClick(sel, fn){ Array.prototype.forEach.call(root.querySelectorAll(sel), function(b){ b.addEventListener("click", function(){ fn(b); }); }); }
  onClick("[data-edit]", function(b){ openEditor(b.dataset.edit); });
  onClick("[data-visit]", function(b){ openVisit(b.dataset.visit, { to: "home" }, true); });                    /* CC-4 */
  onClick("[data-stlog]", function(b){ stLogId = b.dataset.stlog; show("stlog"); try { window.scrollTo(0, 0); } catch(e){} });
}
function drawStations(){
  if (typeof L === "undefined" || !el("caMap")) return;
  var x = stationsData(), m = smap = jcBigMap("caMap", { cfg: cfg, layer: sLayer, onLayer: function(l){ sLayer = l; }, full: sfull });
  jcFindMe(m, { alive: function(){ return smap === m; }, onPos: function(){ if (smap === m) redrawStList(); },
    onError: function(code){ sfull.set(false); caMsg(code); } });
  var col = jcMapColors(), pts = [];
  x.live.forEach(function(s){
    var title = stationTitle(s, x.programme);
    pts.push([s.lat, s.lng]);
    /* Leaflet sets string content as HTML: names are escaped */
    L.circleMarker([s.lat, s.lng], { radius: 11, weight: 3, color: col.ink, fillColor: col.accent, fillOpacity: .95 }).addTo(m)
      .bindTooltip('<span dir="auto">' + esc(title) + '</span>', { permanent: true, direction: "top", offset: [0, -12], className: "bklabel" })
      .bindPopup(jcPopHtml({ head: esc(title), headAuto: true, lat: s.lat, lng: s.lng,
        body: '<div class="meta" dir="auto">' + esc(areaName(x.d, s.area_id)) + '</div>' +
          (x.programme && s.private === true ? '<div class="head"><span class="chip">' + esc(jcT("ca_private")) + '</span></div>' : ''),
        open: x.programme ? { id: s.id, label: jcT("ca_l_history") } : null }), JC_POPUP);
  });
  jcMapPopups(m, x.programme ? function(id){ sfull.set(false); stLogId = id; show("stlog"); } : null);
  jcFitPins(m, pts);
}

/* ---------- views ---------- */
var VIEWS = {
  off: function(){
    el("view").innerHTML = '<h1 dir="auto">' + esc(jcModTitle("cats")) + '</h1><p class="notice" id="caOff">' + esc(jcT("bk_off")) + '</p>';
  },
  home: function(){
    jcBack(null);
    var rk = roleKey();
    var head = '<h1 dir="auto">' + esc(jcModTitle("cats")) + '</h1>' + msgBox() +
      (rk ? '<p class="notice" id="caRole">' + esc(jcT(rk)) + '</p>' : '');
    if (loadErr) { el("view").innerHTML = head + '<p class="notice" id="caErr">' + esc(jcErrTextFor("ca_err_", loadErr)) + '</p>'; return; }
    if (!prog && !places) { el("view").innerHTML = head + '<p class="help">' + esc(jcT("working")) + '</p>'; return; }
    /* residents: the cats + public stations only, in two tabs (DS-4a: as Pets, no headings repeating the tab) */
    var keys = !prog ? ["cats", "stations"] : canEdit() ? ["cats", "log", "stations", "areas"] : ["cats", "log", "stations"];
    if (keys.indexOf(tab) < 0) tab = "cats";
    var body;
    if (!prog) {
      var pub = stationsOf(places);
      body = tab === "cats" ? catsHtml(pubCats, false) + '<div class="panel" id="caSoon"><p>' + esc(jcT("ca_soon")) + '</p></div>'
        : '<p class="help">' + esc(jcT("ca_public_help")) + '</p>' + stationsBlock(places, pub, [], false, "ca_none_public");
    } else body = tab === "areas" ? areasHtml() : tab === "cats" ? catsHtml(reg, true) : tab === "log" ? logTabHtml() : stationsHtml();
    el("view").innerHTML = head + jcTabsHtml("caTab_", keys, tab, function(k){ return jcT("ca_tab_" + k); }, jcModTitle("cats"), "caPanel") +
      '<div ' + jcTabPanel("caTab_", tab, "caPanel") + '>' + body + '</div>';
    jcTabsWire("caTab_", keys, function(k){ tab = k; renaming = null; draw(); });
    if (!prog) { if (tab === "cats") wireCats(pubCats); else { wireStSort(); drawStations(); } return; }
    if (tab === "areas") wireAreas(); else if (tab === "cats") wireCats(reg); else if (tab === "log") wireLogTab(); else wireStations();
  },
  cat: function(){ catView(); },
  visit: function(){ visitView(); },                 /* CC-4, log.js (loaded first) */
  sighting: function(){ sightingView(); },
  stlog: function(){ stationLogView(); },
  catedit: function(){ catEditView(); },
  station: function(){
    if (!ed || !prog) return show("home");
    takeMap();
    jcBack(function(){ ed = null; show("home"); });
    var s = ed, off = busy ? ' disabled' : '';
    var st = ed.id ? stationsOf(prog).filter(function(x){ return x.id === ed.id; })[0] : null;
    var areas = areasOf(prog).filter(function(a){ return a.archived !== true || a.id === s.area_id; });
    var people = (Array.isArray(prog.people) ? prog.people : []).filter(function(p){ return hObj(p) && typeof p.user_id === "string"; });
    var moves = st && Array.isArray(st.moves) ? st.moves.filter(function(m){ return hObj(m) && finite(m.lat) && finite(m.lng); }) : [];
    el("view").innerHTML = '<h1>' + esc(st ? jcFmt("ca_edit_station", { c: st.code || "" }) : jcT("ca_new_station")) + '</h1>' + msgBox() +
      '<form class="panel" id="caForm" novalidate>' +
      '<label>' + esc(jcT("ca_area")) + '<select id="caArea"' + off + '><option value="">' + esc(jcT("ca_pick")) + '</option>' +
        areas.map(function(a){ return '<option value="' + esc(a.id) + '"' + (a.id === s.area_id ? ' selected' : '') + '>' + esc(a.name) + '</option>'; }).join("") + '</select></label>' +
      '<fieldset id="caWhere"><legend>' + esc(jcT("ca_where")) + '</legend>' + jcWhereHtml(s.w, "caW", off, { required: true }) + '</fieldset>' +
      '<label>' + esc(jcT("ca_landmark")) + '<input type="text" id="caLandmark" maxlength="120" dir="auto" autocomplete="off"' + off + '></label>' +
      '<label>' + esc(jcT("ca_notes")) + '<textarea id="caNotes" maxlength="400" dir="auto" aria-describedby="caNotesHelp"' + off + '></textarea></label>' +
      '<p class="help" id="caNotesHelp">' + esc(jcT("ca_notes_help")) + '</p>' +
      '<fieldset id="caPriv"><legend>' + esc(jcT("ca_vis")) + '</legend>' +
        '<label class="check"><input type="radio" name="caVis" value="public"' + (s.private === false ? ' checked' : '') + off + '> <span>' + esc(jcT("ca_vis_public")) + '</span></label>' +
        '<label class="check"><input type="radio" name="caVis" value="private"' + (s.private === true ? ' checked' : '') + off + '> <span>' + esc(jcT("ca_vis_private")) + '</span></label>' +
        '<p class="help">' + esc(jcT("ca_vis_help")) + '</p></fieldset>' +
      '<fieldset id="caWho"><legend>' + esc(jcT("ca_people")) + '</legend>' +
        (people.length ? people.map(function(p){
          var r = s.people[p.user_id] || "";
          return '<label>' + '<span dir="auto">' + esc(p.name || jcT("ca_someone")) + '</span><select data-person="' + esc(p.user_id) + '"' + off + '>' +
            ["", "lead", "feeder", "backup"].map(function(x){ return '<option value="' + x + '"' + (x === r ? ' selected' : '') + '>' + esc(jcT(x ? "ca_r_" + x : "ca_r_none")) + '</option>'; }).join("") +
            '</select></label>';
        }).join("") : '<p class="help" id="caNoPeople">' + esc(jcT("ca_no_people")) + '</p>') +
        '<p class="help">' + esc(jcT("ca_people_help")) + '</p></fieldset>' +
      (moves.length ? '<fieldset id="caMoves"><legend>' + esc(jcT("ca_moves")) + '</legend><ul class="helplist">' + moves.map(function(m){
          return '<li>' + esc(jcFmt("ca_move_line", { from: dayOf(m.from), until: dayOf(m.until) })) +
            (m.landmark ? ' · <span dir="auto">' + esc(m.landmark) + '</span>' : '') + ' · ' + jcDirLink(m.lat, m.lng) + '</li>';
        }).join("") + '</ul></fieldset>' : '') +
      '<div class="row"><button class="btn" type="submit" id="caSave"' + (busy || s.w.picking ? ' disabled' : '') + '>' + esc(jcT("ct_save")) + '</button>' +
      '<button class="btn ghost" type="button" id="caCancel"' + off + '>' + esc(jcT("ct_cancel")) + '</button></div>' +
      (st ? '<div class="row"><button class="btn ghost" type="button" id="caArchive"' + off + '>' + esc(jcT(st.archived === true ? "ca_restore" : "ca_archive")) + '</button></div>' : '') +
      '</form>';
    el("caLandmark").value = s.landmark; el("caLandmark").addEventListener("input", function(){ s.landmark = el("caLandmark").value; });
    el("caNotes").value = s.notes; el("caNotes").addEventListener("input", function(){ s.notes = el("caNotes").value; });
    el("caArea").addEventListener("change", function(){ s.area_id = el("caArea").value; });
    each('input[name="caVis"]', function(b){ s.private = b.value === "private"; }, "change");
    each("[data-person]", function(x){ s.people[x.dataset.person] = x.value; }, "change");
    var c = (cfg && cfg.map) || {};
    jcWhereWire(s.w, "caW", { draw: draw, alive: function(){ return current === "station" && ed === s; },
      center: [c.lat || 24.53, c.lng || 54.43], zoom: c.zoom || 16, onError: caMsg, setMap: function(m){ map = m; } });
    on("caCancel", function(){ ed = null; show("home"); });
    on("caArchive", function(){
      save("jc_cat_station_save", { p_station: s.id, p_fields: { archived: !(st && st.archived === true) } },
           st && st.archived === true ? "ca_restored" : "ca_archived", function(){ ed = null; current = "home"; });
    });
    el("caForm").addEventListener("submit", function(e){
      e.preventDefault();
      if (busy || s.w.picking) return;
      var leads = Object.keys(s.people).filter(function(k){ return s.people[k] === "lead"; }).length;
      if (!s.area_id) { caMsg("NO_AREA"); el("caArea").focus(); return; }
      if (s.w.lat == null) { caMsg("NO_PIN"); var a = el("caWAdd"); if (a) a.focus(); return; }
      if (s.private !== true && s.private !== false) { caMsg("NO_VIS"); var r = document.querySelector('input[name="caVis"]'); if (r) r.focus(); return; }
      if (leads > 1) { caMsg("TWO_LEADS"); return; }
      var ppl = Object.keys(s.people).filter(function(k){ return s.people[k]; }).map(function(k){ return { user_id: k, role: s.people[k] }; });
      save("jc_cat_station_save", { p_station: s.id, p_fields: {
        area_id: s.area_id, lat: s.w.lat, lng: s.w.lng, landmark: s.landmark.trim() || null, access_notes: s.notes.trim() || null,
        "private": s.private, people: ppl } }, "ca_saved", function(){ ed = null; current = "home"; });
    });
  }
};

function stationsHtml(){
  var x = stationsData(), off = busy ? ' disabled' : '';
  return (canEdit() ? '<div class="acts"><button class="btn" type="button" id="caAdd"' + off + '>' + esc(jcT("ca_add_station")) + '</button></div>' +
      (areasOf(prog).filter(function(a){ return a.archived !== true; }).length ? '' : '<p class="help" id="caAreaFirst">' + esc(jcT("ca_area_first")) + '</p>') : '') +
    stationsBlock(prog, x.live, x.gone, true, "ca_none");
}
function wireStations(){
  on("caAdd", function(){
    if (!areasOf(prog).filter(function(a){ return a.archived !== true; }).length) { tab = "areas"; draw(); return; }
    openEditor(null);
  });
  wireStationActs(); wireStSort(); drawStations();
}
function openEditor(id){
  var st = id ? stationsOf(prog).filter(function(x){ return x.id === id; })[0] : null;
  if (id && !st) return;
  var people = {};
  if (st) (st.people || []).forEach(function(p){ if (hObj(p) && typeof p.user_id === "string") people[p.user_id] = p.role; });
  ed = { id: st ? st.id : null, area_id: st ? st.area_id : "", landmark: st && st.landmark || "", notes: st && st.access_notes || "",
         "private": st ? st.private === true : null, people: people,
         w: { lat: st ? st.lat : null, lng: st ? st.lng : null, picking: false } };
  show("station");
  try { window.scrollTo(0, 0); } catch(e){}
}

function areasHtml(){
  var off = busy ? ' disabled' : '';
  var list = areasOf(prog);
  return '<p class="help">' + esc(jcT("ca_areas_help")) + '</p>' +
    (list.length ? list.map(function(a){
      var n = typeof a.stations === "number" ? a.stations : 0;
      var lab = ' aria-label="' + esc(jcFmt("ca_area_named", { a: a.name })) + '"';     /* review L3: each row named */
      var count = '<p class="help">' + esc(a.archived === true ? jcT("ca_area_archived") : jcFmt("ca_area_count", { n: n })) + '</p>';
      /* Zee 2026-11-18: the name is plain text until Rename is tapped; then a box with Save / Cancel */
      if (renaming && renaming.id === a.id) {
        return '<form class="panel caArea" data-area="' + esc(a.id) + '" data-renaming' + lab + ' novalidate><label>' + esc(jcT("ca_area_name")) +
          '<input type="text" maxlength="40" dir="auto" autocomplete="off" data-aname="' + esc(a.id) + '" value="' + esc(renaming.name) + '"' + off + '></label>' + count +
          '<div class="row"><button class="btn" type="submit" data-asave="' + esc(a.id) + '"' + off + '>' + esc(jcT("ct_save")) + '</button>' +
          '<button class="btn ghost" type="button" data-acancel="' + esc(a.id) + '"' + off + '>' + esc(jcT("ct_cancel")) + '</button></div></form>';
      }
      return '<div class="panel caArea" data-area="' + esc(a.id) + '" role="group"' + lab + '><b class="caAreaName" dir="auto">' + esc(a.name) + '</b>' + count +
        '<div class="row"><button class="mini" type="button" data-arename="' + esc(a.id) + '"' + off + '>' + esc(jcT("ca_area_rename")) + '</button>' +
        '<button class="mini" type="button" data-aarch="' + esc(a.id) + '" data-on="' + (a.archived === true ? "0" : "1") + '"' + off + '>' +
          esc(jcT(a.archived === true ? "ca_area_restore" : "ca_area_archive")) + '</button></div></div>';
    }).join("") : '<p class="help" id="caNoAreas">' + esc(jcT("ca_areas_none")) + '</p>') +
    '<form class="panel" id="caAreaForm" novalidate><label>' + esc(jcT("ca_area_new")) +
    '<input type="text" id="caAreaNew" maxlength="40" dir="auto" autocomplete="off"' + off + '></label>' +
    '<button class="btn" type="submit" id="caAreaAdd"' + off + '>' + esc(jcT("ca_area_add")) + '</button></form>';
}
function focusArea(sel){ var x = document.querySelector(sel); if (x) x.focus(); }
function wireAreas(){
  el("caAreaNew").value = newArea;
  el("caAreaNew").addEventListener("input", function(){ newArea = el("caAreaNew").value; });
  el("caAreaForm").addEventListener("submit", function(e){
    e.preventDefault();
    if (!newArea.trim()) { caMsg("NO_NAME"); el("caAreaNew").focus(); return; }
    save("jc_cat_area_save", { p_area: null, p_name: newArea.trim(), p_archived: null }, "ca_saved", function(){ newArea = ""; });
  });
  each("[data-arename]", function(b){
    var a = areasOf(prog).filter(function(x){ return x.id === b.dataset.arename; })[0];
    if (!a) return;
    renaming = { id: a.id, name: a.name };
    draw();
    focusArea('[data-aname="' + a.id + '"]');
  });
  var f = document.querySelector("form[data-renaming]");
  if (f) {
    var id = f.dataset.area, inp = f.querySelector("[data-aname]");
    var cancel = function(){ renaming = null; draw(); focusArea('[data-arename="' + id + '"]'); };
    inp.addEventListener("input", function(){ renaming.name = inp.value; });
    f.addEventListener("keydown", function(e){ if (e.key === "Escape") cancel(); });   /* review L7: from the buttons too */
    f.querySelector("[data-acancel]").addEventListener("click", cancel);
    f.addEventListener("submit", function(e){
      e.preventDefault();
      if (!inp.value.trim()) { caMsg("NO_NAME"); inp.focus(); return; }
      /* review L5: after Save, focus goes back to this area's Rename (after save() has redrawn) */
      save("jc_cat_area_save", { p_area: id, p_name: inp.value.trim(), p_archived: null }, "ca_saved", function(){
        renaming = null; setTimeout(function(){ focusArea('[data-arename="' + id + '"]'); }, 0);
      });
    });
  }
  each("[data-aarch]", function(b){
    save("jc_cat_area_save", { p_area: b.dataset.aarch, p_name: null, p_archived: b.dataset.on === "1" }, "ca_saved");
  });
}

function show(name){
  current = name;
  if (name !== "station") takeMap();
  dropSmap();                                 /* DS-4c: the stations map goes with every redraw */
  jcMinisClear(caMinis);                      /* DS-4b: the activity lists' small maps (log.js) */
  if (name !== "catedit") ced = null;
  if (name !== "home") renaming = null;      /* review L6: a rename box never outlives the Areas screen */
  jcHelp(name === "home" ? "cats" : null);
  VIEWS[name]();
}

/* ---------- CC-3: the cat register ---------- */
var CA_SEX = ["female", "male", "unknown"], CA_LIFE = ["kitten", "adult", "senior", "unknown"],
    CA_STATUS = ["community", "clinic", "foster", "adopted", "transferred", "missing", "deceased", "unknown"],
    CA_EAR = ["present", "absent", "unclear"], CA_STER = ["yes", "no", "unknown"],
    CA_TNVR = ["none", "needed", "booked", "captured", "clinic", "returned"];
var CA_TEXT = ["name", "old_id", "coat", "story", "status_source", "sterilised_source", "tnvr_place"];
function isCat(c){ return hObj(c) && typeof c.id === "string" && typeof c.code === "string"; }
function catsList(d){ return (d && Array.isArray(d.cats) ? d.cats : []).filter(isCat); }
function strs(a){ return Array.isArray(a) ? a.filter(function(x){ return typeof x === "string" && x; }) : []; }
function catTitle(c){ return typeof c.name === "string" && c.name ? c.name : c.code; }
function catFind(d, id){ return catsList(d).filter(function(c){ return c.id === id; })[0] || null; }
function merged(c){ return hObj(c.merged_into); }
/* a value's label, or "" when the server sent something this page doesn't know */
function lab(prefix, list, v){ return list.indexOf(v) >= 0 ? jcT(prefix + v) : ""; }
/* status + provisional chips; a missing cat is red, as a missing pet (DS-4a). noMissing: the cat page's alarm says it */
function catChips(c, noMissing){
  var miss = c.status === "missing";
  return (c.status && c.status !== "community" && !(miss && noMissing) ? '<span class="chip' + (miss ? ' miss' : '') + '">' + esc(lab("ca_st_", CA_STATUS, c.status)) + '</span>' : '') +
    (c.confirmed === false ? '<span class="chip" data-prov>' + esc(jcT("ca_provisional")) + '</span>' : '');
}
/* "C-001 · Souk": the Cat ID when the cat has a name, and its area */
function catSub(c){ return [c.code !== catTitle(c) ? c.code : "", typeof c.area === "string" ? c.area : ""].filter(Boolean).join(" · "); }
/* D2: a Pets photo card; the whole card is one button, its text starts with the name (review M3) */
function catCard(c){
  return jcCardHtml({ missing: c.status === "missing", liAttrs: 'data-catli="' + esc(c.id) + '"', btnAttrs: 'data-cat="' + esc(c.id) + '"',
    photoHtml: jcPetPhotoHtml({ photo_path: strs(c.photos)[0] || null }, 34, "tile"), name: catTitle(c), linesHtml: [
      catSub(c) && jcMetaHtml(catSub(c), "", true),
      typeof c.coat === "string" && c.coat && jcMetaHtml(c.coat, "where", true),
      catChips(c) && '<span class="head">' + catChips(c) + '</span>'] });
}
function catMatches(c){
  return jcMatches(catQ, [c.name, c.code, c.old_id, c.coat, c.area].map(function(x){ return typeof x === "string" ? x : ""; }));
}
function live(d){ return catsList(d).filter(function(c){ return !merged(c); }); }
/* the cards under the search: every cat not missing (missing ones are pinned on top, as on Pets) */
function catsListHtml(d){
  var rest = live(d).filter(function(c){ return c.status !== "missing"; });
  if (!live(d).length) return '<p class="help" id="caCatsNone">' + esc(jcT("ca_cats_none")) + '</p>';
  var hit = rest.filter(catMatches);
  return hit.length ? '<ul class="ptgrid">' + hit.map(catCard).join("") + '</ul>'
    : rest.length ? '<p class="help" id="caCatsNone">' + esc(jcT("ca_cats_nomatch")) + '</p>' : '';
}
function catsHtml(d, programme){
  if (!d) return '';
  var gone = programme && canEditCats() ? catsList(d).filter(merged) : [], off = busy ? ' disabled' : '';
  var missing = live(d).filter(function(c){ return c.status === "missing"; });
  /* Pets' list order: the urgent group, then search, then the cards (design.md §3) */
  return '<p class="help">' + esc(jcT("ca_cats_help")) + '</p>' +
    (programme && canEditCats() ? '<div class="row"><button class="btn" type="button" id="caAddCat"' + off + '>' + esc(jcT("ca_add_cat")) + '</button></div>' : '') +
    (missing.length ? '<h2 class="group" id="caMissingHead">' + esc(jcT("ca_missing_h")) + '</h2>' +
      '<ul class="ptgrid wide" id="caMissing">' + missing.map(catCard).join("") + '</ul>' : '') +
    (catsList(d).length ? jcSearchHtml({ id: "caQ", placeholder: jcT("ca_search"), value: catQ }) : '') +
    '<div id="caCats">' + catsListHtml(d) + '</div>' +
    (gone.length ? '<h2 class="group">' + esc(jcT("ca_merged_h")) + '</h2>' + gone.map(function(c){
      return '<div class="panel caMergedRow" data-merged="' + esc(c.id) + '"><p><b dir="auto">' + esc(c.code + (c.name ? " · " + c.name : "")) + '</b> · ' +
        esc(jcFmt("ca_merged_into", { c: c.merged_into.code || "" })) + '</p>' +
        '<div class="row"><button class="mini" type="button" data-unmerge="' + esc(c.id) + '"' + off + '>' + esc(jcT("ca_unmerge")) + '</button></div></div>';
    }).join("") : '');
}
/* root: the search redraws only #caCats, so only its new cards get a click (the missing ones keep theirs) */
function wireCatList(root){
  Array.prototype.forEach.call((root || document).querySelectorAll("[data-cat]"), function(b){
    b.addEventListener("click", function(){ catId = b.dataset.cat; catTab = "about"; show("cat"); try { window.scrollTo(0, 0); } catch(e){} });
  });
  jcPetPhotoFill();
}
function wireCats(d){
  var q = el("caQ");
  if (q) q.addEventListener("input", function(){ catQ = q.value; el("caCats").innerHTML = catsListHtml(d); wireCatList(el("caCats")); });
  on("caAddCat", function(){ openCatEditor(null); });
  each("[data-unmerge]", function(b){
    var c = catFind(reg, b.dataset.unmerge);
    if (c && window.confirm(jcFmt("ca_unmerge_q", { c: c.code }))) save("jc_cat_unmerge", { p_cat: c.id }, "ca_unmerged");
  });
  wireCatList();
}
function canEditCats(){ return !!(reg && reg.can_edit === true); }
function dateText(d){ return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d) ? dayOf(d + "T12:00:00Z") : ""; }

function catView(){
  var programme = !!reg, d = programme ? reg : pubCats, c = catFind(d, catId);
  if (!c) return show("home");
  jcBack(function(){ show("home"); });
  var photos = strs(c.photos), off = busy ? ' disabled' : '';
  var st = programme && c.station_id ? stationsOf(prog).filter(function(s){ return s.id === c.station_id; })[0] : null;
  var hist = programme && Array.isArray(c.status_log) ? c.status_log.filter(hObj) : [];
  var also = programme && Array.isArray(c.merged_from) ? c.merged_from.filter(hObj) : [];
  var join = function(a){ return a.filter(Boolean).join(" · "); };
  var str = function(v){ return typeof v === "string" ? v : ""; };
  /* typed text inside a joined value keeps its own direction (a Latin source in an Arabic line stays in order) */
  var typed = function(v){ v = str(v); return v ? "\u2068" + v + "\u2069" : ""; };
  /* DS-4a (D3, D5): the stray page's layout — hero (photo beside the name), the red alarm when missing, About · Activity
     tabs, label → value facts in three groups, the status history as record rows */
  var tabs = programme && !merged(c) ? ["about", "log"] : ["about"];
  if (tabs.indexOf(catTab) < 0) catTab = "about";
  var h = jcHeroHtml({ photoHtml: jcPetPhotoHtml({ photo_path: photos[0] || null }, 34, "tile", { view: photos }), name: catTitle(c),
    afterNameHtml: canEditCats() && !merged(c) ? '<button class="lang adminbtn" type="button" id="caEditCat"' + off + '>' + esc(jcT("ca_edit")) + '</button>' : '',
    meta: catSub(c), chipsHtml: catChips(c, true) });
  if (c.status === "missing") h += jcAlarmHtml("caAlarm", programme && dateText(c.status_on)
    ? jcFmt("ca_missing_since", { n: catTitle(c), d: dateText(c.status_on) }) : jcFmt("ca_missing_now", { n: catTitle(c) }));
  if (merged(c)) h += '<p class="notice">' + esc(jcFmt("ca_merged_into", { c: c.merged_into.code || "" })) + '</p>' +
    (canEditCats() ? '<div class="row"><button class="btn ghost" type="button" id="caUnmerge"' + off + '>' + esc(jcT("ca_unmerge")) + '</button></div>' : '');
  if (tabs.length > 1) h += jcTabsHtml("caPg_", tabs, catTab, function(t){ return jcT(t === "log" ? "ca_tab_log" : "ca_pg_about"); }, catTitle(c), "caPage");
  h += msgBox();
  var body = '';
  if (catTab === "about") {
    var pairs = function(list){ return list.filter(function(f){ return f[1]; }).map(function(f){ return [jcT(f[0]), f[1]]; }); };
    var about = pairs([
      ["ca_f_status", programme ? join([lab("ca_st_", CA_STATUS, c.status), dateText(c.status_on), typed(c.status_source)]) : lab("ca_st_", CA_STATUS, c.status)],
      ["ca_f_coat", str(c.coat)],
      ["ca_f_sex", c.sex !== "unknown" ? lab("ca_sex_", CA_SEX, c.sex) : ""],
      ["ca_f_life", c.life_stage !== "unknown" ? lab("ca_life_", CA_LIFE, c.life_stage) : ""],
      ["ca_fl_old", programme ? str(c.old_id) : ""],
      ["ca_also_filed", also.map(function(m){ return join([m.code, typed(m.name), typed(m.old_id)]); }).join("; ")]]);
    var health = pairs([
      ["ca_f_ear", join([lab("ca_ear_", CA_EAR, c.ear_tip), programme && c.ear_side ? lab("ca_side_", ["left", "right"], c.ear_side) : ""])],
      ["ca_fl_ster", join([lab("ca_ster_", CA_STER, c.sterilised), programme ? typed(c.sterilised_source) : ""])],
      ["ca_f_tnvr", programme && c.tnvr !== "none" ? join([lab("ca_tnvr_", CA_TNVR, c.tnvr), dateText(c.tnvr_on), typed(c.tnvr_place)]) : ""]]);
    var where = pairs([["ca_f_area", str(c.area)], ["ca_f_station", st ? join([st.code, typed(st.landmark)]) : ""]]);
    /* the first group has no heading: it would repeat the About tab's name (D1) */
    body += (str(c.story) ? '<p class="desc" dir="auto" id="caStory">' + esc(c.story) + '</p>' : '') +
      (about.length ? jcFactsHtml(about, "caFacts") : '') +
      (health.length ? '<h2 class="group">' + esc(jcT("ca_g_health")) + '</h2>' + jcFactsHtml(health, "caHealth") : '') +
      (where.length ? '<h2 class="group">' + esc(jcT("ca_g_where")) + '</h2>' + jcFactsHtml(where, "caWhere") : '') +
      (hist.length ? '<h2 class="group">' + esc(jcT("ca_history")) + '</h2><ul class="care" id="caHist">' + hist.map(function(x){
        var d = dateText(x.on) || dayOf(x.at), note = join([str(x.source), x.code && x.code !== c.code ? x.code : ""]);
        return '<li><span class="nm">' + esc(lab("ca_st_", CA_STATUS, x.status)) + '</span>' + (d ? '<span class="st">⁦' + esc(d) + '⁩</span>' : '') +
          (note ? '<span class="note" dir="auto">' + esc(note) + '</span>' : '') + '</li>';
      }).join("") + '</ul>' : '');
  } else body += catLogHtml(c);                                                                     /* CC-4 */
  el("view").innerHTML = h + (tabs.length > 1 ? '<div ' + jcTabPanel("caPg_", catTab, "caPage") + '>' + body + '</div>'
    : '<div id="caPage" class="jcstack">' + body + '</div>');
  if (tabs.length > 1) jcTabsWire("caPg_", tabs, function(t){ catTab = t; draw(); });
  on("caEditCat", function(){ openCatEditor(c.id); });
  if (programme && catTab === "log") wireCatLog(c);
  on("caUnmerge", function(){
    if (window.confirm(jcFmt("ca_unmerge_q", { c: c.code }))) save("jc_cat_unmerge", { p_cat: c.id }, "ca_unmerged");
  });
  jcPetPhotoFill();
}

function openCatEditor(id){
  var c = id ? catFind(reg, id) : null;
  if (id && !c) return;
  var f = {};
  CA_TEXT.forEach(function(k){ f[k] = c && typeof c[k] === "string" ? c[k] : ""; });
  f.sex = c ? c.sex : "unknown"; f.life_stage = c ? c.life_stage : "unknown"; f.status = c ? c.status : "community";
  f.ear_tip = c ? c.ear_tip : "unclear"; f.ear_side = c && c.ear_side || ""; f.sterilised = c ? c.sterilised : "unknown";
  f.tnvr = c ? c.tnvr : "none"; f.status_on = c && c.status_on || ""; f.tnvr_on = c && c.tnvr_on || "";
  f.area_id = c && c.area_id || ""; f.station_id = c && c.station_id || ""; f.confirmed = !!(c && c.confirmed === true);
  ced = { id: id, f: f, merge_into: "", shrinking: null };
  show("catedit");
  try { window.scrollTo(0, 0); } catch(e){}
}
/* a dropdown for a fixed list of 6+ (TNVR stage, status): its only caption is the fieldset's legend (D8) */
function selHtml(id, lg, prefix, list, v, off){
  return '<select id="' + id + '" aria-labelledby="' + lg + '"' + off + '>' + list.map(function(x){
    return '<option value="' + esc(x) + '"' + (x === v ? ' selected' : '') + '>' + esc(jcT(prefix + x)) + '</option>';
  }).join("") + '</select>';
}
/* ≤ 5 fixed choices: Pets-style pills (D7; design.md §1 choice table), the legend is the caption */
function pillsHtml(id, key, field, prefix, list, v, off, afterHtml){
  return jcPillsHtml({ id: id, legend: jcT(key), attr: 'data-pill="' + field + '" data-v', pressed: v, off: off, afterHtml: afterHtml,
    items: list.map(function(x){ return { value: x, text: jcT(prefix + x) }; }) });
}
function txtHtml(id, key, v, max, off, area){
  return '<label>' + esc(jcT(key)) + (area ? '<textarea id="' + id + '" maxlength="' + max + '" dir="auto"' + off + '></textarea>'
    : '<input type="text" id="' + id + '" maxlength="' + max + '" dir="auto" autocomplete="off"' + off + '>') + '</label>';
}
function dateHtml(id, key, off){
  var t = new Date(), today = t.getFullYear() + "-" + ("0" + (t.getMonth() + 1)).slice(-2) + "-" + ("0" + t.getDate()).slice(-2);
  return '<label>' + esc(jcT(key)) + '<input type="date" id="' + id + '" min="2000-01-01" max="' + today + '"' + off + '></label>';
}
var CA_IDS = { name: "caCName", old_id: "caCOld", coat: "caCCoat", story: "caCStory", status_source: "caCStSrc",
               sterilised_source: "caCSterSrc", tnvr_place: "caCTPlace", status_on: "caCStOn", tnvr_on: "caCTOn" };
function edStationOpts(f){
  var list = prog ? stationsOf(prog).filter(function(s){ return (s.archived !== true || s.id === f.station_id) && (!f.area_id || s.area_id === f.area_id); }) : [];
  return '<option value="">' + esc(jcT("ca_none_opt")) + '</option>' + list.map(function(s){
    return '<option value="' + esc(s.id) + '"' + (s.id === f.station_id ? ' selected' : '') + '>' + esc([s.code, s.landmark].filter(Boolean).join(" · ")) + '</option>';
  }).join("");
}
/* DS-4b (D14): the Edit pet layout — Photos first, then About · Where · Health · Status · Record, Merge, and one Save
   at the bottom of everything. Every field, id and the saved payload are as before (spec: exact payload) */
function catEditView(){
  if (!ced || !reg) return show("home");
  var e = ced, f = e.f, c = e.id ? catFind(reg, e.id) : null, off = busy || e.shrinking ? ' disabled' : '';
  if (e.id && (!c || merged(c))) return show("home");
  jcBack(function(){ if (c) { catId = c.id; show("cat"); } else show("home"); });
  var areas = prog ? areasOf(prog).filter(function(a){ return a.archived !== true || a.id === f.area_id; }) : [];
  var own = c ? strs(c.own_photos) : [], extra = c ? strs(c.photos).length - own.length : 0;
  var others = catsList(reg).filter(function(x){ return !merged(x) && (!c || x.id !== c.id); });
  el("view").innerHTML = '<h1 dir="auto">' + esc(c ? jcFmt("ca_edit_cat", { c: c.code }) : jcT("ca_new_cat")) + '</h1>' + msgBox() +
    '<p class="help" id="caCatPriv">' + esc(jcT("ca_cat_private")) + ' ' + esc(jcT("ca_text_hint")) + '</p>' +
    '<form class="panel" id="caCatForm" novalidate>' +
    '<fieldset id="caPhotoBox"><legend>' + esc(jcT("ca_photos")) + '</legend>' + (c
      ? (own.length ? '<div class="caPhotos">' + own.map(function(p, i){
          return '<span class="caPhotoEd">' + jcPetPhotoHtml({ photo_path: p }, 22, "thumb", { view: own }) +
            '<button class="mini" type="button" data-phrm="' + esc(p) + '"' + off + '>' + esc(jcFmt("ca_photo_remove", { n: i + 1 })) + '</button></span>';
        }).join("") + '</div>' : '') +
        (extra > 0 ? '<p class="help">' + esc(jcFmt("ca_photo_merged", { n: extra })) + '</p>' : '') +
        (own.length < 4 ? '<input type="file" id="caPhotoIn" class="sr-only" accept="image/*"' + off + '>' +
          '<div class="acts"><label class="btn ghost" id="caPhotoPick" for="caPhotoIn">' + esc(jcT("ca_photo_add")) + '</label></div>' : '') +
        '<p class="help" id="caPhotoHelp" role="status">' + esc(jcT(e.shrinking ? "working" : "ca_photos_help")) + '</p>'
      : '<p class="help" id="caPhotoHelp">' + esc(jcT("ca_photos_after")) + '</p>') + '</fieldset>' +
    txtHtml("caCName", "ca_f_name", f.name, 40, off) + txtHtml("caCCoat", "ca_f_coat", f.coat, 120, off) +
    pillsHtml("caCSex", "ca_f_sex", "sex", "ca_sex_", CA_SEX, f.sex, off) +
    pillsHtml("caCLife", "ca_f_life", "life_stage", "ca_life_", CA_LIFE, f.life_stage, off) +
    txtHtml("caCStory", "ca_f_story", f.story, 1000, off, true) + '<p class="help">' + esc(jcT("ca_story_help")) + ' ' + esc(jcT("ca_text_hint")) + '</p>' +
    '<fieldset id="caCWhere"><legend>' + esc(jcT("ca_g_where")) + '</legend>' +
      '<label>' + esc(jcT("ca_f_area")) + '<select id="caCArea"' + off + '><option value="">' + esc(jcT("ca_none_opt")) + '</option>' +
        areas.map(function(a){ return '<option value="' + esc(a.id) + '"' + (a.id === f.area_id ? ' selected' : '') + '>' + esc(a.name) + '</option>'; }).join("") + '</select></label>' +
      '<label>' + esc(jcT("ca_f_station")) + '<select id="caCStation"' + off + '>' + edStationOpts(f) + '</select></label></fieldset>' +
    pillsHtml("caCEar", "ca_f_ear", "ear_tip", "ca_ear_", CA_EAR, f.ear_tip, off,
      '<label id="caCSideBox"' + (f.ear_tip === "present" ? '' : ' hidden') + '>' + esc(jcT("ca_f_ear_side")) + '<select id="caCSide"' + off + '><option value="">—</option>' +
        ["left", "right"].map(function(x){ return '<option value="' + x + '"' + (x === f.ear_side ? ' selected' : '') + '>' + esc(jcT("ca_side_" + x)) + '</option>'; }).join("") +
        '</select></label>') +
    pillsHtml("caCSter", "ca_ster_h", "sterilised", "ca_ster_", CA_STER, f.sterilised, off,
      txtHtml("caCSterSrc", "ca_f_ster_source", f.sterilised_source, 120, off)) +
    '<fieldset><legend id="caCTnvrLg">' + esc(jcT("ca_f_tnvr")) + '</legend>' + selHtml("caCTnvr", "caCTnvrLg", "ca_tnvr_", CA_TNVR, f.tnvr, off) +
      dateHtml("caCTOn", "ca_f_tnvr_on", off) + txtHtml("caCTPlace", "ca_f_tnvr_place", f.tnvr_place, 120, off) + '</fieldset>' +
    '<fieldset><legend id="caCStatusLg">' + esc(jcT("ca_f_status")) + '</legend>' + selHtml("caCStatus", "caCStatusLg", "ca_st_", CA_STATUS, f.status, off) +
      dateHtml("caCStOn", "ca_f_status_on", off) + txtHtml("caCStSrc", "ca_f_status_source", f.status_source, 120, off) + '</fieldset>' +
    txtHtml("caCOld", "ca_f_old_id", f.old_id, 40, off) +
    '<label class="check"><input type="checkbox" id="caCConf"' + (f.confirmed ? ' checked' : '') + off + '> <span>' + esc(jcT("ca_f_confirmed")) + '</span></label>' +
    (c && others.length ? '<fieldset id="caMergeBox"><legend>' + esc(jcT("ca_merge")) + '</legend>' +
      '<p class="help">' + esc(jcT("ca_merge_help")) + '</p>' +
      '<label>' + esc(jcT("ca_merge_into")) + '<select id="caMergeTo"' + off + '><option value="">' + esc(jcT("ca_pick")) + '</option>' +
        others.map(function(x){ return '<option value="' + esc(x.id) + '"' + (x.id === e.merge_into ? ' selected' : '') + '>' +
          esc([x.code, x.name, x.old_id].filter(Boolean).join(" · ")) + '</option>'; }).join("") + '</select></label>' +
      '<div class="acts"><button class="btn ghost" type="button" id="caMergeBtn"' + off + '>' + esc(jcT("ca_merge_btn")) + '</button></div></fieldset>' : '') +
    '<button class="btn" type="submit" id="caCatSave"' + off + '>' + esc(jcT("ct_save")) + '</button></form>';
  /* values, not markup */
  Object.keys(CA_IDS).forEach(function(k){ var i = el(CA_IDS[k]); if (!i) return; i.value = f[k] || ""; i.addEventListener("input", function(){ f[k] = i.value; }); });
  [["caCTnvr", "tnvr"], ["caCSide", "ear_side"], ["caCStatus", "status"], ["caCStation", "station_id"]].forEach(function(p){
    var i = el(p[0]); if (i) i.addEventListener("change", function(){ f[p[1]] = i.value; });
  });
  /* pills: change in place (no redraw); ear tip shows / hides "Which ear" */
  each("[data-pill]", function(b){
    var k = b.dataset.pill;
    f[k] = b.dataset.v;
    Array.prototype.forEach.call(document.querySelectorAll('[data-pill="' + k + '"]'), function(x){ x.setAttribute("aria-pressed", String(x === b)); });
    if (k === "ear_tip") { if (f.ear_tip !== "present") { f.ear_side = ""; el("caCSide").value = ""; } el("caCSideBox").hidden = f.ear_tip !== "present"; }
  });
  /* D9: a new area rebuilds only the station list — never the form, never a re-focus (iPhone re-opens the picker) */
  el("caCArea").addEventListener("change", function(){ f.area_id = el("caCArea").value; f.station_id = ""; el("caCStation").innerHTML = edStationOpts(f); });
  el("caCConf").addEventListener("change", function(){ f.confirmed = el("caCConf").checked; });
  el("caCatForm").addEventListener("submit", function(ev){
    ev.preventDefault();
    if (busy || e.shrinking) return;
    if (!f.name.trim() && !f.coat.trim()) { caMsg("NO_CAT_NAME"); el("caCName").focus(); return; }
    var p = {};
    CA_TEXT.forEach(function(k){ p[k] = f[k].trim() || null; });
    ["sex", "life_stage", "status", "ear_tip", "sterilised", "tnvr"].forEach(function(k){ p[k] = f[k]; });
    p.ear_side = f.ear_tip === "present" && f.ear_side ? f.ear_side : null;
    p.status_on = f.status_on || null; p.tnvr_on = f.tnvr_on || null;
    p.area_id = f.area_id || null; p.station_id = f.station_id || null; p.confirmed = f.confirmed;
    var before = catsList(reg).map(function(x){ return x.id; });
    save("jc_cat_save", { p_cat: e.id, p_fields: p }, c ? "ca_saved" : "ca_cat_saved_new", function(){
      if (c) { catId = c.id; current = "cat"; return; }
      var fresh = catsList(reg).filter(function(x){ return before.indexOf(x.id) < 0; })[0];
      if (fresh) openCatEditor(fresh.id); else current = "home";
    });
  });
  each("[data-phrm]", function(b){
    if (window.confirm(jcT("ca_photo_remove_q"))) save("jc_cat_photo_remove", { p_path: b.dataset.phrm }, "ca_photo_removed");
  });
  var pin = el("caPhotoIn");
  if (pin) pin.addEventListener("change", function(){
    var file = pin.files && pin.files[0];
    if (!file || busy || !c) return;
    var mine = {};
    e.shrinking = mine; draw();
    jcPetPhotoShrink(file).then(function(url){
      if (e.shrinking !== mine) return;
      return jcPetPhotoUpload(c.id, url, "cat").then(function(d){
        e.shrinking = null; reg = d;
        if (ced === e) { draw(); jcShowOk(jcT("ca_photo_added")); var pk = el("caPhotoIn"); if (pk) pk.focus(); }
      });
    }).catch(function(err){
      if (e.shrinking !== mine) return;
      e.shrinking = null;
      if (ced === e) { draw(); caMsg((err && err.code) || "PHOTO_UPLOAD_FAILED"); }
    });
  });
  var mt = el("caMergeTo");
  if (mt) mt.addEventListener("change", function(){ e.merge_into = mt.value; });
  on("caMergeBtn", function(){
    var into = catFind(reg, e.merge_into);
    if (!into) { caMsg("NO_MERGE"); if (mt) mt.focus(); return; }
    if (!window.confirm(jcFmt("ca_merge_q", { a: c.code, b: into.code }))) return;
    save("jc_cat_merge", { p_from: c.id, p_into: into.id }, "ca_merged", function(){ catId = into.id; catTab = "about"; current = "cat"; });
  });
  jcPetPhotoFill();
}

/* ---------- boot ---------- */
function paint(){
  jcFooter("../");
  var name = jcCommunityName(cfg, state && state.me && state.me.community);
  el("homeLink").textContent = name;
  el("langBtn").textContent = jcT("toggle_label");
  document.title = jcModTitle("cats") + " — " + name;
  if (state && state.status === "member") jcTabBar("../", "cats", cfg);
}

el("langBtn").addEventListener("click", function(){
  jcSetLang(ar() ? "en" : "ar");
  paint();
  if (current) show(current);
});

jcSetLang(jcLang());
paint();
jcState().then(function(s){
  state = s;
  if (s.status === "signed_out") { location.replace("../account/?next=" + encodeURIComponent("../cats/")); return; }
  if (s.status === "not_member") { location.replace("../account/?view=join&next=" + encodeURIComponent("../cats/")); return; }
  return jcAnon("jc_config_get", { p_community: s.me.community }).catch(function(){ return null; }).then(function(c){
    cfg = c;
    paint();
    if (!cfg || !jcModuleOn(cfg, "cats")) return show("off");   /* the kill switch: nothing asked of the server */
    jcHit("cats");
    show("home");
    return load().then(function(){ if (current === "home") show("home"); });
  });
}, function(e){
  el("view").innerHTML = msgBox();
  caMsg(e.code || "UNKNOWN");
});
