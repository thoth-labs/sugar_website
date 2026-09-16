import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { layout, esc } from "./template.mjs";
import { sortFoods, scale, totalSugars } from "../assets/lib.js";

const fmt = (v, unit) => {
  if (unit === "kcal") return `${Math.round(v)} kcal`;
  if (unit === "/100") return `${Math.round(v)}`;
  return `${Number(v).toFixed(1)} ${esc(unit)}`;
};

function foodPage(f, nutrients, config) {
  const per = scale(f, "portion");
  const sugars = nutrients.filter((n) => n.isSugar);
  const total = totalSugars(f);
  const rows = nutrients.map((n) => `<tr><th scope="row"><a href="/nutriment/${n.key}/">${esc(n.emoji)} ${esc(n.label)}</a></th><td>${fmt(f[n.key], n.unit)}</td><td>${fmt(per[n.key], n.unit)}</td></tr>`).join("\n");
  const chips = sugars.filter((n) => f[n.key] > 0).map((n) => `<li><a href="/nutriment/${n.key}/">${esc(n.label)}</a> : ${f[n.key].toFixed(1)} g (${Math.round((f[n.key] / total) * 100)} %)</li>`).join("\n");
  const body = `
<article class="food-page">
<p class="crumbs"><a href="/">${esc(config.siteName)}</a> › ${esc(f.category)}</p>
<h1><span class="big-emoji">${esc(f.emoji)}</span> ${esc(f.name)}</h1>
<p class="lead">${esc(f.name)} apporte ${f.calories} kcal, ${f.glucides.toFixed(1)} g de glucides dont ${total.toFixed(1)} g de sucres, ${f.proteines.toFixed(1)} g de protéines et ${f.lipides.toFixed(1)} g de lipides pour 100 g.${f.ig > 0 ? ` Index glycémique : ${f.ig}.` : ""}</p>
<table class="nutri-table">
<thead><tr><th>Nutriment</th><th>Pour 100 g</th><th>Par portion (${esc(f.portion.label)}, ${f.portion.g} g)</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>${f.alcool > 0 ? `<p class="note">Contient aussi ${f.alcool.toFixed(1)} g d'alcool pour 100 g (7 kcal/g), inclus dans les calories.</p>` : ""}
${total > 0 ? `<h2>Répartition des sucres</h2><ul class="sugar-list">${chips}</ul>` : `<h2>Sucres</h2><p>Cet aliment ne contient pas de sucres.</p>`}
<h2>Source</h2>
<p>${esc(f.source.name)}, fiche <a href="${esc(f.source.url)}" rel="noopener">${esc(f.source.ref)}</a>.${f.igSource ? ` Index glycémique : ${esc(f.igSource)}.` : ""}</p>
<p><a class="btn" href="/?q=${encodeURIComponent(f.name)}">Voir ${esc(f.name)} dans le classement</a></p>
</article>`;
  return layout({ ...config, path: `/aliment/${f.id}/`, title: `${f.name} : sucres, calories et nutriments pour 100 g | ${config.siteName}`, description: `${f.name} : ${total.toFixed(1)} g de sucres (glucose ${f.glucose}, fructose ${f.fructose}, saccharose ${f.saccharose}, lactose ${f.lactose}, maltose ${f.maltose}), ${f.calories} kcal pour 100 g. Source ${f.source.name}.`, body });
}

function nutrientPage(n, foods, config) {
  const ranked = sortFoods(foods, n.key, "desc");
  const items = ranked.map((f, i) => `<li${n.surprises.includes(f.id) && f[n.key] > 0 ? ' class="surprise-row"' : ""}><span class="rank">${i + 1}</span> <a href="/aliment/${f.id}/">${esc(f.emoji)} ${esc(f.name)}</a> <strong>${fmt(f[n.key], n.unit)}</strong></li>`).join("\n");
  const body = `
<article class="nutrient-page" style="--tab-color:${n.color}">
<p class="crumbs"><a href="/">${esc(config.siteName)}</a> › <a href="/comprendre.html">Comprendre</a></p>
<h1><span class="big-emoji">${esc(n.emoji)}</span> ${esc(n.label)}</h1>
<p class="lead">${esc(n.desc)}</p>
<h2>Classement des aliments (pour 100 g)</h2>
<ol class="ranking">
${items}
</ol>
<p><a class="btn" href="/?n=${n.key}">Explorer ${esc(n.label)} dans l'application</a></p>
</article>`;
  return layout({ ...config, path: `/nutriment/${n.key}/`, title: `${n.label} : quels aliments en contiennent le plus ? | ${config.siteName}`, description: `${n.desc.slice(0, 150)}`, body });
}

function comprendrePage(nutrients, foods, config) {
  const section = (n) => {
    const top = sortFoods(foods, n.key, "desc").slice(0, 3).map((f) => `<a href="/aliment/${f.id}/">${esc(f.emoji)} ${esc(f.name)}</a> (${fmt(f[n.key], n.unit)})`).join(", ");
    return `<section id="${n.key}"><h2>${esc(n.emoji)} <a href="/nutriment/${n.key}/">${esc(n.label)}</a></h2><p>${esc(n.desc)}</p><p class="top3">Les plus riches : ${top}.</p></section>`;
  };
  const body = `
<article class="comprendre">
<h1>Comprendre les sucres et les nutriments</h1>
<p class="lead">Tout aliment contient tout, en proportions différentes. Voici ce que mesure chaque onglet de ${esc(config.siteName)}, et pourquoi c'est important.</p>
<h2 class="group">🍭 Les cinq types de sucres</h2>
${nutrients.filter((n) => n.isSugar).map(section).join("\n")}
<h2 class="group">📊 Les macronutriments et l'index glycémique</h2>
${nutrients.filter((n) => !n.isSugar).map(section).join("\n")}
</article>`;
  return layout({ ...config, path: "/comprendre.html", title: `Comprendre les sucres : glucose, fructose, saccharose, lactose, maltose | ${config.siteName}`, description: "Ce que sont le glucose, le fructose, le saccharose, le lactose et le maltose, comment le corps les utilise, et quels aliments en contiennent le plus.", body });
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
