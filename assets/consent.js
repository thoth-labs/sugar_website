// Audience measurement (Google Analytics 4) behind a consent banner, as the CNIL and the ePrivacy directive require:
// nothing is requested from Google until the visitor clicks "Accepter", refusing is as easy as accepting,
// and the choice is kept 6 months, then asked again. The footer button reopens the banner at any time.
const script = document.currentScript;
const GA_ID = script && script.dataset.ga;
const KEY = "glykon-consent";
const MAX_AGE = 1000 * 60 * 60 * 24 * 182;
const GA_COOKIE_EXPIRES = 60 * 60 * 24 * 390; // 13 months, the CNIL's maximum for audience cookies

window.dataLayer = window.dataLayer || [];
function gtag() { window.dataLayer.push(arguments); }
window.gtag = gtag;
// Consent Mode v2 defaults: everything denied. Advertising signals stay denied for good, the site has no ads.
gtag("consent", "default", { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", analytics_storage: "denied" });

function readChoice() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && (saved.value === "granted" || saved.value === "denied") && Date.now() - saved.at < MAX_AGE) return saved.value;
  } catch {}
  return null;
}

function saveChoice(value) {
  try { localStorage.setItem(KEY, JSON.stringify({ value, at: Date.now() })); } catch {}
}

let loaded = false;
function loadAnalytics() {
  if (!GA_ID || loaded) return;
  loaded = true;
  gtag("consent", "update", { analytics_storage: "granted" });
  const tag = document.createElement("script");
  tag.async = true;
  tag.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(tag);
  gtag("js", new Date());
  gtag("config", GA_ID, { cookie_expires: GA_COOKIE_EXPIRES, allow_google_signals: false, allow_ad_personalization_signals: false });
}

// Withdrawing consent: stop measuring and delete the cookies GA set on this domain.
function revokeAnalytics() {
  gtag("consent", "update", { analytics_storage: "denied" });
  const host = location.hostname;
  const domains = ["", host, `.${host}`, `.${host.split(".").slice(-2).join(".")}`];
  for (const name of document.cookie.split(";").map((c) => c.split("=")[0].trim()).filter((n) => n === "_ga" || n.startsWith("_ga_"))) {
    for (const d of domains) document.cookie = `${name}=; Max-Age=0; path=/${d ? `; domain=${d}` : ""}`;
  }
}

function legalHref() {
  const link = document.querySelector('footer a[href$="mentions-legales.html"]');
  return (link ? link.getAttribute("href") : "/mentions-legales.html") + "#cookies";
}

let banner;
function showBanner() {
  if (banner) { banner.hidden = false; banner.querySelector("button").focus(); return; }
  banner = document.createElement("div");
  banner.className = "consent";
  banner.setAttribute("role", "dialog");
  banner.setAttribute("aria-labelledby", "consent-title");
  banner.setAttribute("aria-describedby", "consent-text");
  banner.innerHTML = `<p class="consent-title" id="consent-title">Mesure d'audience</p>
<p id="consent-text">Avec votre accord, nous utilisons Google Analytics pour compter les visites et savoir quelles pages sont consultées. Aucune publicité, aucun profilage. Vous pouvez changer d'avis à tout moment via le lien « Gestion des cookies » en bas de page. <a href="${legalHref()}">En savoir plus</a></p>
<div class="consent-actions"><button type="button" data-choice="denied">Refuser</button><button type="button" data-choice="granted">Accepter</button></div>`;
  banner.addEventListener("click", (e) => {
    const choice = e.target.closest("[data-choice]")?.dataset.choice;
    if (!choice) return;
    saveChoice(choice);
    if (choice === "granted") loadAnalytics(); else revokeAnalytics();
    banner.hidden = true;
  });
  document.body.appendChild(banner);
}

function init() {
  const choice = readChoice();
  if (choice === "granted") loadAnalytics();
  else if (choice === null) showBanner();
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-consent-open]")) { e.preventDefault(); showBanner(); }
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
