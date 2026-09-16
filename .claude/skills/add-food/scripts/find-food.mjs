#!/usr/bin/env node
// Search CIQUAL 2020 and USDA SR Legacy for a food and print candidate records
// with their values in the foods.json shape.
//
//   node .claude/skills/add-food/scripts/find-food.mjs figue
//   node .claude/skills/add-food/scripts/find-food.mjs "fig raw" --usda
//   node .claude/skills/add-food/scripts/find-food.mjs biere --ciqual --limit 20
//
// [core/5 + sugars/5] tells how complete a record is: prefer 5/5 + 5/5.
// A record with core < 5 cannot be added (calories or a macro is missing).

import { loadDatasets, toFoodValues, completeness, norm, SUGARS } from "./datasets.mjs";

const args = process.argv.slice(2);
const only = args.includes("--ciqual") ? "ciqual" : args.includes("--usda") ? "usda" : null;
const limitIdx = args.indexOf("--limit");
const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : 12;
const terms = args.filter((a, i) => !a.startsWith("--") && !(limitIdx >= 0 && i === limitIdx + 1)).map(norm);
if (!terms.length) {
  console.error("usage: find-food.mjs <words...> [--ciqual|--usda] [--limit N]");
  process.exit(2);
}

const { ciqual, usda } = await loadDatasets();
const fmt = (v) => (v == null ? "–" : v);

for (const [dataset, records] of [["ciqual", ciqual], ["usda", usda]]) {
  if (only && only !== dataset) continue;
  const hits = [];
  for (const rec of records) {
    const n = norm(rec.name);
    if (!terms.every((t) => n.includes(t))) continue;
    const vals = toFoodValues(dataset, rec);
    const c = completeness(vals);
    hits.push({ rec, vals, score: c.core * 10 + c.sugars, c });
  }
  hits.sort((a, b) => b.score - a.score || a.rec.name.localeCompare(b.rec.name));
  console.log(`\n## ${dataset.toUpperCase()}: ${hits.length} match(es) for "${terms.join(" ")}"`);
  for (const { rec, vals, c } of hits.slice(0, limit)) {
    console.log(`[${c.core}/5 core, ${c.sugars}/5 sugars] ${dataset}:${rec.code}  ${rec.name}`);
    console.log(
      `    kcal=${fmt(vals.calories)} prot=${fmt(vals.proteines)} gluc=${fmt(vals.glucides)} lip=${fmt(vals.lipides)} fib=${fmt(vals.fibres)}` +
        ` | sucres=${fmt(vals.sucres)} ${SUGARS.map((k) => `${k.slice(0, 3)}=${fmt(vals[k])}`).join(" ")}` +
        (vals.alcool ? ` | alcool=${vals.alcool}` : "")
    );
  }
}
