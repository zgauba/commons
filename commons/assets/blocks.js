/* Shared page pieces (DS-3b, docs/design.md §3–4): markup for the photo card, the hero header, the facts list and the
   dated-entry list. Styles live in app.css. Each returns a string for innerHTML; the page wires its own clicks.
   Text arguments are escaped here; arguments named *Html / attrs are trusted markup the caller has escaped.
   Needs api.js (esc). */

/* A text line under a card or hero name. cls: extra class; auto: typed text (dir="auto"). */
function jcMetaHtml(text, cls, auto){
  return '<span class="meta' + (cls ? " " + cls : "") + '"' + (auto ? ' dir="auto"' : '') + '>' + esc(text) + '</span>';
}

/* Photo card for a .ptgrid list: the whole card is one button.
   o: { liAttrs, btnAttrs — trusted attribute strings ('data-pet="…"'); missing — red border; photoHtml; name;
        linesHtml — array of lines under the name (jcMetaHtml / a .head chip row), falsy entries skipped } */
function jcCardHtml(o){
  return '<li' + (o.missing ? ' class="missing"' : '') + (o.liAttrs ? ' ' + o.liAttrs : '') + '>' +
    '<button class="ptcard" type="button"' + (o.btnAttrs ? ' ' + o.btnAttrs : '') + '>' + (o.photoHtml || '') +
    '<span class="ptbody"><b dir="auto">' + esc(o.name) + '</b>' + (o.linesHtml || []).filter(Boolean).join("") +
    '</span></button></li>';
}

/* Hero header on a thing's own page: photo beside the name.
   o: { photoHtml; name; afterNameHtml — e.g. an Admin button; meta — the "Kind · Status" line; chipsHtml } */
function jcHeroHtml(o){
  return '<div class="pthero">' + (o.photoHtml || '') + '<div class="ptwho"><div class="evtitle"><h1 dir="auto">' + esc(o.name) + '</h1>' +
    (o.afterNameHtml || '') + '</div>' + (o.meta ? '<p class="meta">' + esc(o.meta) + '</p>' : '') +
    (o.chipsHtml ? '<div class="head">' + o.chipsHtml + '</div>' : '') + '</div></div>';
}

/* Facts: label → value pairs ([[label, value], …], both text) as dl.facts; id optional */
function jcFactsHtml(pairs, id){
  return '<dl class="facts"' + (id ? ' id="' + esc(id) + '"' : '') + '>' + pairs.map(function(f){
    return '<dt>' + esc(f[0]) + '</dt><dd dir="auto">' + esc(f[1]) + '</dd>';
  }).join("") + '</dl>';
}

/* Dated-entry list (sightings, care log, activity): a group label, then one card per entry, newest first as given.
   o: { heading; id — on the list, or on the empty line; items — [{ meta: "when · by me" text, bodyHtml }];
        empty — text shown instead of the list (omit: nothing at all when empty, not even the heading);
        afterHtml — under the list (e.g. how long entries are kept) } */
function jcEntriesHtml(o){
  var h = '<h2 class="group">' + esc(o.heading) + '</h2>', id = o.id ? ' id="' + esc(o.id) + '"' : '';
  if (!o.items.length) return o.empty == null ? '' : h + '<p class="help"' + id + '>' + esc(o.empty) + '</p>';
  return h + '<ul class="bklist"' + id + '>' + o.items.map(function(it){
    return '<li><div class="meta">' + esc(it.meta) + '</div>' + (it.bodyHtml || '') + '</li>';
  }).join("") + '</ul>' + (o.afterHtml || '');
}
