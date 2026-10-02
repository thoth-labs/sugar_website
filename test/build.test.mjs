import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { build, clip } from "../scripts/build.mjs";
import { layout, esc } from "../scripts/template.mjs";

const foods = [
  { id: "miel", name: "Miel", emoji: "🍯", category: "sucres", ig: 58, glucose: 33.5, fructose: 40.9, saccharose: 1.5, lactose: 0, maltose: 1.5, glucides: 82.4, proteines: 0.3, lipides: 0, fibres: 0.2, calories: 304, portion: { g: 20, label: "1 c. à soupe" }, source: { name: "CIQUAL 2020", ref: "31008", url: "https://ciqual.anses.fr/#/aliments/31008/miel" }, igSource: "Université de Sydney" },
  { id: "tomate", name: "Tomate", emoji: "🍅", category: "legumes", ig: 15, glucose: 1.5, fructose: 1.4, saccharose: 0, lactose: 0, maltose: 0, glucides: 3.9, proteines: 0.9, lipides: 0.2, fibres: 1.2, calories: 18, portion: { g: 120, label: "1 tomate" }, source: { name: "CIQUAL 2020", ref: "20047", url: "https://ciqual.anses.fr/#/aliments/20047/tomate" }, igSource: "Université de Sydney" },
  { id: "biere", name: "Bière", emoji: "🍺", category: "boissons", ig: 0, glucose: 0, fructose: 0, saccharose: 0, lactose: 0, maltose: 0.5, glucides: 3, proteines: 0.5, lipides: 0, fibres: 0, alcool: 4, calories: 43, portion: { g: 250, label: "1 demi" }, source: { name: "CIQUAL 2020", ref: "5000", url: "https://ciqual.anses.fr/#/aliments/5000/biere" } },
  { id: "confiture", name: "Confiture", emoji: "🍓", category: "sucres", ig: 65, glucose: 20, fructose: 20, saccharose: 20, lactose: 0, maltose: 0, glucides: 60, proteines: 0.5, lipides: 0.1, fibres: 1, calories: 250, portion: { g: 30, label: "1 c. à soupe" }, source: { name: "CIQUAL 2020", ref: "31001", url: "https://ciqual.anses.fr/#/aliments/31001/confiture" }, igSource: "Université de Sydney" },
];
const INDEX = `<!DOCTYPE html><html><body><div id="grid"></div>\n<!-- build:index -->\n<p>stale</p>\n<!-- /build:index -->\n<footer></footer></body></html>`;
const ldBlocks = (html) => [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
const nutrients = [
  { key: "glucose", label: "Glucose", emoji: "⚡", color: "#d4600a", unit: "g", isSugar: true, desc: "Desc glucose", surprises: ["tomate"] },
  { key: "calories", label: "Calories", emoji: "🔥", color: "#b91c1c", unit: "kcal", isSugar: false, desc: "Desc calories", surprises: ["miel"] },
];
const config = {
  siteUrl: "https://example.test", siteName: "Glykon", plausibleDomain: null, legalUpdated: "2026-09-21",
  company: { name: "Thoth Technologies", tradeName: "Thoth", url: "https://corp.example.test/", legalForm: "SASU", capital: "1 500 €", founded: "27 mai 2025", rcs: "RCS Créteil 945 408 763", siren: "945 408 763", euid: "FR9401.945408763", vat: "FR 39 945 408 763", address: "3 Terrasse Le Nôtre, 94220 Charenton-le-Pont, France", email: "contact@example.test", director: "Jane Doe", directorTitle: "présidente" },
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
  fs.writeFileSync(path.join(outDir, "index.html"), INDEX);
  const written = build({ foods, nutrients, config, outDir }).sort();
  assert.deepEqual(written, ["404.html", "aliment/biere/index.html", "aliment/confiture/index.html", "aliment/miel/index.html", "aliment/tomate/index.html", "comprendre.html", "index.html", "mentions-legales.html", "nutriment/calories/index.html", "nutriment/glucose/index.html", "sitemap.xml"]);
  const mentions = fs.readFileSync(path.join(outDir, "mentions-legales.html"), "utf8");
  for (const v of Object.values(config.company)) assert.ok(mentions.includes(esc(v)), `mentions légales shows ${v}`);
  assert.match(mentions, /GitHub/);
  assert.match(mentions, /CNIL/);
  assert.match(mentions, /href="https:\/\/example.test\/mentions-legales.html"/);
  assert.match(mentions, /article 6-III de la loi n° 2004-575/, "cites the LCEN");
  assert.match(mentions, /<h2>Droit applicable<\/h2>/);
  assert.match(mentions, /<h2>Liens sortants<\/h2>/);
  assert.match(mentions, /21 septembre 2026/, "shows the last update date in French");
  assert.match(mentions, /href="https:\/\/corp.example.test\/"/, "links the company site");
  const org = ldBlocks(mentions).find((b) => b["@type"] === "Organization");
  assert.equal(org.legalName, "Thoth Technologies");
  assert.equal(org.identifier.value, "945408763");
  assert.equal(org.url, "https://corp.example.test/");
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
  assert.doesNotMatch(sitemap, /404/);
  fs.rmSync(outDir, { recursive: true, force: true });
});

