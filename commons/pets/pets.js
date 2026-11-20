/* Pets page (R5b-1) — residents' pet directory. Plan: docs/plans/R5-pets.md (Zee decisions 2026-11-10/11);
   R5b-2b-2a tabs + R5b-2b-2b pet page: docs/plans/R5b-2-pets-maps.md "Re-plan 2026-11-13".
   Views: list (tabs Pets · My Pets) · pet (?pet=<uuid>; tabs About · Sightings · Map by the pet's state)
   · edit (add / edit one of my home's pets).
   Pets = owned pets in the server's order (missing → nearest my home pin → name). CC-7c: strays left Pets — stray
   cats are reported on the Cats page (cats/report.js); the Pets tab only links there while Cats is on. Anything the
   server still sends that isn't an owned pet is dropped here (until CC-7d archives the old strays).
   Server: jc_pets_list, jc_pet_get, jc_pet_save, jc_pet_archive, jc_pet_missing_set, jc_admin_pet_missing_set (Pets team),
   jc_pet_sighting_add, jc_pets_group_get (S4 + R5a, R5b-2b-0); photos are R5c; the admin side is R5d.
   PRIVACY — this page renders what the server sends and nothing else:
   - an owned pet's home arrives on its card (homes can't be hidden — HH, Zee 2026-11-11); shown only when it
     arrives;
   - sightings (and a card's last_seen / last_seen_at) arrive only as the server's rule allows (jc_pet_sight_from):
     my own pets, Pets admins, and a missing pet's recent ones; never who reported one. An "out on their
     own" report (an owned pet that isn't missing) goes to the household only — said before it is sent;
     ("by_me" is the reporter's own flag, and disappears once the server erases the reporter within 48 h);
   - the WhatsApp group link is members-only (jc_pets_group_get, never the public config); it is set as an
     attribute after a strict format check, opened with rel="noopener noreferrer". */

var params = new URLSearchParams(location.search);
var PET = params.get("pet");
if (PET && !/^[0-9a-f-]{36}$/i.test(PET)) PET = null;

var state = null, cfg = null, current = null;
var map = null, layer = "sat";                         /* the one big map on screen (a pet's Map tab, the pin picker) */
var minis = { maps: [], obs: null };                        /* the Sightings tab's small maps, built when scrolled into view */
var full = jcMapFull(function(){ return map; }, null); /* the map, bigger (assets/map.js) */
var pets = null, listErr = null, listLoading = false, listSeq = 0;
var pet = null, petId = null, petErr = null, petLoading = false, petSeq = 0;   /* the open pet (jc_pet_get) */
var TABS = ["pets", "mine"];                           /* CC-7c: an old ?tab=strays lands on Pets */
/* the pet page's own tabs (R5b-2b-1, Map R5b-2b-2b): ?show= keeps ?tab= for the list tab to return to */
var PET_TABS = ["about", "sightings", "map"];
var petTab = PET_TABS.indexOf(params.get("show")) >= 0 ? params.get("show") : null;   /* null = the pet's default */
var tab = params.get("tab") === "list" ? "pets" : TABS.indexOf(params.get("tab")) >= 0 ? params.get("tab") : "pets";   /* ?tab=list: old links */
var FILTERS = ["all", "dogs", "cats", "other", "wanderers"];
var filter = "all";
var ptQ = "";                 /* OT-3: the name search on the Pets list (on the phone, over the list already loaded) */
var SPECIES = ["cat", "dog", "bird", "rabbit", "other"];
var ptBusy = false;
var form = null;      /* edit: { id | null, species, name, description, wanderer, microchipped, photo_path, photo (picked: data URL) } — survives a language switch */
var sheet = null;     /* on the pet page: null | "missing" | "found" | "sight" */
var sight = null;     /* { note, lat, lng, picking, where, view, zoom } while the sighting form is open (picking: the pin map) */
var missDraft = null; /* { note } while the missing sheet is open */
var sent = null;      /* the note of the sighting just sent: the WhatsApp message tells the group about it */
var group;            /* undefined = not read yet; null = none / unreadable; else the checked invite link */

/* ---------- helpers ---------- */
/* page helpers: the shared copies in assets/api.js (structural audit SA-1) */
var msgBox = jcMsgBox, say = jcSay, showOk = jcShowOk, on = jcOn, each = jcEach, ar = jcIsAr, hObj = jcObj, setUrl = jcSetUrl, finite = jcFinite;
function ptMsg(code){ jcShowErrFor("pt_err_", code); }
/* pets or community admins (the server checks every admin call; this only shows the way in) */
function canAdmin(){ var sc = (state && state.me && state.me.admin_scopes) || []; return sc.indexOf("pets") >= 0 || sc.indexOf("community") >= 0; }
/* a neighbour's pet: the Pets team can raise / clear the missing alert for an owner who phoned (jc_admin_pet_missing_set) */
function teamMiss(p){ return p.kind === "owned" && p.mine !== true && canAdmin(); }
function missRpc(p){ return teamMiss(p) ? "jc_admin_pet_missing_set" : "jc_pet_missing_set"; }
function hasHome(){ return !!(state && state.me && state.me.home); }
function moduleOn(){ return jcModuleOn(cfg, "pets"); }
function listUrl(){ return tab === "pets" ? null : "tab=" + tab; }
/* owned pets only (CC-7c): a stray the server still sends is dropped from lists and treated as not found on its page */
function isPet(p){ return hObj(p) && typeof p.id === "string" && typeof p.name === "string" && p.kind === "owned"; }
function speciesText(p){ return jcT("pt_sp_" + (SPECIES.indexOf(p.species) >= 0 ? p.species : "other")); }
function kindText(){ return jcT("pt_kind_owned"); }
var DAY = 864e5;
function recent(iso, ms){ var t = Date.parse(iso); return isFinite(t) && Date.now() - t < ms && t - Date.now() < 3e5; }
/* my pet, at home, reported out on its own in the last 24 h (the server sends last_seen_at only to the household) */
function seenOut(p){ return p.mine === true && p.kind === "owned" && p.missing !== true && recent(p.last_seen_at, DAY) ? jcAgo(p.last_seen_at) : ""; }
/* the card's home has no type (villa / townhouse / apartment), so a neutral label — never a guessed "Villa" */
function homeText(h){
  if (!hObj(h) || h.number == null) return "";
  /* the home's type (villa / townhouse / apartment) once the server sends it; a neutral "Home" before that */
  var n = HOME_TYPES.indexOf(h.type) >= 0 ? jcHomeLabel(h) : jcFmt(h.building ? "pt_home_b" : "pt_home", { n: h.number, b: h.building });
  return [n, h.village ? jcVillageName(cfg, h.village) : ""].filter(Boolean).join(" · ");
}
var HOME_TYPES = ["villa", "townhouse", "apartment"];
function myHomeText(){
  var h = state && state.me && state.me.home;
  return h ? [jcHomeLabel(h), jcVillageName(cfg, h.village)].filter(Boolean).join(" · ") : "";
}
function when(iso){ return typeof iso === "string" && !isNaN(Date.parse(iso)) ? jcDayText(jcDateOf(iso, cfg)) + " · ⁦" + jcClock(iso, cfg) + "⁩" : ""; }
/* an owned pet out on its own (R5b-2b-0): not missing, and not a wanderer — a wanderer being out is normal */
function outAlone(p){ return p.kind === "owned" && p.missing !== true && p.wanderer !== true; }
/* the reports the server takes (else SIGHTINGS_CLOSED): a missing pet, a pet out alone */
function sightOpen(p){ return p.missing === true || outAlone(p); }
/* the report button: never on the household's own pet that's at home — they get the reports instead */
function canReport(p){ return sightOpen(p) && !(outAlone(p) && p.mine === true); }
/* the Map tab: where a missing pet was seen. No home pin: the server sends no home coordinates. */
function hasMap(p){ return p.missing === true && typeof L !== "undefined"; }
/* the WhatsApp share: missing pets; an "out on their own" report only once sent ("Is this Rex?") */
function shareOn(p){ return canReport(p) && (!outAlone(p) || sent !== null); }
/* newest first, on the phone too (the small maps and the amber box rely on it — review L2); undated last */
function sightList(p){
  var t = function(s){ var x = Date.parse(s.seen_at); return isFinite(x) ? x : -Infinity; };
  return Array.isArray(p.sightings) ? p.sightings.filter(hObj).map(function(s, i){ return [s, i]; })
    .sort(function(a, b){ return t(b[0]) - t(a[0]) || a[1] - b[1]; }).map(function(x){ return x[0]; }) : [];
}
/* sightings with a location, newest first */
function located(p){
  return sightList(p).filter(function(s){ return finite(s.lat) && finite(s.lng) && isFinite(Date.parse(s.seen_at)); });
}
function petUrl(p){ return location.origin + location.pathname + "?pet=" + encodeURIComponent(p.id); }
/* tabs by the pet's state (plan R5b-2b-2b): Sightings where reports exist or can be added (and on the household's own
   pet that isn't a wanderer — where "out on their own" reports land); Map for a missing pet. A missing pet
   opens on Sightings (that's where help comes in). */
