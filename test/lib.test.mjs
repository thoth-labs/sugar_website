import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, slugify, filterFoods, sortFoods, totalSugars, valueOf, otherNutrients, scale } from "../assets/lib.js";

const foods = [
  { id: "epinard", name: "Épinard", glucose: 0.1, fructose: 0.1, saccharose: 0.1, lactose: 0, maltose: 0, glucides: 3.6, proteines: 2.9, lipides: 0.4, fibres: 2.2, calories: 23, ig: 15, portion: { g: 100, label: "1 portion" } },
  { id: "boeuf", name: "Bœuf (maigre)", glucose: 0, fructose: 0, saccharose: 0, lactose: 0, maltose: 0, glucides: 0, proteines: 26.1, lipides: 8.3, fibres: 0, calories: 185, ig: 0, portion: { g: 120, label: "1 steak" } },
  { id: "miel", name: "Miel", glucose: 33.5, fructose: 40.9, saccharose: 1.5, lactose: 0, maltose: 1.5, glucides: 82.4, proteines: 0.3, lipides: 0, fibres: 0.2, calories: 304, ig: 58, portion: { g: 20, label: "1 c. à soupe" } },
];
const nutrients = [
  { key: "glucose", label: "Glucose", isSugar: true }, { key: "fructose", label: "Fructose", isSugar: true },
  { key: "saccharose", label: "Saccharose", isSugar: true }, { key: "lactose", label: "Lactose", isSugar: true },
  { key: "maltose", label: "Maltose", isSugar: true },
  { key: "glucides", label: "Glucides totaux", isSugar: false }, { key: "proteines", label: "Protéines", isSugar: false },
  { key: "lipides", label: "Lipides", isSugar: false }, { key: "fibres", label: "Fibres", isSugar: false },
  { key: "calories", label: "Calories", isSugar: false }, { key: "ig", label: "Index glycémique", isSugar: false },
];

test("normalize strips accents and case", () => {
  assert.equal(normalize("Épinard"), "epinard");
  assert.equal(normalize("Bœuf"), "boeuf");
});
test("slugify", () => {
  assert.equal(slugify("Chocolat noir 70%"), "chocolat-noir-70");
  assert.equal(slugify("Œuf entier"), "oeuf-entier");
});
test("filterFoods is accent-insensitive and returns all on empty query", () => {
  assert.deepEqual(filterFoods(foods, "epin").map((f) => f.id), ["epinard"]);
  assert.deepEqual(filterFoods(foods, "BOEUF").map((f) => f.id), ["boeuf"]);
  assert.equal(filterFoods(foods, "").length, 3);
});
test("sortFoods desc and asc without mutating input", () => {
  const copy = [...foods];
  assert.deepEqual(sortFoods(foods, "glucose", "desc").map((f) => f.id), ["miel", "epinard", "boeuf"]);
  assert.deepEqual(sortFoods(foods, "glucose", "asc").map((f) => f.id), ["boeuf", "epinard", "miel"]);
  assert.deepEqual(foods, copy);
});
test("totalSugars and valueOf", () => {
  assert.equal(totalSugars(foods[2]).toFixed(1), "77.4");
  assert.equal(valueOf(foods[2], "sucres").toFixed(1), "77.4");
  assert.equal(valueOf(foods[2], "glucose"), 33.5);
});
test("otherNutrients on a sugar tab gives the six macros", () => {
  assert.deepEqual(otherNutrients(nutrients, "glucose").map((n) => n.key), ["glucides", "proteines", "lipides", "fibres", "calories", "ig"]);
});
test("otherNutrients on a macro tab gives the other macros plus total sugars", () => {
  assert.deepEqual(otherNutrients(nutrients, "fibres").map((n) => n.key), ["glucides", "proteines", "lipides", "calories", "ig", "sucres"]);
});
test("scale per portion rounds to 0.1 and leaves ig alone", () => {
  const s = scale(foods[2], "portion");
  assert.equal(s.glucose, 6.7);
  assert.equal(s.calories, 60.8);
  assert.equal(s.ig, 58);
  assert.equal(foods[2].glucose, 33.5);
  assert.deepEqual(scale(foods[2], "100g"), foods[2]);
});
