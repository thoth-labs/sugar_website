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
const config = { siteUrl: "https://example.test", siteName: "Sugar", plausibleDomain: null };

test("esc escapes html", () => assert.equal(esc(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;"));

test("layout emits canonical, description and optional plausible tag", () => {
  const html = layout({ ...config, path: "/x/", title: "T", description: "D", body: "<p>b</p>" });
  assert.match(html, /<link rel="canonical" href="https:\/\/example.test\/x\/">/);
  assert.match(html, /<meta name="description" content="D">/);
  assert.doesNotMatch(html, /plausible/);
  assert.match(layout({ ...config, plausibleDomain: "example.test", path: "/", title: "T", description: "D", body: "" }), /data-domain="example.test"/);
});

test("build writes one page per food and nutrient, comprendre and sitemap", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "nutribase-"));
  const written = build({ foods, nutrients, config, outDir }).sort();
  assert.deepEqual(written, ["aliment/biere/index.html", "aliment/miel/index.html", "aliment/tomate/index.html", "comprendre.html", "nutriment/calories/index.html", "nutriment/glucose/index.html", "sitemap.xml"]);
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
  assert.doesNotMatch(sitemap, /lastmod/);
  fs.rmSync(outDir, { recursive: true, force: true });
});

test("build removes stale food pages", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "nutribase-"));
  fs.mkdirSync(path.join(outDir, "aliment/obsolete"), { recursive: true });
  fs.writeFileSync(path.join(outDir, "aliment/obsolete/index.html"), "old");
  build({ foods, nutrients, config, outDir });
  assert.ok(!fs.existsSync(path.join(outDir, "aliment/obsolete")));
  fs.rmSync(outDir, { recursive: true, force: true });
});
