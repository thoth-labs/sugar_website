# NutriBase overhaul — design

Date: 2026-09-16
Status: approved in chat (user: "start all")
Site: https://sugar.thoth.fr (GitHub Pages, branch `main`, root)

## 1. Goal

Turn the single-file NutriBase prototype into a maintainable, trustworthy,
indexable static site without adding a framework, a backend, or paid hosting.

Four workstreams, in dependency order:

1. **Foundation** — split the file, add tooling and validation, fix known bugs.
2. **Data** — per-food sources, corrected values, portions, ~100 foods.
3. **Sharing & SEO** — URL state, one static page per food and per nutrient, sitemap, meta tags.
4. **Features** — per-portion toggle, two-food comparison, accessible tabs, explainer page.

Out of scope: English version, user accounts, backend, food photos, analytics
(no account exists; a single optional hook is left in config, see §6).

## 2. Constraints

- Static hosting on GitHub Pages from `main` root. No settings change required.
- Zero npm dependencies. Node ≥ 20 built-ins only (`node --test`, `fs`, `path`).
- French UI. Values per 100 g remain the canonical unit.
- Existing look and feel is kept (colours, fonts, card layout).

## 3. Repository layout (target)

```
index.html                 # app shell (no inline data, no inline JS)
comprendre.html            # generated explainer page
aliment/<slug>/index.html  # generated, one per food
nutriment/<key>/index.html # generated, one per nutrient
sitemap.xml                # generated
robots.txt
favicon.svg
assets/styles.css
assets/pages.css           # styles used only by generated pages
assets/app.js              # browser entry (ES module), DOM only
assets/lib.js              # pure functions, shared with build + tests
data/foods.json
data/nutrients.json
data/config.json           # site url, analytics (optional)
scripts/validate.mjs       # data checks, exits non-zero on failure
scripts/build.mjs          # generates the files marked "generated"
scripts/template.mjs       # shared HTML page template
test/*.test.mjs            # node --test
package.json               # scripts only: test, validate, build, check
.github/workflows/ci.yml   # validate + test + build, fails if generated output is stale
README.md, LICENSE (MIT)
docs/superpowers/...
```

Generated files are **committed**. CI runs the build and fails if the working
tree differs, so the deployed site always matches the data. This avoids
changing the Pages source to Actions.

## 4. Data model

`data/foods.json` — array, sorted by `id`:

```json
{
  "id": "pomme",
  "name": "Pomme",
  "emoji": "🍎",
  "category": "fruits",
  "ig": 38,
  "glucose": 2.4, "fructose": 5.9, "saccharose": 1.9, "lactose": 0, "maltose": 0.1,
  "glucides": 14.0, "proteines": 0.3, "lipides": 0.2, "fibres": 2.4, "calories": 52,
  "portion": { "g": 150, "label": "1 pomme moyenne" },
  "source": { "name": "CIQUAL 2020", "ref": "13005", "url": "https://ciqual.anses.fr/#/aliments/13005/pomme-pulpe-et-peau-crue" },
  "igSource": "Université de Sydney (glycemicindex.com)"
}
```

- `id`: slug, unique, `^[a-z0-9-]+$`.
- `category`: one of `fruits | legumes | cereales | proteines | laitiers | legumineuses | oleagineux | sucres | boissons`.
- `ig`: 0–100, 0 = not applicable. `igSource` optional, present when `ig > 0`.
- Flat nutrient keys are kept so the app and validator stay simple.

`data/nutrients.json` — the current `nutrients` array unchanged in shape
(`key, label, emoji, color, unit, isSugar, desc, surprises[]`), where
`surprises` now holds food **ids**.

`data/config.json`:

```json
{ "siteUrl": "https://sugar.thoth.fr", "siteName": "NutriBase", "plausibleDomain": null }
```

## 5. Validation rules (`scripts/validate.mjs`)

Fails the run (non-zero exit, one line per problem) when:

- a required key is missing or not a finite number ≥ 0 (nutrients) / non-empty string (text);
- `id` is not `^[a-z0-9-]+$` or is duplicated; `name` duplicated;
- `glucose+fructose+saccharose+lactose+maltose > glucides + 0.5`;
- `calories` differs by more than 20 % from `4·proteines + 4·glucides + 2·fibres + 9·lipides`, unless calories < 20
  (`glucides` follows the French convention: sugars + starch, excluding fibres; USDA "carbohydrate by difference" has fibre subtracted before storing);
- foods are not sorted by `id`;
- `ig` outside 0–100;
- `category` not in the allowed list;
- `portion.g` not in 1–1000 or `portion.label` empty;
- `source.name`, `source.ref`, `source.url` missing or `url` not `https://`;
- `emoji` empty or in a blocklist (`🫀`);
- any `surprises` id in `nutrients.json` that does not exist in `foods.json`;
- fewer than 6 surprises for a nutrient, or a surprise whose value for that nutrient is 0.

## 6. Build (`scripts/build.mjs`)

Reads the three JSON files and writes:

- `aliment/<id>/index.html` — food name, emoji, category, full nutrient table
  (per 100 g and per portion), sugar breakdown, source link, IG, link back to
  `/?n=<key>` for each nutrient. Static HTML, no JS needed.
