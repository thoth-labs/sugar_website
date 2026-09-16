#!/usr/bin/env node
// Insert one food into data/foods.json from a CIQUAL or USDA record, applying
// the project's data rules, then print what was written and the calorie check.
//
//   node .claude/skills/add-food/scripts/add-food.mjs \
//     --from usda:173021 --id figue-fraiche --name "Figue fraîche" --emoji 🍈 \
//     --category fruits --portion 50 "1 figue" [--ig 35] [--replace]
//
// Rules applied: values rounded to 0.1; missing sugars stored as 0 only when the
// record reports total sugars or is a meat/fish/fat with no carbs (otherwise the
// script refuses); `glucides` = carbs − fibre for USDA, never below the sugar sum;
// `alcool` stored when the record reports it; file kept sorted by id;
// `igSource` set to the indicative label when --ig > 0.
// Run `npm run validate` afterwards; it is the final gate.

import fs from "node:fs";
import path from "node:path";
import { loadDatasets, toFoodValues, sourceFor, completeness, REPO, SUGARS, CORE } from "./datasets.mjs";

const CATEGORIES = ["fruits", "legumes", "cereales", "proteines", "laitiers", "legumineuses", "oleagineux", "sucres", "boissons"];
const args = process.argv.slice(2);
const opt = (name, n = 1) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return null;
  return n === 1 ? args[i + 1] : args.slice(i + 1, i + 1 + n);
};
const from = opt("from"), id = opt("id"), name = opt("name"), emoji = opt("emoji"), category = opt("category");
const portion = opt("portion", 2);
const ig = Number(opt("ig") ?? 0);
const replace = args.includes("--replace");

const usage = () => {
  console.error('usage: add-food.mjs --from ciqual:<code>|usda:<fdcId> --id <slug> --name "<Nom>" --emoji <e> --category <cat> --portion <g> "<label>" [--ig N] [--replace]');
  process.exit(2);
};
if (!from || !id || !name || !emoji || !category || !portion || portion.length !== 2) usage();
const [dataset, code] = from.split(":");
if (!["ciqual", "usda"].includes(dataset) || !code) usage();
if (!/^[a-z0-9-]+$/.test(id)) { console.error(`id "${id}" must match ^[a-z0-9-]+$`); process.exit(2); }
if (!CATEGORIES.includes(category)) { console.error(`category must be one of ${CATEGORIES.join("|")}`); process.exit(2); }

const { ciqual, usda } = await loadDatasets();
const rec = (dataset === "ciqual" ? ciqual : usda).find((r) => String(r.code) === String(code));
if (!rec) { console.error(`${from}: no such record`); process.exit(1); }

const vals = toFoodValues(dataset, rec);
const c = completeness(vals);
if (c.core < 5) {
  console.error(`${from} "${rec.name}" lacks ${CORE.filter((k) => vals[k] == null).join(", ")}; pick another record (find-food.mjs shows completeness).`);
  process.exit(1);
}
// Sugars: never turn "not measured" into 0 unless the record itself shows there is nothing to measure.
const override = opt("sugars");
let sugars;
if (override) {
  sugars = override.split(",").map(Number);
  if (sugars.length !== 5 || sugars.some((n) => !Number.isFinite(n) || n < 0)) { console.error("--sugars needs five numbers: glucose,fructose,saccharose,lactose,maltose"); process.exit(2); }
  console.log("NOTE: sugar breakdown supplied by --sugars; say where it comes from in the commit body.");
} else {
  const known = SUGARS.reduce((s, k) => s + (vals[k] ?? 0), 0);
  const missing = SUGARS.filter((k) => vals[k] == null);
  const noCarbs = (vals.glucides ?? 0) === 0;
  const remainder = vals.sucres != null ? vals.sucres - known : null;
  if (missing.length && !noCarbs && (remainder == null || remainder > 0.5)) {
    console.error(
      `${from} "${rec.name}" does not itemise ${missing.join(", ")}` +
        (remainder != null ? ` and ${remainder.toFixed(1)} g of its ${vals.sucres} g total sugars is unaccounted for.` : " and reports no total sugars.") +
        `\nEither pick a record with a full breakdown (find-food.mjs shows [core/5 + sugars/5]) or pass --sugars g,f,s,l,m taken from a record of the same food that you cite in the commit body.`
    );
    process.exit(1);
  }
  sugars = SUGARS.map((k) => vals[k] ?? 0);
}

const food = { id, name, emoji, category, ig };
SUGARS.forEach((k, i) => (food[k] = sugars[i]));
food.glucides = vals.glucides;
food.proteines = vals.proteines;
food.lipides = vals.lipides;
food.fibres = vals.fibres;
food.calories = vals.calories;
if (vals.alcool > 0) food.alcool = vals.alcool;
food.portion = { g: Number(portion[0]), label: portion[1] };
food.source = sourceFor(dataset, rec);
if (ig > 0) food.igSource = "Tables publiques (valeur indicative)";

const file = path.join(REPO, "data", "foods.json");
const foods = JSON.parse(fs.readFileSync(file, "utf8"));
const existing = foods.findIndex((f) => f.id === id);
if (existing >= 0 && !replace) { console.error(`id "${id}" already exists (use --replace to overwrite)`); process.exit(1); }
if (existing >= 0) foods.splice(existing, 1);
foods.push(food);
foods.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
fs.writeFileSync(file, JSON.stringify(foods, null, 2) + "\n");

const est = 4 * food.proteines + 4 * food.glucides + 2 * food.fibres + 9 * food.lipides + 7 * (food.alcool ?? 0);
const sugSum = SUGARS.reduce((s, k) => s + food[k], 0);
console.log(`Added ${id} from ${dataset}:${rec.code} "${rec.name}"`);
console.log(JSON.stringify(food, null, 2));
console.log(`calories ${food.calories} vs estimate ${est.toFixed(0)} (${((100 * Math.abs(food.calories - est)) / Math.max(est, 1)).toFixed(0)} % off; validator allows 20 %)`);
console.log(`sugar sum ${sugSum.toFixed(1)} ≤ glucides ${food.glucides}${vals.sucres != null ? ` (source total sugars ${vals.sucres})` : ""}`);
console.log(`${foods.length} foods. Now run: npm run validate && npm test && npm run build`);
