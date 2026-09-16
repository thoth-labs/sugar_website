export const SUGAR_KEYS = ["glucose", "fructose", "saccharose", "lactose", "maltose"];
export const NUTRIENT_KEYS = ["ig", ...SUGAR_KEYS, "glucides", "proteines", "lipides", "fibres", "calories"];

export const SUCRES_NUTRIENT = { key: "sucres", label: "Sucres totaux", emoji: "🍭", unit: "g", color: "#b91c1c", isSugar: false, desc: "", surprises: [] };

export function normalize(str) {
  return String(str).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/œ/g, "oe").replace(/æ/g, "ae");
}

export function slugify(str) {
  return normalize(str).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function filterFoods(foods, query) {
  const q = normalize(query || "").trim();
  return q ? foods.filter((f) => normalize(f.name).includes(q)) : [...foods];
}

export function sortFoods(foods, key, dir) {
  const sign = dir === "asc" ? 1 : -1;
  return [...foods].sort((a, b) => sign * (valueOf(a, key) - valueOf(b, key)));
}

export function totalSugars(food) {
  return SUGAR_KEYS.reduce((s, k) => s + food[k], 0);
}

export function valueOf(food, key) {
  return key === "sucres" ? totalSugars(food) : food[key];
}

export function otherNutrients(nutrients, currentKey) {
  const macros = nutrients.filter((n) => !n.isSugar);
  const cur = nutrients.find((n) => n.key === currentKey);
  if (!cur || cur.isSugar) return macros;
  return [...macros.filter((n) => n.key !== currentKey), SUCRES_NUTRIENT];
}

export function scale(food, unit) {
  if (unit !== "portion") return { ...food };
  const k = food.portion.g / 100;
  const out = { ...food };
  for (const key of NUTRIENT_KEYS) {
    if (key === "ig") continue;
    out[key] = Math.round(food[key] * k * 10) / 10;
  }
  if (typeof food.alcool === "number") out.alcool = Math.round(food.alcool * k * 10) / 10;
  return out;
}

export function readState(search, nutrients) {
  const p = new URLSearchParams(search);
  const s = { n: nutrients[0].key, sort: "desc", q: "", u: "100g", cmp: [] };
  const n = p.get("n");
  if (n && nutrients.some((x) => x.key === n)) s.n = n;
  if (p.get("sort") === "asc") s.sort = "asc";
  s.q = p.get("q") || "";
  if (p.get("u") === "portion") s.u = "portion";
  s.cmp = (p.get("cmp") || "").split(",").filter(Boolean).slice(0, 2);
  return s;
}

export function writeState(state, nutrients) {
  const p = new URLSearchParams();
  if (state.n !== nutrients[0].key) p.set("n", state.n);
  if (state.sort === "asc") p.set("sort", "asc");
  if (state.q) p.set("q", state.q);
  if (state.u === "portion") p.set("u", "portion");
  if (state.cmp.length) p.set("cmp", state.cmp.join(","));
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}
