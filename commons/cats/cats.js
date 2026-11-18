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
   Roles come from jc_me_get.admin_scopes (display only). Visits (CC-4) and the vet log (CC-5) follow. */

var state = null, cfg = null, current = null;
var msgBox = jcMsgBox, ar = jcIsAr, on = jcOn, each = jcEach, hObj = jcObj, finite = jcFinite;
var places = null, prog = null, loadErr = null, busy = false, map = null;
var tab = "cats";                     /* the programme's tabs: cats · stations · areas (coordinators) */
var reg = null, pubCats = null;       /* CC-3: the register (programme) · the residents' cat list */
var catQ = "", catId = null;          /* the cats search · the open cat */
var ced = null;                       /* the cat editor's draft: { id | null, f: {field: value}, merge_into, shrinking } */
var ed = null;                        /* the station editor's draft: { id | null, area_id, w (where.js), landmark, notes, private (null = not chosen), people {user_id: role}, archived } */
var newArea = "";
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
function takeMap(){ if (map) { jcMapRemove(map); map = null; } if (ed && ed.w) ed.w.map = null; }
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
function stationCard(d, s, programme){
  var title = programme && s.code ? s.code + (s.landmark ? " · " + s.landmark : "") : (s.landmark || jcT("ca_station"));
  return '<div class="panel caStation" data-station="' + esc(s.id) + '">' +
    '<div class="evtop"><b dir="auto">' + esc(title) + '</b>' +
    (programme && s.private === true ? '<span class="chip" data-private>' + esc(jcT("ca_private")) + '</span>' : '') + '</div>' +
    (programme ? (peopleLine(s) ? '<p class="help">' + peopleLine(s) + '</p>' : '') +
      (typeof s.access_notes === "string" && s.access_notes ? '<p class="help caNotes" dir="auto">' + esc(s.access_notes) + '</p>' : '') : '') +
    '<div class="row">' + jcDirLink(s.lat, s.lng) +
    (programme && canEdit() ? ' <button class="mini" type="button" data-edit="' + esc(s.id) + '">' + esc(jcT("ca_edit")) + '</button>' : '') + '</div></div>';
}
/* stations grouped under their areas, in the server's area order */
function grouped(d, list, programme){
  return areasOf(d).map(function(a){
    var mine = list.filter(function(s){ return s.area_id === a.id; });
    return mine.length ? '<h2 class="group" dir="auto">' + esc(a.name) + '</h2>' + mine.map(function(s){ return stationCard(d, s, programme); }).join("") : '';
  }).join("");
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
    if (!prog) {                                          /* residents: the cats + public stations only */
      var pub = stationsOf(places);
      el("view").innerHTML = head + catsHtml(pubCats, false) +
        '<h2>' + esc(jcT("ca_stations_h")) + '</h2><p class="help">' + esc(jcT("ca_public_help")) + '</p>' +
        (pub.length ? grouped(places, pub, false) : '<p class="help" id="caNone">' + esc(jcT("ca_none_public")) + '</p>') +
        '<div class="panel" id="caSoon"><p>' + esc(jcT("ca_soon")) + '</p></div>';
      wireCats(pubCats);
      return;
    }
    var keys = canEdit() ? ["cats", "stations", "areas"] : ["cats", "stations"];
    if (keys.indexOf(tab) < 0) tab = "cats";
    var body = tab === "areas" ? areasHtml() : tab === "cats" ? catsHtml(reg, true) : stationsHtml();
    el("view").innerHTML = head + jcTabsHtml("caTab_", keys, tab, function(k){ return jcT("ca_tab_" + k); }, jcModTitle("cats"), "caPanel") +
      '<div ' + jcTabPanel("caTab_", tab, "caPanel") + '>' + body + '</div>';
    jcTabsWire("caTab_", keys, function(k){ tab = k; draw(); });
    if (tab === "areas") wireAreas(); else if (tab === "cats") wireCats(reg); else wireStations();
  },
  cat: function(){ catView(); },
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
  var all = stationsOf(prog), live = all.filter(function(s){ return s.archived !== true; }), gone = all.filter(function(s){ return s.archived === true; });
  var off = busy ? ' disabled' : '';
  return (canEdit() ? '<div class="row"><button class="btn" type="button" id="caAdd"' + off + '>' + esc(jcT("ca_add_station")) + '</button></div>' +
      (areasOf(prog).filter(function(a){ return a.archived !== true; }).length ? '' : '<p class="help" id="caAreaFirst">' + esc(jcT("ca_area_first")) + '</p>') : '') +
    (live.length ? grouped(prog, live, true) : '<p class="help" id="caNone">' + esc(jcT("ca_none")) + '</p>') +
    (gone.length ? '<h2 class="group">' + esc(jcT("ca_archived_h")) + '</h2>' + gone.map(function(s){ return stationCard(prog, s, true); }).join("") : '');
}
function wireStations(){
  on("caAdd", function(){
    if (!areasOf(prog).filter(function(a){ return a.archived !== true; }).length) { tab = "areas"; draw(); return; }
    openEditor(null);
  });
  each("[data-edit]", function(b){ openEditor(b.dataset.edit); });
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
      return '<div class="panel caArea" data-area="' + esc(a.id) + '" role="group"' + lab + '><label>' + esc(jcT("ca_area_name")) +
        '<input type="text" maxlength="40" dir="auto" data-aname="' + esc(a.id) + '" value="' + esc(a.name) + '"' + off + '></label>' +
        '<p class="help">' + esc(a.archived === true ? jcT("ca_area_archived") : jcFmt("ca_area_count", { n: n })) + '</p>' +
        '<div class="row"><button class="mini" type="button" data-arename="' + esc(a.id) + '"' + off + '>' + esc(jcT("ca_area_rename")) + '</button> ' +
        '<button class="mini" type="button" data-aarch="' + esc(a.id) + '" data-on="' + (a.archived === true ? "0" : "1") + '"' + off + '>' +
          esc(jcT(a.archived === true ? "ca_area_restore" : "ca_area_archive")) + '</button></div></div>';
    }).join("") : '<p class="help" id="caNoAreas">' + esc(jcT("ca_areas_none")) + '</p>') +
    '<form class="panel" id="caAreaForm" novalidate><label>' + esc(jcT("ca_area_new")) +
    '<input type="text" id="caAreaNew" maxlength="40" dir="auto" autocomplete="off"' + off + '></label>' +
    '<button class="btn" type="submit" id="caAreaAdd"' + off + '>' + esc(jcT("ca_area_add")) + '</button></form>';
}
function wireAreas(){
  el("caAreaNew").value = newArea;
  el("caAreaNew").addEventListener("input", function(){ newArea = el("caAreaNew").value; });
  el("caAreaForm").addEventListener("submit", function(e){
    e.preventDefault();
    if (!newArea.trim()) { caMsg("NO_NAME"); el("caAreaNew").focus(); return; }
    save("jc_cat_area_save", { p_area: null, p_name: newArea.trim(), p_archived: null }, "ca_saved", function(){ newArea = ""; });
  });
  each("[data-arename]", function(b){
    var i = document.querySelector('[data-aname="' + b.dataset.arename + '"]');
    if (!i || !i.value.trim()) { caMsg("NO_NAME"); return; }
    save("jc_cat_area_save", { p_area: b.dataset.arename, p_name: i.value.trim(), p_archived: null }, "ca_saved");
  });
  each("[data-aarch]", function(b){
    save("jc_cat_area_save", { p_area: b.dataset.aarch, p_name: null, p_archived: b.dataset.on === "1" }, "ca_saved");
  });
}

