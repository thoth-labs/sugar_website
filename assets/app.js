import { filterFoods, sortFoods, otherNutrients, valueOf, readState, writeState } from "./lib.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let foods = [];
let nutrients = [];
const state = { n: "", sort: "desc", q: "", u: "100g", cmp: [] };
const current = () => nutrients.find((n) => n.key === state.n);

function sync() {
  history.replaceState(null, "", location.pathname + writeState(state, nutrients));
}

function tabHTML(n) {
  const active = n.key === state.n;
  return `<button class="tab${active ? " active" : ""}" role="tab" aria-selected="${active}" tabindex="${active ? 0 : -1}" data-key="${n.key}" style="--tab-color:${n.color}"><span class="tab-dot"></span>${n.emoji} ${esc(n.label)}</button>`;
}

function renderTabs() {
  const sugar = nutrients.filter((n) => n.isSugar);
  const macro = nutrients.filter((n) => !n.isSugar);
  $("tabs").innerHTML =
    `<span class="tab-section-label">🍭 Types de sucres</span>` + sugar.map(tabHTML).join("") +
    `<div class="tab-separator"></div>` +
    `<span class="tab-section-label">📊 Macronutriments</span>` + macro.map(tabHTML).join("");
  $("tabs").querySelectorAll(".tab").forEach((t) => t.addEventListener("click", () => selectTab(t.dataset.key)));
}

function selectTab(key) {
  state.n = key;
  state.sort = "desc";
  sync();
  renderAll();
}

function renderBanner() {
  const n = current();
  const vals = foods.map((f) => f[n.key]).filter((v) => v > 0);
  const avg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : "0";
  $("banner").innerHTML = `
    <div class="nb-icon" style="background:${n.color}20">${n.emoji}</div>
    <div style="flex:1">
      <div class="nb-title" style="color:${n.color}">${esc(n.label)}</div>
      <div class="nb-desc">${esc(n.desc)}</div>
    </div>
    <div class="nb-right">
      <div class="nb-stat-val" style="color:${n.color}">${avg}</div>
      <div class="nb-stat-lbl">${n.unit} en moyenne (pour 100 g)</div>
    </div>`;
}

function renderPills() {
  const n = current();
  const pill = (dir, label) => `<button class="sort-pill${state.sort === dir ? " active" : ""}" aria-pressed="${state.sort === dir}" data-sort="${dir}" style="--pill-color:${n.color}">${label}</button>`;
  $("sortPills").innerHTML = pill("desc", "↓ Plus riche") + pill("asc", "↑ Moins riche");
  $("sortPills").querySelectorAll("[data-sort]").forEach((p) => p.addEventListener("click", () => {
    state.sort = p.dataset.sort;
    sync();
    renderPills();
    renderGrid();
  }));
}

function sugarChipsHTML(f, n) {
  const sugars = nutrients.filter((x) => x.isSugar);
  const total = sugars.reduce((s, x) => s + f[x.key], 0);
  return `<div class="sugar-breakdown">` + sugars.map((x) => {
    const v = f[x.key];
    if (v === 0) return "";
    const pct = total > 0 ? Math.round((v / total) * 100) : 0;
    const active = x.key === n.key;
    return `<div class="sugar-chip" style="background:${x.color}${active ? "22" : "11"};color:${x.color};border-color:${x.color}${active ? "55" : "22"};font-weight:${active ? "700" : "500"}">${esc(x.label)} ${v.toFixed(1)}g <span style="opacity:0.6">(${pct}%)</span></div>`;
  }).join("") + `</div>`;
}

function cardHTML(f, i, n, maxVal, others) {
  const val = f[n.key];
  const pct = maxVal > 0 ? Math.round((val / maxVal) * 100) : 0;
  const surprise = n.surprises.includes(f.id) && val > 0;
  return `<article class="card" style="animation-delay:${Math.min(i * 0.025, 0.5)}s">
    <div class="card-top">
      <div class="food-emoji">${f.emoji}</div>
      <div><div class="food-name">${esc(f.name)}</div><div class="food-sub">pour 100g</div></div>
    </div>
    <div class="primary-block" style="background:${n.color}12;color:${n.color}">
      <div class="pb-top">
        <div class="pb-label">${n.emoji} ${esc(n.label)}</div>
        <div class="pb-value">${val.toFixed(1)}<span class="pb-unit"> ${n.unit}</span></div>
      </div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${n.color}"></div></div>
      <div class="bar-pct">${pct}% du maximum</div>
    </div>
    ${surprise ? `<div class="surprise">⚠️ Plus que vous ne le croyez !</div>` : ""}
    ${n.isSugar ? sugarChipsHTML(f, n) : ""}
    <div class="others">
      ${others.map((o) => `<div class="ot"><div class="ot-name">${o.emoji} ${esc(o.label.split(" ")[0])}</div><div class="ot-val">${valueOf(f, o.key).toFixed(1)}<span class="ot-unit"> ${o.unit}</span></div></div>`).join("")}
    </div>
  </article>`;
}

function renderGrid() {
  const n = current();
  const data = sortFoods(filterFoods(foods, state.q), n.key, state.sort);
  const maxVal = Math.max(...foods.map((f) => f[n.key]));
  const others = otherNutrients(nutrients, n.key);
  $("grid").innerHTML = data.length
    ? data.map((f, i) => cardHTML(f, i, n, maxVal, others)).join("")
    : `<div class="empty"><div class="empty-icon">🔍</div><h3>Aucun aliment trouvé</h3></div>`;
}

function renderAll() {
  renderTabs();
  renderBanner();
  renderPills();
  renderGrid();
}

async function main() {
  const [f, n] = await Promise.all([
    fetch("data/foods.json").then((r) => r.json()),
    fetch("data/nutrients.json").then((r) => r.json()),
  ]);
  foods = f;
  nutrients = n;
  Object.assign(state, readState(location.search, nutrients));
  $("searchInput").value = state.q;
  $("searchInput").addEventListener("input", (e) => {
    state.q = e.target.value;
    sync();
    renderGrid();
  });
  renderAll();
}

main();
