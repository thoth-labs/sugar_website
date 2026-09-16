import test from "node:test";
import assert from "node:assert/strict";
import { toFoodValues, sugarsUnaccounted } from "../.claude/skills/add-food/scripts/datasets.mjs";

test("sugarsUnaccounted flags a record whose itemised sugars fall well short of its total (CIQUAL 5214)", () => {
  const rec = { code: "5214", name: "Test", values: { sucres: 0.62, glucose: 0.1, fructose: null, saccharose: null, lactose: null, maltose: null } };
  const vals = toFoodValues("ciqual", rec);
  assert.equal(sugarsUnaccounted(rec, vals), true);
});

test("sugarsUnaccounted allows a record with zero total sugars and nothing itemised", () => {
  const rec = { code: "x", name: "Test", values: { sucres: 0, glucose: null, fructose: null, saccharose: null, lactose: null, maltose: null } };
  const vals = toFoodValues("ciqual", rec);
  assert.equal(sugarsUnaccounted(rec, vals), false);
});

test("sugarsUnaccounted allows a full breakdown that sums to its total", () => {
  const rec = { code: "y", name: "Test", values: { sucres: 10, glucose: 4, fructose: 3, saccharose: 2, lactose: 1, maltose: 0 } };
  const vals = toFoodValues("ciqual", rec);
  assert.equal(sugarsUnaccounted(rec, vals), false);
});

test("toFoodValues computes glucides as carbs minus fibre for USDA", () => {
  const vals = toFoodValues("usda", { values: { carbs: 10, fibres: 3, glucose: 1 } });
  assert.equal(vals.glucides, 7);
});
