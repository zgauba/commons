// Every visible button label in English is Title Case, in every module (Zeeshan, Home UI review
// 2026-11-25, decision A; docs/design.md "Buttons"). No browser: reads commons/ source + strings.js.
// A label is any jcT/jcFmt key rendered as the text of a <button>, or of an <a>/<label> with class btn.
// Attribute text (aria-label, title) is not a label. Small words (a, the, of, …) stay lowercase.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "../../../commons");
const SMALL = new Set("a an the and or nor but of to in on at for by as with from per via vs".split(" "));
// keys a dynamic prefix pulls in that are not button text (help lines, questions), or proper names
const NOT_LABELS = new Set([
  "ev_supply_q", "ev_supply_clear_hint", "ev_supply_line",          // question / hint / sentence, not the level buttons
  "tpl_sub",                                                        // the template picker's intro line
  "tpl_haq_al_laila",                                               // a proper name: "al" is part of it
  "adm_ev_filter", "adm_ev_search",                                 // share the adm_ev_ chip prefix: the row's name + search placeholder
]);

function enStrings() {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, "assets/strings.js"), "utf8") + ";this.S = JC_STRINGS;", ctx);
  return ctx.S.en;
}

function sourceFiles(dir, out) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (f === "vendor" || f === "strings.js") continue;
    if (fs.statSync(p).isDirectory()) sourceFiles(p, out);
    else if (/\.(js|html)$/.test(f)) out.push(p);
  }
  return out;
}

function labelKeys(EN) {
  const keys = new Map();
  const add = (k, f) => { if (EN[k] !== undefined && !keys.has(k)) keys.set(k, path.relative(ROOT, f)); };
  // "prefix_" + x: every key with that prefix whose rest is one word (ev_supply_0, fb_kind_problem, ca_sex_unknown)
  const addPrefix = (p, f) => { for (const key of Object.keys(EN)) if (key.startsWith(p) && !key.slice(p.length).includes("_")) add(key, f); };
  const span = /<button\b[\s\S]*?<\/button>|<(a|label)\b[^>]*class=\\?["'][^"']*\bbtn\b[\s\S]*?<\/\1>/g;
  for (const f of sourceFiles(ROOT, [])) {
    const src = fs.readFileSync(f, "utf8");
    // 1. text written straight into a button: jcT("key"), jcT(cond ? "a" : "b"), jcT("prefix_" + x)
    for (const m of src.matchAll(span)) {
      if (m[0].length > 600) continue;   // an unclosed '<button' in a ternary would swallow unrelated code up to the next </button>
      const text = m[0]
        .replace(/(aria-label|title)="' *\+ *esc\([^)]*\)\) *\+ *'"/g, "")
        .replace(/(aria-label|title)="[^"]*"/g, "");
      for (const call of text.matchAll(/jc(?:T|Fmt)\(([^()]*)\)/g)) {
        for (const lit of call[1].matchAll(/"([a-z0-9_]+)"(\s*\+)?/g)) lit[2] ? addPrefix(lit[1], f) : add(lit[1], f);
      }
    }
    // 1b. local button builders: b("edit", jcT("key")), btn("signups", jcT("key")) (admin UI review G6 found "Sign-ups" here)
    for (const call of src.matchAll(/\b(?:b|btn)\( *"[a-z_]+", *jc(?:T|Fmt)\(([^()]*)\)/g)) {
      for (const lit of call[1].matchAll(/"([a-z0-9_]+)"(\s*\+)?/g)) lit[2] ? addPrefix(lit[1], f) : add(lit[1], f);
    }
    // 2. choice pills / filter rows: items of { text: jcT(...) } rendered by jcPillsHtml / jcFiltersHtml
    for (const call of src.matchAll(/(?:key|value): *[^,{}]+, *text: *jc(?:T|Fmt)\(([^()]*)\)/g)) {
      for (const lit of call[1].matchAll(/"([a-z0-9_]+)"(\s*\+)?/g)) lit[2] ? addPrefix(lit[1], f) : add(lit[1], f);
    }
    // 3. Cats' pillsHtml(id, key, field, "prefix_", …): the prefix is the 4th argument
    for (const call of src.matchAll(/\bpillsHtml\("[^"]*", *"[^"]*", *"[^"]*", *"([a-z0-9_]+_)"/g)) addPrefix(call[1], f);
  }
  return keys;
}

function notTitleCase(s) {
  return s.replace(/\{[a-z]+\}/g, "X").split(/\s+/).some((w, i) => {
    const word = w.replace(/^[^A-Za-z]+/, "");
    const parts = word.split("-");
    /* each part after a hyphen counts as a word too: "Sign-Ups", "Check-Up" (admin UI review G6) */
    if (parts.slice(1).some(p => /^[a-z]/.test(p) && !SMALL.has(p.replace(/[^a-z]/g, "")))) return true;
    if (!/^[a-z]/.test(word)) return false;
    return !(i > 0 && SMALL.has(word.toLowerCase().replace(/[^a-z]/g, "")));
  });
}

test("every English button label is Title Case", () => {
  const EN = enStrings();
  const keys = labelKeys(EN);
  expect(keys.size, "found the button labels at all").toBeGreaterThan(100);
  const bad = [...keys]
    .filter(([k]) => !NOT_LABELS.has(k) && typeof EN[k] === "string" && notTitleCase(EN[k]))
    .map(([k, f]) => k + ' "' + EN[k] + '" (' + f + ")");
  expect(bad, "button labels not in Title Case — capitalize every word except a/an/the/and/or/of/to/in/on/at/for/by/as/with/from").toEqual([]);
});