- `nutriment/<key>/index.html` — description, ranked list of all foods for that
  nutrient (richest first) with values, links to food pages.
- `comprendre.html` — the five sugar descriptions plus the six macro
  descriptions as a readable article, with links to nutrient pages.
- `sitemap.xml` — index, comprendre, every food and nutrient page. No `lastmod`, so the build is fully deterministic.
- If `plausibleDomain` is set, every generated page and `index.html` gets the
  Plausible `<script>` tag; otherwise nothing is injected.

All generated pages share one HTML template (`scripts/template.mjs`): same
header/footer as `index.html`, `<title>`, `<meta name="description">`,
Open Graph tags, canonical URL, `lang="fr"`, favicon link.

Generated pages load `assets/styles.css` plus `assets/pages.css` (page-only
styles, kept separate so the app and build workstreams never edit the same
stylesheet). CI runs the build and fails if `git status` is not clean.

## 7. App (`assets/app.js` + `assets/lib.js`)

`lib.js` (pure, tested):

- `normalize(str)` — lowercase, NFD, strip diacritics. Used for search.
- `filterFoods(foods, query)` — matches on normalised name.
- `sortFoods(foods, key, dir)`.
- `scale(food, mode)` — returns a copy with nutrient values multiplied by `portion.g/100` when `mode === "portion"`.
- `otherNutrients(nutrients, currentKey)` — on a sugar tab returns the six macros; on a macro tab returns the five other macros plus a synthetic `sucres` entry (sum of sugars).
- `readState(search)` / `writeState(state)` — `?n=<key>&sort=asc|desc&q=<text>&u=100g|portion&cmp=<id>,<id>`.

`app.js` (DOM):

- Fetches the two JSON files, renders exactly what the current page renders, plus:
- **URL state**: every change calls `history.replaceState`; load reads the URL.
- **Unit toggle** in the controls bar: `100 g` / `Portion`. In portion mode the
  card sub-line shows the portion label and values use `scale()`. The bar
  percentage is computed against the max in the *same* mode.
- **Compare**: each card has a "Comparer" button (max 2 selected). When two are
  selected a fixed bottom tray shows both foods with every nutrient side by
  side and the larger value highlighted. `cmp` is part of URL state.
- **Accessibility**: tabs are `<button role="tab">` inside `role="tablist"`,
  `aria-selected`, Left/Right/Home/End keyboard navigation; sort and unit
  pills are `<button aria-pressed>`; a visually-hidden `role="status"` region
  announces the result count and sort after each grid render (a live region on
  the grid itself would read out every card); `:focus-visible` outline uses
  the tab colour.
- Bug fixes carried in: yogurt protein value, beetroot emoji, accent search,
  redundant sugar mini-grid.

## 8. Data work (workstream 2)

- Every existing food gets `id`, `category`, `portion`, `source` and is
  re-checked against CIQUAL 2020 (fallback USDA FoodData Central, and IG from
  the University of Sydney table). Known fixes: `Yaourt nature` protéines ≈ 4 g;
  `Betterave` emoji.
- New foods, target 100 total, prioritising French staples and the gaps named
  in the hero: baguette, croissant, bière blonde, fromage de chèvre, camembert,
  compote, jus de pomme, pain d'épices, biscuits, céréales petit-déjeuner
  variants, riz complet, frites, purée, pizza, ketchup, sauce
  tomate, lait demi-écrémé, lait d'amande, crème dessert, glace, fruits secs
  (raisins secs, figues sèches, abricots secs), fruits (abricot, prune, figue,
  melon, clémentine, pamplemousse, citron, framboise, grenade), légumes (petits
  pois, courgette, poivron, chou-fleur, haricots verts, patate douce, potiron,
  champignon), noix de cajou, noisette, cacahuète, sirop d'agave, sucre roux,
  chocolat blanc, bonbons, barre chocolatée, boisson énergisante, vin rouge.
- Values with no primary source are not added. Preferred source is the CIQUAL
  2020 table (`ref` = CIQUAL food code, `url` = CIQUAL page); fallback is USDA
  FoodData Central SR Legacy (`ref` = fdc_id, `url` = FDC food-details page),
  with fibre subtracted from "carbohydrate by difference" to get `glucides`.
- `surprises` lists are reviewed after the data grows so each still holds six
  foods that are genuinely non-obvious for that nutrient.

## 9. Testing

- `node --test test/` covers every `lib.js` function and the validator rules
  (fixture JSON with one violation per rule).
- `scripts/validate.mjs` runs on the real data in CI.
- Build smoke test: build into a temp dir, assert expected file count and that
  each generated page contains its canonical URL.
- Manual check before merge: serve the repo root with `python -m http.server`,
  verify tabs, search with accents, portion toggle, compare tray, keyboard
  tabs, and one food page.

## 10. Delivery

- Branch `overhaul` from `main`; one commit per plan task; PR to `main` at the end.
- Workstreams 1 → (2 ∥ 3 ∥ 4) → integration. 2, 3 and 4 touch disjoint files
  once the foundation is in place, so they can run as parallel subagents.
