// Shared loader for the two primary datasets used by Sugar:
//   CIQUAL 2020 (ANSES, XML) and USDA SR Legacy (FoodData Central, CSV).
// Downloads on first use into <repo>/.tmp/datasets/ (git-ignored), then
// caches a compact JSON index so later runs start in well under a second.
//
// Every value returned is per 100 g, rounded to 0.1, in the shape used by
// data/foods.json. `glucides` follows the French convention (no fibres):
// USDA "carbohydrate by difference" has fibre subtracted, never below the
// sum of the five sugars.

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
export const DATA_DIR = path.join(REPO, ".tmp", "datasets");

const CIQUAL_ZIP_URL = "https://ciqual.anses.fr/cms/sites/default/files/inline-files/XML_2020_07_07.zip";
const USDA_ZIP_URL = "https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_sr_legacy_food_csv_2018-04.zip";
const USDA_DIR_NAME = "FoodData_Central_sr_legacy_food_csv_2018-04";

export const SUGARS = ["glucose", "fructose", "saccharose", "lactose", "maltose"];
export const CORE = ["calories", "proteines", "glucides", "lipides", "fibres"];

const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

export const slug = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/g, "oe")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// ---------------------------------------------------------------- download

async function download(url, dest) {
  if (fs.existsSync(dest)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  console.error(`Downloading ${url}`);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

function extract(zip, into) {
  fs.mkdirSync(into, { recursive: true });
  try {
    execFileSync("tar", ["-xf", zip, "-C", into], { stdio: "inherit" }); // bsdtar (Windows, macOS) reads zip
  } catch {
    execFileSync("unzip", ["-o", "-q", zip, "-d", into], { stdio: "inherit" }); // Linux
  }
}

// ------------------------------------------------------------------ CIQUAL

// const_code -> field
const CIQUAL_CONST = {
  328: "calories", 25000: "proteines", 31000: "glucides", 40000: "lipides", 34100: "fibres",
  32000: "sucres", 32250: "glucose", 32210: "fructose", 32480: "saccharose", 32410: "lactose", 32430: "maltose",
  60000: "alcool",
};

const unescapeXml = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/&apos;/g, "'").replace(/&quot;/g, '"');

function parseCiqualValue(raw) {
  if (raw == null) return null;
  const s = unescapeXml(raw).replace(/ /g, " ").trim();
  if (s === "" || s === "-") return null;
  if (/^traces$/i.test(s) || s.startsWith("<")) return 0;
  const n = Number(s.replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : null;
}

async function buildCiqualIndex() {
  const zip = path.join(DATA_DIR, "ciqual-2020-xml.zip");
  const dir = path.join(DATA_DIR, "ciqual");
  await download(CIQUAL_ZIP_URL, zip);
  if (!fs.existsSync(path.join(dir, "alim_2020_07_07.xml"))) extract(zip, dir);
  const dec = new TextDecoder("windows-1252");
  const read = (f) => dec.decode(fs.readFileSync(path.join(dir, f)));
  // Values like "< 0,5" appear unescaped in the XML, so capture lazily up to the closing tag.
  const tag = (block, t) => {
    const m = block.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, "i"));
    return m ? m[1].trim() : null;
  };
  const foods = {};
  for (const m of read("alim_2020_07_07.xml").matchAll(/<ALIM>([\s\S]*?)<\/ALIM>/g)) {
    const code = tag(m[1], "alim_code");
    if (code) foods[code] = { code, name: unescapeXml(tag(m[1], "alim_nom_fr") || ""), values: {} };
  }
  const re = /<COMPO>([\s\S]*?)<\/COMPO>/g;
  const compo = read("compo_2020_07_07.xml");
  let m;
  while ((m = re.exec(compo))) {
    const field = CIQUAL_CONST[tag(m[1], "const_code")];
    if (!field) continue;
    const food = foods[tag(m[1], "alim_code")];
    if (food) food.values[field] = parseCiqualValue(tag(m[1], "teneur"));
  }
  return Object.values(foods);
}

// -------------------------------------------------------------------- USDA

const USDA_NUTRIENT = {
  1008: "calories", 1003: "proteines", 1004: "lipides", 1005: "carbs", 1079: "fibres", 2000: "sucres",
  1011: "glucose", 1012: "fructose", 1010: "saccharose", 1013: "lactose", 1014: "maltose", 1018: "alcool",
};

export function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function buildUsdaIndex() {
  const zip = path.join(DATA_DIR, "usda-sr-legacy.zip");
  const dir = path.join(DATA_DIR, "usda", USDA_DIR_NAME);
  await download(USDA_ZIP_URL, zip);
  if (!fs.existsSync(path.join(dir, "food.csv"))) extract(zip, path.join(DATA_DIR, "usda"));
  const foods = {};
  const fr = parseCSV(fs.readFileSync(path.join(dir, "food.csv"), "utf8"));
  const fi = fr[0].indexOf("fdc_id"), di = fr[0].indexOf("description");
  for (const r of fr.slice(1)) if (r[fi]) foods[r[fi]] = { code: r[fi], name: r[di], values: {} };
  const nr = parseCSV(fs.readFileSync(path.join(dir, "food_nutrient.csv"), "utf8"));
  const iF = nr[0].indexOf("fdc_id"), iN = nr[0].indexOf("nutrient_id"), iA = nr[0].indexOf("amount");
  for (const r of nr.slice(1)) {
    const field = USDA_NUTRIENT[r[iN]];
    const food = field && foods[r[iF]];
    if (!food) continue;
    const a = Number(r[iA]);
    if (Number.isFinite(a)) food.values[field] = a;
  }
  return Object.values(foods);
}

// ------------------------------------------------------------------- index

async function cached(name, build) {
  const file = path.join(DATA_DIR, `${name}-index.json`);
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  const data = await build();
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
  return data;
}

export async function loadDatasets() {
  return { ciqual: await cached("ciqual", buildCiqualIndex), usda: await cached("usda", buildUsdaIndex) };
}

// Normalise one raw record into the foods.json numeric shape.
export function toFoodValues(dataset, rec) {
  const v = rec.values;
  const out = {};
  for (const k of SUGARS) out[k] = r1(v[k] ?? null);
  out.proteines = r1(v.proteines ?? null);
  out.lipides = r1(v.lipides ?? null);
  out.fibres = r1(v.fibres ?? null);
  out.calories = r1(v.calories ?? null);
  out.sucres = r1(v.sucres ?? null);
  out.alcool = r1(v.alcool ?? null);
  const sugSum = SUGARS.reduce((s, k) => s + (out[k] ?? 0), 0);
  if (dataset === "usda") {
    const carbs = v.carbs ?? null;
    out.glucides = carbs == null ? null : r1(Math.max(carbs - (v.fibres ?? 0), sugSum));
  } else {
    out.glucides = v.glucides == null ? null : r1(Math.max(v.glucides, sugSum));
  }
  return out;
}

export function sourceFor(dataset, rec) {
  return dataset === "ciqual"
    ? { name: "CIQUAL 2020", ref: String(rec.code), url: `https://ciqual.anses.fr/#/aliments/${rec.code}/${slug(rec.name)}` }
    : { name: "USDA FoodData Central", ref: String(rec.code), url: `https://fdc.nal.usda.gov/food-details/${rec.code}/nutrients` };
}

export function completeness(vals) {
  return {
    core: CORE.filter((k) => vals[k] != null).length,
    sugars: SUGARS.filter((k) => vals[k] != null).length,
  };
}
