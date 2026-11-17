// B-1 follow-up F2 (2026-11-17): the EN/AR dictionary stays in step. Runs in Node (no browser page).
// 1. every EN key has an AR key and the reverse (a missing AR key silently shows English to Arabic readers);
// 2. no empty string in either language;
// 3. each EN/AR pair uses the same {placeholders} (a missing {n} in Arabic drops the number from the screen);
// 4. every key the app asks for exists: jcT(...) / jcFmt(...) with a literal key — also each branch of a ternary
//    (jcT(a ? "x" : "y")). An argument built with "+" ("prefix_" + value) can't be checked statically and is skipped.
//    (jcShowErr takes an error CODE and jcShowOk final text — neither is a key, so neither is scanned.)
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

// the first argument of every jcT( / jcFmt( call, up to its top-level "," or ")"
function firstArgs(src) {
  const out = [];
  for (const m of src.matchAll(/\bjc(?:T|Fmt)\(/g)) {
    let i = m.index + m[0].length, depth = 0, quote = null, arg = "";
    for (; i < src.length; i++) {
      const ch = src[i];
      if (quote) { arg += ch; if (ch === "\\") { arg += src[++i]; continue; } if (ch === quote) quote = null; continue; }
      if (ch === '"' || ch === "'") { quote = ch; arg += ch; continue; }
      if ("([{".includes(ch)) depth++;
      if (")]}".includes(ch)) { if (depth === 0) break; depth--; }
      if (ch === "," && depth === 0) break;
      arg += ch;
    }
    out.push(arg);
  }
  return out;
}
// the keys an argument names: a literal at its start or a ternary result (after ? or :) — not a compared value
function keysIn(arg) {
  const bare = arg.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""');
  if (bare.includes("+")) return null;                                   // built at run time
  return [...arg.matchAll(/(?:^|[?:])\s*"([a-z][a-z0-9_]*)"/g)].map((k) => k[1]);
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

  test("every key the app asks for exists (literal keys and both sides of a ternary)", () => {
    const missing = [];
    let checked = 0;
    for (const f of appFiles(ROOT)) {
      for (const arg of firstArgs(fs.readFileSync(f, "utf8"))) {
        for (const k of keysIn(arg) || []) {
          checked++;
          if (!(k in S.en)) missing.push(`${k} (${path.relative(ROOT, f)})`);
        }
      }
    }
    expect(missing).toEqual([]);
    expect(checked, "the scan found the app's keys at all").toBeGreaterThan(1000);
  });

  test("the checks bite: a broken dictionary and the call-site scan", () => {
    const broken = loadStrings("var JC_STRINGS = { en: { a: 'x {n}', b: 'y' }, ar: { a: 'س' } };");
    expect(Object.keys(broken.en).filter((k) => !(k in broken.ar))).toEqual(["b"]);
    expect(placeholders(broken.en.a)).not.toEqual(placeholders(broken.ar.a));
    const src = 'jcT("one"); jcFmt("two", { n: 1 }); jcT(a ? "three" : b === "sat" ? "four" : "five"); ' +
                'jcT("pre_" + x); jcT(k); jcT(f("x"), y);';
    expect(firstArgs(src).map(keysIn)).toEqual([["one"], ["two"], ["three", "four", "five"], null, [], []]);
  });
});
