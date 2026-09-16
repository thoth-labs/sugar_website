# NutriBase Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single-file NutriBase site into a data-driven static site with validated JSON data, per-food and per-nutrient pages, URL state, portion toggle, comparison, and accessible controls.

**Architecture:** Data lives in `data/*.json`, pure logic in `assets/lib.js` (shared by browser, build script and tests), DOM code in `assets/app.js`. A dependency-free Node build script generates static pages and the sitemap; generated files are committed and CI fails if they are stale.

**Tech Stack:** Vanilla ES modules in the browser, Node 22 built-ins (`node --test`, `fs`, `path`), GitHub Pages, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-16-nutribase-overhaul-design.md`

## Global Constraints

- Zero npm dependencies. Node ≥ 20 built-ins only.
- Static hosting on GitHub Pages from `main` root; no Pages settings change.
- French UI copy. Canonical unit is per 100 g.
- Existing look and feel is kept (colours, fonts, card layout).
- `glucides` uses the French (CIQUAL) convention: sugars + starch, **excluding** fibres. USDA "carbohydrate by difference" must have fibre subtracted before storing.
- Every food has a real `source` (CIQUAL 2020 or USDA FoodData Central). Values that cannot be sourced are not added.
- One commit per task, on branch `overhaul` (or an agent worktree branch that is merged into `overhaul`). Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Work in the repo root `C:\Users\Mohamed\IdeaProjects\sugar_website` (or the assigned worktree). Run commands with Node 22 (`node --version` → v22.x).
- `robots.txt` currently only lists explicit `Disallow` lines (no `Disallow: /`), so new public pages are crawlable by default. Any new non-page file (scripts, tests, docs, package.json) gets a `Disallow` line.

## Execution order

```
Task 1 → 2 → 3 → 4 → 5          (foundation, sequential, one agent at a time)
then in parallel, one agent each, in isolated worktrees:
  Data agent:   Task 6 → 7
  Build agent:  Task 8 → 9
  App agent:    Task 10 → 11 → 12 → 13
then Task 14 (integration) on `overhaul`.
```

File ownership during the parallel phase (no overlap):

| Agent | May modify |
|-------|-----------|
| Data  | `data/foods.json`, `data/nutrients.json`, `test/data.test.mjs` |
| Build | `scripts/build.mjs`, `scripts/template.mjs`, `assets/pages.css`, `test/build.test.mjs`, `package.json` (`build` script only), `.github/workflows/ci.yml`, `robots.txt`, generated files |
| App   | `assets/app.js`, `assets/lib.js`, `assets/styles.css`, `index.html`, `test/lib.test.mjs` |

---

## Task 1: Extract data into JSON

**Files:**
- Create: `data/foods.json`, `data/nutrients.json`, `data/config.json`, `package.json`, `test/data.test.mjs`
- Modify: `.gitignore`

**Interfaces:**
- Produces: `data/foods.json` — array of food objects, sorted by `id`, shape from spec §4 (keys: `id, name, emoji, category, ig, glucose, fructose, saccharose, lactose, maltose, glucides, proteines, lipides, fibres, calories, portion{g,label}, source{name,ref,url}, igSource?`).
- Produces: `data/nutrients.json` — array of `{key,label,emoji,color,unit,isSugar,desc,surprises:[foodId]}`.
- Produces: `data/config.json` — `{ "siteUrl": "https://sugar.thoth.fr", "siteName": "NutriBase", "plausibleDomain": null }`.
- Produces: `package.json` with `"type": "module"` and scripts `test`, `validate`, `build`.

- [ ] **Step 1: Create `package.json` and update `.gitignore`**

`package.json`:

```json
{
  "name": "nutribase",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "description": "Ce que contient vraiment votre assiette — sucres, macronutriments, index glycémique.",
  "scripts": {
    "test": "node --test",
    "validate": "node scripts/validate.mjs",
    "build": "node scripts/build.mjs"
  },
  "engines": { "node": ">=20" }
}
```

Append to `.gitignore`:

```
# Node
node_modules/

# Local scratch
.tmp/
```

- [ ] **Step 2: Write the failing data test**

`test/data.test.mjs`:

```js
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
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `ENOENT ... data/foods.json`.

- [ ] **Step 4: Write the one-off extraction script**

Save as `.tmp/extract.mjs` (ignored by git). It reads the two arrays out of `index.html`, adds `id`, `category`, `portion`, `source`, `igSource`, applies the two known data fixes, converts `surprises` to ids, and writes the JSON files.