function petTabs(p){
  var t = ["about"];
  if (canReport(p) || sightList(p).length || (outAlone(p) && p.mine === true)) t.push("sightings");
  if (hasMap(p)) t.push("map");
  return t;
}
function petQuery(id){ return "pet=" + encodeURIComponent(id) + (tab === "pets" ? "" : "&tab=" + tab) + (petTab ? "&show=" + petTab : ""); }
function petById(id){ return (pets || []).filter(function(p){ return p.id === id; })[0]; }
function matches(p){
  if (filter === "dogs") return p.species === "dog";
  if (filter === "cats") return p.species === "cat";
  if (filter === "other") return p.species !== "dog" && p.species !== "cat";
  if (filter === "wanderers") return p.wanderer === true;
  return true;
}

/* every write: one at a time; ptBusy always comes back down */
function ptWrite(b, call, done, fail){
  if (ptBusy) return;
  ptBusy = true; if (b) b.disabled = true;
  var view = current;
  Promise.resolve().then(call).then(function(d){
    ptBusy = false;
    if (current !== view) return;
    return done(d);
  }).catch(function(e){
    ptBusy = false; if (b) b.disabled = false;
    if (current !== view) return;
    var code = (e && e.code) || "UNKNOWN";
    if (code === "MODULE_OFF") return show("off");
    if (fail && fail(code) === true) return;
    ptMsg(code);
  });
}

/* photos: assets/pet-photo.js (R5d-2a). The last file picked in the form wins: */
var shrinkSeq = 0;

/* ---------- data ---------- */
function loadList(then){
  var seq = ++listSeq;
  listLoading = true; listErr = null;
  rpc("jc_pets_list", { p_filter: "all" }).then(function(d){
    if (seq !== listSeq) return;
    listLoading = false;
    pets = Array.isArray(d) ? d.filter(isPet) : [];
    if (current !== "list") return;                     /* left meanwhile: no redraw, no message on another screen (review M1) */
    show("list");
    if (then) then();
  }, function(e){
    if (seq !== listSeq) return;
    listLoading = false;
    if (e.code === "MODULE_OFF") return show("off");
    listErr = e.code || "UNKNOWN";
    if (current === "list") show("list");
  });
}
function loadPet(id, then){
  var seq = ++petSeq;
  petId = id;
  petLoading = true; petErr = null;
  rpc("jc_pet_get", { p_pet: id }).then(function(d){
    if (seq !== petSeq) return;
    petLoading = false;
    if (!isPet(d)) {
      if (current !== "pet") return;
      if (hObj(d) && typeof d.id === "string") return backToList("NOT_FOUND");   /* not an owned pet (an old stray link) */
      petErr = "UNKNOWN"; draw(); return;
    }
    if (!pet || pet.id !== d.id) { if (!petTab) petTab = d.missing === true && sightOpen(d) ? "sightings" : "about"; }
    pet = d;
    if (current !== "pet") return;                      /* e.g. Edit opened meanwhile (review M1) */
    sheet = null; sight = null; missDraft = null;       /* a fresh read closes any sheet opened on the old state (review M3) */
    draw();
    if (then) then();
  }, function(e){
    if (seq !== petSeq) return;
    petLoading = false;
    var code = e.code || "UNKNOWN";
    if (code === "MODULE_OFF") return show("off");
    if (current !== "pet") return;                      /* never yank an open edit form back to the list (review M1) */
    if (code === "NOT_FOUND") return backToList("NOT_FOUND");
    petErr = code;
    if (current === "pet") draw();
  });
}
/* the members-only WhatsApp group link, read once per page; anything that isn't an invite link is ignored */
function loadGroup(){
  if (group !== undefined) return;
  group = null;
  rpc("jc_pets_group_get").then(function(d){
    var l = hObj(d) && d.link;
    group = jcWaGroupOk(l) ? l : null;
    if (current === "pet" && pet && el("ptShare")) drawShare();
  }, function(){ group = null; });
}

function openPet(id){
  if (!pet || pet.id !== id) petTab = petTab && id === PET ? petTab : null;    /* a shared ?show= applies to that pet only */
  pet = null; petErr = null; sheet = null; sight = null; missDraft = null; sent = null;
  setUrl(petQuery(id));
  show("pet");
  loadPet(id);
}
/* back to the list, re-read; a message waits for the list to land, or the redraw would wipe it */
function backToList(code, okText){
  pet = null; sheet = null; sight = null; missDraft = null; sent = null; petSeq++; petTab = null; PET = null;
  setUrl(listUrl());
  pets = null;
  loadList(code || okText ? function(){ if (code) ptMsg(code); else showOk(okText); } : null);
  show("list");
}
function draw(){ var r = jcFocusKeep(); VIEWS[current](); r(); jcPetPhotoFill(); }

