---
name: add-food
description: Use when adding, replacing or re-sourcing a food in data/foods.json for the Sugar site, or when asked where a food's nutrient numbers should come from (CIQUAL, USDA, "valeur pour 100 g", sucres, glucose, fructose, index glycémique)
---

# Add a food to Sugar

## Overview

Every number on the site must be traceable to one primary record: **CIQUAL 2020** (ANSES) or **USDA SR Legacy** (FoodData Central). Secondary sites that "cite CIQUAL" (Aprifel, blogs, calorie counters) are not sources. The scripts in this skill query the real datasets offline; use them instead of the web.

Datasets download once into `.tmp/datasets/` (git-ignored, ~135 MB) on first run.

## Workflow

1. **Find the record**
   ```
   node .claude/skills/add-food/scripts/find-food.mjs figue crue
   node .claude/skills/add-food/scripts/find-food.mjs "figs raw" --usda
   ```
   Prefer CIQUAL for French foods. Pick a record with `[5/5 core, 5/5 sugars]`. A `core < 5` record cannot be used (energy or a macro is missing). If no record fits, the food is **skipped**, not estimated.
2. **Add it**
   ```
   node .claude/skills/add-food/scripts/add-food.mjs --from ciqual:13012 --id figue-fraiche \
     --name "Figue fraîche" --emoji 🍈 --category fruits --portion 50 "1 figue" --ig 35
   ```
   The script writes the row (sorted by id) and prints the calorie and sugar checks.
3. **Verify and publish**
   ```
   npm run validate && npm test && npm run build
   ```
   Commit `data/foods.json` with the generated pages (`aliment/`, `nutriment/`, `comprendre.html`, `sitemap.xml`). The commit body names the record used and any substitution.

## Rules the script enforces (know them anyway)

| Field | Rule |
|---|---|
| `source` | `{ name: "CIQUAL 2020" \| "USDA FoodData Central", ref: <code or fdc_id>, url: <record page> }`. Never the dataset homepage, never prose. |
| values | Per 100 g, rounded to 0.1. CIQUAL `traces` and `< x` mean **0**, `-` means missing. |
| `glucides` | French convention, sugars + starch, **no fibres**. USDA rows: `carbohydrate − fiber`, never below the sugar sum. |
| sugars | Five values from the record. Missing ones become 0 only when the record's total sugars is already accounted for. Otherwise supply `--sugars g,f,s,l,m` from a record of the same food and cite it in the commit body. |
| `ig` | 0 when unknown or no carbs. When set, `igSource` is exactly `"Tables publiques (valeur indicative)"` or `"Université de Sydney (glycemicindex.com)"`. No other wording. |
| `name` | Must be honest about the record: USDA shortbread is "Biscuit sablé", not "Petit-beurre". |
| `alcool` | Stored automatically when the record reports alcohol; the validator counts it at 7 kcal/g. |
| `portion` | Usual serving, `g` 1–1000 and a French label ("1 pomme moyenne"). |

Categories: `fruits legumes cereales proteines laitiers legumineuses oleagineux sucres boissons`.

## Common mistakes

- Reading a number off a website and writing `"url": "https://ciqual.anses.fr/"`: the reviewer will reject it. Use the record page the script prints.
- Rounding `< 0,5` to 0.3 "to be safe": it is 0.
- Writing your own `igSource` text: only the two labels above pass review.
- Editing `data/foods.json` by hand: run the script, then adjust `emoji`/`portion` if needed, then validate.
- Forgetting `npm run build`: CI fails when generated pages are stale.
- Adding the food to a `surprises` list in `data/nutrients.json` without checking the value is non-zero and genuinely surprising.

## Related

`scripts/validate.mjs` is the final gate; `CLAUDE.md` describes the data model.
