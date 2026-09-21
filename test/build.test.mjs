import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { build } from "../scripts/build.mjs";
import { layout, esc } from "../scripts/template.mjs";

const foods = [
  { id: "miel", name: "Miel", emoji: "🍯", category: "sucres", ig: 58, glucose: 33.5, fructose: 40.9, saccharose: 1.5, lactose: 0, maltose: 1.5, glucides: 82.4, proteines: 0.3, lipides: 0, fibres: 0.2, calories: 304, portion: { g: 20, label: "1 c. à soupe" }, source: { name: "CIQUAL 2020", ref: "31008", url: "https://ciqual.anses.fr/#/aliments/31008/miel" }, igSource: "Université de Sydney" },
  { id: "tomate", name: "Tomate", emoji: "🍅", category: "legumes", ig: 15, glucose: 1.5, fructose: 1.4, saccharose: 0, lactose: 0, maltose: 0, glucides: 3.9, proteines: 0.9, lipides: 0.2, fibres: 1.2, calories: 18, portion: { g: 120, label: "1 tomate" }, source: { name: "CIQUAL 2020", ref: "20047", url: "https://ciqual.anses.fr/#/aliments/20047/tomate" }, igSource: "Université de Sydney" },
  { id: "biere", name: "Bière", emoji: "🍺", category: "boissons", ig: 0, glucose: 0, fructose: 0, saccharose: 0, lactose: 0, maltose: 0.5, glucides: 3, proteines: 0.5, lipides: 0, fibres: 0, alcool: 4, calories: 43, portion: { g: 250, label: "1 demi" }, source: { name: "CIQUAL 2020", ref: "5000", url: "https://ciqual.anses.fr/#/aliments/5000/biere" } },
];
const nutrients = [
  { key: "glucose", label: "Glucose", emoji: "⚡", color: "#d4600a", unit: "g", isSugar: true, desc: "Desc glucose", surprises: ["tomate"] },
  { key: "calories", label: "Calories", emoji: "🔥", color: "#b91c1c", unit: "kcal", isSugar: false, desc: "Desc calories", surprises: ["miel"] },
];
const config = {
  siteUrl: "https://example.test", siteName: "Sugar", plausibleDomain: null,
  company: { name: "THOTH TECHNOLOGIES", tradeName: "Thoth", legalForm: "SAS à associé unique", capital: "1 500 €", rcs: "945 408 763 R.C.S. Créteil", euid: "FR9401.945408763", vat: "FR 39 945 408 763", address: "3 Terrasse le Nôtre, 94220 Charenton-le-Pont, France", email: "contact@example.test", director: "Jane Doe", directorTitle: "Présidente" },
};

test("esc escapes html", () => assert.equal(esc(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;"));

test("layout emits canonical, description and optional plausible tag", () => {
  const html = layout({ ...config, path: "/x/", title: "T", description: "D", body: "<p>b</p>" });
  assert.match(html, /<link rel="canonical" href="https:\/\/example.test\/x\/">/);
  assert.match(html, /<meta name="description" content="D">/);
  assert.doesNotMatch(html, /plausible/);
  assert.doesNotMatch(html, /googleapis|gstatic/, "fonts are self-hosted");
  assert.match(html, /href="\.\.\/mentions-legales.html"/, "footer links to the legal page");
  assert.match(layout({ ...config, plausibleDomain: "example.test", path: "/", title: "T", description: "D", body: "" }), /data-domain="example.test"/);
});

test("layout links assets and pages relative to the page depth so file:// previews work", () => {
  const deep = layout({ ...config, path: "/aliment/miel/", title: "T", description: "D", body: '<a href="/nutriment/glucose/">g</a> <a href="/?q=miel">q</a>' });
  assert.match(deep, /href="\.\.\/\.\.\/assets\/styles\.css"/);
  assert.match(deep, /href="\.\.\/\.\.\/favicon\.svg"/);
  assert.match(deep, /class="logo" href="\.\.\/\.\.\/"/);
  assert.match(deep, /href="\.\.\/\.\.\/nutriment\/glucose\/"/);
  assert.match(deep, /href="\.\.\/\.\.\/\?q=miel"/);
  assert.match(deep, /<link rel="canonical" href="https:\/\/example.test\/aliment\/miel\/">/);
  assert.doesNotMatch(deep, /href="\//, "no root-absolute href left");
  const top = layout({ ...config, path: "/comprendre.html", title: "T", description: "D", body: '<a href="/?n=ig">n</a>' });
  assert.match(top, /href="assets\/styles\.css"/);
  assert.match(top, /class="logo" href="\.\/"/);
  assert.match(top, /href="\.\/\?n=ig"/);
  assert.doesNotMatch(top, /href="\//);
});

test("build writes one page per food and nutrient, comprendre, mentions légales and sitemap", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "sugar-"));
  const written = build({ foods, nutrients, config, outDir }).sort();
  assert.deepEqual(written, ["aliment/biere/index.html", "aliment/miel/index.html", "aliment/tomate/index.html", "comprendre.html", "mentions-legales.html", "nutriment/calories/index.html", "nutriment/glucose/index.html", "sitemap.xml"]);
  const mentions = fs.readFileSync(path.join(outDir, "mentions-legales.html"), "utf8");
  for (const v of Object.values(config.company)) assert.ok(mentions.includes(esc(v)), `mentions légales shows ${v}`);
  assert.match(mentions, /GitHub/);
  assert.match(mentions, /CNIL/);
  assert.match(mentions, /href="https:\/\/example.test\/mentions-legales.html"/);
  const biere = fs.readFileSync(path.join(outDir, "aliment/biere/index.html"), "utf8");
  assert.match(biere, /4\.0 g d'alcool/);
  const miel = fs.readFileSync(path.join(outDir, "aliment/miel/index.html"), "utf8");
  assert.doesNotMatch(miel, /alcool/);
  assert.match(miel, /href="https:\/\/example.test\/aliment\/miel\/"/);
  assert.match(miel, /33\.5/);
  assert.match(miel, /6\.7/);            // per portion (20 g)
  assert.match(miel, /ciqual\.anses\.fr/);
  const glucose = fs.readFileSync(path.join(outDir, "nutriment/glucose/index.html"), "utf8");
  assert.ok(glucose.indexOf("/aliment/miel/") < glucose.indexOf("/aliment/tomate/"), "richest first");
  const sitemap = fs.readFileSync(path.join(outDir, "sitemap.xml"), "utf8");
  assert.match(sitemap, /<loc>https:\/\/example.test\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/example.test\/aliment\/tomate\/<\/loc>/);
  assert.match(sitemap, /<loc>https:\/\/example.test\/mentions-legales.html<\/loc>/);
  assert.doesNotMatch(sitemap, /lastmod/);
  fs.rmSync(outDir, { recursive: true, force: true });
});

test("build removes stale food pages", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "sugar-"));
  fs.mkdirSync(path.join(outDir, "aliment/obsolete"), { recursive: true });
  fs.writeFileSync(path.join(outDir, "aliment/obsolete/index.html"), "old");
  build({ foods, nutrients, config, outDir });
  assert.ok(!fs.existsSync(path.join(outDir, "aliment/obsolete")));
  fs.rmSync(outDir, { recursive: true, force: true });
});