/* ---------- views ---------- */
function dropMap(){
  full.reset();
  jcMinisClear(minis);
  if (map) { var m = map; map = null; jcMapRemove(m); }
}
function show(name){
  dropMap();
  current = name;
  var back = null;
  if (name === "pet") back = function(){ if (!ptBusy) backToList(); };
  if (name === "edit") back = function(){ if (ptBusy) return; var id = form && form.id; form = null; if (id && pet) { show("pet"); } else show("list"); };
  jcBack(back, "back");
  jcHelp(name === "pet" ? "pet" : name === "list" ? "pets" : null);
  var refocus = jcFocusKeep();
  VIEWS[name]();
  refocus();
  jcPetPhotoFill();
}

function chips(p, noMissing){      /* noMissing: the pet page's alarm already says it */
  var c = [];
  if (p.missing === true && !noMissing) c.push('<span class="chip miss">' + esc(jcT("pt_missing_chip")) + '</span>');
  if (p.wanderer === true) c.push('<span class="chip">' + esc(jcT("pt_wanderer_chip")) + '</span>');
  if (p.mine === true) c.push('<span class="chip">' + esc(jcT("pt_mine_chip")) + '</span>');
  return c.join("");
}
/* R5b-2b-1 (Zee 2026-11-12: "two columns… the pet details page looks messy"): photo-led cards, the whole card is
   the button. Missing pets: full-width cards on top (photo beside the text, the last-seen line). */
function card(p){
  var where = homeText(p.home);
  var miss = p.missing === true, out = seenOut(p);
  return jcCardHtml({ missing: miss, liAttrs: 'data-pet="' + esc(p.id) + '"', btnAttrs: 'data-open="' + esc(p.id) + '"',
    photoHtml: jcPetPhotoHtml(p, 34, "tile"), name: p.name, linesHtml: [
      jcMetaHtml(speciesText(p) + " · " + kindText(p)),
      where && jcMetaHtml(where, "where", true),
      chips(p) && '<span class="head">' + chips(p) + '</span>',
      miss && p.last_seen_note && jcMetaHtml(jcFmt("pt_last_seen", { t: p.last_seen_note }), "", true),
      /* amber, not red: a heads-up for the household, nothing has changed state (plan R5b-2b-2a) */
      out && jcMetaHtml(jcFmt("pt_seen_out", { t: out }), "seenout") ] });
}
function noHomeHtml(){
  return '<p class="notice" id="ptNoHome">' + esc(jcT("pt_no_home")) + '</p>' +
    '<div class="row"><a class="btn ghost" href="../home/">' + esc(jcT("bk_go_home")) + '</a></div>';
}

