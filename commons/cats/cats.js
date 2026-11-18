/* Cats page (CC-1) — the community cat programme. Plan: docs/plans/CC-community-cats.md.
   CC-1 is the foundation only: the page exists behind the 'cats' module flag (the kill switch: off = nothing asked
   of the server), says what is coming, and tells a coordinator / volunteer their role. Areas + stations (CC-2),
   the cat register (CC-3), visits + sightings (CC-4) and the vet log (CC-5) arrive here.
   Roles come from jc_me_get.admin_scopes ('cats' coordinator, 'cats_vol' volunteer; a community admin manages
   the programme too) — display only, every later Cats call is gated by the server. */

var state = null, cfg = null, current = null;
var msgBox = jcMsgBox, ar = jcIsAr;
function caMsg(code){ jcShowErrFor("ca_err_", code); }
function scopes(){ return (state && state.me && state.me.admin_scopes) || []; }
/* the one line about the person's role here, or none */
function roleKey(){
  var sc = scopes();
  return sc.indexOf("cats") >= 0 ? "ca_role_cats" : sc.indexOf("cats_vol") >= 0 ? "ca_role_cats_vol"
       : sc.indexOf("community") >= 0 ? "ca_role_admin" : null;
}

var VIEWS = {
  off: function(){
    el("view").innerHTML = '<h1 dir="auto">' + esc(jcModTitle("cats")) + '</h1><p class="notice" id="caOff">' + esc(jcT("bk_off")) + '</p>';
  },
  home: function(){
    var rk = roleKey();
    el("view").innerHTML = '<h1 dir="auto">' + esc(jcModTitle("cats")) + '</h1>' + msgBox() +
      (rk ? '<p class="notice" id="caRole">' + esc(jcT(rk)) + '</p>' : '') +
      '<div class="panel" id="caSoon"><p>' + esc(jcT("ca_soon")) + '</p></div>';
  }
};
function show(name){
  current = name;
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
  });
}, function(e){
  el("view").innerHTML = msgBox();
  caMsg(e.code || "UNKNOWN");
});
