# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

NutriBase: a single-file, French-language static site that ranks ~60 foods by nutrient content (5 sugar types, macronutrients, calories, glycemic index) per 100g. The entire app lives in `index.html` (inline CSS + vanilla JS, no framework, no dependencies except Google Fonts).

Deployed via GitHub Pages at `sugar.thoth.fr` (see `CNAME`, remote `thoth-labs/sugar_website`). Pushing to `main` publishes the site.

GitHub Pages serves every committed file, so `robots.txt` explicitly disallows the non-page files (this file, `CNAME`, etc.) and `sitemap.xml` lists only the homepage. `.nojekyll` stops Jekyll from rendering Markdown files into indexable HTML pages. When adding a file that is not meant to be a public page, add a `Disallow` line for it in `robots.txt`.

## Commands

There is no build, lint, or test step. To preview locally, open `index.html` directly in a browser or serve the directory:

```
python -m http.server 8000
```

## Architecture of `index.html`

Three sections, in order: `<style>` (lines ~8–115), static HTML shell (header, hero, empty containers `#tabs`, `#banner`, `#sortPills`, `#grid`), then one `<script>` that owns all rendering.

**Data model (in the script):**
- `foods[]`: one object per food with `name`, `emoji`, `ig`, the five sugar keys (`glucose`, `fructose`, `saccharose`, `lactose`, `maltose`) and macros (`glucides`, `proteines`, `lipides`, `fibres`, `calories`). All values are g per 100g except `ig` (0–100) and `calories` (kcal). Every food must have every key, since the grid calls `.toFixed()` on each.
- `nutrients[]`: one entry per tab. `key` must match a `foods` property. `isSugar: true` places the tab in the "Types de sucres" group and turns on the per-card sugar breakdown chips; `false` places it under "Macronutriments". `surprises` is a list of food `name` strings that get the "⚠️ Plus que vous ne le croyez !" badge on that tab (only when the value is > 0), so it must match `foods[].name` exactly.
- `SUGAR_KEYS` / `SUGAR_COLORS` / `SUGAR_LABELS` duplicate the sugar entries of `nutrients` and are used for the breakdown chips. Keep them in sync if adding or renaming a sugar type.

**State:** three module-level variables, `current` (selected nutrient), `sortDir` (-1 richest first, 1 poorest first), `search` (text filter). No persistence.

**Rendering:** `renderAll()` = `renderTabs()` + `renderBanner()` + `renderPills()` + `renderGrid()`. Each function rebuilds its container's `innerHTML` from scratch and re-attaches click listeners; there is no diffing. Changing the tab calls `renderAll()`, changing sort calls `renderPills()` + `renderGrid()`, typing in search calls only `renderGrid()`. The banner average skips zero values. Bar widths in the grid are relative to the max of the *unfiltered* food list, so search does not rescale bars.

**Styling:** colors per nutrient are passed as inline CSS custom properties (`--tab-color`, `--pill-color`) or as hex + 2-digit alpha suffixes (e.g. `${n.color}12`), so nutrient `color` values must be 6-digit hex.

## Content conventions

- All UI copy and food names are in French; data sources cited in the footer are CIQUAL (ANSES), USDA and the University of Sydney GI database. Keep new food data consistent with those sources.
- Food names double as identifiers (search, `surprises`), so renaming a food requires updating every `surprises` array that references it.