```js
import fs from "node:fs";

const html = fs.readFileSync("index.html", "utf8");
function grab(name) {
  const start = html.indexOf(`const ${name} = [`);
  const end = html.indexOf("\n    ];", start);
  const src = html.slice(start + `const ${name} = `.length, end + "\n    ];".length);
  return new Function(`return ${src}`)();
}
const foods = grab("foods");
const nutrients = grab("nutrients");

const normalize = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/œ/g, "oe");
const slugify = (s) => normalize(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// category + portion, keyed by the exact original name
const meta = {
  "Pomme":            ["fruits", 150, "1 pomme moyenne"],
  "Banane":           ["fruits", 120, "1 banane"],
  "Raisin":           ["fruits", 100, "1 petite grappe"],
  "Fraise":           ["fruits", 125, "1 bol (10 fraises)"],
  "Orange":           ["fruits", 150, "1 orange"],
  "Mangue":           ["fruits", 200, "½ mangue"],
  "Cerise":           ["fruits", 100, "1 poignée (15 cerises)"],
  "Pastèque":         ["fruits", 250, "1 tranche"],
  "Poire":            ["fruits", 160, "1 poire"],
  "Pêche":            ["fruits", 150, "1 pêche"],
  "Myrtille":         ["fruits", 80,  "1 poignée"],
  "Avocat":           ["fruits", 100, "½ avocat"],
  "Ananas":           ["fruits", 120, "2 tranches"],
  "Kiwi":             ["fruits", 90,  "1 kiwi"],
  "Carotte":          ["legumes", 80, "1 carotte"],
  "Pomme de terre":   ["legumes", 150, "1 pomme de terre moyenne"],
  "Betterave":        ["legumes", 100, "1 petite betterave"],
  "Tomate":           ["legumes", 120, "1 tomate"],
  "Oignon":           ["legumes", 80, "1 oignon"],
  "Épinard":          ["legumes", 100, "1 portion cuite"],
  "Brocoli":          ["legumes", 150, "1 portion"],
  "Maïs (épi)":       ["legumes", 100, "1 épi"],
  "Pain blanc":       ["cereales", 40, "1 tranche épaisse"],
  "Pain complet":     ["cereales", 40, "1 tranche épaisse"],
  "Riz blanc cuit":   ["cereales", 150, "1 portion cuite"],
  "Pâtes cuites":     ["cereales", 150, "1 portion cuite"],
  "Avoine (flocons)": ["cereales", 40, "4 c. à soupe"],
  "Corn flakes":      ["cereales", 30, "1 bol"],
  "Quinoa cuit":      ["cereales", 150, "1 portion cuite"],
  "Poulet (blanc)":   ["proteines", 120, "1 blanc"],
  "Saumon":           ["proteines", 120, "1 pavé"],
  "Thon (boîte)":     ["proteines", 70, "½ boîte"],
  "Œuf entier":       ["proteines", 55, "1 œuf"],
  "Bœuf (maigre)":    ["proteines", 120, "1 steak"],
  "Lait entier":      ["laitiers", 200, "1 verre"],
  "Yaourt nature":    ["laitiers", 125, "1 pot"],
  "Fromage blanc":    ["laitiers", 100, "1 pot"],
  "Emmental":         ["laitiers", 30, "1 portion"],
  "Beurre":           ["laitiers", 10, "1 noix"],
  "Lait de soja":     ["boissons", 200, "1 verre"],
  "Lentilles":        ["legumineuses", 150, "1 portion cuite"],
  "Pois chiches":     ["legumineuses", 150, "1 portion cuite"],
  "Haricots rouges":  ["legumineuses", 150, "1 portion cuite"],
  "Soja":             ["legumineuses", 100, "1 portion"],
  "Amandes":          ["oleagineux", 30, "1 poignée"],
  "Noix":             ["oleagineux", 30, "1 poignée"],
  "Graines de chia":  ["oleagineux", 15, "1 c. à soupe"],
  "Sucre blanc":      ["sucres", 5, "1 morceau"],
  "Miel":             ["sucres", 20, "1 c. à soupe"],
  "Chocolat noir 70%":["sucres", 20, "2 carrés"],
  "Chocolat au lait": ["sucres", 20, "2 carrés"],
  "Confiture":        ["sucres", 20, "1 c. à soupe"],
  "Miel d'acacia":    ["sucres", 20, "1 c. à soupe"],
  "Dattes":           ["fruits", 24, "3 dattes"],
  "Sirop d'érable":   ["sucres", 20, "1 c. à soupe"],
  "Jus d'orange":     ["boissons", 200, "1 verre"],
  "Soda (cola)":      ["boissons", 330, "1 canette"],
  "Eau":              ["boissons", 250, "1 grand verre"],
  "Thé vert":         ["boissons", 250, "1 tasse"],
};

const out = foods.map((f) => {
  const [category, g, label] = meta[f.name];
  const food = {
    id: slugify(f.name), name: f.name, emoji: f.emoji, category,
    ig: f.ig, glucose: f.glucose, fructose: f.fructose, saccharose: f.saccharose, lactose: f.lactose, maltose: f.maltose,
    glucides: f.glucides, proteines: f.proteines, lipides: f.lipides, fibres: f.fibres, calories: f.calories,
    portion: { g, label },
    source: { name: "À vérifier", ref: "index.html initial", url: "https://ciqual.anses.fr/" },
  };
  if (f.ig > 0) food.igSource = "À vérifier";
  return food;
});

// Known data fixes (spec §7). Yaourt nature was listed with Greek-yogurt protein.
const yaourt = out.find((f) => f.id === "yaourt-nature");
Object.assign(yaourt, { glucose: 0.2, fructose: 0.1, saccharose: 0.1, lactose: 4.0, maltose: 0, glucides: 4.5, proteines: 3.7, lipides: 3.2, fibres: 0, calories: 60 });
out.find((f) => f.id === "betterave").emoji = "🫜";

out.sort((a, b) => (a.id < b.id ? -1 : 1));
const nameToId = new Map(out.map((f) => [f.name, f.id]));
const nutOut = nutrients.map((n) => ({ ...n, surprises: n.surprises.map((name) => nameToId.get(name)) }));

fs.mkdirSync("data", { recursive: true });
fs.writeFileSync("data/foods.json", JSON.stringify(out, null, 2) + "\n");
fs.writeFileSync("data/nutrients.json", JSON.stringify(nutOut, null, 2) + "\n");
fs.writeFileSync("data/config.json", JSON.stringify({ siteUrl: "https://sugar.thoth.fr", siteName: "NutriBase", plausibleDomain: null }, null, 2) + "\n");
console.log(out.length, "foods,", nutOut.length, "nutrients");
```

- [ ] **Step 5: Run the extraction**

Run: `mkdir -p .tmp && node .tmp/extract.mjs`
Expected: `59 foods, 11 nutrients`. Open `data/foods.json` and confirm the first entry is `amandes` and every `surprises` entry in `data/nutrients.json` is a slug (no `undefined`).

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm test`
Expected: 4 tests pass.

- [ ] **Step 7: Commit**

```bash
git add package.json .gitignore data test/data.test.mjs
git commit -m "Extract food and nutrient data into JSON

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 2: Data validator

**Files:**
- Create: `scripts/validate.mjs`, `test/validate.test.mjs`

**Interfaces:**
- Consumes: `data/foods.json`, `data/nutrients.json` (Task 1).
- Produces: `export function validateData({ foods, nutrients }): string[]` (empty array = valid), `export function validateFood(food, index): string[]`, `export const CATEGORIES`, `export const NUTRIENT_KEYS`, `export const SUGAR_KEYS`. CLI: `node scripts/validate.mjs` prints problems and exits 1 if any.

- [ ] **Step 1: Write the failing validator tests**

`test/validate.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find module `scripts/validate.mjs`.

- [ ] **Step 3: Implement `scripts/validate.mjs`**

```js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CATEGORIES = ["fruits", "legumes", "cereales", "proteines", "laitiers", "legumineuses", "oleagineux", "sucres", "boissons"];
export const SUGAR_KEYS = ["glucose", "fructose", "saccharose", "lactose", "maltose"];
export const NUTRIENT_KEYS = ["ig", ...SUGAR_KEYS, "glucides", "proteines", "lipides", "fibres", "calories"];
const EMOJI_BLOCKLIST = ["🫀"];
const ID_RE = /^[a-z0-9-]+$/;
const HEX_RE = /^#[0-9a-f]{6}$/i;

const isNum = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;
const isStr = (v) => typeof v === "string" && v.trim().length > 0;

export function validateFood(f, i) {
  const p = [];
  const tag = `foods[${i}] (${f?.id ?? f?.name ?? "?"})`;
  if (!f || typeof f !== "object") return [`${tag}: not an object`];
  if (!isStr(f.id) || !ID_RE.test(f.id)) p.push(`${tag}: id must match ${ID_RE}`);
  if (!isStr(f.name)) p.push(`${tag}: name missing`);
  if (!isStr(f.emoji) || EMOJI_BLOCKLIST.includes(f.emoji)) p.push(`${tag}: emoji missing or blocked`);
  if (!CATEGORIES.includes(f.category)) p.push(`${tag}: category "${f.category}" not in ${CATEGORIES.join("|")}`);
  for (const k of NUTRIENT_KEYS) if (!isNum(f[k])) p.push(`${tag}: ${k} must be a finite number >= 0`);
  if (isNum(f.ig) && f.ig > 100) p.push(`${tag}: ig must be 0-100`);
  if (NUTRIENT_KEYS.every((k) => isNum(f[k]))) {
    const sugars = SUGAR_KEYS.reduce((s, k) => s + f[k], 0);
    if (sugars > f.glucides + 0.5) p.push(`${tag}: sugars ${sugars.toFixed(1)} exceed glucides ${f.glucides}`);
    const est = 4 * f.proteines + 4 * f.glucides + 2 * f.fibres + 9 * f.lipides;
    if (f.calories >= 20 && Math.abs(f.calories - est) > 0.2 * est) p.push(`${tag}: calories ${f.calories} differ >20% from estimate ${est.toFixed(0)}`);
  }
  if (!f.portion || !isNum(f.portion.g) || f.portion.g < 1 || f.portion.g > 1000 || !isStr(f.portion.label)) p.push(`${tag}: portion must be {g: 1-1000, label}`);
  if (!f.source || !isStr(f.source.name) || !isStr(f.source.ref) || !isStr(f.source.url) || !f.source.url.startsWith("https://")) p.push(`${tag}: source must be {name, ref, url starting with https://}`);
  if (isNum(f.ig) && f.ig > 0 && !isStr(f.igSource)) p.push(`${tag}: igSource required when ig > 0`);
  return p;
}

export function validateData({ foods, nutrients }) {
  if (!Array.isArray(foods) || !Array.isArray(nutrients)) return ["foods and nutrients must be arrays"];
  const p = [];
  foods.forEach((f, i) => p.push(...validateFood(f, i)));
  const count = (arr) => arr.reduce((m, v) => m.set(v, (m.get(v) || 0) + 1), new Map());
  for (const [id, c] of count(foods.map((f) => f?.id))) if (c > 1) p.push(`duplicate id "${id}"`);
  for (const [n, c] of count(foods.map((f) => f?.name))) if (c > 1) p.push(`duplicate name "${n}"`);
  const ids = foods.map((f) => f?.id);
  if (ids.join("\n") !== [...ids].sort().join("\n")) p.push("foods must be sorted by id");
  const byId = new Map(foods.map((f) => [f?.id, f]));
  for (const n of nutrients) {
    const tag = `nutrient "${n?.key}"`;
    if (!isStr(n?.key) || !isStr(n.label) || !isStr(n.emoji) || !isStr(n.unit) || typeof n.isSugar !== "boolean" || !isStr(n.desc)) p.push(`${tag}: key, label, emoji, unit, isSugar, desc required`);
    if (!HEX_RE.test(n?.color ?? "")) p.push(`${tag}: color must be a 6-digit hex color`);
    if (!Array.isArray(n?.surprises) || n.surprises.length < 6) p.push(`${tag}: needs at least 6 surprises`);
    for (const id of n?.surprises ?? []) {
      const f = byId.get(id);
      if (!f) p.push(`${tag}: surprise "${id}" is not a food id`);
      else if (!(f[n.key] > 0)) p.push(`${tag}: surprise "${id}" has value 0`);
    }
  }
  return p;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const read = (f) => JSON.parse(fs.readFileSync(path.join(root, "data", f), "utf8"));
  const foods = read("foods.json");
  const nutrients = read("nutrients.json");
  const problems = validateData({ foods, nutrients });
  const unverified = foods.filter((f) => f?.source?.name === "À vérifier").length;
  for (const m of problems) console.error("✗ " + m);
  console.log(`${foods.length} aliments, ${nutrients.length} nutriments, ${problems.length} problème(s), ${unverified} source(s) à vérifier`);
  process.exit(problems.length ? 1 : 0);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 5: Run the validator on the real data and fix any violation**

Run: `npm run validate`
Expected: `59 aliments, 11 nutriments, 0 problème(s), 59 source(s) à vérifier`, exit 0.

If a food fails the calories or sugars rule, the number in `data/foods.json` is wrong; correct it to a coherent value (keep the change minimal, note it in the commit body). Foods whose calories are ~20 % off with USDA-style carbs (e.g. `graines-de-chia`) will be re-sourced in Task 6; only fix here if the validator fails.

- [ ] **Step 6: Commit**

```bash
git add scripts/validate.mjs test/validate.test.mjs data
git commit -m "Add data validator with tests

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 3: Split index.html into CSS, lib and app modules

**Files:**
- Create: `assets/styles.css`, `assets/lib.js`, `assets/app.js`, `test/lib.test.mjs`
- Modify: `index.html` (full rewrite of the shell)

**Interfaces:**
- Consumes: `data/foods.json`, `data/nutrients.json`.
- Produces (`assets/lib.js`, all pure):
  - `SUGAR_KEYS: string[]`, `NUTRIENT_KEYS: string[]`
  - `normalize(str): string` — lowercase, diacritics stripped, `œ`→`oe`
  - `slugify(str): string`
  - `filterFoods(foods, query): Food[]`
  - `sortFoods(foods, key, dir: "asc"|"desc"): Food[]`
  - `totalSugars(food): number`
  - `valueOf(food, key): number` — `key === "sucres"` returns `totalSugars`
  - `otherNutrients(nutrients, currentKey): Nutrient[]` — sugar tab → the 6 macros; macro tab → other 5 macros + synthetic `{key:"sucres",label:"Sucres totaux",emoji:"🍭",unit:"g",color:"#b91c1c",isSugar:false}`
  - `scale(food, unit: "100g"|"portion"): Food` — copy with nutrient values (not `ig`) × `portion.g/100`, rounded to 0.1
- Produces (`assets/app.js`): a module-level `state = { n, sort, q }`; functions `renderAll, renderTabs, renderBanner, renderPills, renderGrid, selectTab`. Tabs are `<button role="tab">`, sort pills `<button aria-pressed>`.

- [ ] **Step 1: Write the failing lib tests**

`test/lib.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find module `assets/lib.js`.

- [ ] **Step 3: Implement `assets/lib.js`**

```js
export const SUGAR_KEYS = ["glucose", "fructose", "saccharose", "lactose", "maltose"];
export const NUTRIENT_KEYS = ["ig", ...SUGAR_KEYS, "glucides", "proteines", "lipides", "fibres", "calories"];

export const SUCRES_NUTRIENT = { key: "sucres", label: "Sucres totaux", emoji: "🍭", unit: "g", color: "#b91c1c", isSugar: false, desc: "", surprises: [] };

export function normalize(str) {
  return String(str).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/œ/g, "oe").replace(/æ/g, "ae");
}

export function slugify(str) {
  return normalize(str).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function filterFoods(foods, query) {
  const q = normalize(query || "").trim();
  return q ? foods.filter((f) => normalize(f.name).includes(q)) : [...foods];
}

export function sortFoods(foods, key, dir) {
  const sign = dir === "asc" ? 1 : -1;
  return [...foods].sort((a, b) => sign * (valueOf(a, key) - valueOf(b, key)));
}

export function totalSugars(food) {
  return SUGAR_KEYS.reduce((s, k) => s + food[k], 0);
}

export function valueOf(food, key) {
  return key === "sucres" ? totalSugars(food) : food[key];
}

export function otherNutrients(nutrients, currentKey) {
  const macros = nutrients.filter((n) => !n.isSugar);
  const cur = nutrients.find((n) => n.key === currentKey);
  if (!cur || cur.isSugar) return macros;
  return [...macros.filter((n) => n.key !== currentKey), SUCRES_NUTRIENT];
}

export function scale(food, unit) {
  if (unit !== "portion") return { ...food };
  const k = food.portion.g / 100;
  const out = { ...food };
  for (const key of NUTRIENT_KEYS) {
    if (key === "ig") continue;
    out[key] = Math.round(food[key] * k * 10) / 10;
  }
  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 5: Move the CSS to `assets/styles.css`**

Copy everything between `<style>` and `</style>` in `index.html` (lines 9–114) into `assets/styles.css`, unchanged, then make these edits inside the new file:

1. Replace the `.tab{...}` rule with:
   ```css
   .tab{display:flex;align-items:center;gap:7px;padding:14px 18px;cursor:pointer;background:none;border:0;border-bottom:3px solid transparent;white-space:nowrap;font-family:inherit;font-size:0.82rem;font-weight:500;color:var(--muted);transition:all 0.2s;flex-shrink:0;}
   ```
2. Replace the `.sort-pill{...}` rule with:
   ```css
   .sort-pill{padding:7px 13px;border-radius:20px;border:1.5px solid #ddeee4;background:var(--white);font-family:inherit;font-size:0.76rem;font-weight:500;color:var(--muted);cursor:pointer;white-space:nowrap;transition:all 0.15s;}
   ```
3. Delete the unused `.tab-group-label{...}` rule and remove `.tab-group-label` from the `@media(max-width:600px)` block.
4. Append:
   ```css
   .tab:focus-visible,.sort-pill:focus-visible,.search-wrap input:focus-visible{outline:3px solid var(--tab-color,var(--pill-color,var(--green-light)));outline-offset:2px;}
   .visually-hidden{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;}
   ```

- [ ] **Step 6: Write `assets/app.js`**

```js
import { filterFoods, sortFoods, otherNutrients, valueOf } from "./lib.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let foods = [];
let nutrients = [];
const state = { n: "", sort: "desc", q: "" };
const current = () => nutrients.find((n) => n.key === state.n);

function tabHTML(n) {
  const active = n.key === state.n;
  return `<button class="tab${active ? " active" : ""}" role="tab" aria-selected="${active}" tabindex="${active ? 0 : -1}" data-key="${n.key}" style="--tab-color:${n.color}"><span class="tab-dot"></span>${n.emoji} ${esc(n.label)}</button>`;
}

function renderTabs() {
  const sugar = nutrients.filter((n) => n.isSugar);
  const macro = nutrients.filter((n) => !n.isSugar);
  $("tabs").innerHTML =
    `<span class="tab-section-label">🍭 Types de sucres</span>` + sugar.map(tabHTML).join("") +
    `<div class="tab-separator"></div>` +
    `<span class="tab-section-label">📊 Macronutriments</span>` + macro.map(tabHTML).join("");
  $("tabs").querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => selectTab(t.dataset.key)));
}

function selectTab(key) {
  state.n = key;
  state.sort = "desc";
  renderAll();
}

function renderBanner() {
  const n = current();
  const vals = foods.map((f) => f[n.key]).filter((v) => v > 0);
  const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : "0";
  $("banner").innerHTML = `
    <div class="nb-icon" style="background:${n.color}20">${n.emoji}</div>
    <div style="flex:1">
      <div class="nb-title" style="color:${n.color}">${esc(n.label)}</div>
      <div class="nb-desc">${esc(n.desc)}</div>
    </div>
    <div class="nb-right">
      <div class="nb-stat-val" style="color:${n.color}">${avg}</div>
      <div class="nb-stat-lbl">${n.unit} en moyenne (pour 100 g)</div>
    </div>`;
}

function renderPills() {
  const n = current();
  const pill = (dir, label) => `<button class="sort-pill${state.sort === dir ? " active" : ""}" aria-pressed="${state.sort === dir}" data-sort="${dir}" style="--pill-color:${n.color}">${label}</button>`;
  $("sortPills").innerHTML = pill("desc", "↓ Plus riche") + pill("asc", "↑ Moins riche");
  $("sortPills").querySelectorAll("[data-sort]").forEach((p) => p.addEventListener("click", () => {
    state.sort = p.dataset.sort;
    renderPills();
    renderGrid();
  }));
}

function sugarChipsHTML(f, n) {
  const sugars = nutrients.filter((x) => x.isSugar);
  const total = sugars.reduce((s, x) => s + f[x.key], 0);
  return `<div class="sugar-breakdown">` + sugars.map((x) => {
    const v = f[x.key];
    if (v === 0) return "";
    const pct = total > 0 ? Math.round((v / total) * 100) : 0;
    const active = x.key === n.key;
    return `<div class="sugar-chip" style="background:${x.color}${active ? "22" : "11"};color:${x.color};border-color:${x.color}${active ? "55" : "22"};font-weight:${active ? "700" : "500"}">${esc(x.label)} ${v.toFixed(1)}g <span style="opacity:0.6">(${pct}%)</span></div>`;
  }).join("") + `</div>`;
}

function cardHTML(f, i, n, maxVal, others) {
  const val = f[n.key];
  const pct = maxVal > 0 ? Math.round((val / maxVal) * 100) : 0;
  const surprise = n.surprises.includes(f.id) && val > 0;
  return `<article class="card" style="animation-delay:${Math.min(i * 0.025, 0.5)}s">
    <div class="card-top">
      <div class="food-emoji">${f.emoji}</div>
      <div><div class="food-name">${esc(f.name)}</div><div class="food-sub">pour 100g</div></div>
    </div>
    <div class="primary-block" style="background:${n.color}12;color:${n.color}">
      <div class="pb-top">
        <div class="pb-label">${n.emoji} ${esc(n.label)}</div>
        <div class="pb-value">${val.toFixed(1)}<span class="pb-unit"> ${n.unit}</span></div>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${n.color}"></div></div>
      <div class="bar-pct">${pct}% du maximum</div>
    </div>
    ${surprise ? `<div class="surprise">⚠️ Plus que vous ne le croyez !</div>` : ""}
    ${n.isSugar ? sugarChipsHTML(f, n) : ""}
    <div class="others">
      ${others.map((o) => `<div class="ot"><div class="ot-name">${o.emoji} ${esc(o.label.split(" ")[0])}</div><div class="ot-val">${valueOf(f, o.key).toFixed(1)}<span class="ot-unit"> ${o.unit}</span></div></div>`).join("")}
    </div>
  </article>`;
}

function renderGrid() {
  const n = current();
  const data = sortFoods(filterFoods(foods, state.q), n.key, state.sort);
  const maxVal = Math.max(...foods.map((f) => f[n.key]));
  const others = otherNutrients(nutrients, n.key);
  $("grid").innerHTML = data.length
    ? data.map((f, i) => cardHTML(f, i, n, maxVal, others)).join("")
    : `<div class="empty"><div class="empty-icon">🔍</div><h3>Aucun aliment trouvé</h3></div>`;
}

function renderAll() {
  renderTabs();
  renderBanner();
  renderPills();
  renderGrid();
}

async function main() {
  const [f, n] = await Promise.all([
    fetch("data/foods.json").then((r) => r.json()),
    fetch("data/nutrients.json").then((r) => r.json()),
  ]);
  foods = f;
  nutrients = n;
  state.n = nutrients[0].key;
  $("searchInput").addEventListener("input", (e) => {
    state.q = e.target.value;
    renderGrid();
  });
  renderAll();
}

main();
```

- [ ] **Step 7: Rewrite `index.html` as a shell**

Replace the whole file with:

```html
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>NutriBase — Ce que contient vraiment votre assiette</title>
    <meta name="description" content="Classez les aliments par glucose, fructose, saccharose, lactose, maltose, glucides, protéines, lipides, fibres, calories et index glycémique. Valeurs pour 100 g, sources CIQUAL et USDA.">
    <link rel="canonical" href="https://sugar.thoth.fr/">
    <meta property="og:type" content="website">
    <meta property="og:title" content="NutriBase — Ce que contient vraiment votre assiette">
    <meta property="og:description" content="Types de sucres, macronutriments et index glycémique de 60+ aliments, classés et comparés.">
    <meta property="og:url" content="https://sugar.thoth.fr/">
    <meta property="og:site_name" content="NutriBase">
    <meta property="og:locale" content="fr_FR">
    <meta name="twitter:card" content="summary">
    <link rel="icon" href="favicon.svg" type="image/svg+xml">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="assets/styles.css">
</head>
<body>

<header>
    <div class="logo">Nutri<em>Base</em></div>
    <div class="header-sub">Tout aliment contient tout — voyons combien</div>
</header>

<div class="hero">
    <h1>Ce que contient <em>vraiment</em> votre assiette</h1>
    <p>Nutriments, types de sucres, index glycémique — classez tout, découvrez les surprises.</p>
    <div class="hero-examples">
        <div class="hero-pill">🍞 <strong>Pain blanc</strong> contient du glucose</div>
        <div class="hero-pill">🍎 <strong>Pomme</strong> riche en fructose</div>
        <div class="hero-pill">🥛 <strong>Lait</strong> contient du lactose</div>
        <div class="hero-pill">🍺 <strong>Bière</strong> contient du maltose</div>
    </div>
</div>

<div class="tabs-wrap">
    <div class="tabs" id="tabs" role="tablist" aria-label="Nutriment affiché"></div>
</div>
<div class="nutrient-banner" id="banner"></div>
<div class="controls">
    <div class="search-wrap">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
        <input type="search" id="searchInput" placeholder="Rechercher un aliment…" aria-label="Rechercher un aliment" autocomplete="off">
    </div>
    <div class="sort-pills" id="sortPills" role="group" aria-label="Tri"></div>
</div>
<div class="grid-container" id="grid"></div>
<footer>NutriBase · Valeurs pour 100g · Sources : CIQUAL (ANSES), USDA · IG : Université de Sydney</footer>

<script type="module" src="assets/app.js"></script>
</body>
</html>
```

- [ ] **Step 8: Add `favicon.svg`**

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#1a3a2a"/><text x="32" y="44" font-size="36" text-anchor="middle">🍬</text></svg>
```

- [ ] **Step 9: Smoke-test in a browser**

Run in the background: `python -m http.server 8000` (from the repo root), then open `http://localhost:8000/`. If the Playwright MCP tools are available, use `browser_navigate` + `browser_snapshot`; otherwise use a real browser. Verify:
- 59 cards render on the Glucose tab, banner shows the description.
- Clicking "Fibres" switches tab, the bottom mini-grid of a card shows Glucides, Protéines, Lipides, Calories, Index, Sucres (no repeated sugar chips).
- Typing `epinard` in the search shows Épinard.
- Tab key reaches the tabs and pills; Enter activates them.
- Browser console has no errors.

Stop the server afterwards.

- [ ] **Step 10: Run all tests and commit**

Run: `npm test && npm run validate`
Expected: all pass.

```bash
git add index.html assets favicon.svg test/lib.test.mjs
git commit -m "Split site into CSS, lib and app modules loading JSON data

Fix accent-insensitive search and redundant sugar mini-grid on sugar tabs.
Tabs and sort controls are now real buttons.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 4: README, LICENSE, robots and CI

**Files:**
- Create: `README.md`, `LICENSE`, `.github/workflows/ci.yml`
- Modify: `robots.txt`

**Interfaces:**
- Consumes: `npm test`, `npm run validate` (Tasks 1–3).
- Produces: a CI workflow named `CI` with job `check`; Task 9 adds the build and staleness steps to it.

- [ ] **Step 1: Write `LICENSE` (MIT)**

```
MIT License

Copyright (c) 2026 Mohamed Ait Abderrahman

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 2: Write `README.md`**

```markdown
# NutriBase

Ce que contient vraiment votre assiette : types de sucres (glucose, fructose,
saccharose, lactose, maltose), macronutriments, calories et index glycémique
de chaque aliment, pour 100 g. En ligne sur https://sugar.thoth.fr.

## Développement

Aucune dépendance. Node ≥ 20.

```
npm test          # tests unitaires (node --test)
npm run validate  # vérifie data/foods.json et data/nutrients.json
npm run build     # régénère les pages aliment/, nutriment/, comprendre.html, sitemap.xml
python -m http.server 8000   # prévisualiser sur http://localhost:8000
```

## Ajouter un aliment

1. Ajouter une entrée dans `data/foods.json` (trié par `id`). Chaque aliment
   doit citer sa source (`source.name`, `source.ref`, `source.url`) — CIQUAL
   2020 ou USDA FoodData Central — et une portion usuelle.
2. `glucides` suit la convention française : sucres + amidon, **sans** les fibres.
3. `npm run validate` puis `npm run build`, et committer les fichiers générés.

## Structure

- `index.html`, `assets/` — application (ES modules, sans framework)
- `data/` — données et configuration
- `scripts/` — validateur et générateur de pages
- `test/` — tests
- Pages générées : `aliment/<id>/`, `nutriment/<clé>/`, `comprendre.html`, `sitemap.xml`

## Sources

CIQUAL 2020 (ANSES), USDA FoodData Central, index glycémique : Université de Sydney.

Licence MIT.
```

- [ ] **Step 3: Update `robots.txt`**

Replace the file with:

```
User-agent: *
Disallow: /CLAUDE.md
Disallow: /CNAME
Disallow: /README.md
Disallow: /LICENSE
Disallow: /package.json
Disallow: /.gitignore
Disallow: /.nojekyll
Disallow: /.claude/
Disallow: /.github/
Disallow: /docs/
Disallow: /scripts/
Disallow: /test/

Sitemap: https://sugar.thoth.fr/sitemap.xml
```

(`/assets/` and `/data/` stay crawlable so Google can render the app.)

- [ ] **Step 4: Write `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  push:
  pull_request:
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm run validate
      - run: npm test
```

- [ ] **Step 5: Verify locally and commit**

Run: `npm run validate && npm test`
Expected: pass.

```bash
git add README.md LICENSE robots.txt .github/workflows/ci.yml
git commit -m "Add README, MIT license, CI workflow and crawler rules

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 5: Push the foundation and fan out

**Files:** none.

- [ ] **Step 1: Push `overhaul`**

```bash
git push -u origin overhaul
```

Expected: the `CI` workflow runs green on GitHub (`gh run list --branch overhaul` shows `completed success`). If it fails, fix on `overhaul` before fanning out.

- [ ] **Step 2: Start the three parallel agents**

Dispatch the Data agent (Tasks 6–7), Build agent (Tasks 8–9) and App agent (Tasks 10–13), each in its own worktree branched from `overhaul` HEAD, each restricted to the file ownership table above.

---

## Task 6: Source and verify the existing 59 foods

**Owner:** Data agent. **Files:** Modify `data/foods.json` only.

**Interfaces:**
- Consumes: the food shape from Task 1; `npm run validate`.
- Produces: every food has `source.name` ∈ {`CIQUAL 2020`, `USDA FoodData Central`}, a real `source.ref` and `source.url`, `igSource` when `ig > 0`, and values re-checked against the source. Zero `source(s) à vérifier`.

- [ ] **Step 1: Get a machine-readable primary source**

Prefer CIQUAL 2020 (French foods, French carb convention). Try, in order:

1. CIQUAL XML/CSV table: open https://ciqual.anses.fr/#/cms/download/node/20 (use `WebFetch`, the firecrawl scrape skill, or the Playwright browser tools) and download the "Table Ciqual 2020 — FR" XML zip into `.tmp/ciqual/`. Extract with `tar -xf` (Windows bsdtar reads zip) or `Expand-Archive`. The files are `alim_2020_07_07.xml` (foods: `alim_code`, `alim_nom_fr`), `const_2020_07_07.xml` (constituents: `const_code`, `const_nom_fr`) and `compo_2020_07_07.xml` (values: `alim_code`, `const_code`, `teneur`). Inspect the constituents file for the exact labels; they look like `Energie, Règlement UE N° 1169/2011 (kcal/100 g)`, `Protéines, N x 6.25 (g/100 g)`, `Glucides (g/100 g)`, `Lipides (g/100 g)`, `Fibres alimentaires (g/100 g)`, `Sucres (g/100 g)`, `Glucose (g/100 g)`, `Fructose (g/100 g)`, `Saccharose (g/100 g)`, `Lactose (g/100 g)`, `Maltose (g/100 g)`. Values use a comma decimal separator and may be `-` (missing), `traces`, or `< 0.5` (treat `traces` and `< x` as 0).
2. If CIQUAL is not downloadable, use USDA SR Legacy CSV from https://fdc.nal.usda.gov/download-datasets (file `FoodData_Central_sr_legacy_food_csv_2018-04.zip`, ~30 MB). `food.csv` has `fdc_id, description`; `food_nutrient.csv` has `fdc_id, nutrient_id, amount`. Nutrient ids: 1008 energy kcal, 1003 protein, 1004 fat, 1005 carbohydrate by difference, 1079 fiber, 1010 sucrose, 1011 glucose, 1012 fructose, 1013 lactose, 1014 maltose. Store `glucides = carbohydrate − fiber` (rounded to 0.1, never below the sugar sum).

Write a lookup helper `.tmp/lookup.mjs` (not committed) that loads the table once and prints, for a search string, the matching food names with their code and the eleven values in the JSON shape, so each food is one command: `node .tmp/lookup.mjs "pomme"`.

A minimal CSV parser for USDA files (handles quoted commas):

```js
export function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}
```

- [ ] **Step 2: Update each of the 59 foods**

For each entry in `data/foods.json`, pick the closest source food (e.g. `Pomme, pulpe et peau, crue` for `pomme`; `Pain, baguette, courante` is *not* `pain-blanc` — use `Pain de mie` or `Pain blanc` entries as appropriate) and:

- set the eleven numeric values from the source, rounded to 0.1 (`ig` stays as is unless a Sydney value is found);
- set `source` to `{ "name": "CIQUAL 2020", "ref": "<alim_code>", "url": "https://ciqual.anses.fr/#/aliments/<alim_code>/<slug-of-alim_nom_fr>" }` or `{ "name": "USDA FoodData Central", "ref": "<fdc_id>", "url": "https://fdc.nal.usda.gov/food-details/<fdc_id>/nutrients" }`;
- when a sugar breakdown is missing at the source but total sugars is present, distribute total sugars using the ratios already in the file and note it in the commit body (`source.ref` still points to the real record);
- set `igSource` to `"Université de Sydney (glycemicindex.com)"` when the value was checked at https://glycemicindex.com/gi-search/, otherwise `"Tables publiques (valeur indicative)"`;
- keep `id`, `name`, `emoji`, `category`, `portion` unchanged.

Do this in batches of ~10 foods and run `npm run validate` after each batch; fix violations before continuing.

- [ ] **Step 3: Validate and test**

Run: `npm run validate && npm test`
Expected: `59 aliments, 11 nutriments, 0 problème(s), 0 source(s) à vérifier`.

- [ ] **Step 4: Commit**

```bash
git add data/foods.json
git commit -m "Source and re-check all 59 foods against CIQUAL/USDA

