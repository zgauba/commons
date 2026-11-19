/* Pets page (R5b-1) — residents' pet directory. Plan: docs/plans/R5-pets.md (Zee decisions 2026-11-10/11);
   R5b-2b-2a tabs + R5b-2b-2b pet page: docs/plans/R5b-2-pets-maps.md "Re-plan 2026-11-13".
   Views: list (tabs Pets · Strays · My Pets) · pet (?pet=<uuid>; tabs About · Sightings · Map by the pet's state)
   · edit (add / edit one of my home's pets).
   Pets = owned pets in the server's order (missing → nearest my home pin → name); Strays = a map (one pin per
   stray at its latest visible sighting, else its territory; rehomed off the map) + the stray cards.
   Server: jc_pets_list, jc_pet_get, jc_pet_save, jc_pet_archive, jc_pet_missing_set,
   jc_pet_sighting_add, jc_pets_group_get (S4 + R5a, R5b-2b-0); photos are R5c; the admin side is R5d.
   PRIVACY — this page renders what the server sends and nothing else:
   - an owned pet's home arrives on its card (homes can't be hidden — HH, Zee 2026-11-11); shown only when it
     arrives;
   - sightings (and a card's last_seen / last_seen_at) arrive only as the server's rule allows (jc_pet_sight_from):
     strays, my own pets, Pets admins, and a missing pet's recent ones; never who reported one. An "out on their
     own" report (an owned pet that isn't missing) goes to the household only — said before it is sent;
     ("by_me" is the reporter's own flag, and disappears once the server erases the reporter within 48 h);
   - the WhatsApp group link is members-only (jc_pets_group_get, never the public config); it is set as an
     attribute after a strict format check, opened with rel="noopener noreferrer". */

var params = new URLSearchParams(location.search);
var PET = params.get("pet");
if (PET && !/^[0-9a-f-]{36}$/i.test(PET)) PET = null;

var state = null, cfg = null, current = null;
var map = null, layer = "sat";                         /* the one big map on screen (Strays, a pet's Map tab, the pin picker) */
var minis = { maps: [], obs: null };                        /* the Sightings tab's small maps, built when scrolled into view */
var full = jcMapFull(function(){ return map; }, null); /* the map, bigger (assets/map.js) */
var pets = null, listErr = null, listLoading = false, listSeq = 0;
var pet = null, petId = null, petErr = null, petLoading = false, petSeq = 0;   /* the open pet (jc_pet_get) */
var TABS = ["pets", "strays", "mine"];
/* the pet page's own tabs (R5b-2b-1, Map R5b-2b-2b): ?show= keeps ?tab= for the list tab to return to */
var PET_TABS = ["about", "sightings", "map"];
var petTab = PET_TABS.indexOf(params.get("show")) >= 0 ? params.get("show") : null;   /* null = the pet's default */
var tab = params.get("tab") === "list" ? "pets" : TABS.indexOf(params.get("tab")) >= 0 ? params.get("tab") : "pets";   /* ?tab=list: old links */
var FILTERS = ["all", "dogs", "cats", "other", "wanderers"];
var filter = "all";
var ptQ = "";                 /* OT-3: the name search on the Pets list (on the phone, over the list already loaded) */
var SPECIES = ["cat", "dog", "bird", "rabbit", "other"];
var CARE = ["sterilized", "dewormed", "vaccination", "treatment"];
var ptBusy = false;
var form = null;      /* edit: { id | null, species, name, description, wanderer, microchipped, photo_path, photo (picked: data URL) } — survives a language switch */
var sheet = null;     /* on the pet page: null | "missing" | "found" | "sight" */
var sight = null;     /* { note, lat, lng, picking, where, view, zoom } while the sighting form is open (picking: the pin map) */
var missDraft = null; /* { note } while the missing sheet is open */
var sent = null;      /* the note of the sighting just sent: the WhatsApp message tells the group about it */
var group;            /* undefined = not read yet; null = none / unreadable; else the checked invite link */
var rep = null;       /* report a stray: { id (made here: a retry never sends twice), species, note, place, lat, lng, picking, where,
                         view, zoom, moved, tok, photo, shrinking, wa, phone, confirm (the photo prompt is open) } */
var reports;          /* my stray reports (jc_stray_reports_mine): undefined = not read (or unreadable: asked again on the next draw) */
var repLoading = false;
var queueN;           /* Pets organizers: open stray reports waiting (undefined = not read; null = unreadable / not an organizer) */
var repDone = null;   /* the report just sent: { text } for the thank-you screen's WhatsApp message */

