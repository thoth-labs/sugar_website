export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Rewrites root-absolute hrefs and srcs ("/assets/x", "/?q=miel", "/") relative to the page depth,
// so the generated pages also render when opened straight from the file system.
export function relativize(html, path) {
  const base = "../".repeat(path.split("/").length - 2);
  return html.replace(/(href|src)="\/([^"]*)"/g, (m, attr, rest) => `${attr}="${rest && !rest.startsWith("?") ? base + rest : (base || "./") + rest}"`);
}

// JSON-LD lives inside a <script>, where "</script>" would end it early: escape "<" so the block stays inert.
export const jsonLdTag = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;

// `jsonLd`: structured data blocks to embed. `noindex`: keep the page out of search results (404).
// `absolute`: skip relativize, for pages served at arbitrary URLs (404.html).
export function layout({ siteName, siteUrl, path, title, description, body, gaMeasurementId, jsonLd = [], noindex = false, absolute = false }) {
  const canonical = siteUrl + path;
  // Loads Google Analytics only after consent, see assets/consent.js.
  const analytics = gaMeasurementId ? `\n<script defer src="/assets/consent.js" data-ga="${esc(gaMeasurementId)}"></script>` : "";
  const ld = jsonLd.map((d) => `\n${jsonLdTag(d)}`).join("");
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="theme-color" content="#1a3a2a">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">${noindex ? `\n<meta name="robots" content="noindex">` : `\n<link rel="canonical" href="${canonical}">`}
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:site_name" content="${esc(siteName)}">
<meta property="og:locale" content="fr_FR">
<meta name="twitter:card" content="summary">
<link rel="icon" href="/assets/glykon_icon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/styles.css">
<link rel="stylesheet" href="/assets/pages.css">${analytics}${ld}
</head>
<body>
<header><a class="logo" href="/"><img src="/assets/glykon_icon_foreground.svg" alt="" width="36" height="36">${esc(siteName)}</a><nav class="header-nav"><a href="/">Classement</a><a href="/comprendre.html">Comprendre les sucres</a></nav></header>
<main class="page">
${body}
</main>
<footer>${esc(siteName)} · Valeurs pour 100 g · Sources : CIQUAL (ANSES), USDA · IG : valeurs indicatives (tables publiques) · <a href="/mentions-legales.html">Mentions légales</a>${gaMeasurementId ? ` · <button type="button" class="consent-open" data-consent-open>Gestion des cookies</button>` : ""}</footer>
</body>
</html>
`;
  return absolute ? html : relativize(html, path);
}