<one line per notable value change, e.g. 'graines-de-chia: glucides now excludes fibres'>

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 7: Grow the database to ~100 foods

**Owner:** Data agent. **Files:** Modify `data/foods.json`, `data/nutrients.json`.

**Interfaces:**
- Consumes: the lookup helper from Task 6.
- Produces: ≥ 100 foods, every `surprises` list reviewed.

- [ ] **Step 1: Add the new foods**

Add these foods (skip any with no source record; add close substitutes from the source if a name differs) with `id` = slugified name, sensible `category`, `portion` and the same sourcing rules as Task 6. Keep the file sorted by `id`.

| Nom | category | portion |
|-----|----------|---------|
| Baguette | cereales | 50 g, "⅕ baguette" |
| Croissant | cereales | 45 g, "1 croissant" |
| Bière blonde | boissons | 250 g, "1 demi" |
| Vin rouge | boissons | 125 g, "1 verre" |
| Fromage de chèvre | laitiers | 30 g, "1 portion" |
| Camembert | laitiers | 30 g, "1 portion" |
| Lait demi-écrémé | laitiers | 200 g, "1 verre" |
| Lait d'amande | boissons | 200 g, "1 verre" |
| Crème dessert chocolat | laitiers | 125 g, "1 pot" |
| Glace vanille | sucres | 70 g, "1 boule" |
| Compote de pomme | fruits | 100 g, "1 pot" |
| Jus de pomme | boissons | 200 g, "1 verre" |
| Pain d'épices | sucres | 30 g, "1 tranche" |
| Biscuit sec (petit-beurre) | sucres | 25 g, "3 biscuits" |
| Muesli | cereales | 45 g, "1 bol" |
| Riz complet cuit | cereales | 150 g, "1 portion cuite" |
| Frites | legumes | 130 g, "1 portion" |
| Purée de pommes de terre | legumes | 200 g, "1 portion" |
| Pizza margherita | cereales | 150 g, "½ pizza" |
| Ketchup | sucres | 15 g, "1 c. à soupe" |
| Sauce tomate | legumes | 100 g, "1 louche" |
| Raisins secs | fruits | 30 g, "1 poignée" |
| Figue sèche | fruits | 20 g, "1 figue" |
| Abricot sec | fruits | 24 g, "3 abricots" |
| Abricot | fruits | 45 g, "1 abricot" |
| Prune | fruits | 55 g, "1 prune" |
| Figue fraîche | fruits | 50 g, "1 figue" |
| Melon | fruits | 150 g, "1 tranche" |
| Clémentine | fruits | 60 g, "1 clémentine" |
| Pamplemousse | fruits | 150 g, "½ pamplemousse" |
| Citron | fruits | 30 g, "½ citron" |
| Framboise | fruits | 80 g, "1 poignée" |
| Grenade | fruits | 100 g, "½ grenade" |
| Petits pois | legumes | 100 g, "1 portion" |
| Courgette | legumes | 150 g, "1 portion" |
| Poivron | legumes | 100 g, "1 poivron" |
| Chou-fleur | legumes | 150 g, "1 portion" |
| Haricots verts | legumes | 150 g, "1 portion" |
| Patate douce | legumes | 150 g, "1 patate douce" |
| Potiron | legumes | 150 g, "1 portion" |
| Champignon de Paris | legumes | 100 g, "1 portion" |
| Noix de cajou | oleagineux | 30 g, "1 poignée" |
| Noisette | oleagineux | 30 g, "1 poignée" |
| Cacahuète | oleagineux | 30 g, "1 poignée" |
| Sirop d'agave | sucres | 20 g, "1 c. à soupe" |
| Sucre roux | sucres | 5 g, "1 c. à café" |
| Chocolat blanc | sucres | 20 g, "2 carrés" |
| Bonbons | sucres | 20 g, "4 bonbons" |
| Barre chocolatée | sucres | 50 g, "1 barre" |
| Boisson énergisante | boissons | 250 g, "1 canette" |

