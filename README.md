# Sugar

Ce que contient vraiment votre assiette : types de sucres (glucose, fructose,
saccharose, lactose, maltose), macronutriments, calories et index glycémique
de plus de 100 aliments, pour 100 g. En ligne sur https://sugar.thoth.fr.

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
   doit citer sa source (`source.name`, `source.ref`, `source.url`), CIQUAL
   2020 ou USDA FoodData Central, et une portion usuelle.
2. `glucides` suit la convention française : sucres + amidon, **sans** les fibres.
3. `npm run validate` puis `npm run build`, et committer les fichiers générés.

## Structure

- `index.html`, `assets/` : application (ES modules, sans framework)
- `data/` : données et configuration
- `scripts/` : validateur et générateur de pages
- `test/` : tests
- Pages générées : `aliment/<id>/`, `nutriment/<clé>/`, `comprendre.html`, `sitemap.xml`

## Sources

CIQUAL 2020 (ANSES), USDA FoodData Central, index glycémique : valeurs indicatives (tables publiques).

Licence MIT.
