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
  history: path.join(ROOT, "data", "history.json"),
};

export function ensureDirs() {
  for (const d of [PATHS.data, PATHS.menus, PATHS.shopping]) {
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
  return new Date().toISOString().slice(0, 10);
}

// Monday of the week containing `dateStr` (or today), as YYYY-MM-DD.
export function weekOf(dateStr) {
  const d = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - day);
  return d.toISOString().slice(0, 10);
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

export function die(msg) {
  console.error(c.red("Error: ") + msg);
  process.exit(1);
}