Emoji rules: use a real food emoji that exists in Unicode ≤ 15.0; reuse emojis when needed (🍞 for baguette, 🥐 croissant, 🍺 bière, 🍷 vin, 🧀 fromages, 🥛 laits, 🍮 crème dessert, 🍨 glace, 🍏 compote/jus de pomme, 🍪 biscuits, 🥣 muesli, 🍚 riz, 🍟 frites, 🥔 purée, 🍕 pizza, 🥫 ketchup/sauce, 🍇 raisins secs, 🍑 abricot, 🫐 framboise, 🍈 melon, 🍊 clémentine/pamplemousse, 🍋 citron, 🫛 petits pois, 🥒 courgette, 🫑 poivron, 🥦 chou-fleur, 🫘 haricots verts, 🍠 patate douce, 🎃 potiron, 🍄 champignon, 🥜 cajou/noisette/cacahuète, 🍯 agave, 🍬 sucre/bonbons, 🍫 chocolat/barre, ⚡ boisson énergisante).

- [ ] **Step 2: Review the surprises**

For each nutrient in `data/nutrients.json`, rank foods with `npm run validate` passing and pick six ids that a reader would not expect to be high in that nutrient (e.g. `ketchup` for saccharose, `baguette` for maltose, `petits-pois` for glucides). Keep at least six per nutrient; drop entries that are no longer surprising given the larger list.