test("layout embeds JSON-LD blocks with script-safe escaping", () => {
  const html = layout({ ...config, path: "/x/", title: "T", description: "D", body: "", jsonLd: [{ "@context": "https://schema.org", "@type": "Thing", name: "a</script>b" }] });
  assert.doesNotMatch(html, /a<\/script>b/);
  assert.deepEqual(ldBlocks(html), [{ "@context": "https://schema.org", "@type": "Thing", name: "a</script>b" }]);
  assert.doesNotMatch(layout({ ...config, path: "/x/", title: "T", description: "D", body: "" }), /ld\+json/);
});

test("build injects a crawlable index of nutrients and foods into index.html", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "sugar-"));
  fs.writeFileSync(path.join(outDir, "index.html"), INDEX);
  build({ foods, nutrients, config, outDir });
  const html = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
  assert.doesNotMatch(html, /stale/);
  assert.match(html, /<!-- build:index -->[\s\S]*<!-- \/build:index -->/, "markers are kept for the next build");
  assert.match(html, /href="nutriment\/glucose\/"/);
  assert.match(html, /href="aliment\/miel\/"/);
  assert.match(html, /href="aliment\/biere\/"/);
  assert.ok(html.indexOf("Sucres et douceurs") < html.indexOf('href="aliment/miel/"'), "foods are grouped under their category");
  assert.doesNotMatch(html, /href="\/aliment/, "home page links stay relative");
  build({ foods, nutrients, config, outDir });
  assert.equal(fs.readFileSync(path.join(outDir, "index.html"), "utf8"), html, "rebuilding is idempotent");
  fs.rmSync(outDir, { recursive: true, force: true });
});

test("build fails loudly when index.html has no markers", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "sugar-"));
  fs.writeFileSync(path.join(outDir, "index.html"), "<html></html>");
  assert.throws(() => build({ foods, nutrients, config, outDir }), /build:index/);
  fs.rmSync(outDir, { recursive: true, force: true });
});

test("food page links the other foods of its category and carries breadcrumbs", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "sugar-"));
  build({ foods, nutrients, config, outDir });
  const miel = fs.readFileSync(path.join(outDir, "aliment/miel/index.html"), "utf8");
  assert.match(miel, /Autres sucres et douceurs/);
  assert.match(miel, /href="\.\.\/\.\.\/aliment\/confiture\/"/);
  assert.doesNotMatch(miel, /href="\.\.\/\.\.\/aliment\/miel\/"/, "a food does not list itself");
  const biere = fs.readFileSync(path.join(outDir, "aliment/biere/index.html"), "utf8");
  assert.doesNotMatch(biere, /Autres/, "no section when the food is alone in its category");
  const crumbs = ldBlocks(miel).find((b) => b["@type"] === "BreadcrumbList");
  assert.deepEqual(crumbs.itemListElement.map((e) => e.name), ["Glykon", "Sucres et douceurs", "Miel"]);
  assert.equal(crumbs.itemListElement[2].item, "https://example.test/aliment/miel/");
  fs.rmSync(outDir, { recursive: true, force: true });
});

test("nutrient page description names the top foods and its ranking is an ItemList", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "sugar-"));
  build({ foods, nutrients, config, outDir });
  const html = fs.readFileSync(path.join(outDir, "nutriment/glucose/index.html"), "utf8");
  const desc = html.match(/<meta name="description" content="([^"]*)">/)[1];
  assert.match(desc, /4 aliments/);
  assert.match(desc, /Miel, Confiture, Tomate/);
  assert.ok(desc.length <= 160, `description too long: ${desc.length}`);
  assert.doesNotMatch(desc, /\S…$/, "not cut mid-word");
  const list = ldBlocks(html).find((b) => b["@type"] === "ItemList");
  assert.equal(list.itemListElement[0].position, 1);
  assert.equal(list.itemListElement[0].url, "https://example.test/aliment/miel/");
  assert.equal(list.itemListElement.length, 4);
  fs.rmSync(outDir, { recursive: true, force: true });
});

test("clip cuts at the last full sentence when one fits, else at a word", () => {
  assert.equal(clip("Short.", 20), "Short.");
  assert.equal(clip("One two. Three four five six.", 20), "One two.");
  assert.equal(clip("One two three four five six seven", 20), "One two three four…");
});

test("index glycémique description is not stated per 100 g", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "sugar-"));
  build({ foods, nutrients: [{ key: "ig", label: "Index glycémique", emoji: "📈", color: "#000", unit: "/100", isSugar: false, desc: "Desc IG", surprises: [] }], config, outDir });
  const desc = fs.readFileSync(path.join(outDir, "nutriment/ig/index.html"), "utf8").match(/<meta name="description" content="([^"]*)">/)[1];
  assert.match(desc, /^Classement de 4 aliments par index glycémique\. Les plus élevés : Confiture, Miel, Tomate\./);
  fs.rmSync(outDir, { recursive: true, force: true });
});

test("build writes a French 404 page linking home", () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "sugar-"));
  build({ foods, nutrients, config, outDir });
  const html = fs.readFileSync(path.join(outDir, "404.html"), "utf8");
  assert.match(html, /Page introuvable/);
  assert.match(html, /<meta name="robots" content="noindex">/);
  // Served at any missing URL, at any depth, so links must stay root-absolute.
  assert.match(html, /class="logo" href="\/"/);
  assert.match(html, /href="\/comprendre\.html"/);
  assert.match(html, /href="\/assets\/styles\.css"/);
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
