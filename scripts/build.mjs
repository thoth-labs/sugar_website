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

const categoryLabel = (f) => CATEGORY_LABELS[f.category] || f.category;
const byName = (a, b) => a.name.localeCompare(b.name, "fr");

// Shortens `text` to `max` characters for meta descriptions: at the last full sentence when one fits, else at a word.
export function clip(text, max = 155) {
  if (text.length <= max) return text;
  const head = text.slice(0, max);
  const sentence = head.lastIndexOf(". ");
  if (sentence > 0) return head.slice(0, sentence + 1);
  const cut = head.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}

const breadcrumbs = (config, crumbs) => ({
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [{ name: config.siteName, item: config.siteUrl + "/" }, ...crumbs].map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, ...(c.item ? { item: c.item } : {}) })),
});

function foodPage(f, foods, nutrients, config) {
  const per = scale(f, "portion");
  const sugars = nutrients.filter((n) => n.isSugar);
  const total = totalSugars(f);
  const category = categoryLabel(f);
  const rows = nutrients.map((n) => `<tr><th scope="row"><a href="/nutriment/${n.key}/">${esc(n.emoji)} ${esc(n.label)}</a></th><td>${fmt(f[n.key], n.unit)}</td><td>${fmt(per[n.key], n.unit)}</td></tr>`).join("\n");
  const chips = sugars.filter((n) => f[n.key] > 0).map((n) => `<li><a href="/nutriment/${n.key}/">${esc(n.label)}</a> : ${f[n.key].toFixed(1)} g (${Math.round((f[n.key] / total) * 100)} %)</li>`).join("\n");
  const siblings = foods.filter((o) => o.category === f.category && o.id !== f.id).sort(byName);
  const related = siblings.length ? `<h2>Autres ${esc(category.toLowerCase())}</h2><ul class="related">${siblings.map((o) => `<li><a href="/aliment/${o.id}/">${esc(o.emoji)} ${esc(o.name)}</a></li>`).join("")}</ul>` : "";
  const body = `
<article class="food-page">
<p class="crumbs"><a href="/">${esc(config.siteName)}</a> › ${esc(category)}</p>
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
${related}
</article>`;
  const path = `/aliment/${f.id}/`;
  return layout({ ...config, path, title: `${f.name} : sucres, calories et nutriments pour 100 g | ${config.siteName}`, description: `${f.name} : ${total.toFixed(1)} g de sucres (glucose ${f.glucose}, fructose ${f.fructose}, saccharose ${f.saccharose}, lactose ${f.lactose}, maltose ${f.maltose}), ${Math.round(f.calories)} kcal pour 100 g. Source ${f.source.name}.`, body, jsonLd: [breadcrumbs(config, [{ name: category }, { name: f.name, item: config.siteUrl + path }])] });
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
  const path = `/nutriment/${n.key}/`;
  const top = ranked.slice(0, 3).map((f) => f.name).join(", ");
  const isIg = n.key === "ig";
  const criterion = isIg ? "index glycémique" : `teneur en ${n.label.toLowerCase()}`;
  const description = clip(`Classement de ${foods.length} aliments par ${criterion}${isIg ? "" : " pour 100 g"}. ${isIg ? "Les plus élevés" : "Les plus riches"} : ${top}. ${n.desc}`);
  const list = { "@context": "https://schema.org", "@type": "ItemList", name: `Aliments classés par ${criterion}`, itemListElement: ranked.map((f, i) => ({ "@type": "ListItem", position: i + 1, name: f.name, url: `${config.siteUrl}/aliment/${f.id}/` })) };
  return layout({ ...config, path, title: `${n.label} : quels aliments en contiennent le plus ? | ${config.siteName}`, description, body, jsonLd: [breadcrumbs(config, [{ name: "Comprendre", item: `${config.siteUrl}/comprendre.html` }, { name: n.label, item: config.siteUrl + path }]), list] });
}

function notFoundPage(config) {
  const body = `
<article class="not-found">
<h1>Page introuvable</h1>
<p class="lead">Cette adresse ne correspond à aucune page de ${esc(config.siteName)}. L'aliment a peut-être été renommé ou retiré.</p>
<p><a class="btn" href="/">Retour au classement</a> <a class="btn" href="/comprendre.html">Comprendre les sucres</a></p>
</article>`;
  return layout({ ...config, path: "/404.html", title: `Page introuvable | ${config.siteName}`, description: "Cette page n'existe pas.", body, noindex: true, absolute: true });
}