/* ---------- helpers ---------- */
/* page helpers: the shared copies in assets/api.js (structural audit SA-1) */
var msgBox = jcMsgBox, say = jcSay, showOk = jcShowOk, on = jcOn, each = jcEach, ar = jcIsAr, hObj = jcObj, setUrl = jcSetUrl, finite = jcFinite;
function ptMsg(code){ jcShowErrFor("pt_err_", code); }
/* pets or community admins (the server checks every admin call; this only shows the way in) */
function canAdmin(){ var sc = (state && state.me && state.me.admin_scopes) || []; return sc.indexOf("pets") >= 0 || sc.indexOf("community") >= 0; }
function hasHome(){ return !!(state && state.me && state.me.home); }
function moduleOn(){ return jcModuleOn(cfg, "pets"); }
function listUrl(){ return tab === "pets" ? null : "tab=" + tab; }
function isPet(p){ return hObj(p) && typeof p.id === "string" && typeof p.name === "string" && (p.kind === "owned" || p.kind === "stray"); }
function speciesText(p){ return jcT("pt_sp_" + (SPECIES.indexOf(p.species) >= 0 ? p.species : "other")); }
function kindText(p){ return jcT(p.kind === "owned" ? "pt_kind_owned" : "pt_kind_stray"); }   /* no "community animal": owned or stray (Zee 2026-11-13) */
var DAY = 864e5;
function recent(iso, ms){ var t = Date.parse(iso); return isFinite(t) && Date.now() - t < ms && t - Date.now() < 3e5; }
/* my pet, at home, reported out on its own in the last 24 h (the server sends last_seen_at only to the household) */
function seenOut(p){ return p.mine === true && p.kind === "owned" && p.missing !== true && recent(p.last_seen_at, DAY) ? jcAgo(p.last_seen_at) : ""; }
/* where a stray goes on the map: its latest visible sighting with a location, else its territory spot */
function strayPos(p){
  var s = hObj(p.last_seen);
  if (s && finite(s.lat) && finite(s.lng)) return [s.lat, s.lng];
  return finite(p.territory_lat) && finite(p.territory_lng) ? [p.territory_lat, p.territory_lng] : null;
}
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
/* the reports the server takes (else SIGHTINGS_CLOSED): a missing pet, a stray that isn't rehomed, a pet out alone */
function sightOpen(p){ return p.missing === true || (p.kind === "stray" && p.care_state !== "rehomed") || outAlone(p); }
/* the report button: never on the household's own pet that's at home — they get the reports instead */
function canReport(p){ return sightOpen(p) && !(outAlone(p) && p.mine === true); }
/* the Map tab: where a missing pet or a stray was seen. No home pin: the server sends no home coordinates. */
function hasMap(p){ return (p.missing === true || (p.kind === "stray" && p.care_state !== "rehomed")) && typeof L !== "undefined"; }
/* the WhatsApp share: missing pets and strays; an "out on their own" report only once sent ("Is this Rex?") */
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
function terrPos(p){ return p.kind === "stray" && finite(p.territory_lat) && finite(p.territory_lng) ? [p.territory_lat, p.territory_lng] : null; }
function petUrl(p){ return location.origin + location.pathname + "?pet=" + encodeURIComponent(p.id); }
/* tabs by the pet's state (plan R5b-2b-2b): Sightings where reports exist or can be added (and on the household's own
   pet that isn't a wanderer — where "out on their own" reports land); Map for a missing pet or a stray. A missing pet
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
    if (!isPet(d)) { petErr = "UNKNOWN"; if (current === "pet") draw(); return; }
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
    if (current === "repdone") draw();
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
  if (name === "report") back = function(){ if (ptBusy) return; rep = null; tab = "strays"; setUrl(listUrl()); show("list"); };
  if (name === "repdone") back = function(){ repDone = null; tab = "strays"; setUrl(listUrl()); show("list"); };
  jcBack(back, "back");
  jcHelp(name === "pet" ? "pet" : name === "list" ? "pets" : null);
  var refocus = jcFocusKeep();
  VIEWS[name]();
  refocus();
  jcPetPhotoFill();
}

/* noState: the pet page lists the status in its facts, so its chip row doesn't repeat it */
function chips(p, noState, noMissing){      /* noMissing: the pet page's alarm already says it */
  var c = [];
  if (p.missing === true && !noMissing) c.push('<span class="chip miss">' + esc(jcT("pt_missing_chip")) + '</span>');
  /* colour only for real states: Missing = red, Needs help = amber; the rest neutral (brand: signals are semantics) */
  if (!noState && p.kind === "stray" && p.care_state)
    c.push('<span class="chip' + (p.care_state === "needs_help" ? " warn" : "") + '">' + esc(jcT("pt_care_" + p.care_state)) + '</span>');
  if (p.wanderer === true) c.push('<span class="chip">' + esc(jcT("pt_wanderer_chip")) + '</span>');
  if (p.mine === true) c.push('<span class="chip">' + esc(jcT("pt_mine_chip")) + '</span>');
  return c.join("");
}
/* R5b-2b-1 (Zee 2026-11-12: "two columns… the pet details page looks messy"): photo-led cards, the whole card is
   the button. Missing pets: full-width cards on top (photo beside the text, the last-seen line). */
/* a stray's spot as { lat, lng } for the kit's nearest-first (NF-2) */
function strayAt(p){ var s = strayPos(p); return s ? { lat: s[0], lng: s[1] } : null; }
function card(p, i, all, near){
  var where = p.kind === "owned" ? homeText(p.home) : (p.territory || "");
  var d = near ? jcDistOf(jcOrigin(), strayAt(p)) : null;   /* Strays cards only: their spot from the origin */
  var miss = p.missing === true, out = seenOut(p);
  var seen = p.kind === "stray" && p.care_state !== "rehomed" && recent(p.last_seen_at, 30 * DAY) ? jcAgo(p.last_seen_at) : "";
  return jcCardHtml({ missing: miss, liAttrs: 'data-pet="' + esc(p.id) + '"', btnAttrs: 'data-open="' + esc(p.id) + '"',
    photoHtml: jcPetPhotoHtml(p, 34, "tile"), name: p.name, linesHtml: [
      jcMetaHtml(speciesText(p) + " · " + kindText(p)),
      where && jcMetaHtml(where, "where", true),
      chips(p) && '<span class="head">' + chips(p) + '</span>',
      miss && p.last_seen_note && jcMetaHtml(jcFmt("pt_last_seen", { t: p.last_seen_note }), "", true),
      seen && jcMetaHtml(jcFmt("pt_seen_ago", { t: seen })),
      d !== null && '<span class="meta"><bdi dir="ltr">' + esc(jcFmt("sort_dist", { d: jcFmtDist(d) })) + '</bdi></span>',
      /* amber, not red: a heads-up for the household, nothing has changed state (plan R5b-2b-2a) */
      out && jcMetaHtml(jcFmt("pt_seen_out", { t: out }), "seenout") ] });
}
/* The Strays cards: Needs help first, rehomed last; within each, nearest first — the server's order (nearest my home
   pin), or from this visit's phone position once Find Me / Use Where I Am is tapped (NF-2) */
