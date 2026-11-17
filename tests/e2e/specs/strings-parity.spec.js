// B-1 follow-up F2 (2026-11-17): the EN/AR dictionary stays in step. Runs in Node (no browser page).
// 1. every EN key has an AR key and the reverse (a missing AR key silently shows English to Arabic readers);
// 2. no empty string in either language;
// 3. each EN/AR pair uses the same {placeholders} (a missing {n} in Arabic drops the number from the screen);
// 4. every literal key the app asks for — jcT("x") / jcFmt("x", …) / jcShowErr("x") — exists. Keys built as
//    "prefix_" + value can't be checked statically; the literal ends in "_" and is skipped.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.join(__dirname, "../../../commons");

function loadStrings(src) {
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(src + ";this.S = JC_STRINGS;", ctx);
  return ctx.S;
}
const S = loadStrings(fs.readFileSync(path.join(ROOT, "assets/strings.js"), "utf8"));
const placeholders = (s) => [...new Set(String(s).match(/\{[a-z0-9_]+\}/gi) || [])].sort();

function appFiles(dir, out = []) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) { if (f !== "vendor") appFiles(p, out); }
    else if (/\.(js|html)$/.test(f) && f !== "strings.js") out.push(p);
  }
  return out;
}

test.describe("strings dictionary (EN/AR)", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "pure Node checks: run once, not per browser");

  test("every EN key has an AR key, and the reverse", () => {
    const en = Object.keys(S.en), ar = Object.keys(S.ar);
    expect(en.filter((k) => !(k in S.ar)), "EN keys missing in AR").toEqual([]);
    expect(ar.filter((k) => !(k in S.en)), "AR keys missing in EN").toEqual([]);
  });

  test("no empty strings", () => {
    const empty = [];
    for (const lang of ["en", "ar"]) for (const [k, v] of Object.entries(S[lang]))
      if (typeof v === "string" && !v.trim()) empty.push(lang + "." + k);
    expect(empty).toEqual([]);
  });

  test("each EN/AR pair has the same {placeholders}", () => {
    const bad = [];
    for (const k of Object.keys(S.en)) {
      if (!(k in S.ar)) continue;
      const a = placeholders(S.en[k]).join(","), b = placeholders(S.ar[k]).join(",");
      if (a !== b) bad.push(`${k}: en {${a}} ar {${b}}`);
    }
    expect(bad).toEqual([]);
  });

  test("every literal key the app asks for exists", () => {
    const missing = [];
    for (const f of appFiles(ROOT)) {
      const src = fs.readFileSync(f, "utf8");
      for (const m of src.matchAll(/\bjc(?:T|Fmt|ShowErr|ShowOk)\(\s*"([a-z][a-z0-9_]*)"/gi)) {
        if (m[1].endsWith("_")) continue;                       // "prefix_" + value
        if (!(m[1] in S.en)) missing.push(`${m[1]} (${path.relative(ROOT, f)})`);
      }
    }
    expect(missing).toEqual([]);
  });

  test("the checks bite: a broken dictionary fails them", () => {
    const broken = loadStrings("var JC_STRINGS = { en: { a: 'x {n}', b: 'y' }, ar: { a: 'س' } };");
    expect(Object.keys(broken.en).filter((k) => !(k in broken.ar))).toEqual(["b"]);
    expect(placeholders(broken.en.a)).not.toEqual(placeholders(broken.ar.a));
  });
});
