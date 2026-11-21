// Per-serving nutrition estimates on menu meals (docs/NUTRITION.md).
//
// Claude writes a `nutrition` block onto each meal when it plans a week. This
// module validates those blocks, adds them up per day, and compares dinners
// against the optional daily targets in `cfg.nutrition.targets`.

export const NUTRITION_SCHEMA_VERSION = 1;

export const PER_SERVING_KEYS = [
  "calories",
  "proteinG",
  "carbsG",
  "fatG",
  "saturatedFatG",
  "fiberG",
  "sodiumMg",
  "potassiumMg",
];

// Daily targets a user can set (potassium is tracked but has no target).
export const TARGET_KEYS = [
  "calories",
  "proteinG",
  "carbsG",
  "fatG",
  "saturatedFatG",
  "fiberG",
  "sodiumMg",
];

// Targets that are ceilings: a dinner over its share gets a warning. Protein and
// fiber are things to reach, so going over is never flagged.
const CEILING_KEYS = ["calories", "carbsG", "fatG", "saturatedFatG", "sodiumMg"];

export const METHODS = ["estimated", "source", "manual"];
export const CONFIDENCE = ["high", "medium", "low"];
export const DEFAULT_DINNER_SHARE = 0.4;

const DAY_ORDER = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const LABELS = {
  calories: "calories",
  proteinG: "protein (g)",
  carbsG: "carbs (g)",
  fatG: "fat (g)",
  saturatedFatG: "saturated fat (g)",
  fiberG: "fiber (g)",
  sodiumMg: "sodium (mg)",
  potassiumMg: "potassium (mg)",
};

const isObj = (v) => v != null && typeof v === "object" && !Array.isArray(v);
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

// Round to the spec's precision: calories and milligrams to 10, grams to 1.
export function roundPerServing(ps) {
  const out = { ...ps };
  for (const k of PER_SERVING_KEYS) {
    if (!isNum(out[k])) continue;
    out[k] = k === "calories" || k.endsWith("Mg") ? Math.round(out[k] / 10) * 10 : Math.round(out[k]);
  }
  return out;
}

// Light normalization when a meal is built: round the numbers, and copy the
// meal's servings in when the block leaves them out. Everything else is kept
// as given so the validator can report on it.
export function normalizeNutrition(n, mealServings) {
  if (!isObj(n)) return n;
  const out = { ...n };
  if (isObj(out.perServing)) out.perServing = roundPerServing(out.perServing);
  if (out.servings == null && mealServings != null) out.servings = mealServings;
  return out;
}

// Returns a list of problems; an empty list means the block is valid.
// Pass the meal's servings to check that the block divides by the same number.
export function validateNutrition(n, { servings } = {}) {
  const errs = [];
  if (!isObj(n)) return ["nutrition must be an object"];

  if (!isObj(n.perServing)) {
    errs.push("perServing is missing");
  } else {
    for (const k of PER_SERVING_KEYS) {
      const v = n.perServing[k];
      if (v === undefined || v === null) errs.push(`perServing.${k} is missing`);
      else if (!isNum(v)) errs.push(`perServing.${k} must be a number`);
      else if (v < 0) errs.push(`perServing.${k} must not be negative`);
    }
  }

  if (!isNum(n.servings) || n.servings <= 0) errs.push("servings must be a positive number");
  else if (isNum(servings) && n.servings !== servings)
    errs.push(`servings (${n.servings}) does not match the meal's servings (${servings})`);

  if (typeof n.servingDescription !== "string" || !n.servingDescription.trim())
    errs.push("servingDescription is missing");
  if (!METHODS.includes(n.method))
    errs.push(`method must be one of ${METHODS.join(", ")} (got ${JSON.stringify(n.method)})`);
  for (const k of ["confidence", "sodiumConfidence"]) {
    if (!CONFIDENCE.includes(n[k]))
      errs.push(`${k} must be one of ${CONFIDENCE.join(", ")} (got ${JSON.stringify(n[k])})`);
  }
  if (!Array.isArray(n.sodiumDrivers) || n.sodiumDrivers.some((s) => typeof s !== "string"))
    errs.push("sodiumDrivers must be a list of strings");
  else if (n.sodiumDrivers.length > 3) errs.push("sodiumDrivers lists at most 3 ingredients");
  if (!Array.isArray(n.assumptions) || n.assumptions.some((s) => typeof s !== "string"))
    errs.push("assumptions must be a list of strings");
  if (typeof n.estimatedAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(n.estimatedAt))
    errs.push("estimatedAt must be a YYYY-MM-DD date");

  return errs;
}

export function hasValidNutrition(meal) {
  return isObj(meal.nutrition) && validateNutrition(meal.nutrition, { servings: meal.servings }).length === 0;
}