function strayOrder(strays){
  var rank = function(p){ return p.care_state === "needs_help" ? 0 : p.care_state === "rehomed" ? 2 : 1; };
  if (jcHere) strays = jcNear(strays, jcOrigin(), strayAt);
  return strays.map(function(p, i){ return [p, i]; })
    .sort(function(a, b){ return rank(a[0]) - rank(b[0]) || a[1] - b[1]; }).map(function(x){ return x[0]; });
}
function strayCardsHtml(strays){
  return jcSortedHtml({ id: "ptStraysSorted", fallback: "sort_name" }) +
    '<ul class="ptgrid" id="ptStrays">' + strayOrder(strays).map(function(p){ return card(p, 0, null, true); }).join("") + '</ul>';
}
function wireStraySort(){
  jcSortedWire({ onChange: redrawStrayCards, onError: ptMsg, alive: function(){ return current === "list" && tab === "strays"; } });
}
/* Find Me on the Strays map: re-sort the cards under it, the map stays as it is */
function redrawStrayCards(){
  var box = el("ptStraysBox");
  if (!box || !pets || current !== "list" || tab !== "strays") return;
  var r = jcFocusKeep();                                /* keyboard focus back on the button (review L1) */
  box.innerHTML = strayCardsHtml(pets.filter(function(p){ return p.kind === "stray"; }));
  each("#ptStraysBox [data-open]", function(b){ openPet(b.dataset.open); });
  wireStraySort();
  r();
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
    var body, onMap = [];
    if (tab === "mine") {
      var mine = pets.filter(function(p){ return p.mine === true; });
      body = !hasHome() ? noHomeHtml() :
        (mine.length ? '<ul class="ptgrid" id="ptMine">' + mine.map(card).join("") + '</ul>'
                     : '<p class="help" id="ptMine">' + esc(jcT("pt_mine_none")) + '</p>') +
        (mine.length < 10 ? '<div class="row"><button class="btn" type="button" id="ptAdd">' + esc(jcT("pt_add")) + '</button></div>'
                          : '<p class="help" id="ptCap">' + esc(jcT("pt_err_TOO_MANY_PETS")) + '</p>');
    } else if (tab === "strays") {
      var strays = pets.filter(function(p){ return p.kind === "stray"; });
      var active = strays.filter(function(p){ return p.care_state !== "rehomed"; });
      onMap = active.filter(strayPos);
      var unplaced = active.length - onMap.length;
      body = queueHtml() + '<div class="row"><button class="btn" type="button" id="rpOpen">' + esc(jcT("rp_cta")) + '</button></div>' +
        '<p class="help" id="rpCtaHelp">' + esc(jcT("rp_cta_help")) + '</p>' +
        (!strays.length ? '<p class="help" id="ptStrays">' + esc(jcT("pt_strays_none")) + '</p>' :
        (typeof L === "undefined" ? '<p class="help" id="ptNoMap">' + esc(jcT("err_NETWORK")) + '</p>' :   /* no dead buttons */
         onMap.length ? jcMapHtml("ptmap", layer, { attrs: ' role="region" aria-label="' + esc(jcT("pt_strays_map")) + '"',
           before: '<button type="button" class="lang" id="namesBtn" aria-pressed="' + (namesOn() ? 'true' : 'false') + '">' +
                     esc(jcT(namesOn() ? "pt_names_hide" : "pt_names_show")) + '</button>' +
                   '<button type="button" class="lang" id="labelsBtn" aria-haspopup="dialog">' + esc(jcT("ev_labels")) + '</button>' }) +
           jcKeySheetHtml("ptKey") : '') +
        (unplaced ? '<p class="help" id="ptUnplaced">' + esc(jcFmt("pt_strays_unplaced", { n: unplaced })) + '</p>' : '') +
        '<div id="ptStraysBox">' + strayCardsHtml(strays) + '</div>') +
        '<div id="rpMineBox">' + myReportsHtml() + '</div>';
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
        '<div id="ptListBox">' + restHtml() + '</div>';
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
    if (onMap.length) drawStrays(onMap);
    if (tab === "strays") { wireStraySort(); wireMyReports(); on("rpOpen", openReport); }
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
        (p.mine === true && p.kind === "owned" ? '<div class="acts"><button class="btn" type="button" id="ptFound"' + (ptBusy ? ' disabled' : '') + '>' +
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
      if (p.kind === "owned") {
        if (hObj(p.home)) facts.push(['pt_lives', homeText(p.home)]);
        if (p.wanderer === true) facts.push(['pt_wanderer', jcT("pt_wanderer_help")]);
        facts.push(['pt_chip', jcT(p.microchipped === true ? "pt_yes" : "pt_no_or_unknown")]);
      } else {
        facts.push(['pt_state', jcT("pt_care_" + p.care_state)]);
        if (p.territory) facts.push(['pt_territory', p.territory]);
      }
      if (p.description) body += '<p class="desc" dir="auto" id="ptDesc">' + esc(p.description) + '</p>';
      body += jcFactsHtml(facts.map(function(f){ return [jcT(f[0]), f[1]]; }), "ptFacts");
      /* my own pet: the household's controls */
      if (p.mine === true && p.kind === "owned") body += ownerHtml(p);
      if (p.kind === "stray") body += careHtml(p);
      if (Array.isArray(p.care_log)) body += logHtml(p);
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

function careHtml(p){
  var c = hObj(p.care) || {};
  return '<h2 class="group">' + esc(jcT("pt_care_record")) + '</h2><ul class="care" id="ptCare">' + CARE.map(function(k){
    var it = hObj(c[k]), s = it && ["done", "due", "ongoing"].indexOf(it.s) >= 0 ? it.s : null;
    var d = it && jcIsDate(it.d) ? jcDayText(it.d, { weekday: undefined, year: "numeric" }) : "";
    return '<li data-care="' + k + '"><span class="nm">' + esc(jcT("pt_ci_" + k)) + '</span>' +
      '<span class="st st-' + (s || "unknown") + '">' + esc(jcT("pt_cs_" + (s || "unknown"))) + (d ? " · ⁦" + esc(d) + "⁩" : "") + '</span>' +
      (it && typeof it.n === "string" && it.n ? '<span class="note" dir="auto">' + esc(it.n) + '</span>' : '') + '</li>';
  }).join("") + '</ul>';
}
function ownerHtml(p){
  var h = '<h2 class="group">' + esc(jcT("pt_yours")) + '</h2><div class="panel" id="ptOwner">';
  if (sheet === "missing") {
    var d = missDraft || { note: "" };
    h += '<p><b>' + esc(jcFmt("pt_miss_q", { n: p.name })) + '</b></p>' +
      '<label>' + esc(jcT("pt_miss_note")) + '<textarea id="ptMissNote" maxlength="200" dir="auto">' + esc(d.note) + '</textarea></label>' +
      '<p class="help">' + esc(jcT("pt_miss_help")) + '</p>' +
      '<div class="acts"><button class="btn danger-fill" type="button" id="ptMissGo"' + (ptBusy ? ' disabled' : '') + '>' + esc(jcT("pt_miss_go")) + '</button>' +
      '<button class="btn ghost" type="button" id="ptSheetKeep">' + esc(jcT("ct_cancel")) + '</button></div>';
  } else if (p.missing !== true) {          /* while missing, "is back home" sits in the alarm, on every tab */
    h += '<button class="btn danger-fill wide" type="button" id="ptMiss">' + esc(jcT("pt_miss")) + '</button>';
  }
  /* not beside the red button while the missing sheet is open; Remove is in the Edit form, away from the alarm */
  if (sheet !== "missing") h += '<button class="btn ghost wide" type="button" id="ptEdit">' + esc(jcT("pt_edit")) + '</button>';
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
function logHtml(p){
  return jcEntriesHtml({ heading: jcT("pt_log"), id: "ptLog", items: p.care_log.filter(hObj).map(function(c){
    var k = ["fed", "vet", "note", "state"].indexOf(c.kind) >= 0 ? c.kind : "note";
    return { meta: jcT("pt_log_" + k) + " · " + when(c.at), bodyHtml: jcCareLogBody(c) };
  }) });
}

/* ---------- WhatsApp (Zee W1 = a): copy the message + open the group; or WhatsApp's own chat picker ---------- */
function waText(p){
  /* "Is this Rex?": the reporter asks the group; the report itself stays with the household */
  if (sent !== null && outAlone(p)) return jcFmt(sent ? "pt_wa_out_note" : "pt_wa_out", { n: p.name, s: speciesText(p), t: sent, u: petUrl(p) });
  if (sent !== null) return jcFmt(sent ? "pt_wa_seen_note" : "pt_wa_seen", { n: p.name, s: speciesText(p), t: sent, u: petUrl(p) });
  if (p.missing === true) {
    /* the home goes into a message only when the household shares its own pet: neighbors' shares carry the
       Commons link, where the home is shown under the server's rules (security review M1, Zee 2026-11-11) */
    var where = p.mine === true ? homeText(p.home) : "";
    return jcFmt(where ? "pt_wa_missing_home" : "pt_wa_missing", { n: p.name, s: speciesText(p), h: where, u: petUrl(p) });
  }
  return jcFmt("pt_wa_stray", { n: p.name, s: speciesText(p), u: petUrl(p) });
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
/* the message + "Tell the pets group" (copy, then the group opens) + "Send to someone else" (shared by a pet's page and
   the stray report's thank-you screen) */
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
      return rpc("jc_pet_missing_set", { p_pet: p.id, p_missing: true, p_note: note || null });
    }, function(){
      sheet = null; missDraft = null; pets = null; petTab = "sightings";    /* the share is there: "Share the alert below" */
      setUrl(petQuery(p.id));
      loadPet(p.id, function(){ showOk(jcFmt("pt_missing_done", { n: p.name })); });
    }, function(code){ if (code === "NOT_FOUND") { backToList("NOT_FOUND"); return true; } return false; });
  });
  on("ptFound", function(){
    if (!window.confirm(jcFmt("pt_found_q", { n: p.name }))) return;
    ptWrite(el("ptFound"), function(){ return rpc("jc_pet_missing_set", { p_pet: p.id, p_missing: false, p_note: null }); }, function(){
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

/* ---------- the Strays map (kit: assets/map.js) ---------- */
/* colour only for real states (brand): Needs help amber · Under care the normal pin · Known and fine neutral */
function pinColor(p, col){ return p.care_state === "needs_help" ? col.warn : p.care_state === "under_care" ? col.accent : col.muted; }
function keyHtml(){
  return '<div class="legend"><div class="row">' + ["needs_help", "under_care", "known_fine"].map(function(k){
    return '<span class="chip"><i class="ptdot ' + k + '" aria-hidden="true"></i>' + esc(jcT("pt_care_" + k)) + '</span>';
  }).join("") + '</div><p class="help">' + esc(jcT("pt_key_note")) + '</p></div>';
}
function strayPop(p){
  /* the time of the sighting the pin stands on (last_seen), not a newer one without a location (review L3) */
  var pos = strayPos(p), at = hObj(p.last_seen) && finite(p.last_seen.lat) ? p.last_seen.at : null;
  var seen = recent(at, 30 * DAY) ? jcAgo(at) : "";
  return jcPopHtml({ head: esc(p.name), headAuto: true,
    body: '<div class="meta">' + esc(speciesText(p) + " · " + jcT("pt_care_" + p.care_state)) + '</div>' +
      (seen ? '<div class="meta">' + esc(jcFmt("pt_seen_ago", { t: seen })) + '</div>'
            : p.territory ? '<div class="meta" dir="auto">' + esc(p.territory) + '</div>' : ''),
    open: { id: p.id, label: jcT("pt_open") }, lat: pos[0], lng: pos[1] });
}
/* a full map in mapId (the kit: Street / Satellite, Full Screen, Find Me) — the Strays map and a pet's Map tab */
function bigMap(mapId){
  var m = map = jcBigMap(mapId, { cfg: cfg, layer: layer, onLayer: function(l){ layer = l; }, full: full });
  jcFindMe(m, { alive: function(){ return map === m; },
    onPos: function(){ if (map === m) redrawStrayCards(); },   /* the Strays cards follow the visit position (NF-2) */
    onError: function(code){ full.set(false); ptMsg(code); } });   /* visible, not behind the full map; never on another screen */
  return m;
}
function drawStrays(list){
  if (typeof L === "undefined" || !el("ptmap")) return;
  var m = bigMap("ptmap");
  on("labelsBtn", function(){ jcKeySheet("ptKey", keyHtml()); });
  var col = jcMapColors(), pts = [];
  list.forEach(function(p){
    var pos = strayPos(p);
    pts.push(pos);
    /* Leaflet sets string content as HTML: names are escaped */
    L.circleMarker(pos, { radius: 11, weight: 3, color: col.ink, fillColor: pinColor(p, col), fillOpacity: .95 }).addTo(m)
      .bindTooltip('<span dir="auto">' + esc(p.name) + '</span>', { permanent: true, direction: "top", offset: [0, -12], className: "bklabel" })
      .bindPopup(strayPop(p), JC_POPUP);
  });
  var box = el("ptmap");
  jcMapPopups(m, function(id){ full.set(false); openPet(id); });   /* the kit */
  /* Zee 2026-11-17: names show at every zoom; Hide Names / Show Names turns them off and on (remembered on this phone) */
  function labels(){ if (box && map === m) box.classList.toggle("nolabels", !namesOn()); }
  on("namesBtn", function(){
    var v = !namesOn();
    try { localStorage.setItem("jc_pt_names", v ? "1" : "0"); } catch(e){}
    NAMES = v;
    var b = el("namesBtn");
    if (b) { b.setAttribute("aria-pressed", v ? "true" : "false"); b.textContent = jcT(v ? "pt_names_hide" : "pt_names_show"); }
    labels();
  });
  jcFitPins(m, pts);
  labels();
}
/* the Strays map's names: on unless this viewer turned them off (a per-phone convenience; works without storage) */
var NAMES = null;
function namesOn(){
  if (NAMES === null) { try { NAMES = localStorage.getItem("jc_pt_names") !== "0"; } catch(e){ NAMES = true; } }
  return NAMES;
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
  var n = located(p).length, t = terrPos(p);
  if (!n && !t) return '<p class="help" id="ptMapNone">' + esc(jcFmt("pt_map_none", { n: p.name })) + '</p>';
  return jcMapHtml("ptpmap", layer, { attrs: ' role="region" aria-label="' + esc(jcFmt("pt_map_label", { n: p.name })) + '"' }) +
    '<p class="help" id="ptMapKey">' + esc(jcT(t ? "pt_map_key_terr" : "pt_map_key")) + '</p>';
}
function sightPop(s){
  return jcPopHtml({ head: esc(when(s.seen_at)), body: s.note ? '<div dir="auto">' + esc(s.note) + '</div>' : '', lat: s.lat, lng: s.lng });
}
/* the newest big with "Latest · 20 min ago", the rest small, older than 48 h faded; a stray's territory spot as a ring.
   No lines between dots (they'd suggest a route nobody saw). */
function drawPetMap(p){
  if (typeof L === "undefined" || !el("ptpmap")) return;
  var m = bigMap("ptpmap"), col = jcMapColors(), list = located(p), t = terrPos(p), pts = [];
  if (t) {
    L.circleMarker(t, { radius: 16, weight: 2, color: col.ink, dashArray: "4 4", fill: false, className: "ptterr" }).addTo(m)
      .bindPopup(jcPopHtml({ head: esc(jcT("pt_territory")), body: p.territory ? '<div dir="auto">' + esc(p.territory) + '</div>' : '' }), JC_POPUP);
    pts.push(t);
  }
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

/* ---------- report a stray (PR 3; server 20261116100000 + 20261116140000) ----------
   Residents report a stray they don't see listed. Pets organizers review it before anything is public; they see the
   reporter's home, and a WhatsApp number only if given (cleared when the report closes). A photo is optional — and
   asked about again at Send: if organizers add or match the animal it becomes that stray's photo, public to members. */
function repId(){
  try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch(e){}
  var b = new Uint8Array(16); crypto.getRandomValues(b);
  b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  var h = Array.prototype.map.call(b, function(x){ return (x + 256).toString(16).slice(1); }).join("");
  return h.slice(0, 8) + "-" + h.slice(8, 12) + "-" + h.slice(12, 16) + "-" + h.slice(16, 20) + "-" + h.slice(20);
}
function openReport(){
  if (ptBusy) return;
  rep = { id: repId(), species: "", note: "", place: "", lat: null, lng: null, picking: false, photo: null, shrinking: null,
          wa: false, phone: "", confirm: false };
  loadGroup();
  show("report");
  try { window.scrollTo(0, 0); } catch(e){}
}
/* the WhatsApp number: international only (+971 50 …, or 00971 …), so the organizer's link opens a chat (review L4) */
function repPhone(v){
  var d = String(v || "").replace(/[\s().-]/g, "");
  if (/^00/.test(d)) d = "+" + d.slice(2);
  return /^\+[0-9]{8,15}$/.test(d) ? d : null;
}
function repPickText(){
  var w = rep && rep.where;
  return jcT(w === "centre" ? "rp_pick_centre" : w === "locating" ? "rp_pick_finding" : "rp_pick_help");
}
function repWhereHtml(off){
  var r = rep;
  if (r.picking) return '<p class="help" id="rpPickHelp" role="status">' + esc(repPickText()) + '</p>' + jcPinPickerHtml("rpPick") +
    '<div class="acts"><button class="btn" type="button" id="rpPickOk"' + (r.where === "centre" && !r.moved ? ' disabled' : '') + '>' + esc(jcT("pt_pick_ok")) + '</button>' +
    '<button class="btn ghost" type="button" id="rpPickCancel">' + esc(jcT("ct_cancel")) + '</button></div>';
  return (r.lat != null
      ? '<p class="status ok" id="rpPos">' + esc(jcT("pt_pos_added")) + ' <button class="mini" type="button" id="rpPosClear"' + off + '>' + esc(jcT("pt_pos_clear")) + '</button></p>'
      : typeof L !== "undefined" ? '<div class="acts"><button class="btn ghost" type="button" id="rpPosAdd"' + off + '>' + esc(jcT("pt_pos_add")) + '</button></div>' : '') +
    '<label>' + esc(jcT("rp_place")) + '<input type="text" id="rpPlace" maxlength="120" dir="auto" autocomplete="off"' + off + '></label>' +
    '<p class="help">' + esc(jcT("rp_where_help")) + '</p>';
}
VIEWS.report = function(){
  if (!rep) return show("list");
  var r = rep, off = ptBusy ? ' disabled' : '';
  var lock = ptBusy || r.confirm ? ' disabled' : '';     /* the prompt is open: what was agreed to can't change behind it (review M1) */
  var send = r.confirm
    /* the photo prompt (Zee 2026-11-16): said again at Send, with the choice to send without it */
    ? '<div class="panel" id="rpConfirm" role="group" aria-labelledby="rpConfirmH" aria-describedby="rpC1 rpC2 rpC3"><b id="rpConfirmH" tabindex="-1">' + esc(jcT("rp_confirm_h")) + '</b>' +
      '<p id="rpC1">' + esc(jcT("rp_confirm_1")) + '</p><p id="rpC2">' + esc(jcT("rp_confirm_2")) + '</p><p id="rpC3">' + esc(jcT("rp_confirm_3")) + '</p>' +
      '<div class="row"><button class="btn" type="button" id="rpSendPhoto"' + off + '>' + esc(jcT("rp_send_photo")) + '</button>' +
      '<button class="btn ghost" type="button" id="rpSendNoPhoto"' + off + '>' + esc(jcT("rp_send_nophoto")) + '</button>' +
      '<button class="btn ghost" type="button" id="rpConfirmBack"' + off + '>' + esc(jcT("acct_back")) + '</button></div></div>'
    : '<button class="btn" type="submit" id="rpSend"' + (ptBusy || r.shrinking || r.picking ? ' disabled' : '') + '>' + esc(jcT("rp_send")) + '</button>';
  el("view").innerHTML = '<h1>' + esc(jcT("rp_title")) + '</h1><p class="help">' + esc(jcT("rp_help")) + '</p>' + msgBox() +
    '<form class="panel" id="rpForm" novalidate>' +
    '<fieldset><legend>' + esc(jcT("pt_species")) + '</legend><div class="opts" id="rpSpecies">' + SPECIES.map(function(sp){
      return '<button type="button" data-rsp="' + sp + '" aria-pressed="' + (r.species === sp) + '"' + lock + '>' + esc(jcT("pt_sp_" + sp)) + '</button>';
    }).join("") + '</div></fieldset>' +
    '<label>' + esc(jcT("rp_note")) + '<textarea id="rpNote" maxlength="280" dir="auto"' + lock + '></textarea></label>' +
    '<fieldset id="rpWhere"><legend>' + esc(jcT("rp_where")) + '</legend>' + repWhereHtml(lock) + '</fieldset>' +
    '<fieldset id="rpPhotoBox"><legend>' + esc(jcT("rp_photo")) + '</legend><div class="ptphotoedit">' +
      (r.photo ? '<span class="ptph big has"><img id="rpPhotoNew" alt="" src="' + esc(r.photo) + '"></span>' : '') +
      '<input type="file" id="rpPhotoIn" class="sr-only" accept="image/*"' + lock + '>' +
      '<div class="row"><label class="btn ghost" id="rpPhotoPick" for="rpPhotoIn">' + esc(jcT(r.photo ? "pt_photo_change" : "pt_photo_add")) + '</label>' +
      (r.photo ? '<button class="btn ghost" type="button" id="rpPhotoDrop"' + lock + '>' + esc(jcT("pt_photo_drop")) + '</button>' : '') + '</div></div>' +
      '<p class="help" id="rpPhotoHelp" role="status">' + esc(jcT(r.shrinking ? "working" : r.photo ? "pt_photo_ready" : "rp_photo_help")) + '</p>' +
      '<p class="help" id="rpPhotoWho">' + esc(jcT("rp_photo_who")) + '</p></fieldset>' +
    '<fieldset id="rpWaBox"><legend>' + esc(jcT("rp_wa")) + '</legend>' +
      '<label class="check"><input type="checkbox" id="rpWa" aria-controls="rpWaBox"' + (r.wa ? ' checked' : '') + lock + '> <span>' + esc(jcT("rp_wa_q")) + '</span></label>' +
      (r.wa ? '<label>' + esc(jcT("rp_phone")) + '<input type="tel" id="rpPhone" inputmode="tel" autocomplete="tel" maxlength="24" dir="ltr" placeholder="+971 50 123 4567"' + lock + '></label>' : '') +
      '<p class="help" id="rpWaHelp">' + esc(jcT("rp_wa_help")) + '</p></fieldset>' +
    '<p class="help" id="rpPrivacy">' + esc(jcT("rp_privacy")) + '</p>' + send + '</form>';
  el("rpNote").value = r.note; el("rpNote").addEventListener("input", function(){ r.note = el("rpNote").value; });
  if (el("rpPlace")) { el("rpPlace").value = r.place; el("rpPlace").addEventListener("input", function(){ r.place = el("rpPlace").value; }); }
  if (el("rpPhone")) { el("rpPhone").value = r.phone; el("rpPhone").addEventListener("input", function(){ r.phone = el("rpPhone").value; }); }
  each("[data-rsp]", function(b){
    if (SPECIES.indexOf(b.dataset.rsp) < 0) return;
    r.species = b.dataset.rsp;
    Array.prototype.forEach.call(document.querySelectorAll("[data-rsp]"), function(x){ x.setAttribute("aria-pressed", String(x === b)); });
  });
  el("rpWa").addEventListener("change", function(){ r.wa = el("rpWa").checked; draw(); });   /* focus stays on the box (review L3) */
  el("rpPhotoIn").addEventListener("change", function(){
    var file = el("rpPhotoIn").files && el("rpPhotoIn").files[0];
    if (!file || ptBusy) return;
    var mine = ++shrinkSeq;
    var was = r.confirm;
    r.shrinking = mine; r.confirm = false;
    if (was) draw();                                     /* the prompt was for the old photo: gone at once (review M1) */
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
      draw(); ptMsg((e && e.code) || "PHOTO_UNREADABLE");
    });
  });
  on("rpPhotoDrop", function(){ if (ptBusy) return; r.photo = null; r.confirm = false; shrinkSeq++; r.shrinking = null; draw(); if (el("rpPhotoIn")) el("rpPhotoIn").focus(); });
  /* where: the kit's pin picker (as a sighting); never the community's centre by accident */
  on("rpPosAdd", function(){
    var tok = r.tok = {};
    r.picking = true; r.where = "locating"; r.view = null; r.zoom = null; r.moved = false;
    draw();
    var t = el("rpPickHelp"); if (t) { t.setAttribute("tabindex", "-1"); t.focus(); }
    jcLocate(function(lat, lng){
      if (rep !== r || r.tok !== tok || !r.picking || current !== "report") return;
      r.where = "you"; r.view = [lat, lng]; r.zoom = 18;
      if (map && el("rpPick")) map.setView([lat, lng], 18, { animate: false });
      if (el("rpPickHelp")) el("rpPickHelp").textContent = repPickText();
    }, function(){
      if (rep !== r || r.tok !== tok || !r.picking || current !== "report") return;
      r.where = "centre";
      if (el("rpPickHelp")) el("rpPickHelp").textContent = repPickText();
      if (el("rpPickOk") && !r.moved) el("rpPickOk").disabled = true;
    }, true);
  });
  on("rpPickOk", function(){
    if (!map) return;
    var c = map.getCenter();
    r.lat = Math.round(c.lat * 1e5) / 1e5; r.lng = Math.round(c.lng * 1e5) / 1e5; r.picking = false; r.tok = null;
    draw(); var x = el("rpPosClear"); if (x) x.focus();
  });
  on("rpPickCancel", function(){ r.picking = false; r.tok = null; draw(); var a = el("rpPosAdd"); if (a) a.focus(); });
  on("rpPosClear", function(){ r.lat = null; r.lng = null; draw(); var a = el("rpPosAdd"); if (a) a.focus(); });
  if (r.picking && typeof L !== "undefined" && el("rpPick")) {
    var c = (cfg && cfg.map) || {};
    var m = map = jcPinPicker("rpPick", { center: r.view || [c.lat || 24.53, c.lng || 54.43], zoom: r.zoom || c.zoom || 16, locateZoom: 18,
      onError: function(code){ if (map === m) ptMsg(code); }, alive: function(){ return map === m; } });
    m.on("moveend", function(){
      if (rep !== r || map !== m) return;
      var x = m.getCenter(); r.view = [x.lat, x.lng]; r.zoom = m.getZoom();
      if (r.where === "centre" && !r.moved) { r.moved = true; var b = el("rpPickOk"); if (b) b.disabled = false; }
    });
  }
  on("rpSendPhoto", function(){ repSend(true); });
  on("rpSendNoPhoto", function(){ repSend(false); });
  on("rpConfirmBack", function(){ r.confirm = false; draw(); if (el("rpSend")) el("rpSend").focus(); });
  el("rpForm").addEventListener("submit", function(e){
    e.preventDefault();
    if (r.shrinking || r.picking || ptBusy) return;
    if (!repCheck()) return;
    if (r.photo) { r.confirm = true; draw(); var h = el("rpConfirmH"); if (h) h.focus(); return; }   /* the photo prompt */
    repSend(false);
  });
};
/* said before sending: what the server would refuse */
function repCheck(){
  var r = rep;
  if (!r.species) { ptMsg("REP_NO_SPECIES"); var b = document.querySelector("[data-rsp]"); if (b) b.focus(); return false; }
  if (r.lat == null && !r.place.trim()) { ptMsg("REP_NO_WHERE"); if (el("rpPlace")) el("rpPlace").focus(); return false; }
  if (r.wa && !repPhone(r.phone)) { ptMsg("REP_PHONE"); if (el("rpPhone")) el("rpPhone").focus(); return false; }
  return true;
}
function repSend(withPhoto){
  var r = rep;
  if (!r || ptBusy || r.shrinking || r.picking || !repCheck()) return;   /* never a photo other than the one agreed to */
  var fields = { species: r.species };
  if (r.note.trim()) fields.note = r.note.trim();
  if (r.place.trim()) fields.place = r.place.trim();
  if (r.lat != null) { fields.lat = r.lat; fields.lng = r.lng; }
  if (r.wa) fields.contact = repPhone(r.phone);
  var photo = withPhoto ? r.photo : null, where = r.place.trim();
  ptWrite(el(withPhoto ? "rpSendPhoto" : r.confirm ? "rpSendNoPhoto" : "rpSend"), function(){
    /* the same id on a retry: the server returns the first report, never a second */
    return rpc("jc_stray_report_add", { p_id: r.id, p_fields: fields }).then(function(){
      if (!photo) return {};
      return jcPetPhotoUpload(r.id, photo, true).then(function(){ return {}; }, function(e){ return { photoErr: (e && e.code) || "UNKNOWN" }; });
    });
  }, function(x){
    rep = null; reports = undefined; repSeq++; repLoading = false;
    repDone = { text: jcFmt(where ? "rp_wa_msg_place" : "rp_wa_msg", { s: jcT("pt_sp_" + fields.species), w: where }) };
    show("repdone");
    try { window.scrollTo(0, 0); } catch(e){}
    if (x && x.photoErr) say("err", jcFmt("rp_photo_failed", { why: jcErrTextFor("pt_err_", x.photoErr) }));
    else showOk(jcT("rp_sent"));
  }, function(code){
    if (code === "TOO_MANY_REPORTS" || code === "RATE_LIMITED") { r.confirm = false; draw(); ptMsg("REP_" + code); return true; }
    r.confirm = false; draw();
    return false;
  });
}
VIEWS.repdone = function(){
  if (!repDone) return show("list");
  el("view").innerHTML = '<h1>' + esc(jcT("rp_done_title")) + '</h1>' + msgBox() +
    '<p class="desc">' + esc(jcT("rp_done_body")) + '</p>' +
    '<h2 class="group" id="ptShareHead">' + esc(jcT("rp_done_tell")) + '</h2>' + shareLinksHtml(repDone.text) +
    '<div class="row"><button class="btn ghost" type="button" id="rpToStrays">' + esc(jcT("rp_to_strays")) + '</button></div>';
  wireShareLinks(repDone.text);
  on("rpToStrays", function(){ repDone = null; tab = "strays"; setUrl(listUrl()); show("list"); });
};

/* Pets organizers: the waiting count where they already go (no notifications yet — Zee 2026-11-16). Only for someone
   with Pets / community rights; any refusal (an expired grant: NOT_ADMIN) just hides the line. */
function queueHtml(){
  if (!canAdmin()) return '';
  if (queueN === undefined) loadQueue();
  if (!queueN) return '';
  return '<p class="notice" id="rpQueue"><a href="../admin/?tab=pets&open=reports">' + esc(jcFmt(queueN === 1 ? "rp_queue_1" : "rp_queue", { n: queueN })) + '</a></p>';
}
function loadQueue(){
  queueN = null;
  rpc("jc_admin_stray_reports_list", { p_show: "open" }).then(function(d){
    queueN = Array.isArray(d) ? d.length : null;
    /* dropped in place: a redraw would rebuild the Strays map and lose where it was moved (review L1) */
    if (queueN && current === "list" && tab === "strays" && !el("rpQueue") && el("rpOpen")) el("rpOpen").parentNode.insertAdjacentHTML("beforebegin", queueHtml());
  }, function(){ queueN = null; });
}

/* My reports, under the Strays tab: what organizers decided; while open, the number and the photo can be taken back */
var repSeq = 0;
function loadReports(){
  repLoading = true;
  var seq = ++repSeq;                                    /* an older read never overwrites a newer state (review L4) */
  rpc("jc_stray_reports_mine").then(function(d){
    if (seq !== repSeq) return;
    repLoading = false;
    reports = Array.isArray(d) ? d.filter(function(x){ return hObj(x) && typeof x.id === "string"; }) : [];
    redrawMyReports();
  }, function(e){
    if (seq !== repSeq) return;
    repLoading = false;                                  /* unreadable: the section stays away; the next draw asks again */
    if (e && e.code === "MODULE_OFF") return show("off");
  });
}
function redrawMyReports(){
  var box = el("rpMineBox");
  if (!box || current !== "list" || tab !== "strays") return;
  box.innerHTML = myReportsHtml();
  wireMyReports();
  jcPetPhotoFill();
}
function repState(x){
  var pet = hObj(x.pet) && typeof x.pet.name === "string" && typeof x.pet.id === "string" ? x.pet : null;
  if (x.state === "added" && pet) return { t: jcFmt("rp_st_added", { n: pet.name }), pet: pet };
  if (x.state === "known" && pet) return { t: jcFmt("rp_st_known", { n: pet.name }), pet: pet };
  return { t: jcT("rp_st_" + (["open", "added", "known", "not_stray", "expired"].indexOf(x.state) >= 0 ? x.state : "expired")), pet: null };
}
function myReportsHtml(){
  if (reports === undefined && !repLoading) loadReports();
  if (!Array.isArray(reports) || !reports.length) return '';
  return '<h2 class="group" id="rpMineH">' + esc(jcT("rp_mine")) + '</h2><ul class="bklist" id="rpMine">' + reports.map(function(x){
    var st = repState(x), open = x.state === "open", off = ptBusy ? ' disabled' : '';
    return '<li data-myreport="' + esc(x.id) + '"><div class="meta">' + esc(when(x.created_at) + " · " + jcT("pt_sp_" + (SPECIES.indexOf(x.species) >= 0 ? x.species : "other"))) + '</div>' +
      (open && x.photo_path ? jcPetPhotoHtml(x, 34, "tile", { view: true }) : '') +
      (x.place ? '<div class="meta" dir="auto">' + esc(x.place) + '</div>' : '') +
      '<div><b dir="auto">' + esc(st.t) + '</b></div>' +
      '<div class="acts">' + (st.pet ? '<button class="btn ghost small" type="button" data-rpopen="' + esc(st.pet.id) + '">' + esc(jcT("rp_see")) + '</button>' : '') +
      (open && x.has_contact === true ? '<button class="mini" type="button" id="rpNum-' + esc(x.id) + '" data-rpnum="' + esc(x.id) + '"' + off + '>' + esc(jcT("rp_num_remove")) + '</button>' : '') +
      (open && x.photo_path ? '<button class="mini danger" type="button" id="rpPh-' + esc(x.id) + '" data-rpphoto="' + esc(x.id) + '"' + off + '>' + esc(jcT("rp_photo_remove")) + '</button>' : '') +
      '</div></li>';
  }).join("") + '</ul><p class="help">' + esc(jcT("rp_mine_kept")) + '</p>';
}
function wireMyReports(){
  each("[data-rpopen]", function(b){ openPet(b.dataset.rpopen); });
  function take(b, fn, okKey, q){
    var id = b.dataset.rpnum || b.dataset.rpphoto;
    if (q && !window.confirm(jcT(q))) return;
    ptWrite(b, function(){ return rpc(fn, { p_id: id }); }, function(d){
      if (hObj(d) && Array.isArray(reports)) reports = reports.map(function(x){ return x.id === id ? Object.assign({}, x, d) : x; });
      redrawMyReports(); showOk(jcT(okKey));
    }, function(code){
      if (code === "NO_PHOTO" || code === "NOT_FOUND") { reports = undefined; repSeq++; repLoading = false; redrawMyReports(); return true; }   /* closed or gone meanwhile */
      return false;
    });
  }
  each("[data-rpnum]", function(b){ take(b, "jc_stray_report_contact_clear", "rp_num_removed"); });
  each("[data-rpphoto]", function(b){ take(b, "jc_stray_report_photo_remove", "rp_photo_removed", "rp_photo_remove_q"); });
}

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
    loadList();
    show("list");
  });
}, function(e){
  el("view").innerHTML = msgBox();
  ptMsg(e.code || "UNKNOWN");
});
