import { test } from "node:test";
import assert from "node:assert/strict";
import { validateData, validateFood } from "../scripts/validate.mjs";

function food(over = {}) {
  return {
    id: "pomme", name: "Pomme", emoji: "🍎", category: "fruits", ig: 38,
    glucose: 2.4, fructose: 5.9, saccharose: 1.9, lactose: 0, maltose: 0.1,
    glucides: 14, proteines: 0.3, lipides: 0.2, fibres: 2.4, calories: 52,
    portion: { g: 150, label: "1 pomme" },
    source: { name: "CIQUAL 2020", ref: "13005", url: "https://ciqual.anses.fr/#/aliments/13005" },
    igSource: "Université de Sydney",
    ...over,
  };
}
function nutrient(over = {}) {
  return { key: "glucose", label: "Glucose", emoji: "⚡", color: "#d4600a", unit: "g", isSugar: true, desc: "x", surprises: ["a", "b", "c", "d", "e", "f"], ...over };
}
const sixFoods = ["a", "b", "c", "d", "e", "f"].map((id) => food({ id, name: id.toUpperCase() }));

test("valid data has no problems", () => {
  assert.deepEqual(validateData({ foods: sixFoods, nutrients: [nutrient()] }), []);
});

test("bad id", () => assert.match(validateFood(food({ id: "Pomme Verte" }), 0).join(), /id must match/));
test("blocked emoji", () => assert.match(validateFood(food({ emoji: "🫀" }), 0).join(), /emoji/));
test("unknown category", () => assert.match(validateFood(food({ category: "x" }), 0).join(), /category/));
test("negative nutrient", () => assert.match(validateFood(food({ fibres: -1 }), 0).join(), /fibres/));
test("missing nutrient", () => assert.match(validateFood(food({ maltose: undefined }), 0).join(), /maltose/));
test("ig above 100", () => assert.match(validateFood(food({ ig: 101 }), 0).join(), /ig must be 0-100/));
test("sugars exceed glucides", () => assert.match(validateFood(food({ glucides: 5 }), 0).join(), /sugars .* exceed glucides/));
test("calories far from estimate", () => assert.match(validateFood(food({ calories: 300 }), 0).join(), /calories/));
test("calories check skipped under 20 kcal", () => assert.deepEqual(validateFood(food({ calories: 5, glucides: 0, glucose: 0, fructose: 0, saccharose: 0, maltose: 0 }), 0), []));
test("bad portion", () => assert.match(validateFood(food({ portion: { g: 0, label: "" } }), 0).join(), /portion/));
test("bad source url", () => assert.match(validateFood(food({ source: { name: "x", ref: "1", url: "http://x" } }), 0).join(), /source/));
test("igSource required when ig > 0", () => assert.match(validateFood(food({ igSource: undefined }), 0).join(), /igSource/));

test("duplicate ids and names", () => {
  const p = validateData({ foods: [food(), food()], nutrients: [] }).join("\n");
  assert.match(p, /duplicate id "pomme"/);
  assert.match(p, /duplicate name "Pomme"/);
});
test("foods must be sorted by id", () => {
  const p = validateData({ foods: [food({ id: "b", name: "B" }), food({ id: "a", name: "A" })], nutrients: [] }).join();
  assert.match(p, /sorted by id/);
});
test("surprise must be an existing food id with a non-zero value", () => {
  const foods = [...sixFoods, food({ id: "zero", name: "Zero", glucose: 0 })];
  const p = validateData({ foods, nutrients: [nutrient({ surprises: ["a", "b", "c", "d", "e", "nope"] }), nutrient({ key: "glucose", surprises: ["a", "b", "c", "d", "e", "zero"] })] }).join("\n");
  assert.match(p, /"nope" is not a food id/);
  assert.match(p, /"zero" has value 0/);
});
test("nutrient needs 6 surprises and a hex color", () => {
  const p = validateData({ foods: sixFoods, nutrients: [nutrient({ surprises: ["a"], color: "red" })] }).join("\n");
  assert.match(p, /at least 6 surprises/);
  assert.match(p, /hex color/);
});
