import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const foods = JSON.parse(fs.readFileSync(new URL("../data/foods.json", import.meta.url), "utf8"));
const nutrients = JSON.parse(fs.readFileSync(new URL("../data/nutrients.json", import.meta.url), "utf8"));
const config = JSON.parse(fs.readFileSync(new URL("../data/config.json", import.meta.url), "utf8"));

const NUTRIENT_KEYS = ["ig", "glucose", "fructose", "saccharose", "lactose", "maltose", "glucides", "proteines", "lipides", "fibres", "calories"];

test("foods.json has the 59 original foods with every key", () => {
  assert.equal(foods.length, 59);
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

test("config.json has site url", () => {
  assert.equal(config.siteUrl, "https://sugar.thoth.fr");
  assert.equal(config.siteName, "NutriBase");
});