// The home page is hand-written; the build only refreshes the static index between its markers,
// so crawlers reach every food and nutrient page without running the app.
const INDEX_START = "<!-- build:index -->";
const INDEX_END = "<!-- /build:index -->";
function homeIndex(foods, nutrients) {
  const keys = [...new Set([...Object.keys(CATEGORY_LABELS), ...foods.map((f) => f.category)])];
  const groups = keys.map((key) => [key, foods.filter((f) => f.category === key).sort(byName)]).filter(([, list]) => list.length)
    .map(([key, list]) => `<h3>${esc(CATEGORY_LABELS[key] || key)}</h3><ul>${list.map((f) => `<li><a href="aliment/${f.id}/">${esc(f.emoji)} ${esc(f.name)}</a></li>`).join("")}</ul>`).join("\n");
  return `${INDEX_START}
<section class="site-index" aria-labelledby="site-index-title">
<h2 id="site-index-title">Tous les aliments et nutriments</h2>
<h3>Par nutriment</h3><ul>${nutrients.map((n) => `<li><a href="nutriment/${n.key}/">${esc(n.emoji)} ${esc(n.label)}</a></li>`).join("")}</ul>
${groups}
</section>
${INDEX_END}`;
}
function injectHomeIndex(html, foods, nutrients) {
  const start = html.indexOf(INDEX_START);
  const end = html.indexOf(INDEX_END);
  if (start < 0 || end < start) throw new Error(`index.html must contain the ${INDEX_START} … ${INDEX_END} markers`);
  return html.slice(0, start) + homeIndex(foods, nutrients) + html.slice(end + INDEX_END.length);
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

// Mirrors the structure and wording of the company's own legal page (thoth.fr/entreprise.html).
function mentionsPage(config) {
  const c = config.company;
  const site = esc(config.siteName);
  const name = esc(c.name);
  const mail = `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>`;
  const updated = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(config.legalUpdated));
  const body = `
<article class="mentions">
<p class="crumbs"><a href="/">${site}</a> › Mentions légales</p>
<h1>Mentions légales</h1>
<p class="lead">Informations fournies en application de l'article 6-III de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique (LCEN). ${site} est un site d'information nutritionnelle édité par ${name}.</p>

<h2>L'entreprise</h2>
<p><a href="${esc(c.url)}" rel="noopener">${name}</a>, sous le nom commercial ${esc(c.tradeName)}, est un studio français d'applications mobiles et web fondé au printemps 2025 à Charenton-le-Pont, aux portes de Paris. Il crée, développe et publie ses propres applications, dont ${site}, et propose en parallèle du conseil informatique et technologique, des prestations en data science et en business intelligence, et des formations sur ces sujets.</p>
<p>${site} classe plus de cent aliments courants selon leurs sucres, leurs macronutriments, leurs calories et leur index glycémique, à partir de données publiques (CIQUAL de l'ANSES, USDA FoodData Central). Les valeurs sont données pour 100 g, à titre informatif : elles ne remplacent pas l'avis d'un professionnel de santé.</p>

<h2>Éditeur du site</h2>
<dl class="legal-list">
<dt>Dénomination</dt><dd>${name} (nom commercial : ${esc(c.tradeName)})</dd>
<dt>Forme juridique</dt><dd>${esc(c.legalForm)} au capital de ${esc(c.capital)}</dd>
<dt>Création</dt><dd>${esc(c.founded)}</dd>
<dt>Immatriculation</dt><dd>${esc(c.rcs)} · SIREN ${esc(c.siren)} · EUID ${esc(c.euid)}</dd>
<dt>TVA intracommunautaire</dt><dd>${esc(c.vat)}</dd>
<dt>Siège social</dt><dd>${esc(c.address)}</dd>
<dt>Directeur de la publication</dt><dd>${esc(c.director)}, ${esc(c.directorTitle)}</dd>
<dt>Contact</dt><dd>${mail}</dd>
</dl>

<h2>Hébergement</h2>
<p>Le site est hébergé par GitHub, Inc. (service GitHub Pages), 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, États-Unis (<a href="https://pages.github.com/" rel="noopener">pages.github.com</a>). Comme tout hébergeur, GitHub peut enregistrer l'adresse IP des visiteurs dans ses journaux techniques, à des fins de sécurité, selon sa propre <a href="https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement" rel="noopener">déclaration de confidentialité</a>. GitHub, Inc. participe au cadre de protection des données UE-États-Unis (Data Privacy Framework). ${name} n'a pas accès à ces journaux et n'en exploite aucun.</p>

<h2>Propriété intellectuelle et sources</h2>
<p>La structure du site, ses textes, son logo et son code sont la propriété de ${name}, sauf mention contraire. Le code source est publié sous licence libre (voir le dépôt du projet). Les polices de caractères DM Sans et DM Serif Display sont diffusées sous licence SIL Open Font License. Les marques et noms de produits cités appartiennent à leurs propriétaires respectifs.</p>
<p>Les valeurs nutritionnelles proviennent de la table CIQUAL 2020 de l'ANSES et de la base USDA FoodData Central, chacune citée sur la fiche de l'aliment. Ces données publiques restent soumises aux conditions de leurs éditeurs. Les index glycémiques sont des valeurs indicatives issues de tables publiques.</p>

<h2>Responsabilité</h2>
<p>Les informations de ${site} sont fournies à titre indicatif et sont vérifiées avec soin, mais elles peuvent contenir des erreurs ou des données obsolètes. Elles ne constituent pas un conseil médical ou diététique. ${name} ne peut être tenue responsable de l'usage qui en est fait. Signalez toute erreur à ${mail}.</p>

<h2>Droit applicable</h2>
<p>Le présent site est soumis au droit français. En cas de litige, et à défaut de résolution amiable, les tribunaux français seront seuls compétents.</p>

<h2>Politique de confidentialité</h2>
<p>${site} ne collecte aucune donnée personnelle. Aucun cookie, aucun traceur, aucune mesure d'audience, aucun formulaire, aucun compte utilisateur.</p>
<ul class="legal-points">
<li><strong>Cookies et traceurs : aucun.</strong> Le site n'utilise ni cookie, ni stockage local, ni outil d'analyse d'audience, ni bouton de partage tiers. Aucun bandeau de consentement n'est donc nécessaire.</li>
<li><strong>Ressources externes : aucune.</strong> Les polices de caractères et tous les fichiers du site sont servis depuis le même domaine ; aucune requête n'est adressée à un service tiers pendant votre visite.</li>
<li><strong>Formulaires et comptes : aucun.</strong> Le site ne vous demande jamais d'information. Vos réglages (nutriment affiché, tri, recherche, comparaison) sont conservés uniquement dans l'adresse de la page, jamais sur un serveur.</li>
</ul>
<p>Seul l'hébergeur peut enregistrer des journaux techniques, comme indiqué ci-dessus, sous sa propre responsabilité.</p>

<h2>Liens sortants</h2>
<p>Les liens vers les fiches CIQUAL, USDA FoodData Central et les autres sites cités vous conduisent vers des services régis par leurs propres politiques de confidentialité.</p>

<h2>Contact</h2>
<p>Si vous nous écrivez à ${mail}, votre message n'est utilisé que pour vous répondre et n'est transmis à personne. Pour toute question relative à vos données au sens du règlement (UE) 2016/679 (RGPD), vous pouvez nous contacter à cette même adresse ou saisir la Commission nationale de l'informatique et des libertés (CNIL, <a href="https://www.cnil.fr/" rel="noopener">cnil.fr</a>).</p>

<h2>Mise à jour</h2>
<p>Dernière mise à jour : ${updated}. Toute modification de cette page sera publiée ici.</p>
</article>`;
  const [street, rest] = c.address.split(", ");
  const [postalCode, ...locality] = (rest || "").split(" ");
  const org = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: c.name,
    alternateName: c.tradeName,
    legalName: c.name,
    url: c.url,
    email: c.email,
    founder: { "@type": "Person", name: c.director },
    identifier: { "@type": "PropertyValue", propertyID: "SIREN", value: c.siren.replace(/\s/g, "") },
    address: { "@type": "PostalAddress", streetAddress: street, postalCode, addressLocality: locality.join(" "), addressCountry: "FR" },
  };
  return layout({ ...config, path: "/mentions-legales.html", title: `Mentions légales | ${config.siteName}`, description: `${config.siteName} est édité par ${c.name} (${c.tradeName}). Identification de l'éditeur, hébergement, propriété intellectuelle, confidentialité et contact.`, body, jsonLd: [org] });
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
  for (const f of foods) write(path.join("aliment", f.id, "index.html"), foodPage(f, foods, nutrients, config));
  for (const n of nutrients) write(path.join("nutriment", n.key, "index.html"), nutrientPage(n, foods, config));
  write("comprendre.html", comprendrePage(nutrients, foods, config));
  write("mentions-legales.html", mentionsPage(config));
  write("404.html", notFoundPage(config));
  write("sitemap.xml", sitemap(foods, nutrients, config));
  const home = path.join(outDir, "index.html");
  if (fs.existsSync(home)) write("index.html", injectHomeIndex(fs.readFileSync(home, "utf8"), foods, nutrients));
  return written;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const read = (f) => JSON.parse(fs.readFileSync(path.join(root, "data", f), "utf8"));
  const written = build({ foods: read("foods.json"), nutrients: read("nutrients.json"), config: read("config.json"), outDir: root });
  console.log(`${written.length} fichiers générés`);
}
