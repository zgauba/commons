/* Cats page — the community cat programme. Plan: docs/plans/CC-community-cats.md.
   CC-1 foundation (the page behind the 'cats' module flag — off = nothing asked of the server — and the role line);
   CC-2 areas + feeding stations (server 20261118140000_cc2_cat_areas_stations.sql).
   Two server families, never one filtered here (plan premortem #6):
   - residents: jc_cat_places — public stations only (no Station ID, notes, people or history); shown as a list;
   - the programme (coordinators 'cats', volunteers 'cats_vol', community admins): jc_cat_programme — every station
     incl. private pins, access notes, who feeds where (names only), earlier locations. can_edit (coordinators and
     community admins) shows the editors; every write is checked by the server again.
   Roles come from jc_me_get.admin_scopes (display only). The cat register (CC-3), visits (CC-4), vet log (CC-5) follow. */

var state = null, cfg = null, current = null;
var msgBox = jcMsgBox, ar = jcIsAr, on = jcOn, each = jcEach, hObj = jcObj, finite = jcFinite;
var places = null, prog = null, loadErr = null, busy = false, map = null;
var tab = "stations";                 /* the programme's tabs: stations · areas (coordinators) */
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
  var call = inProgramme() ? rpc("jc_cat_programme").then(function(d){ prog = d; }, function(e){
    if (e && e.code === "NOT_ADMIN") { prog = null; return rpc("jc_cat_places").then(function(d){ places = d; }); }   /* role just removed */
    throw e;
  }) : rpc("jc_cat_places").then(function(d){ places = d; });
  return call.catch(function(e){ loadErr = (e && e.code) || "UNKNOWN"; });
}
function save(name, args, okKey, after){
  if (busy) return;
  busy = true; draw();
  rpc(name, args).then(function(d){
    busy = false; prog = d;
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
    if (!prog) {                                          /* residents: public stations only */
      var pub = stationsOf(places);
      el("view").innerHTML = head + '<h2>' + esc(jcT("ca_stations_h")) + '</h2><p class="help">' + esc(jcT("ca_public_help")) + '</p>' +
        (pub.length ? grouped(places, pub, false) : '<p class="help" id="caNone">' + esc(jcT("ca_none_public")) + '</p>') +
        '<div class="panel" id="caSoon"><p>' + esc(jcT("ca_soon")) + '</p></div>';
      return;
    }
    var keys = canEdit() ? ["stations", "areas"] : ["stations"];
    if (keys.indexOf(tab) < 0) tab = "stations";
    var body = tab === "areas" ? areasHtml() : stationsHtml();
    el("view").innerHTML = head + (keys.length > 1 ? jcTabsHtml("caTab_", keys, tab, function(k){ return jcT("ca_tab_" + k); }, jcModTitle("cats"), "caPanel") : '') +
      '<div ' + jcTabPanel("caTab_", tab, "caPanel") + '>' + body + '</div>';
    if (keys.length > 1) jcTabsWire("caTab_", keys, function(k){ tab = k; draw(); });
    if (tab === "areas") wireAreas(); else wireStations();
  },
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
  jcHelp(name === "home" ? "cats" : null);
  VIEWS[name]();
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