var VIEWS = {
  off: function(){
    el("view").innerHTML = '<h1 dir="auto">' + esc(jcModTitle("pets")) + '</h1><p class="notice" id="ptOff">' + esc(jcT("bk_off")) + '</p>';
  },

  list: function(){
    dropMap();                                         /* a redraw (language, filter) builds a fresh map */
    var html = '<h1 dir="auto">' + esc(jcModTitle("pets")) + '</h1>' +
      jcTabsHtml("pttab-", TABS, tab, function(t){ return jcT("pt_tab_" + t); }, jcModName("pets"), "ptBody") + msgBox();
    function wireTabs(){
      jcTabsWire("pttab-", TABS, function(t){ tab = t; setUrl(listUrl()); show("list"); });
    }
    if (listErr) {
      el("view").innerHTML = html + '<div ' + jcTabPanel("pttab-", tab, "ptBody") + '><div class="row"><button class="btn ghost" type="button" id="ptRetry">' +
        esc(jcT("adm_ad_retry")) + '</button></div></div>';
      ptMsg(listErr); wireTabs();
      return on("ptRetry", function(){ loadList(); show("list"); });
    }
    if (!pets) {
      el("view").innerHTML = html + '<div ' + jcTabPanel("pttab-", tab, "ptBody") + '><p class="help" role="status">' + esc(jcT("working")) + '</p></div>';
      wireTabs();
      if (!listLoading) loadList();
      return;
    }
    var body;
    if (tab === "mine") {
      var mine = pets.filter(function(p){ return p.mine === true; });
      body = !hasHome() ? noHomeHtml() :
        (mine.length ? '<ul class="ptgrid" id="ptMine">' + mine.map(card).join("") + '</ul>'
                     : '<p class="help" id="ptMine">' + esc(jcT("pt_mine_none")) + '</p>') +
        (mine.length < 10 ? '<div class="row"><button class="btn" type="button" id="ptAdd">' + esc(jcT("pt_add")) + '</button></div>'
                          : '<p class="help" id="ptCap">' + esc(jcT("pt_err_TOO_MANY_PETS")) + '</p>');
    } else {
      /* Pets: owned only; missing pinned on top; the rest in the server's order */
      var owned = pets.filter(function(p){ return p.kind === "owned"; });
      var missing = owned.filter(function(p){ return p.missing === true; });
      var rest = owned.filter(function(p){ return p.missing !== true && matches(p); });
      var restHtml = function(){
        var found = rest.filter(function(p){ return jcMatches(ptQ, [p.name]); });
        return found.length ? '<ul class="ptgrid" id="ptList">' + found.map(card).join("") + '</ul>'
          : '<p class="help" id="ptList" role="status">' + esc(ptQ.trim() && rest.length ? jcFmt("pt_no_match", { q: ptQ.trim() })
                                                           : jcT(owned.length ? "pt_none_filter" : "pt_none")) + '</p>';
      };
      body = (missing.length ? '<h2 class="group" id="ptMissingHead">' + esc(jcT("pt_missing_now")) + '</h2>' +
                               '<ul class="ptgrid wide" id="ptMissing">' + missing.map(card).join("") + '</ul>' : '') +
        jcChipsHtml({ id: "ptFilters", prefix: "ptF-", label: jcT("pt_filter"), current: filter,
                      items: FILTERS.map(function(f){ return { key: f, text: jcT("pt_f_" + f) }; }) }) +
        /* owned pets: the server's order from my home pin — their homes never reach the phone, so no button (NF-2) */
        (owned.length ? jcSearchHtml({ id: "ptSearch", placeholder: jcT("pt_search"), value: ptQ }) : '') +
        jcSortedHtml({ id: "ptSorted", fallback: "pt_sorted_name", noButton: true }) +
        '<div id="ptListBox">' + restHtml() + '</div>' +
        /* CC-7b/7c: stray cats are reported on the Cats page (nothing to report there while Cats is off) */
        (jcModuleOn(cfg, "cats") ? '<div class="row"><a class="btn ghost" id="rpOpen" href="../cats/?report=1">' + esc(jcT("ca_rp_cta")) + '</a></div>' +
          '<p class="help" id="rpCtaHelp">' + esc(jcT("pt_rp_cats_help")) + '</p>' : '');
    }
    el("view").innerHTML = html + '<div ' + jcTabPanel("pttab-", tab, "ptBody") + '>' + body + '</div>';
    wireTabs();
    each("[data-open]", function(b){ openPet(b.dataset.open); });
    jcChipsWire("ptFilters", "ptF-", function(k){ if (FILTERS.indexOf(k) < 0) return; filter = k; show("list"); });
    var sb = el("ptSearch");
    if (sb) sb.addEventListener("input", function(){
      ptQ = sb.value;                                    /* only the list redraws: the box keeps focus */
      el("ptListBox").innerHTML = restHtml();
      each("#ptListBox [data-open]", function(b){ openPet(b.dataset.open); });
    });
    on("ptAdd", function(){ form = { id: null, species: "cat", name: "", description: "", wanderer: false, microchipped: false, photo_path: null, photo: null }; show("edit"); });
  },

  pet: function(){
    dropMap();                                         /* every redraw builds its maps afresh */
    if (petErr) {
      el("view").innerHTML = msgBox() + '<div class="row"><button class="btn ghost" type="button" id="ptPetRetry">' + esc(jcT("adm_ad_retry")) + '</button></div>';
      ptMsg(petErr);
      return on("ptPetRetry", function(){ if (petId) { loadPet(petId); draw(); } });
    }
    if (!pet) { el("view").innerHTML = msgBox() + '<p class="help" role="status">' + esc(jcT("working")) + '</p>'; return; }
    var p = pet, h = '', tabs = petTabs(p);
    if (tabs.indexOf(petTab) < 0) petTab = tabs[0];
    /* header: photo, name, species · kind, badges; the missing alarm (with the owner's "is back home") on every tab */
    /* compact: photo beside the name, so the tabs stay on the first screen */
    var badges = chips(p, true, true);
    h += jcHeroHtml({ photoHtml: jcPetPhotoHtml(p, 34, "tile", { view: true }), name: p.name,
      /* pets / community admins: the way into Organizer Tools → Pets, as on a court's page (R5d-1) */
      afterNameHtml: canAdmin() ? '<a class="lang adminbtn" id="ptAdmin" href="../admin/?tab=pets&pet=' + encodeURIComponent(p.id) + '">' + esc(jcT("ev_admin")) + '</a>' : '',
      meta: speciesText(p) + " · " + kindText(p), chipsHtml: badges });
    if (p.missing === true) {
      h += jcAlarmHtml("ptAlarm", jcFmt("pt_missing_since", { n: p.name, d: when(p.missing_since) }),
        (p.last_seen_note ? '<p dir="auto">' + esc(jcFmt("pt_last_seen", { t: p.last_seen_note })) + '</p>' : '') +
        (p.mine === true && p.missing_by_team === true ? '<p id="ptByTeam">' + esc(jcT("pt_missing_by_team")) + '</p>' : '') +
        ((p.mine === true && p.kind === "owned") || teamMiss(p) ? '<div class="acts"><button class="btn" type="button" id="ptFound"' + (ptBusy ? ' disabled' : '') + '>' +
          esc(jcFmt("pt_found", { n: p.name })) + '</button></div>' : ''));
    }
    h += seenOutHtml(p);
    if (tabs.length > 1) h += jcTabsHtml("ptpg-", tabs, petTab, function(t){
      var n = t === "sightings" ? sightList(p).length : 0;
      return jcT("pt_tab_" + t) + (n ? " (" + n + ")" : "");
    }, p.name, "ptPage");
    h += msgBox();
    var body = '';
    if (petTab === "about") {
      var facts = [];
      if (hObj(p.home)) facts.push(['pt_lives', homeText(p.home)]);
      if (p.wanderer === true) facts.push(['pt_wanderer', jcT("pt_wanderer_help")]);
      facts.push(['pt_chip', jcT(p.microchipped === true ? "pt_yes" : "pt_no_or_unknown")]);
      if (p.description) body += '<p class="desc" dir="auto" id="ptDesc">' + esc(p.description) + '</p>';
      body += jcFactsHtml(facts.map(function(f){ return [jcT(f[0]), f[1]]; }), "ptFacts");
      /* my own pet: the household's controls */
      if (p.mine === true) body += ownerHtml(p);
      else if (teamMiss(p)) body += ownerHtml(p, true);       /* the Pets team: the same panel, the missing switch only */
    } else if (petTab === "map") {
      body += mapTabHtml(p);
    } else {
      if (canReport(p)) body += sightHtml(p);
      if (Array.isArray(p.sightings)) body += sightingsHtml(p);
      if (shareOn(p)) body += '<section class="share" id="ptShare" aria-labelledby="ptShareHead"></section>';
    }
    el("view").innerHTML = h + (tabs.length > 1 ? '<div ' + jcTabPanel("ptpg-", petTab, "ptPage") + '>' + body + '</div>' : '<div id="ptPage" class="jcstack">' + body + '</div>');
    if (tabs.length > 1) jcTabsWire("ptpg-", tabs, function(t){
      petTab = t; sheet = null; sight = null; missDraft = null;     /* an open form belongs to its tab */
      setUrl(petQuery(p.id)); draw();
    });
    wirePet();
    if (petTab === "sightings" && shareOn(p)) { drawShare(); loadGroup(); }
    if (petTab === "map") drawPetMap(p);
    if (petTab === "sightings") { jcMinisDraw(minis); drawPicker(p); }
  }
};