- [ ] **Step 3: Validate and test**

In `test/data.test.mjs`, change `assert.equal(foods.length, 59);` to `assert.ok(foods.length >= 100, \`expected >= 100 foods, got ${foods.length}\`);` and rename that test to `"foods.json has at least 100 foods with every key"`.

Run: `npm run validate && npm test`
Expected: `≥100 aliments, 11 nutriments, 0 problème(s), 0 source(s) à vérifier`; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add data test/data.test.mjs
git commit -m "Add <N> sourced foods and review surprise lists

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 8: Page template and build script

**Owner:** Build agent. **Files:**
- Create: `scripts/template.mjs`, `scripts/build.mjs`, `assets/pages.css`, `test/build.test.mjs`

**Interfaces:**
- Consumes: `assets/lib.js` (`sortFoods`, `scale`, `totalSugars`, `valueOf`, `SUGAR_KEYS`), `data/*.json`, `data/config.json`.
- Produces:
  - `scripts/template.mjs`: `export function esc(s): string`, `export function layout({ siteName, siteUrl, path, title, description, body, plausibleDomain }): string` (full HTML document; `path` starts with `/`).
  - `scripts/build.mjs`: `export function build({ foods, nutrients, config, outDir }): string[]` (relative paths written), CLI `node scripts/build.mjs` builds into the repo root and deletes `aliment/` and `nutriment/` first.
  - Generated URLs: `/aliment/<id>/`, `/nutriment/<key>/`, `/comprendre.html`, `/sitemap.xml`.

- [ ] **Step 1: Write the failing build test**

`test/build.test.mjs`:

```js
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
];
const nutrients = [
  { key: "glucose", label: "Glucose", emoji: "⚡", color: "#d4600a", unit: "g", isSugar: true, desc: "Desc glucose", surprises: ["tomate"] },
  { key: "calories", label: "Calories", emoji: "🔥", color: "#b91c1c", unit: "kcal", isSugar: false, desc: "Desc calories", surprises: ["miel"] },
];
const config = { siteUrl: "https://example.test", siteName: "NutriBase", plausibleDomain: null };

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
  assert.deepEqual(written, ["aliment/miel/index.html", "aliment/tomate/index.html", "comprendre.html", "nutriment/calories/index.html", "nutriment/glucose/index.html", "sitemap.xml"]);
  const miel = fs.readFileSync(path.join(outDir, "aliment/miel/index.html"), "utf8");
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot find module `scripts/build.mjs`.

- [ ] **Step 3: Write `scripts/template.mjs`**

```js
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function layout({ siteName, siteUrl, path, title, description, body, plausibleDomain }) {
  const canonical = siteUrl + path;
  const plausible = plausibleDomain ? `\n<script defer data-domain="${esc(plausibleDomain)}" src="https://plausible.io/js/script.js"></script>` : "";
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:site_name" content="${esc(siteName)}">
<meta property="og:locale" content="fr_FR">
<meta name="twitter:card" content="summary">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/styles.css">
<link rel="stylesheet" href="/assets/pages.css">${plausible}
</head>
<body>
<header><a class="logo" href="/">Nutri<em>Base</em></a><nav class="header-nav"><a href="/">Classement</a><a href="/comprendre.html">Comprendre les sucres</a></nav></header>
<main class="page">
${body}
</main>
<footer>NutriBase · Valeurs pour 100g · Sources : CIQUAL (ANSES), USDA · IG : Université de Sydney</footer>
</body>
</html>
`;
}
```

- [ ] **Step 4: Write `scripts/build.mjs`**

```js
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { layout, esc } from "./template.mjs";
import { sortFoods, scale, totalSugars, valueOf, SUGAR_KEYS } from "../assets/lib.js";

const fmt = (v, unit) => {
  if (unit === "kcal") return `${Math.round(v)} kcal`;
  if (unit === "/100") return `${Math.round(v)}`;
  return `${Number(v).toFixed(1)} ${unit}`;
};

function foodPage(f, nutrients, config) {
  const per = scale(f, "portion");
  const sugars = nutrients.filter((n) => n.isSugar);
  const total = totalSugars(f);
  const rows = nutrients.map((n) => `<tr><th scope="row"><a href="/nutriment/${n.key}/">${n.emoji} ${esc(n.label)}</a></th><td>${fmt(f[n.key], n.unit)}</td><td>${n.key === "ig" ? "—" : fmt(per[n.key], n.unit)}</td></tr>`).join("\n");
  const chips = sugars.filter((n) => f[n.key] > 0).map((n) => `<li><a href="/nutriment/${n.key}/">${esc(n.label)}</a> : ${f[n.key].toFixed(1)} g (${Math.round((f[n.key] / total) * 100)} %)</li>`).join("\n");
  const body = `
<article class="food-page">
<p class="crumbs"><a href="/">NutriBase</a> › ${esc(f.category)}</p>
<h1><span class="big-emoji">${f.emoji}</span> ${esc(f.name)}</h1>
<p class="lead">${esc(f.name)} apporte ${f.calories} kcal, ${f.glucides.toFixed(1)} g de glucides dont ${total.toFixed(1)} g de sucres, ${f.proteines.toFixed(1)} g de protéines et ${f.lipides.toFixed(1)} g de lipides pour 100 g.${f.ig > 0 ? ` Index glycémique : ${f.ig}.` : ""}</p>
<table class="nutri-table">
<thead><tr><th>Nutriment</th><th>Pour 100 g</th><th>Par portion (${esc(f.portion.label)}, ${f.portion.g} g)</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
${total > 0 ? `<h2>Répartition des sucres</h2><ul class="sugar-list">${chips}</ul>` : `<h2>Sucres</h2><p>Cet aliment ne contient pas de sucres.</p>`}
<h2>Source</h2>
<p>${esc(f.source.name)}, fiche <a href="${esc(f.source.url)}" rel="noopener">${esc(f.source.ref)}</a>.${f.igSource ? ` Index glycémique : ${esc(f.igSource)}.` : ""}</p>
<p><a class="btn" href="/?q=${encodeURIComponent(f.name)}">Voir ${esc(f.name)} dans le classement</a></p>
</article>`;
  return layout({ ...config, path: `/aliment/${f.id}/`, title: `${f.name} : sucres, calories et nutriments pour 100 g — ${config.siteName}`, description: `${f.name} : ${total.toFixed(1)} g de sucres (glucose ${f.glucose}, fructose ${f.fructose}, saccharose ${f.saccharose}, lactose ${f.lactose}, maltose ${f.maltose}), ${f.calories} kcal pour 100 g. Source ${f.source.name}.`, body });
}

function nutrientPage(n, foods, config) {
  const ranked = sortFoods(foods, n.key, "desc");
  const items = ranked.map((f, i) => `<li${n.surprises.includes(f.id) && f[n.key] > 0 ? ' class="surprise-row"' : ""}><span class="rank">${i + 1}</span> <a href="/aliment/${f.id}/">${f.emoji} ${esc(f.name)}</a> <strong>${fmt(f[n.key], n.unit)}</strong></li>`).join("\n");
  const body = `
<article class="nutrient-page" style="--tab-color:${n.color}">
<p class="crumbs"><a href="/">NutriBase</a> › <a href="/comprendre.html">Comprendre</a></p>
<h1><span class="big-emoji">${n.emoji}</span> ${esc(n.label)}</h1>
<p class="lead">${esc(n.desc)}</p>
<h2>Classement des aliments (pour 100 g)</h2>
<ol class="ranking">
${items}
</ol>
<p><a class="btn" href="/?n=${n.key}">Explorer ${esc(n.label)} dans l'application</a></p>
</article>`;
  return layout({ ...config, path: `/nutriment/${n.key}/`, title: `${n.label} : quels aliments en contiennent le plus ? — ${config.siteName}`, description: `${n.desc.slice(0, 150)}`, body });
}

function comprendrePage(nutrients, foods, config) {
  const section = (n) => {
    const top = sortFoods(foods, n.key, "desc").slice(0, 3).map((f) => `<a href="/aliment/${f.id}/">${f.emoji} ${esc(f.name)}</a> (${fmt(f[n.key], n.unit)})`).join(", ");
    return `<section id="${n.key}"><h2>${n.emoji} <a href="/nutriment/${n.key}/">${esc(n.label)}</a></h2><p>${esc(n.desc)}</p><p class="top3">Les plus riches : ${top}.</p></section>`;
  };
  const body = `
<article class="comprendre">
<h1>Comprendre les sucres et les nutriments</h1>
<p class="lead">Tout aliment contient tout, en proportions différentes. Voici ce que mesure chaque onglet de NutriBase, et pourquoi c'est important.</p>
<h2 class="group">🍭 Les cinq types de sucres</h2>
${nutrients.filter((n) => n.isSugar).map(section).join("\n")}
<h2 class="group">📊 Les macronutriments et l'index glycémique</h2>
${nutrients.filter((n) => !n.isSugar).map(section).join("\n")}
</article>`;
  return layout({ ...config, path: "/comprendre.html", title: `Comprendre les sucres : glucose, fructose, saccharose, lactose, maltose — ${config.siteName}`, description: "Ce que sont le glucose, le fructose, le saccharose, le lactose et le maltose, comment le corps les utilise, et quels aliments en contiennent le plus.", body });
}

function sitemap(foods, nutrients, config) {
  const urls = ["/", "/comprendre.html", ...nutrients.map((n) => `/nutriment/${n.key}/`), ...foods.map((f) => `/aliment/${f.id}/`)];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${config.siteUrl}${u}</loc></url>`).join("\n")}\n</urlset>\n`;
}

export function build({ foods, nutrients, config, outDir }) {
  const written = [];
  const write = (rel, content) => {
    const abs = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
    written.push(rel.split(path.sep).join("/"));
  };
  for (const dir of ["aliment", "nutriment"]) fs.rmSync(path.join(outDir, dir), { recursive: true, force: true });
  for (const f of foods) write(path.join("aliment", f.id, "index.html"), foodPage(f, nutrients, config));
  for (const n of nutrients) write(path.join("nutriment", n.key, "index.html"), nutrientPage(n, foods, config));
  write("comprendre.html", comprendrePage(nutrients, foods, config));
  write("sitemap.xml", sitemap(foods, nutrients, config));
  return written;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const read = (f) => JSON.parse(fs.readFileSync(path.join(root, "data", f), "utf8"));
  const written = build({ foods: read("foods.json"), nutrients: read("nutrients.json"), config: read("config.json"), outDir: root });
  console.log(`${written.length} fichiers générés`);
}
```

- [ ] **Step 5: Write `assets/pages.css`**