function show(name){
  current = name;
  if (name !== "station") takeMap();
  if (name !== "catedit") ced = null;
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
function catChips(c){
  return (c.status && c.status !== "community" ? ' <span class="chip' + (c.status === "missing" ? ' warn' : '') + '">' + esc(lab("ca_st_", CA_STATUS, c.status)) + '</span>' : '') +
    (c.confirmed === false ? ' <span class="chip" data-prov>' + esc(jcT("ca_provisional")) + '</span>' : '');
}
function catCard(c){
  var ph = strs(c.photos)[0];
  var sub = [c.code !== catTitle(c) ? c.code : "", typeof c.area === "string" ? c.area : "", typeof c.coat === "string" ? c.coat : ""].filter(Boolean).join(" · ");
  return '<button type="button" class="panel caCat" data-cat="' + esc(c.id) + '">' +     /* its text is its name (review M3) */
    jcPetPhotoHtml({ photo_path: ph || null }, 22, "thumb") +
    '<span class="caCatTxt"><span class="caCatTop"><b dir="auto">' + esc(catTitle(c)) + '</b>' + catChips(c) + '</span>' +
    (sub ? '<span class="help" dir="auto">' + esc(sub) + '</span>' : '') + '</span></button>';
}
function catMatches(c){
  return jcMatches(catQ, [c.name, c.code, c.old_id, c.coat, c.area].map(function(x){ return typeof x === "string" ? x : ""; }));
}
function catsListHtml(d){
  var live = catsList(d).filter(function(c){ return !merged(c); });
  if (!live.length) return '<p class="help" id="caCatsNone">' + esc(jcT("ca_cats_none")) + '</p>';
  var hit = live.filter(catMatches);
  return hit.length ? hit.map(catCard).join("") : '<p class="help" id="caCatsNone">' + esc(jcT("ca_cats_nomatch")) + '</p>';
}
function catsHtml(d, programme){
  if (!d) return '';
  var gone = programme && canEditCats() ? catsList(d).filter(merged) : [], off = busy ? ' disabled' : '';
  return '<h2>' + esc(jcT("ca_cats_h")) + '</h2><p class="help">' + esc(jcT("ca_cats_help")) + '</p>' +
    (programme && canEditCats() ? '<div class="row"><button class="btn" type="button" id="caAddCat"' + off + '>' + esc(jcT("ca_add_cat")) + '</button></div>' : '') +
    (catsList(d).length ? jcSearchHtml({ id: "caQ", placeholder: jcT("ca_search"), value: catQ }) : '') +
    '<div id="caCats">' + catsListHtml(d) + '</div>' +
    (gone.length ? '<h2 class="group">' + esc(jcT("ca_merged_h")) + '</h2>' + gone.map(function(c){
      return '<div class="panel caMergedRow" data-merged="' + esc(c.id) + '"><p><b dir="auto">' + esc(c.code + (c.name ? " · " + c.name : "")) + '</b> · ' +
        esc(jcFmt("ca_merged_into", { c: c.merged_into.code || "" })) + '</p>' +
        '<div class="row"><button class="mini" type="button" data-unmerge="' + esc(c.id) + '"' + off + '>' + esc(jcT("ca_unmerge")) + '</button></div></div>';
    }).join("") : '');
}
function wireCatList(){
  each("[data-cat]", function(b){ catId = b.dataset.cat; show("cat"); try { window.scrollTo(0, 0); } catch(e){} });
  jcPetPhotoFill();
}
function wireCats(d){
  var q = el("caQ");
  if (q) q.addEventListener("input", function(){ catQ = q.value; el("caCats").innerHTML = catsListHtml(d); wireCatList(); });
  on("caAddCat", function(){ openCatEditor(null); });
  each("[data-unmerge]", function(b){
    var c = catFind(reg, b.dataset.unmerge);
    if (c && window.confirm(jcFmt("ca_unmerge_q", { c: c.code }))) save("jc_cat_unmerge", { p_cat: c.id }, "ca_unmerged");
  });
  wireCatList();
}
function canEditCats(){ return !!(reg && reg.can_edit === true); }
function factRow(k, v){ return v ? '<li><b>' + esc(jcT(k)) + ':</b> <span dir="auto">' + esc(v) + '</span></li>' : ''; }
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
  el("view").innerHTML = msgBox() +
    (photos.length ? '<div class="caPhotos">' + photos.map(function(p, i){
      return jcPetPhotoHtml({ photo_path: p }, i ? 22 : 44, i ? "thumb" : "big", { view: photos });
    }).join("") + '</div>' : '') +
    '<h1 dir="auto">' + esc(catTitle(c)) + '</h1>' +
    '<p class="help" id="caCode">' + esc(c.code) + catChips(c) + '</p>' +
    (merged(c) ? '<p class="notice">' + esc(jcFmt("ca_merged_into", { c: c.merged_into.code || "" })) + '</p>' : '') +
    (typeof c.story === "string" && c.story ? '<p class="caStory" dir="auto">' + esc(c.story) + '</p>' : '') +
    '<ul class="helplist caFacts">' +
      factRow("ca_f_area", typeof c.area === "string" ? c.area : "") +
      (programme ? factRow("ca_f_station", st ? join([st.code, st.landmark]) : "") : '') +
      factRow("ca_f_coat", typeof c.coat === "string" ? c.coat : "") +
      factRow("ca_f_sex", c.sex !== "unknown" ? lab("ca_sex_", CA_SEX, c.sex) : "") +
      factRow("ca_f_life", c.life_stage !== "unknown" ? lab("ca_life_", CA_LIFE, c.life_stage) : "") +
      factRow("ca_f_status", programme ? join([lab("ca_st_", CA_STATUS, c.status), dateText(c.status_on), c.status_source]) : lab("ca_st_", CA_STATUS, c.status)) +
      factRow("ca_f_ear", join([lab("ca_ear_", CA_EAR, c.ear_tip), programme && c.ear_side ? lab("ca_side_", ["left", "right"], c.ear_side) : ""])) +
      factRow("ca_f_ster", join([lab("ca_ster_", CA_STER, c.sterilised), programme ? c.sterilised_source : ""])) +
      (programme ? factRow("ca_f_tnvr", c.tnvr !== "none" ? join([lab("ca_tnvr_", CA_TNVR, c.tnvr), dateText(c.tnvr_on), c.tnvr_place]) : "") +
                   factRow("ca_f_old_id", c.old_id) : '') +
    '</ul>' +
    (also.length ? '<p class="help" id="caAlso">' + esc(jcT("ca_also_filed")) + ': <span dir="auto">' +
      esc(also.map(function(m){ return join([m.code, m.name, m.old_id]); }).join("; ")) + '</span></p>' : '') +
    (hist.length ? '<h2>' + esc(jcT("ca_history")) + '</h2><ul class="helplist" id="caHist">' + hist.map(function(h){
      return '<li>' + esc(jcFmt("ca_hist_line", { s: lab("ca_st_", CA_STATUS, h.status), d: dateText(h.on) || dayOf(h.at) })) +
        (h.source ? ' · <span dir="auto">' + esc(h.source) + '</span>' : '') + (h.code && h.code !== c.code ? ' · ' + esc(h.code) : '') + '</li>';
    }).join("") + '</ul>' : '') +
    (canEditCats() ? '<div class="row">' + (merged(c)
       ? '<button class="btn ghost" type="button" id="caUnmerge"' + off + '>' + esc(jcT("ca_unmerge")) + '</button>'
       : '<button class="btn" type="button" id="caEditCat"' + off + '>' + esc(jcT("ca_edit")) + '</button>') + '</div>' : '');
  on("caEditCat", function(){ openCatEditor(c.id); });
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
function selHtml(id, key, prefix, list, v, off){
  return '<label>' + esc(jcT(key)) + '<select id="' + id + '"' + off + '>' + list.map(function(x){
    return '<option value="' + esc(x) + '"' + (x === v ? ' selected' : '') + '>' + esc(jcT(prefix + x)) + '</option>';
  }).join("") + '</select></label>';
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
function catEditView(){
  if (!ced || !reg) return show("home");
  var e = ced, f = e.f, c = e.id ? catFind(reg, e.id) : null, off = busy || e.shrinking ? ' disabled' : '';
  if (e.id && (!c || merged(c))) return show("home");
  jcBack(function(){ if (c) { catId = c.id; show("cat"); } else show("home"); });
  var areas = prog ? areasOf(prog).filter(function(a){ return a.archived !== true || a.id === f.area_id; }) : [];
  var stations = prog ? stationsOf(prog).filter(function(s){ return (s.archived !== true || s.id === f.station_id) && (!f.area_id || s.area_id === f.area_id); }) : [];
  var own = c ? strs(c.own_photos) : [], extra = c ? strs(c.photos).length - own.length : 0;
  var others = catsList(reg).filter(function(x){ return !merged(x) && (!c || x.id !== c.id); });
  el("view").innerHTML = '<h1 dir="auto">' + esc(c ? jcFmt("ca_edit_cat", { c: c.code }) : jcT("ca_new_cat")) + '</h1>' + msgBox() +
    '<p class="help" id="caCatPriv">' + esc(jcT("ca_cat_private")) + ' ' + esc(jcT("ca_text_hint")) + '</p>' +
    '<form class="panel" id="caCatForm" novalidate>' +
    txtHtml("caCName", "ca_f_name", f.name, 40, off) + txtHtml("caCOld", "ca_f_old_id", f.old_id, 40, off) +
    txtHtml("caCCoat", "ca_f_coat", f.coat, 120, off) +
    selHtml("caCSex", "ca_f_sex", "ca_sex_", CA_SEX, f.sex, off) + selHtml("caCLife", "ca_f_life", "ca_life_", CA_LIFE, f.life_stage, off) +
    '<label>' + esc(jcT("ca_f_area")) + '<select id="caCArea"' + off + '><option value="">' + esc(jcT("ca_none_opt")) + '</option>' +
      areas.map(function(a){ return '<option value="' + esc(a.id) + '"' + (a.id === f.area_id ? ' selected' : '') + '>' + esc(a.name) + '</option>'; }).join("") + '</select></label>' +
    '<label>' + esc(jcT("ca_f_station")) + '<select id="caCStation"' + off + '><option value="">' + esc(jcT("ca_none_opt")) + '</option>' +
      stations.map(function(s){ return '<option value="' + esc(s.id) + '"' + (s.id === f.station_id ? ' selected' : '') + '>' +
        esc([s.code, s.landmark].filter(Boolean).join(" · ")) + '</option>'; }).join("") + '</select></label>' +
    '<label class="check"><input type="checkbox" id="caCConf"' + (f.confirmed ? ' checked' : '') + off + '> <span>' + esc(jcT("ca_f_confirmed")) + '</span></label>' +
    txtHtml("caCStory", "ca_f_story", f.story, 1000, off, true) + '<p class="help">' + esc(jcT("ca_story_help")) + ' ' + esc(jcT("ca_text_hint")) + '</p>' +
    '<fieldset><legend>' + esc(jcT("ca_f_status")) + '</legend>' + selHtml("caCStatus", "ca_f_status", "ca_st_", CA_STATUS, f.status, off) +
      dateHtml("caCStOn", "ca_f_status_on", off) + txtHtml("caCStSrc", "ca_f_status_source", f.status_source, 120, off) + '</fieldset>' +
    '<fieldset><legend>' + esc(jcT("ca_f_ear")) + '</legend>' + selHtml("caCEar", "ca_f_ear", "ca_ear_", CA_EAR, f.ear_tip, off) +
      (f.ear_tip === "present" ? '<label>' + esc(jcT("ca_f_ear_side")) + '<select id="caCSide"' + off + '><option value="">—</option>' +
        ["left", "right"].map(function(x){ return '<option value="' + x + '"' + (x === f.ear_side ? ' selected' : '') + '>' + esc(jcT("ca_side_" + x)) + '</option>'; }).join("") +
        '</select></label>' : '') +
      '</fieldset><fieldset><legend>' + esc(jcT("ca_ster_h")) + '</legend>' +
      selHtml("caCSter", "ca_f_ster", "ca_ster_", CA_STER, f.sterilised, off) + txtHtml("caCSterSrc", "ca_f_ster_source", f.sterilised_source, 120, off) + '</fieldset>' +
    '<fieldset><legend>' + esc(jcT("ca_f_tnvr")) + '</legend>' + selHtml("caCTnvr", "ca_f_tnvr", "ca_tnvr_", CA_TNVR, f.tnvr, off) +
      dateHtml("caCTOn", "ca_f_tnvr_on", off) + txtHtml("caCTPlace", "ca_f_tnvr_place", f.tnvr_place, 120, off) + '</fieldset>' +
    '<div class="row"><button class="btn" type="submit" id="caCatSave"' + off + '>' + esc(jcT("ct_save")) + '</button>' +
    '<button class="btn ghost" type="button" id="caCatCancel"' + off + '>' + esc(jcT("ct_cancel")) + '</button></div></form>' +
    '<fieldset class="panel" id="caPhotoBox"><legend>' + esc(jcT("ca_photos")) + '</legend>' + (c
      ? '<div class="caPhotos">' + own.map(function(p, i){
          return '<span class="caPhotoEd">' + jcPetPhotoHtml({ photo_path: p }, 22, "thumb", { view: own }) +
            '<button class="mini" type="button" data-phrm="' + esc(p) + '"' + off + '>' + esc(jcFmt("ca_photo_remove", { n: i + 1 })) + '</button></span>';
        }).join("") + '</div>' +
        (extra > 0 ? '<p class="help">' + esc(jcFmt("ca_photo_merged", { n: extra })) + '</p>' : '') +
        (own.length < 4 ? '<input type="file" id="caPhotoIn" class="sr-only" accept="image/*"' + off + '>' +
          '<div class="row"><label class="btn ghost" id="caPhotoPick" for="caPhotoIn">' + esc(jcT("ca_photo_add")) + '</label></div>' : '') +
        '<p class="help" id="caPhotoHelp" role="status">' + esc(jcT(e.shrinking ? "working" : "ca_photos_help")) + '</p>'
      : '<p class="help" id="caPhotoHelp">' + esc(jcT("ca_photos_after")) + '</p>') + '</fieldset>' +
    (c && others.length ? '<fieldset class="panel" id="caMergeBox"><legend>' + esc(jcT("ca_merge")) + '</legend>' +
      '<p class="help">' + esc(jcT("ca_merge_help")) + '</p>' +
      '<label>' + esc(jcT("ca_merge_into")) + '<select id="caMergeTo"' + off + '><option value="">' + esc(jcT("ca_pick")) + '</option>' +
        others.map(function(x){ return '<option value="' + esc(x.id) + '"' + (x.id === e.merge_into ? ' selected' : '') + '>' +
          esc([x.code, x.name, x.old_id].filter(Boolean).join(" · ")) + '</option>'; }).join("") + '</select></label>' +
      '<div class="row"><button class="btn ghost" type="button" id="caMergeBtn"' + off + '>' + esc(jcT("ca_merge_btn")) + '</button></div></fieldset>' : '');
  /* values, not markup */
  Object.keys(CA_IDS).forEach(function(k){ var i = el(CA_IDS[k]); if (!i) return; i.value = f[k] || ""; i.addEventListener("input", function(){ f[k] = i.value; }); });
  [["caCSex", "sex"], ["caCLife", "life_stage"], ["caCStatus", "status"], ["caCSter", "sterilised"], ["caCTnvr", "tnvr"], ["caCSide", "ear_side"], ["caCStation", "station_id"]].forEach(function(p){
    var i = el(p[0]); if (i) i.addEventListener("change", function(){ f[p[1]] = i.value; });
  });
  el("caCArea").addEventListener("change", function(){ f.area_id = el("caCArea").value; f.station_id = ""; draw(); if (el("caCArea")) el("caCArea").focus(); });
  el("caCEar").addEventListener("change", function(){ f.ear_tip = el("caCEar").value; if (f.ear_tip !== "present") f.ear_side = ""; draw(); if (el("caCEar")) el("caCEar").focus(); });
  el("caCConf").addEventListener("change", function(){ f.confirmed = el("caCConf").checked; });
  on("caCatCancel", function(){ if (c) { catId = c.id; show("cat"); } else show("home"); });
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
    save("jc_cat_merge", { p_from: c.id, p_into: into.id }, "ca_merged", function(){ catId = into.id; current = "cat"; });
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