function ownerHtml(p, team){
  var h = '<h2 class="group">' + esc(jcT(team ? "pt_team" : "pt_yours")) + '</h2><div class="panel" id="ptOwner">';
  if (sheet === "missing") {
    var d = missDraft || { note: "" };
    h += '<p><b>' + esc(jcFmt("pt_miss_q", { n: p.name })) + '</b></p>' +
      '<label>' + esc(jcT("pt_miss_note")) + '<textarea id="ptMissNote" maxlength="200" dir="auto">' + esc(d.note) + '</textarea></label>' +
      '<p class="help">' + esc(jcT(team ? "pt_miss_help_team" : "pt_miss_help")) + '</p>' +
      '<div class="acts"><button class="btn danger-fill" type="button" id="ptMissGo"' + (ptBusy ? ' disabled' : '') + '>' + esc(jcT("pt_miss_go")) + '</button>' +
      '<button class="btn ghost" type="button" id="ptSheetKeep">' + esc(jcT("ct_cancel")) + '</button></div>';
  } else if (p.missing !== true) {          /* while missing, "is back home" sits in the alarm, on every tab */
    h += '<button class="btn danger-fill wide" type="button" id="ptMiss">' + esc(jcT("pt_miss")) + '</button>';
  }
  /* not beside the red button while the missing sheet is open; Remove is in the Edit form, away from the alarm */
  if (sheet !== "missing" && !team) h += '<button class="btn ghost wide" type="button" id="ptEdit">' + esc(jcT("pt_edit")) + '</button>';
  return h + '</div>';
}
function sightHtml(p){
  /* an owned pet at home: "Seen Rex out on their own?" — and who will see the report, said before it is sent */
  var title = jcFmt(outAlone(p) ? "pt_sight_out" : "pt_sight", { n: p.name });
  if (sheet !== "sight") {
    return '<div class="acts"><button class="btn ghost" type="button" id="ptSight">' + esc(title) + '</button></div>';
  }
  var s = sight || { note: "", lat: null, lng: null };
  return '<div class="panel" id="ptSightForm"><b>' + esc(title) + '</b>' +
    '<label>' + esc(jcT("pt_sight_note")) + '<textarea id="ptSightNote" maxlength="280" dir="auto">' + esc(s.note) + '</textarea></label>' +
    (s.picking ? pickHtml(p) :
     s.lat != null
      ? '<p class="status ok" id="ptPos">' + esc(jcT("pt_pos_added")) + ' <button class="mini" type="button" id="ptPosClear">' + esc(jcT("pt_pos_clear")) + '</button></p>'
      : typeof L !== "undefined" ? '<div class="acts"><button class="mini" type="button" id="ptPosAdd">' + esc(jcT("pt_pos_add")) + '</button></div>' : '') +
    '<p class="help" id="ptSightPrivacy">' + esc(outAlone(p) ? jcFmt("pt_out_privacy", { n: p.name }) : jcT("pt_sight_privacy")) + '</p>' +
    /* while the pin map is open, its own buttons decide; Send waits */
    (s.picking ? '' : '<div class="acts"><button class="btn" type="button" id="ptSightGo"' + (ptBusy ? ' disabled' : '') + '>' + esc(jcT("pt_sight_go")) + '</button>' +
    '<button class="btn ghost" type="button" id="ptSheetKeep">' + esc(jcT("ct_cancel")) + '</button></div>') + '</div>';
}
/* Add Location Pin (kit picker): opens on the phone's location if it can find it, else the community's centre — the
   line above the map says which; the person still puts the ring on the spot. */
function pickText(p){
  var w = sight && sight.where;
  return jcFmt(w === "centre" ? "pt_pick_centre" : w === "locating" ? "pt_pick_finding" : "pt_pick_help", { n: p.name });
}
function pickHtml(p){
  return '<p class="help" id="ptPickHelp" role="status">' + esc(pickText(p)) + '</p>' + jcPinPickerHtml("ptPick") +
    /* never the community's centre by accident: when it couldn't find you, the map must be moved first (security L2) */
    '<div class="acts"><button class="btn" type="button" id="ptPickOk"' + (sight && sight.where === "centre" && !sight.moved ? ' disabled' : '') + '>' + esc(jcT("pt_pick_ok")) + '</button>' +
    '<button class="btn ghost" type="button" id="ptPickCancel">' + esc(jcT("ct_cancel")) + '</button></div>';
}
function drawPicker(p){
  var s0 = sight;
  if (!s0 || !s0.picking || typeof L === "undefined" || !el("ptPick")) return;
  var c = (cfg && cfg.map) || {};
  var m = map = jcPinPicker("ptPick", { center: s0.view || [c.lat || 24.53, c.lng || 54.43], zoom: s0.zoom || c.zoom || 16, locateZoom: 18,
    onError: function(code){ if (map === m) ptMsg(code); }, alive: function(){ return map === m; } });
  /* a redraw (language switch) reopens the map where it was left */
  m.on("moveend", function(){
    if (sight !== s0 || map !== m) return;
    var x = m.getCenter(); s0.view = [x.lat, x.lng]; s0.zoom = m.getZoom();
    if (s0.where === "centre" && !s0.moved) { s0.moved = true; var b = el("ptPickOk"); if (b) b.disabled = false; }
  });
}
var MINI_MAX = 10;                                    /* small maps on the newest 10 sightings with a location */
function sightingsHtml(p){
  var minisLeft = typeof L !== "undefined" ? MINI_MAX : 0;
  return jcEntriesHtml({ heading: jcT("pt_sightings"), id: "ptSightings",
    /* the household's own pet at home: where neighbours' "out on their own" reports land */
    empty: outAlone(p) && p.mine === true ? jcFmt("pt_out_none", { n: p.name }) : jcT("pt_sightings_none"),
    items: p.sightings.length ? sightList(p).map(function(s){
      var pos = finite(s.lat) && finite(s.lng), mini = pos && minisLeft-- > 0;
      return { meta: when(s.seen_at) + (s.by_me === true ? ' · ' + jcT("pt_by_me") : ''),
        bodyHtml: (s.note ? '<div dir="auto">' + esc(s.note) + '</div>' : '') +
          (mini ? jcMiniHtml(s.lat, s.lng) : '') + (pos ? '<div class="acts">' + jcMapLink(s.lat, s.lng) + '</div>' : '') };
    }) : [],
    afterHtml: '<p class="help">' + esc(jcT("pt_sightings_kept")) + '</p>' });
}

/* ---------- WhatsApp (Zee W1 = a): copy the message + open the group; or WhatsApp's own chat picker ---------- */
function waText(p){
  /* "Is this Rex?": the reporter asks the group; the report itself stays with the household */
  if (sent !== null && outAlone(p)) return jcFmt(sent ? "pt_wa_out_note" : "pt_wa_out", { n: p.name, s: speciesText(p), t: sent, u: petUrl(p) });
  if (sent !== null) return jcFmt(sent ? "pt_wa_seen_note" : "pt_wa_seen", { n: p.name, s: speciesText(p), t: sent, u: petUrl(p) });
  /* otherwise a missing pet (shareOn). The home goes into a message only when the household shares its own pet:
     neighbors' shares carry the Commons link, where the home is shown under the server's rules (security review M1,
     Zee 2026-11-11) */
  var where = p.mine === true ? homeText(p.home) : "";
  return jcFmt(where ? "pt_wa_missing_home" : "pt_wa_missing", { n: p.name, s: speciesText(p), h: where, u: petUrl(p) });
}
function drawShare(){
  var box = el("ptShare");
  if (!box || !pet) return;
  var text = waText(pet);
  box.innerHTML = '<h2 class="group" id="ptShareHead">' + esc(jcT("pt_share")) + '</h2>' +
    /* an "out on their own" report was the household's only: sharing it is the reporter's own, separate choice (security M2) */
    (outAlone(pet) ? '<p class="help" id="ptWaOut">' + esc(jcFmt("pt_wa_out_group", { n: pet.name })) + '</p>' : '') +
    shareLinksHtml(text);
  wireShareLinks(text);
}
/* the message + "Tell the pets group" (copy, then the group opens) + "Send to someone else" */
function shareLinksHtml(text){
  return '<p class="wamsg" id="ptWaText" dir="auto">' + esc(text) + '</p>' +
    '<div class="acts">' + (group ? '<a class="btn" id="ptWaGroup" target="_blank" rel="noopener noreferrer">' + esc(jcT("pt_wa_group")) + '</a>' : '') +
    '<a class="btn ghost" id="ptWaAny" target="_blank" rel="noopener noreferrer">' + esc(jcT("pt_wa_any")) + '</a></div>' +
    (group ? '<p class="help">' + esc(jcT("pt_wa_group_help")) + '</p>' : '');
}
function wireShareLinks(text){
  /* attributes, not markup: the link never passes through an HTML string */
  el("ptWaAny").setAttribute("href", "https://wa.me/?text=" + encodeURIComponent(text));
  var g = el("ptWaGroup");
  if (g) {
    g.setAttribute("href", group);
    g.addEventListener("click", function(){
      /* WhatsApp group links can't carry a message: copy it, the group opens in the same tap */
      var done = function(){ showOk(jcT("pt_wa_copied")); };
      var fail = function(){ say("err", jcT("pt_wa_copy_failed")); };
      try { navigator.clipboard.writeText(text).then(done, fail); } catch(e){ fail(); }
    });
  }
}