```css
/* Styles for generated pages (aliment/, nutriment/, comprendre.html) */
.logo{text-decoration:none;}
.header-nav{display:flex;gap:18px;}
.header-nav a{color:rgba(255,255,255,0.7);text-decoration:none;font-size:0.82rem;}
.header-nav a:hover{color:#fff;}
.page{max-width:860px;margin:0 auto;padding:32px 24px 48px;}
.page h1{font-family:'DM Serif Display',serif;font-size:clamp(1.8rem,4vw,2.6rem);line-height:1.15;margin-bottom:12px;}
.page h2{font-family:'DM Serif Display',serif;font-size:1.35rem;margin:28px 0 10px;}
.page h2.group{font-size:1.6rem;margin-top:40px;color:var(--green-mid);}
.page p{line-height:1.6;margin-bottom:12px;}
.page a{color:var(--green-mid);}
.crumbs{font-size:0.78rem;color:var(--muted);text-transform:capitalize;}
.lead{font-size:1.02rem;color:#2f4a3a;}
.big-emoji{font-size:1.2em;margin-right:6px;}
.nutri-table{width:100%;border-collapse:collapse;background:var(--white);border:1px solid #e4ede7;border-radius:var(--radius);overflow:hidden;font-size:0.9rem;}
.nutri-table th,.nutri-table td{padding:10px 12px;text-align:left;border-bottom:1px solid #e4ede7;}
.nutri-table thead th{background:var(--green-wash);font-size:0.72rem;text-transform:uppercase;letter-spacing:0.5px;color:var(--muted);}
.nutri-table th a{text-decoration:none;color:var(--text);font-weight:600;}
.nutri-table td{font-variant-numeric:tabular-nums;}
.sugar-list,.ranking{padding-left:0;list-style:none;}
.sugar-list li{padding:6px 0;}
.ranking li{display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid #e4ede7;background:var(--white);}
.ranking li:first-child{border-radius:var(--radius) var(--radius) 0 0;}
.ranking li:last-child{border-radius:0 0 var(--radius) var(--radius);}
.ranking li a{flex:1;text-decoration:none;color:var(--text);}
.ranking li strong{color:var(--tab-color,var(--green-mid));font-variant-numeric:tabular-nums;}
.ranking .rank{width:2em;font-size:0.75rem;color:var(--muted);text-align:right;}
.ranking .surprise-row{background:rgba(255,165,0,0.07);}
.btn{display:inline-block;margin-top:8px;padding:10px 18px;border-radius:30px;background:var(--green-mid);color:#fff !important;text-decoration:none;font-weight:500;font-size:0.88rem;}
.top3{font-size:0.9rem;color:var(--muted);}
@media(max-width:600px){.page{padding:20px 16px 40px;}.header-nav{gap:12px;}}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: all pass.

- [ ] **Step 7: Generate the real pages and check one in a browser**

Run: `npm run build`
Expected: `72 fichiers générés` (59 foods + 11 nutrients + 2) at this point in the branch.

Serve with `python -m http.server 8000` and open `http://localhost:8000/aliment/miel/`, `http://localhost:8000/nutriment/glucose/`, `http://localhost:8000/comprendre.html`. Check the header, table, links, and that `/assets/pages.css` loaded (table has borders). Stop the server.

- [ ] **Step 8: Commit**

```bash
git add scripts/template.mjs scripts/build.mjs assets/pages.css test/build.test.mjs aliment nutriment comprendre.html sitemap.xml
git commit -m "Generate static food, nutrient and explainer pages with sitemap

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 9: Build in CI with staleness check

**Owner:** Build agent. **Files:**
- Modify: `.github/workflows/ci.yml`, `package.json` (add `check` script), `robots.txt`

**Interfaces:**
- Consumes: `npm run build` (Task 8).
- Produces: CI fails when generated files are not committed.

- [ ] **Step 1: Add the `check` script to `package.json`**

In `"scripts"`, add:

```json
"check": "npm run validate && npm test && npm run build"
```

- [ ] **Step 2: Extend the workflow**

Replace `.github/workflows/ci.yml` with:

```yaml
name: CI
on:
  push:
  pull_request:
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm run validate
      - run: npm test
      - run: npm run build
      - name: Generated files must be committed
        run: |
          if [ -n "$(git status --porcelain)" ]; then
            git status --porcelain
            git --no-pager diff
            echo "::error::Generated files are stale. Run 'npm run build' and commit."
            exit 1
          fi
```

- [ ] **Step 3: Confirm `robots.txt` still allows the new pages**

`robots.txt` has no `Disallow: /` and no line matching `/aliment/`, `/nutriment/` or `/comprendre.html`, so nothing to change unless a previous task added one. Verify with `grep -E "aliment|nutriment|comprendre" robots.txt` → no output.

- [ ] **Step 4: Verify locally**

Run: `npm run check && git status --porcelain`
Expected: check passes; `git status --porcelain` prints only the two modified files from this task.

- [ ] **Step 5: Commit**

```bash
git add package.json .github/workflows/ci.yml
git commit -m "Build pages in CI and fail on stale generated files

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 10: URL state

**Owner:** App agent. **Files:**
- Modify: `assets/lib.js`, `assets/app.js`, `test/lib.test.mjs`

**Interfaces:**
- Produces (`lib.js`): `readState(search: string, nutrients): { n, sort, q, u, cmp }` and `writeState(state, nutrients): string` (`""` or `"?..."`). Query keys: `n`, `sort` (`asc` only when not default), `q`, `u` (`portion` only), `cmp` (comma-joined ids, max 2).
- Produces (`app.js`): `state` gains `u: "100g"` and `cmp: []`; `sync()` writes the URL after every state change.

- [ ] **Step 1: Write the failing tests** (append to `test/lib.test.mjs`)

```js
import { readState, writeState } from "../assets/lib.js";

test("readState defaults and parses", () => {
  const nuts = [{ key: "glucose" }, { key: "fibres" }];
  assert.deepEqual(readState("", nuts), { n: "glucose", sort: "desc", q: "", u: "100g", cmp: [] });
  assert.deepEqual(readState("?n=fibres&sort=asc&q=pom&u=portion&cmp=a,b,c", nuts), { n: "fibres", sort: "asc", q: "pom", u: "portion", cmp: ["a", "b"] });
  assert.equal(readState("?n=unknown", nuts).n, "glucose");
  assert.equal(readState("?sort=weird&u=weird", nuts).sort, "desc");
});
test("writeState omits defaults and round-trips", () => {
  const nuts = [{ key: "glucose" }, { key: "fibres" }];
  assert.equal(writeState({ n: "glucose", sort: "desc", q: "", u: "100g", cmp: [] }, nuts), "");
  const s = { n: "fibres", sort: "asc", q: "pâte", u: "portion", cmp: ["a", "b"] };
  const qs = writeState(s, nuts);
  assert.deepEqual(readState(qs, nuts), s);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `readState` is not exported.

- [ ] **Step 3: Implement in `assets/lib.js`** (append)

```js
export function readState(search, nutrients) {
  const p = new URLSearchParams(search);
  const s = { n: nutrients[0].key, sort: "desc", q: "", u: "100g", cmp: [] };
  const n = p.get("n");
  if (n && nutrients.some((x) => x.key === n)) s.n = n;
  if (p.get("sort") === "asc") s.sort = "asc";
  s.q = p.get("q") || "";
  if (p.get("u") === "portion") s.u = "portion";
  s.cmp = (p.get("cmp") || "").split(",").filter(Boolean).slice(0, 2);
  return s;
}

