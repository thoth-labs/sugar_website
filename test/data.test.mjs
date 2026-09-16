import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const foods = JSON.parse(fs.readFileSync(new URL("../data/foods.json", import.meta.url), "utf8"));
const nutrients = JSON.parse(fs.readFileSync(new URL("../data/nutrients.json", import.meta.url), "utf8"));
const config = JSON.parse(fs.readFileSync(new URL("../data/config.json", import.meta.url), "utf8"));

const NUTRIENT_KEYS = ["ig", "glucose", "fructose", "saccharose", "lactose", "maltose", "glucides", "proteines", "lipides", "fibres", "calories"];

test("foods.json has at least 100 foods with every key", () => {
  assert.ok(foods.length >= 100, `expected >= 100 foods, got ${foods.length}`);
  for (const f of foods) {
    for (const k of NUTRIENT_KEYS) assert.equal(typeof f[k], "number", `${f.name}.${k}`);
    assert.match(f.id, /^[a-z0-9-]+$/, f.name);
    assert.equal(typeof f.portion.g, "number", f.name);
    assert.equal(typeof f.portion.label, "string", f.name);
    assert.equal(typeof f.source.url, "string", f.name);
  }
});

test("foods.json is sorted by id", () => {
  const ids = foods.map((f) => f.id);
  assert.deepEqual(ids, [...ids].sort());
});

test("nutrients.json surprises reference food ids", () => {
  const ids = new Set(foods.map((f) => f.id));
  assert.equal(nutrients.length, 11);
  for (const n of nutrients) for (const id of n.surprises) assert.ok(ids.has(id), `${n.key}: ${id}`);
});

test("every food cites a real CIQUAL or USDA record", () => {
  const URL_RE = {
    "CIQUAL 2020": /^https:\/\/ciqual\.anses\.fr\/#\/aliments\/\d+\/[a-z0-9-]+$/,
    "USDA FoodData Central": /^https:\/\/fdc\.nal\.usda\.gov\/food-details\/\d+\/nutrients$/,
  };
  for (const f of foods) {
    assert.ok(URL_RE[f.source.name], `${f.id}: unexpected source "${f.source.name}"`);
    assert.match(f.source.ref, /^\d+$/, `${f.id}: source.ref must be the dataset code`);
    assert.match(f.source.url, URL_RE[f.source.name], f.id);
    assert.ok(f.source.url.includes(f.source.ref), `${f.id}: url must point at source.ref`);
  }
});

test("igSource is present exactly when ig > 0", () => {
  const ALLOWED = new Set(["Université de Sydney (glycemicindex.com)", "Tables publiques (valeur indicative)"]);
  for (const f of foods) {
    if (f.ig > 0) assert.ok(ALLOWED.has(f.igSource), `${f.id}: unexpected igSource ${JSON.stringify(f.igSource)}`);
    else assert.equal(f.igSource, undefined, f.id);
  }
});

test("glucides covers the five sugars (French convention, fibres excluded)", () => {
  const SUGARS = ["glucose", "fructose", "saccharose", "lactose", "maltose"];
  for (const f of foods) {
    const sum = SUGARS.reduce((s, k) => s + f[k], 0);
    assert.ok(sum <= f.glucides + 1e-9, `${f.id}: sugars ${sum.toFixed(1)} > glucides ${f.glucides}`);
  }
});

test("config.json has site url", () => {
  assert.equal(config.siteUrl, "https://sugar.thoth.fr");
  assert.equal(config.siteName, "NutriBase");
});