/* ---------- wiring ---------- */
function wirePet(){
  var p = pet;
  on("ptSheetKeep", function(){ var was = sheet; sheet = null; sight = null; missDraft = null; draw();
    var b = el(was === "sight" ? "ptSight" : "ptMiss"); if (b) b.focus(); });
  on("ptEdit", function(){
    sheet = null; sight = null; missDraft = null;       /* a half-typed sighting doesn't reopen after Edit (review L5) */
    form = { id: p.id, was: p.name, species: p.species, name: p.name, description: p.description || "", wanderer: p.wanderer === true, microchipped: p.microchipped === true,
             photo_path: p.photo_path || null, photo: null };
    show("edit");
  });
  /* the missing switch */
  on("ptMiss", function(){ sheet = "missing"; missDraft = { note: "" }; draw(); var t = el("ptMissNote"); if (t) t.focus(); });
  var mn = el("ptMissNote"); if (mn) mn.addEventListener("input", function(){ missDraft.note = mn.value; });
  on("ptMissGo", function(){
    var note = el("ptMissNote").value.trim();
    ptWrite(el("ptMissGo"), function(){
      return rpc(missRpc(p), { p_pet: p.id, p_missing: true, p_note: note || null });
    }, function(){
      sheet = null; missDraft = null; pets = null; petTab = "sightings";    /* the share is there: "Share the alert below" */
      setUrl(petQuery(p.id));
      loadPet(p.id, function(){ showOk(jcFmt("pt_missing_done", { n: p.name })); });
    }, function(code){ if (code === "NOT_FOUND") { backToList("NOT_FOUND"); return true; } return false; });
  });
  on("ptFound", function(){
    if (!window.confirm(jcFmt("pt_found_q", { n: p.name }))) return;
    ptWrite(el("ptFound"), function(){ return rpc(missRpc(p), { p_pet: p.id, p_missing: false, p_note: null }); }, function(){
      pets = null; sent = null; petTab = "about"; setUrl(petQuery(p.id));
      loadPet(p.id, function(){ showOk(jcFmt("pt_found_done", { n: p.name })); });
    }, function(code){ if (code === "NOT_FOUND") { backToList("NOT_FOUND"); return true; } return false; });
  });
  /* a sighting */
  on("ptSight", function(){ sheet = "sight"; sight = { note: "", lat: null, lng: null }; draw(); var t = el("ptSightNote"); if (t) t.focus(); });
  var sn = el("ptSightNote"); if (sn) sn.addEventListener("input", function(){ sight.note = sn.value; });
  /* Add Location Pin: the pin map opens; the phone's location (a fresh fix, never an old one) only moves it */
  on("ptPosAdd", function(){
    var s0 = sight;
    var tok = s0.tok = {};                               /* each open of the pin map: a cancelled one's late fix never lands (review L1) */
    s0.picking = true; s0.where = "locating"; s0.view = null; s0.zoom = null; s0.moved = false;
    draw();
    var t = el("ptPickHelp"); if (t) { t.setAttribute("tabindex", "-1"); t.focus(); }
    jcLocate(function(lat, lng){
      if (sight !== s0 || s0.tok !== tok || !s0.picking || current !== "pet") return;
      s0.where = "you"; s0.view = [lat, lng]; s0.zoom = 18;
      if (map && el("ptPick")) map.setView([lat, lng], 18, { animate: false });
      if (el("ptPickHelp")) el("ptPickHelp").textContent = pickText(p);
    }, function(){
      if (sight !== s0 || s0.tok !== tok || !s0.picking || current !== "pet") return;
      s0.where = "centre";
      if (el("ptPickHelp")) el("ptPickHelp").textContent = pickText(p);
      if (el("ptPickOk") && !s0.moved) el("ptPickOk").disabled = true;
    }, true);
  });
  on("ptPickOk", function(){
    if (!map || !sight) return;
    /* ~1 m is plenty for "where it was seen" */
    var c = map.getCenter();
    sight.lat = Math.round(c.lat * 1e5) / 1e5; sight.lng = Math.round(c.lng * 1e5) / 1e5; sight.picking = false; sight.tok = null;
    draw(); var x = el("ptPosClear"); if (x) x.focus();
  });
  on("ptPickCancel", function(){ sight.picking = false; sight.tok = null; draw(); var a = el("ptPosAdd"); if (a) a.focus(); });
  on("ptPosClear", function(){ sight.lat = null; sight.lng = null; draw(); var a = el("ptPosAdd"); if (a) a.focus(); });
  /* the household's amber box: Report as missing, right there (the sheet is on About) */
  on("ptSeenMiss", function(){
    petTab = "about"; sheet = "missing"; sight = null; missDraft = { note: "" };
    setUrl(petQuery(p.id)); draw();
    var t = el("ptMissNote"); if (t) t.focus();
  });
  on("ptSightGo", function(){
    var note = el("ptSightNote").value.trim(), s = sight;
    if (!note && s.lat == null) return ptMsg("SIGHT_EMPTY");
    ptWrite(el("ptSightGo"), function(){
      return rpc("jc_pet_sighting_add", { p_pet: p.id, p_note: note || null, p_lat: s.lat, p_lng: s.lng });
    }, function(){
      sheet = null; sight = null; sent = note;
      var done = outAlone(p) ? jcFmt("pt_out_done", { n: p.name }) : jcT("pt_sight_done");
      loadPet(p.id, function(){ if (petTab !== "sightings") return; showOk(done); var h = el("ptShareHead"); if (h) { h.setAttribute("tabindex", "-1"); h.focus(); } });
    }, function(code){
      if (code === "SIGHTINGS_CLOSED") { sheet = null; sight = null; loadPet(p.id, function(){ ptMsg(code); }); return true; }
      if (code === "NOT_FOUND") { backToList("NOT_FOUND"); return true; }
      return false;
    });
  });
}

