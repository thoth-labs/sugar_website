import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { layout, esc } from "./template.mjs";
import { sortFoods, scale, totalSugars } from "../assets/lib.js";

const CATEGORY_LABELS = { fruits: "Fruits", legumes: "Légumes", cereales: "Céréales", proteines: "Protéines", laitiers: "Produits laitiers", legumineuses: "Légumineuses", oleagineux: "Oléagineux", sucres: "Sucres et douceurs", boissons: "Boissons" };

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
<p class="crumbs"><a href="/">${esc(config.siteName)}</a> › ${esc(CATEGORY_LABELS[f.category] || f.category)}</p>
<h1><span class="big-emoji">${esc(f.emoji)}</span> ${esc(f.name)}</h1>
<p class="lead">${esc(f.name)} apporte ${Math.round(f.calories)} kcal, ${f.glucides.toFixed(1)} g de glucides dont ${total.toFixed(1)} g de sucres, ${f.proteines.toFixed(1)} g de protéines et ${f.lipides.toFixed(1)} g de lipides pour 100 g.${f.ig > 0 ? ` Index glycémique : ${f.ig}.` : ""}</p>
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
  return layout({ ...config, path: `/aliment/${f.id}/`, title: `${f.name} : sucres, calories et nutriments pour 100 g | ${config.siteName}`, description: `${f.name} : ${total.toFixed(1)} g de sucres (glucose ${f.glucose}, fructose ${f.fructose}, saccharose ${f.saccharose}, lactose ${f.lactose}, maltose ${f.maltose}), ${Math.round(f.calories)} kcal pour 100 g. Source ${f.source.name}.`, body });
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
<p><a class="btn" href="/?n=${n.key}">Voir le classement complet dans l'application</a></p>
</article>`;
  return layout({ ...config, path: `/nutriment/${n.key}/`, title: `${n.label} : quels aliments en contiennent le plus ? | ${config.siteName}`, description: `${n.desc.slice(0, 150)}`, body });
}

function comprendrePage(nutrients, foods, config) {
  const section = (n) => {
    const top = sortFoods(foods, n.key, "desc").slice(0, 3).map((f) => `<a href="/aliment/${f.id}/">${esc(f.emoji)} ${esc(f.name)}</a> (${fmt(f[n.key], n.unit)})`).join(", ");
    return `<section id="${n.key}"><h2>${esc(n.emoji)} <a href="/nutriment/${n.key}/">${esc(n.label)}</a></h2><p>${esc(n.desc)}</p><p class="top3">${n.key === "ig" ? "Les plus élevés" : "Les plus riches"} : ${top}.</p></section>`;
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

function mentionsPage(config) {
  const c = config.company;
  const site = esc(config.siteName);
  const mail = `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`;
  const body = `
<article class="mentions">
<p class="crumbs"><a href="/">${site}</a> › Mentions légales</p>
<h1>Mentions légales</h1>
<p class="lead">${site} est un site d'information nutritionnelle édité par ${esc(c.name)}. Cette page présente l'entreprise et les informations légales exigées par le droit français et européen.</p>

<h2>Qui sommes-nous</h2>
<p>${esc(c.name)}, sous le nom commercial ${esc(c.tradeName)}, est une société de logiciel et de données installée à Charenton-le-Pont, près de Paris. Elle conçoit et développe des logiciels, des applications web et mobiles, et accompagne ses clients en conseil informatique, en business intelligence et en science des données.</p>
<p>${site} est l'un de ses projets : un classement d'une centaine d'aliments courants par teneur en sucres, en macronutriments, en calories et par index glycémique, à partir de données publiques (CIQUAL de l'ANSES, USDA FoodData Central). Les valeurs sont données pour 100 g, à titre informatif : elles ne remplacent pas l'avis d'un professionnel de santé.</p>