export function writeState(state, nutrients) {
  const p = new URLSearchParams();
  if (state.n !== nutrients[0].key) p.set("n", state.n);
  if (state.sort === "asc") p.set("sort", "asc");
  if (state.q) p.set("q", state.q);
  if (state.u === "portion") p.set("u", "portion");
  if (state.cmp.length) p.set("cmp", state.cmp.join(","));
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test` → pass.

- [ ] **Step 5: Wire into `assets/app.js`**

1. Change the import line to `import { filterFoods, sortFoods, otherNutrients, valueOf, readState, writeState } from "./lib.js";`
2. Change `const state = { n: "", sort: "desc", q: "" };` to `const state = { n: "", sort: "desc", q: "", u: "100g", cmp: [] };`
3. Add after `current`:
   ```js
   function sync() {
     history.replaceState(null, "", location.pathname + writeState(state, nutrients));
   }
   ```
4. In `selectTab`, add `sync();` before `renderAll();`.
5. In the sort pill click handler, add `sync();` after `state.sort = p.dataset.sort;`.
6. In the search input handler, add `sync();` after `state.q = e.target.value;`.
7. In `main`, replace `state.n = nutrients[0].key;` with:
   ```js
   Object.assign(state, readState(location.search, nutrients));
   $("searchInput").value = state.q;
   ```

- [ ] **Step 6: Browser check**

Serve with `python -m http.server 8000`, open `http://localhost:8000/?n=fibres&sort=asc&q=len`. Expect the Fibres tab active, ascending sort, search box containing `len`, and Lentilles visible. Change tab: the URL updates without reload. Stop the server.

- [ ] **Step 7: Commit**

```bash
git add assets/lib.js assets/app.js test/lib.test.mjs
git commit -m "Keep tab, sort and search in the URL

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 11: Per-portion toggle

**Owner:** App agent. **Files:**
- Modify: `assets/app.js`, `assets/styles.css`, `index.html`

**Interfaces:**
- Consumes: `scale(food, unit)` from `lib.js`; `state.u`.
- Produces: `#unitPills` group in the controls bar; cards show scaled values and the portion label when `state.u === "portion"`.

- [ ] **Step 1: Add the container to `index.html`**

Inside `<div class="controls">`, after the `#sortPills` div, add:

```html
<div class="sort-pills" id="unitPills" role="group" aria-label="Unité"></div>
```

- [ ] **Step 2: Update `assets/app.js`**

1. Import `scale`: `import { filterFoods, sortFoods, otherNutrients, valueOf, readState, writeState, scale } from "./lib.js";`
2. Add a `renderUnitPills` function after `renderPills`:
   ```js
   function renderUnitPills() {
     const pill = (u, label) => `<button class="sort-pill${state.u === u ? " active" : ""}" aria-pressed="${state.u === u}" data-unit="${u}" style="--pill-color:var(--green-mid)">${label}</button>`;
     $("unitPills").innerHTML = pill("100g", "100 g") + pill("portion", "Portion");
     $("unitPills").querySelectorAll("[data-unit]").forEach((p) => p.addEventListener("click", () => {
       state.u = p.dataset.unit;
       sync();
       renderUnitPills();
       renderGrid();
     }));
   }
   ```
3. In `renderAll`, call `renderUnitPills();` after `renderPills();`.
4. In `renderGrid`, replace the two lines computing `data` and `maxVal` with:
   ```js
   const scaled = foods.map((f) => scale(f, state.u));
   const data = sortFoods(filterFoods(scaled, state.q), n.key, state.sort);
   const maxVal = Math.max(...scaled.map((f) => f[n.key]));
   ```
5. In `cardHTML`, replace `<div class="food-sub">pour 100g</div>` with:
   ```js
   <div class="food-sub">${state.u === "portion" ? `${esc(f.portion.label)} · ${f.portion.g} g` : "pour 100g"}</div>
   ```
   (`f` is already the scaled copy, and `scale` keeps `portion` unchanged.)

- [ ] **Step 3: Browser check**

Serve, open `http://localhost:8000/?u=portion`. The "Portion" pill is active, Miel shows `6.7 g` glucose with sub-line `1 c. à soupe · 20 g`, and the IG tab still shows unscaled IG values. Toggle back to 100 g: values return. Stop the server.

- [ ] **Step 4: Commit**

```bash
git add assets/app.js index.html
git commit -m "Add per-portion unit toggle

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 12: Compare two foods

**Owner:** App agent. **Files:**
- Modify: `assets/app.js`, `assets/styles.css`, `index.html`

**Interfaces:**
- Consumes: `state.cmp` (ids, max 2), `valueOf`, `scale`.
- Produces: `#compare` fixed tray; `toggleCompare(id)`; "Comparer" button per card.

- [ ] **Step 1: Add the tray container to `index.html`**

Before `<footer>`, add:

```html
<div class="compare-tray" id="compare" aria-live="polite" hidden></div>
```

- [ ] **Step 2: Add styles to `assets/styles.css`** (append)

```css
.cmp-btn{margin-top:10px;width:100%;padding:7px;border-radius:8px;border:1.5px solid #ddeee4;background:var(--white);font-family:inherit;font-size:0.74rem;font-weight:500;color:var(--muted);cursor:pointer;}
.cmp-btn[aria-pressed="true"]{background:var(--green-mid);border-color:var(--green-mid);color:#fff;}
.cmp-btn:focus-visible{outline:3px solid var(--green-light);outline-offset:2px;}
.compare-tray{position:fixed;left:0;right:0;bottom:0;z-index:110;background:var(--green-dark);color:#fff;padding:14px 40px;box-shadow:0 -4px 30px rgba(0,0,0,0.25);max-height:55vh;overflow:auto;}
.compare-tray[hidden]{display:none;}
.ct-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;}
.ct-title{font-family:'DM Serif Display',serif;font-size:1.15rem;}
.ct-close{background:none;border:1px solid rgba(255,255,255,0.3);color:#fff;border-radius:20px;padding:5px 12px;font-family:inherit;font-size:0.75rem;cursor:pointer;}
.ct-hint{font-size:0.82rem;color:rgba(255,255,255,0.7);}
.ct-table{width:100%;border-collapse:collapse;font-size:0.84rem;}
.ct-table th,.ct-table td{padding:6px 8px;text-align:right;border-bottom:1px solid rgba(255,255,255,0.1);}
.ct-table th:first-child,.ct-table td:first-child{text-align:left;color:rgba(255,255,255,0.75);font-weight:500;}
.ct-table thead th{font-family:'DM Serif Display',serif;font-size:1rem;}
.ct-table td.win{color:var(--green-pale);font-weight:600;}
body.has-compare{padding-bottom:40vh;}
@media(max-width:600px){.compare-tray{padding:12px 16px;}}
```

- [ ] **Step 3: Update `assets/app.js`**

1. In `cardHTML`, before the closing `</article>`, add:
   ```js
   <button class="cmp-btn" data-cmp="${f.id}" aria-pressed="${state.cmp.includes(f.id)}">${state.cmp.includes(f.id) ? "✓ Sélectionné" : "Comparer"}</button>
   ```
2. At the end of `renderGrid` (after setting `innerHTML`), add:
   ```js
   $("grid").querySelectorAll("[data-cmp]").forEach((b) => b.addEventListener("click", () => toggleCompare(b.dataset.cmp)));
   ```
3. Add these functions after `renderGrid`:
   ```js
   function toggleCompare(id) {
     if (state.cmp.includes(id)) state.cmp = state.cmp.filter((x) => x !== id);
     else state.cmp = [...state.cmp.slice(-1), id];
     sync();
     renderGrid();
     renderCompare();
   }

   function renderCompare() {
     const tray = $("compare");
     const picked = state.cmp.map((id) => foods.find((f) => f.id === id)).filter(Boolean).map((f) => scale(f, state.u));
     document.body.classList.toggle("has-compare", picked.length > 0);
     if (picked.length === 0) { tray.hidden = true; tray.innerHTML = ""; return; }
     tray.hidden = false;
     const head = `<div class="ct-head"><div class="ct-title">Comparer</div><button class="ct-close" id="cmpClose">Fermer</button></div>`;
     if (picked.length === 1) {
       tray.innerHTML = head + `<div class="ct-hint">${picked[0].emoji} ${esc(picked[0].name)} sélectionné — choisissez un second aliment.</div>`;
     } else {
       const [a, b] = picked;
       const unitLabel = (f) => state.u === "portion" ? `${esc(f.portion.label)} · ${f.portion.g} g` : "pour 100 g";
       const rows = [...nutrients, { key: "sucres", label: "Sucres totaux", emoji: "🍭", unit: "g" }].map((n) => {
         const va = valueOf(a, n.key), vb = valueOf(b, n.key);
         return `<tr><td>${n.emoji} ${esc(n.label)}</td><td class="${va > vb ? "win" : ""}">${va.toFixed(1)} ${n.unit}</td><td class="${vb > va ? "win" : ""}">${vb.toFixed(1)} ${n.unit}</td></tr>`;
       }).join("");
       tray.innerHTML = head + `<table class="ct-table"><thead><tr><th></th><th>${a.emoji} ${esc(a.name)}<div class="ct-hint">${unitLabel(a)}</div></th><th>${b.emoji} ${esc(b.name)}<div class="ct-hint">${unitLabel(b)}</div></th></tr></thead><tbody>${rows}</tbody></table>`;
     }
     $("cmpClose").addEventListener("click", () => { state.cmp = []; sync(); renderGrid(); renderCompare(); });
   }
   ```
4. In the unit pill click handler, add `renderCompare();` after `renderGrid();`.
5. In `main`, after `renderAll();`, add `renderCompare();`.

- [ ] **Step 4: Browser check**

Serve, open `http://localhost:8000/?cmp=miel,pomme`. The tray shows both foods with the larger value highlighted in each row. Click "Comparer" on a third card: it replaces Miel (the oldest pick). "Fermer" clears the tray and the URL loses `cmp`. Stop the server.

- [ ] **Step 5: Commit**

```bash
git add assets/app.js assets/styles.css index.html
git commit -m "Add two-food comparison tray

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 13: Keyboard tabs and live status

**Owner:** App agent. **Files:**
- Modify: `assets/app.js`, `index.html`

**Interfaces:**
- Produces: arrow-key navigation on the tablist; `#status` visually-hidden live region announcing result counts.

- [ ] **Step 1: Add the status region to `index.html`**

After `<div class="grid-container" id="grid"></div>` add:

```html
<div id="status" class="visually-hidden" role="status" aria-live="polite"></div>
```

- [ ] **Step 2: Update `assets/app.js`**

1. In `renderTabs`, after attaching click listeners, add:
   ```js
   $("tabs").addEventListener("keydown", onTabKey);
   ```
   and add the handler near `selectTab`:
   ```js
   function onTabKey(e) {
     const keys = nutrients.map((n) => n.key);
     const i = keys.indexOf(state.n);
     const map = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: keys.length - 1 };
     if (!(e.key in map)) return;
     e.preventDefault();
     const next = keys[(map[e.key] + keys.length) % keys.length];
     selectTab(next);
     $("tabs").querySelector(`[data-key="${next}"]`).focus();
   }
   ```
   Because `renderTabs` rebuilds the container's children but not the container, guard against duplicate listeners: add a module-level `let tabKeysBound = false;` and wrap the `addEventListener` in `if (!tabKeysBound) { $("tabs").addEventListener("keydown", onTabKey); tabKeysBound = true; }`.
2. At the end of `renderGrid`, add:
   ```js
   $("status").textContent = `${data.length} aliment${data.length > 1 ? "s" : ""}, ${state.sort === "desc" ? "du plus riche au moins riche" : "du moins riche au plus riche"} en ${n.label.toLowerCase()}`;
   ```

- [ ] **Step 3: Browser check**

Serve, open `http://localhost:8000/`, press Tab until a nutrient tab is focused, press ArrowRight: the next tab activates and keeps focus; End jumps to Index glycémique. Stop the server.

- [ ] **Step 4: Commit**

```bash
git add assets/app.js index.html
git commit -m "Add keyboard navigation for tabs and a live status region

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 14: Integration

**Owner:** main session, on `overhaul`. **Files:**
- Modify: `CLAUDE.md`, `test/data.test.mjs`, generated files, `README.md` (food count)

- [ ] **Step 1: Merge the three agent branches**

```bash
git merge --no-ff <data-branch> -m "Merge data workstream"
git merge --no-ff <build-branch> -m "Merge build workstream"
git merge --no-ff <app-branch> -m "Merge app workstream"
```

Expected: no conflicts (disjoint files). If `package.json` conflicts, keep both the `check` script and existing scripts.

- [ ] **Step 2: Rebuild, validate, test**

Run: `npm run check && git status --porcelain`
Expected: passes; only generated files (new food pages, sitemap) show as modified.

- [ ] **Step 3: Update the README food count**

In `README.md` and the `og:description` of `index.html`, replace "60+" with the real count rounded down to a ten (e.g. "100+").

- [ ] **Step 4: Rewrite `CLAUDE.md`**

Replace the "What this is", "Commands" and "Architecture of `index.html`" sections so they describe: `data/*.json` as the source of truth (shape from the spec §4, `glucides` excludes fibres, `surprises` hold ids), `assets/lib.js` (pure, tested) vs `assets/app.js` (DOM), `scripts/validate.mjs` and `scripts/build.mjs`, the four npm scripts, the generated directories that must be committed (CI fails otherwise), the robots rule for non-page files, and the URL state keys `n, sort, q, u, cmp`. Keep the "Content conventions" section, replacing "Food names double as identifiers" with "Food `id`s are the identifiers; `name` is display only."

- [ ] **Step 5: Full browser pass**

Serve with `python -m http.server 8000` and verify: home renders all foods; accent search; portion toggle; compare tray; keyboard tabs; `/aliment/baguette/` (or another new food), `/nutriment/maltose/`, `/comprendre.html`; no console errors. Stop the server.

- [ ] **Step 6: Commit and push**

```bash
git add -A
git commit -m "Integrate data, build and app workstreams; update CLAUDE.md

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
git push
```

Expected: CI green on `overhaul` (`gh run list --branch overhaul`).

- [ ] **Step 7: Open the PR**

```bash
gh pr create --base main --head overhaul --title "NutriBase overhaul: JSON data, static pages, portion toggle, compare, a11y" --body "$(cat <<'EOF'
## Summary
- Data moved to validated JSON (`data/`), every food sourced (CIQUAL / USDA), ~100 foods
- Static page per food and per nutrient, explainer page, sitemap, meta tags
- URL state, per-portion toggle, two-food comparison, keyboard-accessible tabs
- CI: validate + tests + build, fails on stale generated files

Spec: docs/superpowers/specs/2026-09-16-nutribase-overhaul-design.md
Plan: docs/superpowers/plans/2026-09-16-nutribase-overhaul.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Merging to `main` is the user's call: it publishes to sugar.thoth.fr.

---

## Task 15: Alcohol field, beer and wine, data corrections (added during execution)

**Why:** Task 7 could not add bière blonde or vin rouge because alcohol carries 7 kcal/g and no field represents it, so the validator's calorie rule rejects every alcoholic record. The hero advertises "Bière contient du maltose". Also from the Task 7 review: `biscuit-sec` is sourced from USDA shortbread but named "petit-beurre"; `sucre-blanc` ig 100 is the glucose value, not sucrose.

**Files:**
- Modify: `scripts/validate.mjs`, `test/validate.test.mjs`, `assets/lib.js`, `test/lib.test.mjs`, `scripts/build.mjs`, `test/build.test.mjs`, `data/foods.json`, `data/nutrients.json`
- Regenerate: `aliment/`, `nutriment/`, `comprendre.html`, `sitemap.xml`

**Interfaces:**
- Produces: optional food field `alcool` (g/100 g, number ≥ 0). Calorie estimate becomes `4·proteines + 4·glucides + 2·fibres + 9·lipides + 7·(alcool ?? 0)`. `scale()` scales `alcool` when present. Food pages show a note when `alcool > 0`.

- [ ] **Step 1: Validator (test first)**

Append to `test/validate.test.mjs`:

```js
test("alcool counts 7 kcal/g in the calorie estimate", () => {
  const beer = food({ glucose: 0, fructose: 0, saccharose: 0, lactose: 0, maltose: 0.5, glucides: 3, proteines: 0.5, lipides: 0, fibres: 0, alcool: 4, calories: 43 });
  assert.deepEqual(validateFood(beer, 0), []);
  const noAlcool = { ...beer }; delete noAlcool.alcool;
  assert.match(validateFood(noAlcool, 0).join(), /calories/);
});
test("alcool must be a finite number >= 0 when present", () => {
  assert.match(validateFood(food({ alcool: -1 }), 0).join(), /alcool/);
});
```

Run `npm test` → both fail. Then in `scripts/validate.mjs` `validateFood`:
- after the `NUTRIENT_KEYS` loop add: `if (f.alcool !== undefined && !isNum(f.alcool)) p.push(`${tag}: alcool must be a finite number >= 0 when present`);`
- change the estimate to: `const est = 4 * f.proteines + 4 * f.glucides + 2 * f.fibres + 9 * f.lipides + 7 * (isNum(f.alcool) ? f.alcool : 0);`

Run `npm test` → green.

- [ ] **Step 2: lib scale (test first)**

Append to `test/lib.test.mjs`:

```js
test("scale also scales alcool when present", () => {
  const beer = { ...foods[0], alcool: 4, portion: { g: 250, label: "1 demi" } };
  assert.equal(scale(beer, "portion").alcool, 10);
  assert.equal(scale(foods[0], "portion").alcool, undefined);
});
```

In `assets/lib.js` `scale()`, after the loop: `if (typeof food.alcool === "number") out.alcool = Math.round(food.alcool * k * 10) / 10;`

- [ ] **Step 3: Food page note (test first)**

In `test/build.test.mjs`, add to the `foods` fixture a third food `{ id: "biere", name: "Bière", emoji: "🍺", category: "boissons", ig: 0, glucose: 0, fructose: 0, saccharose: 0, lactose: 0, maltose: 0.5, glucides: 3, proteines: 0.5, lipides: 0, fibres: 0, alcool: 4, calories: 43, portion: { g: 250, label: "1 demi" }, source: { name: "CIQUAL 2020", ref: "5000", url: "https://ciqual.anses.fr/#/aliments/5000/biere" } }`, update the expected `written` list (add `aliment/biere/index.html`) and assert `fs.readFileSync(path.join(outDir, "aliment/biere/index.html"), "utf8")` matches `/4\.0 g d'alcool/` and that `aliment/miel/index.html` does not match `/alcool/`.

In `scripts/build.mjs` `foodPage`, after the `</table>`: `${f.alcool > 0 ? `<p class="note">Contient aussi ${f.alcool.toFixed(1)} g d'alcool pour 100 g (7 kcal/g), inclus dans les calories.</p>` : ""}`.

- [ ] **Step 4: Data**

Using the datasets and helpers in the worktree `.tmp/` (or re-download per Task 6), add:
- `biere-blonde` — "Bière blonde", 🍺, boissons, portion 250 g "1 demi". CIQUAL 2020 (alcool constituent code 60000) or USDA SR Legacy "Alcoholic beverage, beer, regular, all" (nutrient 1018 = alcohol, ethyl). Record `alcool` from the source.
- `vin-rouge` — "Vin rouge", 🍷, boissons, portion 125 g "1 verre". CIQUAL 2020 or USDA "Alcoholic beverage, wine, table, red".
- (The biscuit rename and the sugar IG fix moved into Task 7's fix round; nothing to do here.)
- If `biere-blonde.maltose > 0`, consider it for the `maltose` surprises list.

Run `npm run validate` → `104 aliments, 11 nutriments, 0 problème(s), 0 source(s) à vérifier`; `npm test` green; `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add scripts/validate.mjs test/validate.test.mjs assets/lib.js test/lib.test.mjs scripts/build.mjs test/build.test.mjs data aliment nutriment comprendre.html sitemap.xml
git commit -m "Add optional alcohol field; add beer and wine; fix biscuit name and sugar IG

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Task 16: Rename to Sugar, remove dashes from copy, docs (added during execution)

**Why:** User instructions during execution: the site is now called **Sugar** (exact casing), and no dashes are used as punctuation inside sentences. Also fixes the glucides description, which wrongly says fibres are included.

**Files:**
- Modify: `index.html`, `data/config.json`, `data/nutrients.json`, `test/data.test.mjs`, `scripts/template.mjs`, `scripts/build.mjs`, `README.md`, `package.json`, `CLAUDE.md`
- Regenerate: `aliment/`, `nutriment/`, `comprendre.html`, `sitemap.xml`

- [ ] **Step 1: Guard test (test first)**

Append to `test/data.test.mjs`:

```js
test("no dashes used as punctuation in nutrient copy", () => {
  for (const n of nutrients) {
    assert.doesNotMatch(n.desc, /[—–]| - /, `${n.key}.desc`);
    assert.doesNotMatch(n.label, /[—–]/, `${n.key}.label`);
  }
});
```

and change the config assertion to `assert.equal(config.siteName, "Sugar");`. Run `npm test` → fails.

- [ ] **Step 2: Nutrient copy** (`data/nutrients.json`, exact new `desc` values)

- glucose: `Le glucose est absorbé directement dans le sang : c'est le sucre qui fait monter la glycémie le plus vite. Présent dans les fruits, le miel, mais aussi en traces dans le pain et les produits céréaliers.`
- fructose: `Le fructose est le sucre des fruits. Il est métabolisé par le foie (pas par les muscles), donc il n'augmente pas directement la glycémie, mais en excès il surcharge le foie. Le miel et les fruits en sont riches.`
- lactose: `Le lactose est le sucre du lait (glucose + galactose). Présent presque exclusivement dans les produits laitiers animaux, et en traces dans quelques aliments transformés. Les personnes intolérantes manquent de lactase, l'enzyme nécessaire à sa digestion.`
- glucides: `Les glucides totaux regroupent les sucres et l'amidon (les fibres sont comptées à part). C'est la principale source d'énergie. Présents partout : céréales, fruits, légumineuses, et même dans les légumes.`
- proteines: `Indispensables aux muscles et tissus. Les viandes en sont riches, mais aussi l'avoine, les légumineuses, le fromage ou même le pain, souvent méconnus comme sources protéiques.`
- lipides: `Les graisses sont essentielles au cerveau, aux hormones et à l'absorption des vitamines liposolubles. Pas toutes mauvaises : celles du saumon, des noix ou de l'avocat sont bénéfiques.`
- calories: `L'énergie apportée par un aliment. Les graisses : 9 kcal/g. Glucides et protéines : 4 kcal/g. Le beurre est 45 fois plus calorique que la tomate, à garder en tête pour les portions.`
- ig: `L'IG mesure la vitesse de montée de la glycémie après ingestion, de 0 à 100. IG inférieur à 55 : lent. IG supérieur à 70 : rapide. La cuisson, la transformation et la finesse de mouture augmentent l'IG, même pour la carotte cuite !`
- saccharose, maltose, fibres: unchanged unless they contain a dash.

- [ ] **Step 3: App shell** (`index.html`)

- `<title>Sugar : ce que contient vraiment votre assiette</title>`; same text for `og:title`; `og:site_name` = `Sugar`.
- meta description: `Classez plus de 100 aliments par glucose, fructose, saccharose, lactose, maltose, glucides, protéines, lipides, fibres, calories et index glycémique. Valeurs pour 100 g, sources CIQUAL et USDA.`
- og:description: `Types de sucres, macronutriments et index glycémique de plus de 100 aliments, classés et comparés.`
- logo: `<div class="logo">Sugar</div>`
- header-sub: `Tout aliment contient tout. Voyons combien.`
- hero p: `Nutriments, types de sucres, index glycémique : classez tout, découvrez les surprises.`
- hero pill for beer: keep `🍺 Bière contient du maltose` only if `biere-blonde.maltose > 0` in `data/foods.json`; otherwise replace with `🥖 Baguette contient du maltose` (check `baguette.maltose > 0`; if also 0, use `🌾 Avoine contient du maltose`).
- footer: `Sugar · Valeurs pour 100 g · Sources : CIQUAL (ANSES), USDA · IG : Université de Sydney`

- [ ] **Step 4: Config, template, build**

- `data/config.json`: `"siteName": "Sugar"`.
- `scripts/template.mjs`: logo `<a class="logo" href="/">Sugar</a>`; footer as above.
- `scripts/build.mjs`: every ` — ${config.siteName}` in titles becomes ` | ${config.siteName}`; crumbs `<a href="/">NutriBase</a>` → `<a href="/">${esc(config.siteName)}</a>`; comprendre lead `chaque onglet de NutriBase` → `chaque onglet de ${esc(config.siteName)}`; `grep -n "—\|NutriBase" scripts/*.mjs` must return nothing.
- `package.json`: `"name": "sugar"`, description `Ce que contient vraiment votre assiette : sucres, macronutriments, index glycémique.`

- [ ] **Step 5: README and CLAUDE.md**

`README.md`: title `# Sugar`, replace every ` — ` (use `:` or a new sentence, and `` `dir/` : description`` for the structure list), food count "plus de 100 aliments". `CLAUDE.md`: rewrite per Task 14 Step 4 (data-driven architecture, scripts, generated files committed, URL state keys, robots rule, `id` as identifier), name "Sugar", no dashes.

- [ ] **Step 6: Verify and commit**

`grep -rn "NutriBase" --include=*.html --include=*.json --include=*.md --include=*.mjs . | grep -v "^./docs\|^./.superpowers\|^./.claude\|^./.tmp\|^./aliment\|^./nutriment"` → nothing. `grep -n "—" index.html README.md package.json data/nutrients.json scripts/*.mjs` → nothing. `npm run check` green; `git status --porcelain` shows only intended files after build.

```bash
git add -A -- index.html data test scripts README.md package.json CLAUDE.md aliment nutriment comprendre.html sitemap.xml
git commit -m "Rename site to Sugar, remove dashes from copy, update docs

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```