/* ---------- a pet's page: the amber "seen out" box, the Map tab, the small maps (R5b-2b-2b) ---------- */
/* the household's own pet, reported out on its own in the last 24 h: amber (a heads-up — nothing changed state) */
function seenOutHtml(p){
  var t = seenOut(p);
  if (!t) return '';
  var s = sightList(p).filter(function(x){ return recent(x.seen_at, DAY); })[0];   /* newest first */
  return '<div class="seenbox" id="ptSeenOut"><b>' + esc(jcFmt("pt_out_box", { n: p.name, t: t })) + '</b>' +
    (s && s.note ? '<p dir="auto">' + esc(s.note) + '</p>' : '') +
    '<p>' + esc(jcFmt("pt_out_ignore", { n: p.name })) + '</p>' +
    (sheet === "missing" ? '' : '<div class="acts"><button class="btn danger-fill" type="button" id="ptSeenMiss">' + esc(jcT("pt_miss")) + '</button></div>') + '</div>';
}
var OLD = 2 * DAY;                                     /* sightings older than 48 h fade on the Map tab */
function mapTabHtml(p){
  if (!located(p).length) return '<p class="help" id="ptMapNone">' + esc(jcFmt("pt_map_none", { n: p.name })) + '</p>';
  return jcMapHtml("ptpmap", layer, { attrs: ' role="region" aria-label="' + esc(jcFmt("pt_map_label", { n: p.name })) + '"' }) +
    '<p class="help" id="ptMapKey">' + esc(jcT("pt_map_key")) + '</p>';
}
function sightPop(s){
  return jcPopHtml({ head: esc(when(s.seen_at)), body: s.note ? '<div dir="auto">' + esc(s.note) + '</div>' : '', lat: s.lat, lng: s.lng });
}
/* a full map in mapId (the kit: Street / Satellite, Full Screen, Find Me) — a missing pet's Map tab */
function bigMap(mapId){
  var m = map = jcBigMap(mapId, { cfg: cfg, layer: layer, onLayer: function(l){ layer = l; }, full: full });
  jcFindMe(m, { alive: function(){ return map === m; },
    onError: function(code){ full.set(false); ptMsg(code); } });   /* visible, not behind the full map; never on another screen */
  return m;
}
/* the newest big with "Latest · 20 min ago", the rest small, older than 48 h faded.
   No lines between dots (they'd suggest a route nobody saw). */
