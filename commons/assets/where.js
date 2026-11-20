/* "Where is it?" — the old Pets "Report a stray" Where flow (retired in CC-7c), shared so every Cats editor and the
   Cats stray report ask for a place the same way (CC plan Step 1b EXTRACT; tester feedback 2026-11-17: the report's
   flow was intuitive, the organizer's separate "Pin here" was missed). The pin is set when the person taps "Use this
   spot": no second save.

   w = the page's draft of the spot, kept across redraws: { lat, lng, picking, where, view, zoom, moved, tok }.
   jcWhereHtml(w, id, off, o)  the fieldset body. id = an id prefix (e.g. "stW"); off = ' disabled' or '';
                               o.required → no Remove button (a set spot can only be moved).
   jcWhereWire(w, id, o)       after innerHTML. o: { draw(), alive() → still on this form, center [lat, lng], zoom,
                               onError(code), setMap(m) — the page keeps the one map to take down on redraw }. */
function jcWhereText(w){
  return jcT(w.where === "centre" ? "wh_pick_centre" : w.where === "locating" ? "wh_pick_finding" : "wh_pick_help");
}
function jcWhereHtml(w, id, off, o){
  o = o || {};
  if (w.picking) return '<p class="help" id="' + id + 'Help" role="status">' + esc(jcWhereText(w)) + '</p>' + jcPinPickerHtml(id + "Map") +
    '<div class="acts"><button class="btn" type="button" id="' + id + 'Ok"' + (w.where === "centre" && !w.moved ? ' disabled' : '') + '>' + esc(jcT("pt_pick_ok")) + '</button>' +
    '<button class="btn ghost" type="button" id="' + id + 'Cancel">' + esc(jcT("ct_cancel")) + '</button></div>';
  if (w.lat != null) return '<p class="status ok" id="' + id + 'Pos">' + esc(jcT("wh_set")) +
    ' <button class="mini" type="button" id="' + id + 'Move"' + off + '>' + esc(jcT("wh_move")) + '</button>' +
    (o.required ? '' : ' <button class="mini" type="button" id="' + id + 'Clear"' + off + '>' + esc(jcT("pt_pos_clear")) + '</button>') + '</p>';
  return typeof L !== "undefined" ? '<div class="acts"><button class="btn ghost" type="button" id="' + id + 'Add"' + off + '>' + esc(jcT("pt_pos_add")) + '</button></div>'
    : '<p class="help">' + esc(jcT("wh_nomap")) + '</p>';
}
function jcWhereWire(w, id, o){
  function open(fromSpot){
    var tok = w.tok = {};
    w.picking = true; w.moved = false;
    function focusHelp(){ var t = el(id + "Help"); if (t) { t.setAttribute("tabindex", "-1"); t.focus(); } }   /* review L2: both paths */
    if (fromSpot) { w.where = "spot"; w.view = [w.lat, w.lng]; w.zoom = 18; o.draw(); focusHelp(); return; }   /* moving: start on the pin */
    w.where = "locating"; w.view = null; w.zoom = null;
    o.draw();
    focusHelp();
    jcLocate(function(lat, lng){
      if (w.tok !== tok || !w.picking || !o.alive()) return;
      w.where = "you"; w.view = [lat, lng]; w.zoom = 18;
      if (w.map && el(id + "Map")) w.map.setView([lat, lng], 18, { animate: false });
      if (el(id + "Help")) el(id + "Help").textContent = jcWhereText(w);
    }, function(){
      if (w.tok !== tok || !w.picking || !o.alive()) return;
      w.where = "centre";
      if (el(id + "Help")) el(id + "Help").textContent = jcWhereText(w);
      if (el(id + "Ok") && !w.moved) el(id + "Ok").disabled = true;
    }, true);
  }
  jcOn(id + "Add", function(){ open(false); });
  jcOn(id + "Move", function(){ open(true); });
  jcOn(id + "Ok", function(){
    if (!w.map) return;
    var c = w.map.getCenter();
    w.lat = Math.round(c.lat * 1e5) / 1e5; w.lng = Math.round(c.lng * 1e5) / 1e5; w.picking = false; w.tok = null;
    o.draw(); var x = el(id + "Move"); if (x) x.focus();
  });
  jcOn(id + "Cancel", function(){ w.picking = false; w.tok = null; o.draw(); var a = el(id + "Add") || el(id + "Move"); if (a) a.focus(); });
  jcOn(id + "Clear", function(){ w.lat = null; w.lng = null; o.draw(); var a = el(id + "Add"); if (a) a.focus(); });
  w.map = null;
  if (w.picking && typeof L !== "undefined" && el(id + "Map")) {
    var m = w.map = jcPinPicker(id + "Map", { center: w.view || o.center, zoom: w.zoom || o.zoom || 16, locateZoom: 18,
      /* review M1: a late Find Me failure after leaving the form says nothing */
      onError: function(code){ if (w.map === m && o.alive() && o.onError) o.onError(code); }, alive: function(){ return w.map === m && o.alive(); } });
    if (o.setMap) o.setMap(m);
    m.on("moveend", function(){
      if (w.map !== m) return;
      var x = m.getCenter(); w.view = [x.lat, x.lng]; w.zoom = m.getZoom();
      if (w.where === "centre" && !w.moved) { w.moved = true; var b = el(id + "Ok"); if (b) b.disabled = false; }
    });
  }
}
