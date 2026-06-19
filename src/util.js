import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

// Project root. Override with COOKWHAT_HOME to keep your data elsewhere.
export const ROOT = process.env.COOKWHAT_HOME
  ? path.resolve(process.env.COOKWHAT_HOME)
  : process.cwd();

export const PATHS = {
  config: path.join(ROOT, "cookwhat.config.json"),
  data: path.join(ROOT, "data"),
  menus: path.join(ROOT, "data", "menus"),
  shopping: path.join(ROOT, "data", "shopping"),
  recipes: path.join(ROOT, "data", "recipes"),
  history: path.join(ROOT, "data", "history.json"),
};

export function ensureDirs() {
  for (const d of [PATHS.data, PATHS.menus, PATHS.shopping, PATHS.recipes]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw new Error(`Could not parse ${file}: ${err.message}`);
  }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

export function exists(file) {
  return fs.existsSync(file);
}

export function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
}

export function uid() {
  return crypto.randomBytes(4).toString("hex");
}

export function todayISO() {
  return localISO(new Date());
}

// Format a Date as YYYY-MM-DD using local time (avoids UTC timezone shift).
function localISO(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${da}`;
}

// Sunday of the week containing `dateStr` (or today), as YYYY-MM-DD.
// Weeks start on Sunday.
export function weekOf(dateStr) {
  const s = dateStr || localISO(new Date());
  const d = new Date(s + "T00:00:00");
  const day = d.getDay(); // 0 = Sunday
  d.setDate(d.getDate() - day);
  return localISO(d);
}

export function round(n, dp = 2) {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}

// Minimal singularizer for ingredient de-duplication.
export function singular(word) {
  const w = String(word).toLowerCase().trim();
  if (w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.endsWith("oes")) return w.slice(0, -2);
  if (w.endsWith("ses")) return w.slice(0, -2);
  if (w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

export function normalizeItem(name) {
  return String(name)
    .toLowerCase()
    .replace(/\([^)]*\)/g, "") // drop parentheticals like "(optional)"
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map(singular)
    .join(" ")
    .trim();
}

// Prep/state words that recipes tack onto an ingredient ("garlic, minced";
// "parsley, chopped"). They describe how to cut it, not what to buy, so they
// must not split the same ingredient into two shopping lines.
const PREP_WORDS = new Set([
  "minced", "chopped", "diced", "sliced", "grated", "shredded", "crushed",
  "ground", "crumbled", "cubed", "julienned", "halved", "quartered", "fine",
  "finely", "coarse", "coarsely", "thin", "thinly", "thick", "thickly",
  "rough", "roughly", "fresh", "freshly", "peeled", "deveined", "trimmed",
  "seeded", "stemmed", "cored", "drained", "rinsed", "softened", "melted",
  "divided", "beaten", "separated", "cooked", "toasted", "room",
  "temperature", "to", "taste", "for", "serving", "garnish", "and", "or",
  "well", "lightly", "patted", "dry", "washed", "cut", "into", "pieces",
  "wedges", "rings", "strips", "zested", "juiced", "of",
]);

// Leading cut-prep adverbs safe to drop from the front of an item
// ("chopped fresh parsley" -> "fresh parsley"). Deliberately excludes "fresh",
// "ground", and colors, which distinguish what you buy ("ground beef" must not
// merge into "beef", "fresh mozzarella" not into "mozzarella").
const LEADING_PREP = new Set([
  "chopped", "minced", "diced", "sliced", "grated", "shredded", "crushed",
  "crumbled", "cubed", "julienned", "finely", "coarsely", "thinly", "roughly",
]);

// Merge key for the shopping list: drop a trailing prep clause that is *only*
// prep words ("garlic, minced" -> "garlic") and any leading cut-prep adverbs
// ("chopped fresh parsley" -> "fresh parsley"), so variants of the same buy
// consolidate, while leaving compositional descriptors alone ("bone-in,
// skin-on chicken thighs" keeps its comma because "skin-on chicken thighs"
// isn't all prep words, so it won't collapse into the boneless version).
export function coreItemName(name) {
  let core = String(name);
  const ci = core.indexOf(",");
  if (ci !== -1) {
    const after = core
      .slice(ci + 1)
      .toLowerCase()
      .replace(/[^a-z ]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    if (after.length && after.every((t) => PREP_WORDS.has(t))) {
      core = core.slice(0, ci);
    }
  }
  const tokens = normalizeItem(core).split(" ").filter(Boolean);
  while (tokens.length > 1 && LEADING_PREP.has(tokens[0])) tokens.shift();
  return tokens.join(" ");
}

// Color helpers (disabled if not a TTY or NO_COLOR set).
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const wrap = (code) => (s) => (useColor ? `\x1b[${code}m${s}\x1b[0m` : String(s));
export const c = {
  bold: wrap(1),
  dim: wrap(2),
  red: wrap(31),
  green: wrap(32),
  yellow: wrap(33),
  blue: wrap(34),
  cyan: wrap(36),
};

// Load .env from project root without requiring external deps.
// Only sets keys not already present in process.env.
export function loadDotenv() {
  const envFile = path.join(ROOT, ".env");
  if (!fs.existsSync(envFile)) return;
  for (const line of fs.readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^\s*([\w]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2].trim().replace(/^["']|["']$/g, "");
    if (!(m[1] in process.env)) process.env[m[1]] = val;
  }
}

export function die(msg) {
  console.error(c.red("Error: ") + msg);
  process.exit(1);
}