function drawPetMap(p){
  if (typeof L === "undefined" || !el("ptpmap")) return;
  var m = bigMap("ptpmap"), col = jcMapColors(), list = located(p), pts = [];
  for (var i = list.length - 1; i >= 0; i--) {         /* oldest first: the latest is drawn on top */
    var s = list[i], latest = i === 0, old = !recent(s.seen_at, OLD);
    var mk = L.circleMarker([s.lat, s.lng], { radius: latest ? 12 : 7, weight: latest ? 3 : 2, color: col.ink, opacity: old ? .45 : 1,
      fillColor: col.accent, fillOpacity: old ? .3 : .95, className: latest ? "ptlatest" : old ? "ptold" : "ptrecent" }).addTo(m).bindPopup(sightPop(s), JC_POPUP);
    if (latest) mk.bindTooltip(esc(jcFmt("pt_map_latest", { t: jcAgo(s.seen_at) })), { permanent: true, direction: "top", offset: [0, -13], className: "bklabel" });
    pts.push([s.lat, s.lng]);
  }
  jcMapPopups(m, null);                                /* the map's buttons step aside while a popup is open */
  jcFitPins(m, pts);
}
VIEWS.edit = function(){
  if (!form) return show("list");
  var f = form;
  el("view").innerHTML = '<h1 dir="auto">' + esc(f.id ? jcFmt("pt_edit_title", { n: f.name || "" }) : jcT("pt_add")) + '</h1>' + msgBox() +
    '<form class="panel" id="ptForm" novalidate>' +
    '<label>' + esc(jcT("pt_name")) + '<input type="text" id="ptName" maxlength="40" dir="auto" autocomplete="off" required></label>' +
    '<fieldset id="ptPhotoBox"><legend>' + esc(jcT("pt_photo")) + '</legend><div class="ptphotoedit">' +
      (f.photo ? '<span class="ptph big has"><img id="ptPhotoNew" alt="" src="' + esc(f.photo) + '"></span>'
       : f.photo_path ? jcPetPhotoHtml({ photo_path: f.photo_path }, 44, "big") : '') +
      /* the input sits before its label so the label can show the keyboard focus (review a11y) */
      '<input type="file" id="ptPhotoIn" class="sr-only" accept="image/*"' + (ptBusy ? ' disabled' : '') + '>' +
      '<div class="row"><label class="btn ghost" id="ptPhotoPick" for="ptPhotoIn">' + esc(jcT(f.photo || f.photo_path ? "pt_photo_change" : "pt_photo_add")) + '</label>' +
      /* R5c-2: a picked photo can be dropped before Save; a saved one removed now (with a confirm) */
      (f.photo ? '<button class="btn ghost" type="button" id="ptPhotoDrop"' + (ptBusy ? ' disabled' : '') + '>' + esc(jcT("pt_photo_drop")) + '</button>'
       : f.id && f.photo_path ? '<button class="btn ghost danger" type="button" id="ptPhotoRemove"' + (ptBusy ? ' disabled' : '') + '>' + esc(jcT("pt_photo_remove")) + '</button>' : '') +
      '</div></div>' +
      '<p class="help" id="ptPhotoHelp" role="status">' + esc(jcT(f.shrinking ? "working" : f.photo ? "pt_photo_ready" : "pt_photo_help")) + '</p>' +
      '<p class="help" id="ptPhotoWho">' + esc(jcT("pt_photo_who")) + '</p></fieldset>' +
    '<fieldset><legend>' + esc(jcT("pt_species")) + '</legend><div class="opts" id="ptSpecies">' + SPECIES.map(function(s){
      return '<button type="button" data-sp="' + s + '" aria-pressed="' + (f.species === s) + '">' + esc(jcT("pt_sp_" + s)) + '</button>';
    }).join("") + '</div></fieldset>' +
    '<label>' + esc(jcT("pt_desc")) + '<textarea id="ptDescIn" maxlength="280" dir="auto"></textarea></label>' +
    '<p class="help">' + esc(jcT("pt_desc_help")) + '</p>' +
    '<label class="check"><input type="checkbox" id="ptWand"' + (f.wanderer ? ' checked' : '') + '> <span>' + esc(jcT("pt_wanderer_q")) + '</span></label>' +
    '<p class="help">' + esc(jcT("pt_wanderer_help")) + '</p>' +
    '<label class="check"><input type="checkbox" id="ptChipIn"' + (f.microchipped ? ' checked' : '') + '> <span>' + esc(jcT("pt_chip_q")) + '</span></label>' +
    '<p class="help">' + esc(jcFmt("pt_shown_with", { h: myHomeText() })) + '</p>' +
    '<button class="btn" type="submit" id="ptSave"' + (ptBusy || f.shrinking ? ' disabled' : '') + '>' + esc(jcT("mh_save")) + '</button></form>' +
    (f.id ? '<div class="panel danger-zone"><p class="help">' + esc(jcFmt("pt_archive_help", { n: f.was })) + '</p>' +
      '<button class="btn ghost danger" type="button" id="ptArchive"' + (ptBusy ? ' disabled' : '') + '>' +
      esc(jcFmt("pt_archive_n", { n: f.was })) + '</button></div>' : '');
  el("ptName").value = f.name; el("ptDescIn").value = f.description;   /* values, not markup */
  el("ptName").addEventListener("input", function(){ f.name = el("ptName").value; });
  el("ptDescIn").addEventListener("input", function(){ f.description = el("ptDescIn").value; });
  el("ptWand").addEventListener("change", function(){ f.wanderer = el("ptWand").checked; });
  el("ptChipIn").addEventListener("change", function(){ f.microchipped = el("ptChipIn").checked; });
  el("ptPhotoIn").addEventListener("change", function(){
    var file = el("ptPhotoIn").files && el("ptPhotoIn").files[0];
    if (!file || ptBusy) return;
    /* the last file picked wins; Save waits (disabled) until it's ready — never a save without the photo (review) */
    var mine = ++shrinkSeq;
    f.shrinking = mine;
    el("ptPhotoHelp").textContent = jcT("working");
    if (el("ptSave")) el("ptSave").disabled = true;
    jcPetPhotoShrink(file).then(function(url){
      if (f.shrinking !== mine) return;
      f.shrinking = null;
      if (form !== f) return;
      f.photo = url;
      if (current === "edit") { draw(); if (el("ptPhotoIn")) el("ptPhotoIn").focus(); }
    }, function(e){
      if (f.shrinking !== mine) return;
      f.shrinking = null;
      if (form !== f || current !== "edit") return;
      draw();
      ptMsg(e.code || "PHOTO_UNREADABLE");
    });
  });
  each("[data-sp]", function(b){
    if (SPECIES.indexOf(b.dataset.sp) < 0) return;
    f.species = b.dataset.sp;
    Array.prototype.forEach.call(document.querySelectorAll("[data-sp]"), function(x){ x.setAttribute("aria-pressed", String(x === b)); });
  });
  on("ptPhotoDrop", function(){ if (ptBusy) return; f.photo = null; shrinkSeq++; f.shrinking = null; draw(); if (el("ptPhotoIn")) el("ptPhotoIn").focus(); });
  /* the open pet keeps its place (Back returns to it — review); only its photo goes; the list re-reads */
  function photoGone(){
    f.photo_path = null; pets = null;
    if (pet && pet.id === f.id) pet.photo_path = null;
    draw();
    showOk(jcFmt("pt_photo_removed", { n: f.was }));
    if (el("ptPhotoIn")) el("ptPhotoIn").focus();
  }
  on("ptPhotoRemove", function(){
    if (!window.confirm(jcFmt("pt_photo_remove_q", { n: f.was }))) return;
    ptWrite(el("ptPhotoRemove"), function(){ return rpc("jc_pet_photo_remove", { p_pet: f.id }); }, function(){
      photoGone();
    }, function(code){
      if (code === "NO_PHOTO") { photoGone(); return true; }     /* already gone (another tap / household member) */
      if (code === "NOT_FOUND") { form = null; backToList("NOT_FOUND"); return true; }
      return false;
    });
  });
  if (el("ptArchive")) el("ptArchive").addEventListener("click", function(){
    if (!window.confirm(jcFmt("pt_archive_q", { n: f.was }))) return;
    ptWrite(el("ptArchive"), function(){ return rpc("jc_pet_archive", { p_pet: f.id }); }, function(){
      form = null; tab = "mine"; backToList(null, jcFmt("pt_archived", { n: f.was }));
    }, function(code){
      if (code === "NOT_FOUND") { form = null; backToList("NOT_FOUND"); return true; }
      return false;
    });
  });
  el("ptForm").addEventListener("submit", function(e){
    e.preventDefault();
    if (f.shrinking) return;
    var name = f.name.trim();
    if (!name) { ptMsg("NAME_EMPTY"); el("ptName").focus(); return; }
    var fields = { species: f.species, name: name, description: f.description.trim() || null, wanderer: f.wanderer, microchipped: f.microchipped };
    var photo = f.photo;
    ptWrite(el("ptSave"), function(){
      return rpc("jc_pet_save", { p_pet: f.id, p_fields: fields }).then(function(c){
        var id = isPet(c) ? c.id : f.id;
        if (!photo || !id) return { c: c };
        /* the details are saved either way: a photo that fails is said plainly, never loses the rest */
        return jcPetPhotoUpload(id, photo).then(function(){ return { c: c }; }, function(e){ return { c: c, photoErr: (e && e.code) || "UNKNOWN" }; });
      });
    }, function(r){
      var c = r.c, id = isPet(c) ? c.id : f.id, added = !f.id;
      form = null; pets = null;
      if (!id) { tab = "mine"; backToList(); return; }
      pet = null; petTab = "about"; setUrl(petQuery(id));
      show("pet");
      loadPet(id, function(){
        if (!r.photoErr) return showOk(jcFmt(added ? "pt_added" : "pt_saved", { n: name }));
        say("err", jcFmt("pt_photo_failed", { n: name, why: jcErrTextFor("pt_err_", r.photoErr) }));
      });
    }, function(code){
      if (code === "NOT_FOUND") { form = null; backToList("NOT_FOUND"); return true; }
      return false;
    });
  });
};

/* ---------- boot ---------- */
function paint(){
  jcFooter("../");
  var name = jcCommunityName(cfg, state && state.me && state.me.community);
  el("homeLink").textContent = name;
  el("langBtn").textContent = jcT("toggle_label");
  document.title = jcModTitle("pets") + " — " + name;
  if (state && state.status === "member") jcTabBar("../", "pets", cfg);
}

el("langBtn").addEventListener("click", function(){
  jcSetLang(ar() ? "en" : "ar");
  paint();
  if (current) show(current);              /* drafts (form / sighting / missing note) live in state, so they survive */
});

jcSetLang(jcLang());
paint();
jcState().then(function(s){
  state = s;
  var back = "../pets/" + (PET ? "?pet=" + PET.toLowerCase() : "");   /* a shared pet link survives sign-in (jcSafeNext) */
  if (s.status === "signed_out") { location.replace("../account/?next=" + encodeURIComponent(back)); return; }
  if (s.status === "not_member") { location.replace("../account/?view=join&next=" + encodeURIComponent(back)); return; }
  return jcAnon("jc_config_get", { p_community: s.me.community }).catch(function(){ return null; }).then(function(c){
    cfg = c;
    paint();
    if (cfg && !moduleOn()) return show("off");   /* the kill switch: nothing asked of the server */
    jcHit("pets");
    if (PET) { current = "pet"; openPet(PET); return; }
    current = "list";
    if (params.get("tab") && params.get("tab") !== tab) setUrl(listUrl());   /* an old ?tab=strays / ?tab=list: the address follows */
    loadList();
    show("list");
  });
}, function(e){
  el("view").innerHTML = msgBox();
  ptMsg(e.code || "UNKNOWN");
});
