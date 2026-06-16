import { uid, slug, normalizeItem } from "./util.js";
import { classifyProtein } from "./config.js";

// Build a normalized meal object from loose input (CLI flags or JSON).
export function makeMeal(input, cfg) {
  const m = {
    id: input.id || `${slug(input.title || "meal")}-${uid()}`,
    day: input.day || "",
    slot: input.slot || "dinner",
    title: input.title || "Untitled",
    source: input.source || "",
    sourceUrl: input.sourceUrl || input.url || "",
    cuisine: (input.cuisine || "").toLowerCase(),
    protein: (input.protein || "").toLowerCase(),
    tags: input.tags || [],
    activeTimeMin: numOrNull(input.activeTimeMin ?? input.activeMin),
    totalTimeMin: numOrNull(input.totalTimeMin ?? input.totalMin),
    servings: numOrNull(input.servings) ?? cfg.household.defaultServings,
    ingredients: (input.ingredients || []).map(normIngredient),
    notes: input.notes || "",
  };
  return m;
}

function normIngredient(ing) {
  if (typeof ing === "string") {
    return { item: ing, qty: null, unit: "", category: "" };
  }
  return {
    item: ing.item || ing.name || "",
    qty: ing.qty == null || ing.qty === "" ? null : Number(ing.qty),
    unit: ing.unit || "",
    category: (ing.category || "").toLowerCase(),
    note: ing.note || "",
  };
}

function numOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function addMeal(menu, meal) {
  // Replace any existing meal for the same day+slot.
  menu.meals = menu.meals.filter(
    (m) => !(m.day === meal.day && m.slot === meal.slot && meal.day)
  );
  menu.meals.push(meal);
  menu.meals.sort(byDaySlot);
  return menu;
}

// Weeks start on Sunday.
const DAY_ORDER = { Sun: 1, Mon: 2, Tue: 3, Wed: 4, Thu: 5, Fri: 6, Sat: 7 };
function byDaySlot(a, b) {
  return (DAY_ORDER[a.day] || 9) - (DAY_ORDER[b.day] || 9);
}

// ---- Validation against config rules ---------------------------------------

export function checkPlan(menu, cfg) {
  const errors = [];
  const warnings = [];
  const info = [];

  const meals = menu.meals.filter((m) => m.slot === "dinner" || true);

  // Protein balance
  const counts = { red_meat: 0, poultry: 0, seafood: 0, vegetarian: 0, other: 0, unknown: 0 };
  for (const m of meals) counts[classifyProtein(m.protein, cfg)]++;
  const r = cfg.proteinRules;

  if (counts.red_meat > r.redMeatMaxPerWeek)
    errors.push(`Red meat ${counts.red_meat}× exceeds max ${r.redMeatMaxPerWeek}/week.`);
  if (counts.poultry > r.poultryMaxPerWeek)
    warnings.push(`Poultry ${counts.poultry}× exceeds max ${r.poultryMaxPerWeek}/week.`);
  if (counts.seafood < r.seafoodMinPerWeek)
    warnings.push(`Seafood ${counts.seafood}× is below min ${r.seafoodMinPerWeek}/week.`);
  if (counts.vegetarian < r.vegetarianMinPerWeek)
    warnings.push(`Vegetarian ${counts.vegetarian}× is below min ${r.vegetarianMinPerWeek}/week.`);
  if (r.vegetarianMaxPerWeek != null && counts.vegetarian > r.vegetarianMaxPerWeek)
    errors.push(`Vegetarian ${counts.vegetarian}× exceeds max ${r.vegetarianMaxPerWeek}/week.`);
  if (counts.unknown > 0)
    info.push(`${counts.unknown} meal(s) have no protein set — can't balance-check them.`);

  // No same protein two days in a row
  if (r.noRepeatProteinTwoDaysInRow) {
    const ordered = [...meals].sort(byDaySlot);
    for (let i = 1; i < ordered.length; i++) {
      const a = classifyProtein(ordered[i - 1].protein, cfg);
      const b = classifyProtein(ordered[i].protein, cfg);
      if (a !== "unknown" && a === b)
        warnings.push(`Same protein (${a}) on ${ordered[i - 1].day} and ${ordered[i].day}.`);
    }
  }

  // Disliked / allergen ingredients
  const blocked = [
    ...cfg.ingredients.allergies.map((x) => ({ x, kind: "allergy" })),
    ...cfg.ingredients.dislikes.map((x) => ({ x, kind: "dislike" })),
  ];
  for (const m of meals) {
    const haystack = [m.title, ...(m.ingredients || []).map((i) => i.item)]
      .join(" ")
      .toLowerCase();
    for (const { x, kind } of blocked) {
      if (x && haystack.includes(String(x).toLowerCase())) {
        const msg = `"${m.title}" (${m.day}) contains ${kind}: ${x}.`;
        if (kind === "allergy") errors.push(msg);
        else errors.push(msg);
      }
    }
  }

  // Avoided cuisines
  for (const m of meals) {
    if (m.cuisine && cfg.preferences.cuisines.avoid.includes(m.cuisine))
      errors.push(`"${m.title}" uses avoided cuisine: ${m.cuisine}.`);
  }

  // Weeknight time budget
  const weekend = new Set(cfg.schedule.weekendDays);
  for (const m of meals) {
    if (m.activeTimeMin == null) continue;
    const budget = weekend.has(m.day)
      ? cfg.constraints.maxActiveMinutesWeekend
      : cfg.constraints.maxActiveMinutesWeeknight;
    if (m.activeTimeMin > budget)
      warnings.push(`"${m.title}" (${m.day}) active time ${m.activeTimeMin}m > budget ${budget}m.`);
  }

  // Source quality
  for (const m of meals) {
    if (!m.sourceUrl) {
      warnings.push(`"${m.title}" has no source URL.`);
      continue;
    }
    const host = hostOf(m.sourceUrl);
    if (cfg.preferences.avoidSites.some((s) => host.includes(s)))
      errors.push(`"${m.title}" sourced from avoided site: ${host}.`);
    else if (!cfg.preferences.preferredSites.some((s) => host.includes(s)))
      info.push(`"${m.title}" source ${host} is not in your preferred sites list.`);
  }

  // Coverage: did we plan all requested slots?
  const wanted = [];
  for (const day of cfg.schedule.daysToPlan)
    for (const slot of cfg.schedule.mealsPerDay) wanted.push(`${day}/${slot}`);
  const have = new Set(meals.map((m) => `${m.day}/${m.slot}`));
  const missing = wanted.filter((w) => !have.has(w));
  if (missing.length) info.push(`Unplanned slots: ${missing.join(", ")}.`);

  return { errors, warnings, info, counts };
}

export function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
