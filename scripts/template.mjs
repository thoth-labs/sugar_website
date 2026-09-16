export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function layout({ siteName, siteUrl, path, title, description, body, plausibleDomain }) {
  const canonical = siteUrl + path;
  const plausible = plausibleDomain ? `\n<script defer data-domain="${esc(plausibleDomain)}" src="https://plausible.io/js/script.js"></script>` : "";
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${canonical}">
<meta property="og:site_name" content="${esc(siteName)}">
<meta property="og:locale" content="fr_FR">
<meta name="twitter:card" content="summary">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/styles.css">
<link rel="stylesheet" href="/assets/pages.css">${plausible}
</head>
<body>
<header><a class="logo" href="/">Sugar</a><nav class="header-nav"><a href="/">Classement</a><a href="/comprendre.html">Comprendre les sucres</a></nav></header>
<main class="page">
${body}
</main>
<footer>Sugar · Valeurs pour 100 g · Sources : CIQUAL (ANSES), USDA · IG : valeurs indicatives (tables publiques)</footer>
</body>
</html>
`;
}
