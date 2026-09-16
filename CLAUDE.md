# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Sugar: a French-language static site that ranks around 100 foods by nutrient content (five sugar types, macronutrients, calories, glycemic index) per 100 g. Zero npm dependencies, Node 20 or later. Deployed via GitHub Pages at `sugar.thoth.fr` (see `CNAME`, remote `thoth-labs/sugar_website`). Pushing to `main` publishes the site.

## Data model

`data/foods.json`: an array of food objects, sorted by `id`. Each has:
- `id`: the stable identifier (slug, `[a-z0-9-]+`); `name` is display text only and can be renamed freely.
- The five sugar keys (`glucose`, `fructose`, `saccharose`, `lactose`, `maltose`), macros (`glucides`, `proteines`, `lipides`, `fibres`), `calories` and `ig`. All values are grams per 100 g except `calories` (kcal) and `ig` (0 to 100). `glucides` follows the French convention: sugars plus starch, fibres excluded.
- Optional `alcool` (g per 100 g, counted at 7 kcal/g). `igSource` is required whenever `ig > 0`.
- `portion` (`g`, `label`) and `source` (`name`, `ref`, `url`), citing CIQUAL 2020 or USDA FoodData Central.

`data/nutrients.json`: one entry per tab (`key`, `label`, `emoji`, `color`, `unit`, `isSugar`, `desc`, `surprises`). `surprises` holds food `id`s (not names) that get the surprise badge on that tab when their value is greater than zero.

`scripts/validate.mjs` enforces both shapes (types, sort order, source URLs, calorie estimate, surprises resolving to real foods with non-zero values). Run it before committing data changes.

## Code split

- `assets/lib.js`: pure functions (sorting, filtering, URL state, unit scaling). No DOM access, fully covered by `test/lib.test.mjs`.
- `assets/app.js`: DOM rendering and event wiring on top of `lib.js`. Not directly unit tested; verify manually or via the `run` skill.
- `scripts/template.mjs` and `scripts/build.mjs`: generate the static pages (see below) from `data/*.json`.

## Generated pages

`scripts/build.mjs` writes `aliment/<id>/index.html` (one per food), `nutriment/<key>/index.html` (one per nutrient), `comprendre.html` and `sitemap.xml`. These are committed to the repo, not built by CI: run `npm run build` after any data change and commit the result, or CI fails on a stale diff.

GitHub Pages serves every committed file, so `robots.txt` disallows the non-page files (`CLAUDE.md`, `CNAME`, `README.md`, `package.json`, `scripts/`, `test/`, etc). Add a `Disallow` line there for any new non-page file.

## Commands

```
npm test          # unit tests (node --test)
npm run validate  # validates data/foods.json and data/nutrients.json
npm run build     # regenerates aliment/, nutriment/, comprendre.html, sitemap.xml
npm run check     # validate + test + build, must stay green
```

## App state

The app keeps its state in the URL query string, read and written by `assets/lib.js`: `n` (selected nutrient key), `sort` (`asc` or `desc`), `q` (search text), `u` (`100g` or `portion`), `cmp` (up to two food ids being compared).

## Adding foods

Use the `add-food` skill (`.claude/skills/add-food/`) or the `food-sourcer` agent (`.claude/agents/food-sourcer.md`) to add or re-source foods. Both pull numbers only from CIQUAL or USDA, never invented values, and run `npm run validate` before finishing.

## Copy conventions

All UI copy is in French. The site name is exactly `Sugar`, everywhere (title, meta tags, logo, footer, page titles). Do not use dashes ("—", "–") or " - " as sentence punctuation anywhere in user-facing copy; use a comma, a colon or a new sentence instead. Hyphens inside compound words (`chou-fleur`, `demi-écrémé`, `petit-beurre`) are fine.
