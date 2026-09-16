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
  return out;
}