<h2>Éditeur du site</h2>
<dl class="legal-list">
<dt>Dénomination</dt><dd>${esc(c.name)} (nom commercial : ${esc(c.tradeName)})</dd>
<dt>Forme juridique</dt><dd>${esc(c.legalForm)} au capital de ${esc(c.capital)}</dd>
<dt>Immatriculation</dt><dd>${esc(c.rcs)}</dd>
<dt>Identifiant européen (EUID)</dt><dd>${esc(c.euid)}</dd>
<dt>TVA intracommunautaire</dt><dd>${esc(c.vat)}</dd>
<dt>Siège social</dt><dd>${esc(c.address)}</dd>
<dt>Contact</dt><dd>${mail}</dd>
<dt>Directeur de la publication</dt><dd>${esc(c.director)}, ${esc(c.directorTitle)}</dd>
</dl>

<h2>Hébergement</h2>
<p>Le site est hébergé par GitHub Pages, service de GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis (<a href="https://pages.github.com/" rel="noopener">pages.github.com</a>). L'hébergeur peut enregistrer l'adresse IP des visiteurs dans ses journaux techniques, selon sa propre <a href="https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement" rel="noopener">politique de confidentialité</a>. GitHub, Inc. participe au cadre de protection des données UE-États-Unis (Data Privacy Framework).</p>

<h2>Données personnelles</h2>
<p>${site} ne collecte aucune donnée personnelle. Il n'y a ni compte utilisateur, ni formulaire, ni outil de mesure d'audience, ni traceur publicitaire. Les polices de caractères et tous les fichiers du site sont servis depuis le même domaine : aucune requête n'est envoyée à un tiers pendant la navigation. Vos réglages (nutriment affiché, tri, recherche, comparaison) sont conservés uniquement dans l'adresse de la page, jamais sur un serveur.</p>
<p>Seul l'hébergeur peut enregistrer des journaux techniques, comme indiqué ci-dessus, sous sa propre responsabilité. Pour toute question relative à vos données au sens du règlement (UE) 2016/679 (RGPD), écrivez à ${mail} ; vous pouvez aussi vous adresser à la CNIL (<a href="https://www.cnil.fr/" rel="noopener">cnil.fr</a>).</p>

<h2>Cookies</h2>
<p>Le site ne dépose aucun cookie et n'utilise aucun stockage local. Aucun bandeau de consentement n'est donc nécessaire.</p>

<h2>Propriété intellectuelle et sources</h2>
<p>Les valeurs nutritionnelles proviennent de la table CIQUAL 2020 de l'ANSES et de la base USDA FoodData Central, chacune citée sur la fiche de l'aliment. Ces données publiques restent soumises aux conditions de leurs éditeurs. Les index glycémiques sont des valeurs indicatives issues de tables publiques.</p>
<p>La structure du site, ses textes et son code sont la propriété de ${esc(c.name)}. Le code source est publié sous licence libre (voir le dépôt du projet). Les marques et noms de produits cités appartiennent à leurs propriétaires respectifs.</p>

<h2>Responsabilité</h2>
<p>Les informations de ${site} sont fournies à titre indicatif et sont vérifiées avec soin, mais elles peuvent contenir des erreurs ou des données obsolètes. Elles ne constituent pas un conseil médical ou diététique. ${esc(c.name)} ne peut être tenue responsable de l'usage qui en est fait. Signalez toute erreur à ${mail}.</p>
</article>`;
  return layout({ ...config, path: "/mentions-legales.html", title: `Mentions légales | ${config.siteName}`, description: `${config.siteName} est édité par ${c.name} (${c.tradeName}). Identification de l'éditeur, hébergement, données personnelles, cookies et sources.`, body });
}

function sitemap(foods, nutrients, config) {
  const urls = ["/", "/comprendre.html", "/mentions-legales.html", ...nutrients.map((n) => `/nutriment/${n.key}/`), ...foods.map((f) => `/aliment/${f.id}/`)];
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
  write("mentions-legales.html", mentionsPage(config));
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