// Days a dish is eaten on: the day it's planned, plus any `covers-<day>` tags
// (a batch cooked Sunday and eaten again Monday carries its block once, on
// Sunday, with a `covers-mon` tag).
export function daysEaten(meal) {
  const days = meal.day ? [meal.day] : [];
  for (const t of meal.tags || []) {
    const m = /^covers-(sun|mon|tue|wed|thu|fri|sat)$/i.exec(t);
    if (!m) continue;
    const d = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
    if (!days.includes(d)) days.push(d);
  }
  return days;
}

const zero = () => Object.fromEntries(PER_SERVING_KEYS.map((k) => [k, 0]));

// A dish on the table that the person tracking (the one watching blood
// pressure) skips, such as garlic toasts that are just for his wife. It keeps
// its estimate but is left out of the per-day totals and target checks.
export function isOptional(meal) {
  return (meal.tags || []).some((t) => String(t).toLowerCase() === "optional");
}

// Per-day totals: one serving of every dish a person eats that day. Only valid
// blocks are added; `missing` counts the dishes left out and `optional` lists
// dishes tagged optional (not added).
export function nutritionByDay(menu) {
  const byDay = new Map();
  const get = (d) => {
    if (!byDay.has(d))
      byDay.set(d, { day: d, dishes: [], missing: [], optional: [], totals: zero(), dinner: zero(), exempt: false });
    return byDay.get(d);
  };
  for (const m of menu.meals || []) {
    for (const d of daysEaten(m)) {
      const row = get(d);
      const ref = { id: m.id, title: m.title, slot: m.slot || "dinner", leftover: d !== m.day };
      if (isOptional(m)) {
        row.optional.push(ref);
        continue;
      }
      if (ref.slot === "dinner" && isTargetExempt(m)) row.exempt = true;
      if (!hasValidNutrition(m)) {
        row.missing.push(ref);
        continue;
      }
      row.dishes.push(ref);
      for (const k of PER_SERVING_KEYS) {
        row.totals[k] += m.nutrition.perServing[k];
        if (ref.slot === "dinner") row.dinner[k] += m.nutrition.perServing[k];
      }
    }
  }
  return [...byDay.values()].sort((a, b) => DAY_ORDER.indexOf(a.day) - DAY_ORDER.indexOf(b.day));
}

// The numeric targets that are set (zero, blank or non-numbers are ignored).
export function activeTargets(cfg) {
  const t = (cfg.nutrition && cfg.nutrition.targets) || {};
  const out = {};
  for (const k of TARGET_KEYS) if (isNum(t[k]) && t[k] > 0) out[k] = t[k];
  return out;
}

export function dinnerShare(cfg) {
  const s = cfg.nutrition && cfg.nutrition.dinnerShare;
  return isNum(s) && s > 0 && s <= 1 ? s : DEFAULT_DINNER_SHARE;
}

// Holiday and celebration dinners still get totals but no target warnings.
const EXEMPT_TAGS = ["holiday", "celebration"];
export function isTargetExempt(meal) {
  return (meal.tags || []).some((t) => EXEMPT_TAGS.includes(String(t).toLowerCase()));
}

// Warnings for days whose dinner goes over its share of a ceiling target.
export function targetWarnings(days, cfg) {
  const targets = activeTargets(cfg);
  const share = dinnerShare(cfg);
  const out = [];
  for (const row of days) {
    for (const k of CEILING_KEYS) {
      if (targets[k] == null || !row.dishes.some((d) => d.slot === "dinner")) continue;
      if (row.exempt) continue;
      const limit = targets[k] * share;
      if (row.dinner[k] > limit)
        out.push(
          `${row.day} dinner is ${fmt(row.dinner[k])} ${LABELS[k]}, over its ` +
            `${Math.round(share * 100)}% share of the daily target (${fmt(limit)} of ${fmt(targets[k])}).`
        );
    }
  }
  return out;
}

// Everything plan check needs: per-meal problems, per-day totals and target
// warnings.
export function checkNutrition(menu, cfg) {
  const warnings = [];
  const meals = menu.meals || [];
  for (const m of meals) {
    const where = m.day ? ` (${m.day})` : "";
    if (m.nutrition == null) {
      warnings.push(`"${m.title}"${where} has no nutrition estimate.`);
      continue;
    }
    const errs = validateNutrition(m.nutrition, { servings: m.servings });
    if (errs.length) warnings.push(`"${m.title}"${where} has an invalid nutrition block: ${errs.join("; ")}.`);
  }
  if (meals.some((m) => m.nutrition != null) && menu.nutritionSchemaVersion == null)
    warnings.push(`Menu has nutrition blocks but no nutritionSchemaVersion (expected ${NUTRITION_SCHEMA_VERSION}).`);
  const days = nutritionByDay(menu);
  warnings.push(...targetWarnings(days, cfg));
  return {
    warnings,
    days,
    targets: activeTargets(cfg),
    dinnerShare: dinnerShare(cfg),
  };
}

function fmt(n) {
  return Math.round(n).toLocaleString("en-US");
}
