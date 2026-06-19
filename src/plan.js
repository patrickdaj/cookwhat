import { uid, slug, normalizeItem } from "./util.js";
import { classifyProtein } from "./config.js";

// Build a normalized meal object from loose input (CLI flags or JSON).
export function makeMeal(input, cfg) {
  const m = {
    id: input.id || `${slug(input.title || "meal")}-${uid()}`,
    day: input.day || "",
    slot: input.slot || "dinner",
    // "main" drives the day's protein/balance; "side" is an accompanying dish.
    role: (input.role || "main").toLowerCase(),
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
  // A day can hold several dishes (a main + sides). Replace only the matching
  // dish: same id, or same day+slot+title (so re-adding a dish updates it).
  const sameDish = (m) =>
    m.id === meal.id ||
    (meal.day &&
      m.day === meal.day &&
      m.slot === meal.slot &&
      (m.title || "").toLowerCase() === (meal.title || "").toLowerCase());
  menu.meals = menu.meals.filter((m) => !sameDish(m));
  menu.meals.push(meal);
  menu.meals.sort(byDayRole);
  return menu;
}

// Weeks start on Sunday; within a day, mains come before sides.
const DAY_ORDER = { Sun: 1, Mon: 2, Tue: 3, Wed: 4, Thu: 5, Fri: 6, Sat: 7 };
const ROLE_ORDER = { main: 0, side: 1, dessert: 2 };
function byDayRole(a, b) {
  const d = (DAY_ORDER[a.day] || 9) - (DAY_ORDER[b.day] || 9);
  if (d) return d;
  const r = (ROLE_ORDER[a.role] ?? 1) - (ROLE_ORDER[b.role] ?? 1);
  if (r) return r;
  return (a.title || "").localeCompare(b.title || "");
}

// Is this dish a "main" (counts toward protein balance)?
export function isMain(m) {
  return (m.role || "main") !== "side";
}

// ---- Validation against config rules ---------------------------------------

export function checkPlan(menu, cfg) {
  const errors = [];
  const warnings = [];
  const info = [];

  const dishes = menu.meals; // every dish (mains + sides)
  const meals = dishes.filter(isMain); // mains drive the weekly balance

  // Protein balance (mains only — sides don't count)
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
    const ordered = [...meals].sort(byDayRole);
    for (let i = 1; i < ordered.length; i++) {
      const a = classifyProtein(ordered[i - 1].protein, cfg);
      const b = classifyProtein(ordered[i].protein, cfg);
      if (a !== "unknown" && a === b)
        warnings.push(`Same protein (${a}) on ${ordered[i - 1].day} and ${ordered[i].day}.`);
    }
  }

  // Rice / carb variety (cfg.carbRules). Rice = the carb on a dinner; risotto is
  // exempt (it's its own beloved dish, not "another night of rice"). Detection is
  // heuristic — it scans dinner dishes' titles + ingredient items.
  const cr = cfg.carbRules;
  if (cr) {
    const riceRe = /\b(white rice|jasmine rice|basmati rice|short-?grain rice|long-?grain rice|brown rice|fried rice|rice pilaf|sushi rice|steamed rice|rice)\b/i;
    const notRice = /rice (vinegar|wine|paper|noodle|flour)|risotto|arborio|vermicelli/i;
    const whiteRe = /\b(white|jasmine|short-?grain|long-?grain|steamed|basmati)\s+rice\b|(^|\|)\s*rice\s*($|\|)/i;
    const variety = /\b(brown rice|fried rice|rice pilaf|wild rice|sushi rice)\b/i;
    const byDay = {};
    for (const m of dishes) {
      if ((m.slot || "dinner") !== "dinner") continue;
      const tokens = [m.title, ...(m.ingredients || []).map((i) => i.item)];
      for (const tok of tokens) {
        if (!tok || !riceRe.test(tok) || notRice.test(tok)) continue;
        byDay[m.day] = byDay[m.day] || { white: false, other: false };
        if (variety.test(tok)) byDay[m.day].other = true;
        else if (whiteRe.test("|" + tok + "|")) byDay[m.day].white = true;
        else byDay[m.day].other = true;
      }
    }
    const riceDays = Object.keys(byDay).sort(
      (a, b) => (DAY_ORDER[a] || 9) - (DAY_ORDER[b] || 9)
    );
    const n = riceDays.length;
    const softMax = cr.riceMaxPerWeek ?? 3;
    const hardMax = cr.riceHardMaxPerWeek ?? 4;
    if (n > hardMax) {
      errors.push(`Rice ${n}× exceeds the hard max ${hardMax}/week — cut some back.`);
    } else if (n > softMax) {
      const allWhite = riceDays.every((d) => byDay[d].white && !byDay[d].other);
      if (allWhite && cr.fourthRiceMustNotBeAllWhite)
        errors.push(`Rice ${n}× and all plain white rice — vary it (brown/fried/pilaf) or drop one.`);
      else
        warnings.push(`Rice ${n}× is over the soft max ${softMax}/week (ok up to ${hardMax} with variety).`);
    }
    if (cr.noRiceThreeDaysInRow) {
      let run = 1;
      for (let i = 1; i < riceDays.length; i++) {
        if ((DAY_ORDER[riceDays[i]] || 0) === (DAY_ORDER[riceDays[i - 1]] || 0) + 1) {
          run++;
          if (run === 3)
            warnings.push(`Rice 3 days in a row (${riceDays[i - 2]}–${riceDays[i]}) — break it up (risotto doesn't count).`);
        } else run = 1;
      }
    }
  }

  // Disliked / allergen ingredients (check every dish, including sides)
  const blocked = [
    ...cfg.ingredients.allergies.map((x) => ({ x, kind: "allergy" })),
    ...cfg.ingredients.dislikes.map((x) => ({ x, kind: "dislike" })),
  ];
  for (const m of dishes) {
    const haystack = [m.title, ...(m.ingredients || []).map((i) => i.item)]
      .join(" ")
      .toLowerCase();
    for (const { x, kind } of blocked) {
      if (!x) continue;
      // Whole-word match so e.g. "liver" doesn't trip on "slivered almonds"
      // (and "broccoli" doesn't trip on "broccolini").
      const term = String(x).toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`\\b${term}\\b`).test(haystack)) {
        const msg = `"${m.title}" (${m.day}) contains ${kind}: ${x}.`;
        if (kind === "allergy") errors.push(msg);
        else errors.push(msg);
      }
    }
  }

  // Avoided cuisines
  for (const m of dishes) {
    if (m.cuisine && cfg.preferences.cuisines.avoid.includes(m.cuisine))
      errors.push(`"${m.title}" uses avoided cuisine: ${m.cuisine}.`);
  }

  // Weeknight time budget (per dish)
  const weekend = new Set(cfg.schedule.weekendDays);
  for (const m of dishes) {
    if (m.activeTimeMin == null) continue;
    const budget = weekend.has(m.day)
      ? cfg.constraints.maxActiveMinutesWeekend
      : cfg.constraints.maxActiveMinutesWeeknight;
    if (m.activeTimeMin > budget)
      warnings.push(`"${m.title}" (${m.day}) active time ${m.activeTimeMin}m > budget ${budget}m.`);
  }

  // Source quality (every dish should ideally have a real recipe URL)
  for (const m of dishes) {
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
