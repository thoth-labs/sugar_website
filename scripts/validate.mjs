import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CATEGORIES = ["fruits", "legumes", "cereales", "proteines", "laitiers", "legumineuses", "oleagineux", "sucres", "boissons"];
export const SUGAR_KEYS = ["glucose", "fructose", "saccharose", "lactose", "maltose"];
export const NUTRIENT_KEYS = ["ig", ...SUGAR_KEYS, "glucides", "proteines", "lipides", "fibres", "calories"];
const EMOJI_BLOCKLIST = ["🫀"];
const ID_RE = /^[a-z0-9-]+$/;
const HEX_RE = /^#[0-9a-f]{6}$/i;

const isNum = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0;
const isStr = (v) => typeof v === "string" && v.trim().length > 0;

export function validateFood(f, i) {
  const p = [];
  const tag = `foods[${i}] (${f?.id ?? f?.name ?? "?"})`;
  if (!f || typeof f !== "object") return [`${tag}: not an object`];
  if (!isStr(f.id) || !ID_RE.test(f.id)) p.push(`${tag}: id must match ${ID_RE}`);
  if (!isStr(f.name)) p.push(`${tag}: name missing`);
  if (!isStr(f.emoji) || EMOJI_BLOCKLIST.includes(f.emoji)) p.push(`${tag}: emoji missing or blocked`);
  if (!CATEGORIES.includes(f.category)) p.push(`${tag}: category "${f.category}" not in ${CATEGORIES.join("|")}`);
  for (const k of NUTRIENT_KEYS) if (!isNum(f[k])) p.push(`${tag}: ${k} must be a finite number >= 0`);
  if (isNum(f.ig) && f.ig > 100) p.push(`${tag}: ig must be 0-100`);
  if (NUTRIENT_KEYS.every((k) => isNum(f[k]))) {
    const sugars = SUGAR_KEYS.reduce((s, k) => s + f[k], 0);
    if (sugars > f.glucides + 0.5) p.push(`${tag}: sugars ${sugars.toFixed(1)} exceed glucides ${f.glucides}`);
    const est = 4 * f.proteines + 4 * f.glucides + 2 * f.fibres + 9 * f.lipides;
    if (f.calories >= 20 && Math.abs(f.calories - est) > 0.2 * est) p.push(`${tag}: calories ${f.calories} differ >20% from estimate ${est.toFixed(0)}`);
  }
  if (!f.portion || !isNum(f.portion.g) || f.portion.g < 1 || f.portion.g > 1000 || !isStr(f.portion.label)) p.push(`${tag}: portion must be {g: 1-1000, label}`);
  if (!f.source || !isStr(f.source.name) || !isStr(f.source.ref) || !isStr(f.source.url) || !f.source.url.startsWith("https://")) p.push(`${tag}: source must be {name, ref, url starting with https://}`);
  if (isNum(f.ig) && f.ig > 0 && !isStr(f.igSource)) p.push(`${tag}: igSource required when ig > 0`);
  return p;
}

export function validateData({ foods, nutrients }) {
  if (!Array.isArray(foods) || !Array.isArray(nutrients)) return ["foods and nutrients must be arrays"];
  const p = [];
  foods.forEach((f, i) => p.push(...validateFood(f, i)));
  const count = (arr) => arr.reduce((m, v) => m.set(v, (m.get(v) || 0) + 1), new Map());
  for (const [id, c] of count(foods.map((f) => f?.id))) if (c > 1) p.push(`duplicate id "${id}"`);
  for (const [n, c] of count(foods.map((f) => f?.name))) if (c > 1) p.push(`duplicate name "${n}"`);
  const ids = foods.map((f) => f?.id);
  if (ids.join("\n") !== [...ids].sort().join("\n")) p.push("foods must be sorted by id");
  const byId = new Map(foods.map((f) => [f?.id, f]));
  for (const n of nutrients) {
    const tag = `nutrient "${n?.key}"`;
    if (!isStr(n?.key) || !isStr(n.label) || !isStr(n.emoji) || !isStr(n.unit) || typeof n.isSugar !== "boolean" || !isStr(n.desc)) p.push(`${tag}: key, label, emoji, unit, isSugar, desc required`);
    if (!HEX_RE.test(n?.color ?? "")) p.push(`${tag}: color must be a 6-digit hex color`);
    if (!Array.isArray(n?.surprises) || n.surprises.length < 6) p.push(`${tag}: needs at least 6 surprises`);
    for (const id of n?.surprises ?? []) {
      const f = byId.get(id);
      if (!f) p.push(`${tag}: surprise "${id}" is not a food id`);
      else if (!(f[n.key] > 0)) p.push(`${tag}: surprise "${id}" has value 0`);
    }
  }
  return p;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (isMain) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const read = (f) => JSON.parse(fs.readFileSync(path.join(root, "data", f), "utf8"));
  const foods = read("foods.json");
  const nutrients = read("nutrients.json");
  const problems = validateData({ foods, nutrients });
  const unverified = foods.filter((f) => f?.source?.name === "À vérifier").length;
  for (const m of problems) console.error("✗ " + m);
  console.log(`${foods.length} aliments, ${nutrients.length} nutriments, ${problems.length} problème(s), ${unverified} source(s) à vérifier`);
  process.exit(problems.length ? 1 : 0);
}
