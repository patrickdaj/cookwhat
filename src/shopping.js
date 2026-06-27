import { round, normalizeItem, coreItemName } from "./util.js";

// Lightweight category guesser used only when a meal ingredient has no category.
const CATEGORY_HINTS = {
  produce: ["lettuce", "tomato", "onion", "garlic", "pepper", "carrot", "celery", "potato", "lemon", "lime", "apple", "spinach", "kale", "herb", "cilantro", "parsley", "basil", "ginger", "mushroom", "cucumber", "zucchini", "broccoli", "avocado", "scallion", "shallot", "lettuce", "cabbage", "corn", "bean", "pea"],
  "meat-seafood": ["chicken", "beef", "pork", "lamb", "turkey", "bacon", "sausage", "fish", "salmon", "shrimp", "tuna", "cod", "scallop", "crab", "steak", "ground", "thigh", "breast"],
  dairy: ["milk", "cream", "butter", "cheese", "yogurt", "egg", "parmesan", "mozzarella", "feta", "sour cream"],
  bakery: ["bread", "bun", "tortilla", "baguette", "roll", "pita", "naan"],
  pantry: ["flour", "sugar", "oil", "vinegar", "rice", "pasta", "stock", "broth", "sauce", "paste", "honey", "syrup", "oats", "lentil", "quinoa"],
  canned: ["canned", "can ", "diced tomato", "tomato paste", "coconut milk", "chickpea", "black bean"],
  spices: ["salt", "pepper", "cumin", "paprika", "cinnamon", "oregano", "thyme", "chili powder", "curry", "spice", "bay leaf", "nutmeg"],
  frozen: ["frozen", "ice cream"],
};

function guessCategory(item) {
  const n = item.toLowerCase();
  for (const [cat, words] of Object.entries(CATEGORY_HINTS)) {
    if (words.some((w) => n.includes(w))) return cat;
  }
  return "other";
}

function isPantryStaple(name, cfg) {
  const n = normalizeItem(name);
  const tokens = new Set(n.split(" "));
  return cfg.ingredients.pantryStaples.some((s) => {
    const ns = normalizeItem(s);
    if (n === ns) return true;
    // Match when every word of the staple appears as a whole word in the
    // ingredient (so "salt" matches "kosher salt"). Variants you actually
    // buy (e.g. "jasmine rice") stay on the list by keeping bare "rice"/
    // "pasta" out of the default staples — add them if you want them hidden.
    return ns.split(" ").every((t) => tokens.has(t));
  });
}

// Convertible units, expressed in a base (volume -> tsp, weight -> oz). Lets
// "0.25 cup" + "1 tbsp" of the same item merge into one line instead of two.
// Anything not listed (clove, bunch, sprig, "", count) stays as its own unit.
const VOLUME_IN_TSP = {
  tsp: 1, teaspoon: 1, teaspoons: 1,
  tbsp: 3, tbsps: 3, tablespoon: 3, tablespoons: 3,
  cup: 48, cups: 48,
};
// Map a raw unit to a merge "dimension" + factor to its base unit. Only volume
// is canonicalized (tsp/tbsp/cup interconvert); weight (oz/lb) and counts keep
// their own unit so "0.5 lb" doesn't get rewritten as "8 oz".
function unitDimension(unit) {
  if (unit in VOLUME_IN_TSP) return { dim: "vol", factor: VOLUME_IN_TSP[unit] };
  return { dim: unit, factor: 1 }; // weight / count / bunch / sprig / unitless
}

// A value reads cleanly if it lands on a quarter (1, 0.5, 0.25, 1.75, …).
function isCleanAmount(v) {
  return Math.abs(v * 4 - Math.round(v * 4)) < 0.01;
}

// Convert an accumulated volume (in tsp) back to the largest unit that reads
// cleanly — 36 tsp -> 0.75 cup, 15 tsp -> 5 tbsp, 3.5 tsp -> 3.5 tsp.
function displayQtyUnit(line) {
  if (line.qty == null) return { qty: null, unit: line.unitLabel };
  if (line.dim !== "vol") return { qty: round(line.qty, 2), unit: line.unitLabel };
  const t = line.qty; // tsp
  for (const [unit, factor] of [["cup", 48], ["tbsp", 3], ["tsp", 1]]) {
    const v = t / factor;
    if (v >= 0.25 && isCleanAmount(v)) return { qty: round(v, 2), unit };
  }
  return { qty: round(t, 2), unit: "tsp" }; // fallback: smallest unit
}

// Fresh leafy herbs are bought by the bunch, so spoon/sprig measures across
// dishes all collapse to a single "1 bunch" line rather than fiddly amounts.
// (Dried versions live in `spices`, not `produce`, so they're never collapsed.)
const FRESH_HERBS = new Set([
  "parsley", "cilantro", "coriander", "basil", "mint", "rosemary", "thyme",
  "tarragon", "dill", "sage", "oregano", "chive", "marjoram", "chervil",
]);

// Core herb name, ignoring a leading "fresh" ("fresh basil" -> "basil").
function herbCore(item) {
  return coreItemName(item).replace(/^fresh\s+/, "");
}

function isFreshHerb(line) {
  return (
    line.category === "produce" &&
    !/\bdried\b/i.test(line.item) &&
    FRESH_HERBS.has(herbCore(line.item))
  );
}

// Build a consolidated shopping list from a menu.
// `targetServings` (optional) scales every meal to that serving count.
export function buildShoppingList(menu, cfg, { targetServings = null } = {}) {
  // key = normalizedItem + "|" + unit  -> merged line
  const merged = new Map();
  const excluded = [];

  for (const meal of menu.meals) {
    const scale =
      targetServings && meal.servings ? targetServings / meal.servings : 1;
    for (const ing of meal.ingredients || []) {
      if (!ing.item) continue;
      if (cfg.shopping.excludePantryStaples && isPantryStaple(ing.item, cfg)) {
        excluded.push(ing.item);
        continue;
      }
      const core = coreItemName(ing.item);
      const unit = (ing.unit || "").toLowerCase().trim();
      const { dim, factor } = unitDimension(unit);
      const key = `${core}|${dim}`;
      const category = ing.category || guessCategory(ing.item);
      if (!merged.has(key)) {
        merged.set(key, {
          item: ing.item,
          qty: null,
          dim,
          unitLabel: unit,
          category,
          fromMeals: [],
          hasUnquantified: false,
        });
      }
      const line = merged.get(key);
      // Prefer the cleanest display name: when variants merge ("garlic" +
      // "garlic, minced"), show the plain form (no prep clause / shortest).
      if (normalizeItem(ing.item) === core && line.item.length > ing.item.length) {
        line.item = ing.item;
      }
      if (ing.qty != null) {
        line.qty = (line.qty || 0) + ing.qty * scale * factor; // base units
      } else {
        line.hasUnquantified = true;
      }
      if (!line.fromMeals.includes(meal.title)) line.fromMeals.push(meal.title);
    }
  }

  // Collapse fresh herbs to one "1 bunch" line each (you buy a bunch, not
  // 6.5 tsp). Sum any explicit bunch counts; otherwise default to 1.
  const herbs = new Map(); // core -> merged herb line
  for (const [key, line] of merged) {
    if (!isFreshHerb(line)) continue;
    merged.delete(key);
    const core = herbCore(line.item);
    if (!herbs.has(core)) {
      herbs.set(core, {
        item: line.item, qty: 0, dim: "bunch", unitLabel: "bunch",
        category: "produce", fromMeals: [], hasUnquantified: false,
      });
    }
    const h = herbs.get(core);
    if (line.item.length < h.item.length) h.item = line.item; // cleanest name
    if (line.unitLabel === "bunch" || line.unitLabel === "bunches") {
      h.qty += line.qty || 0; // honor an explicit bunch count
    }
    for (const mt of line.fromMeals) if (!h.fromMeals.includes(mt)) h.fromMeals.push(mt);
  }
  for (const [core, h] of herbs) {
    h.qty = h.qty > 0 ? round(h.qty, 2) : 1; // at least one bunch
    merged.set(`${core}|bunch`, h);
  }

  // Group by category, ordered per config.
  const byCat = new Map();
  for (const line of merged.values()) {
    // Convert accumulated base quantity back to a friendly display unit.
    const d = displayQtyUnit(line);
    line.qty = d.qty;
    line.unit = d.unit;
    if (!byCat.has(line.category)) byCat.set(line.category, []);
    byCat.get(line.category).push(line);
  }

  const order = cfg.shopping.aisleOrder;
  const categories = [...byCat.keys()].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  const sections = categories.map((cat) => ({
    category: cat,
    items: byCat.get(cat).sort((a, b) => a.item.localeCompare(b.item)),
  }));

  // Guard: meals that contributed no ingredients are incomplete — typically a
  // cookbook "needs-scan" placeholder (planned by title, not yet scanned). Their
  // items are missing from the list until captured. "Eating out" / no-cook
  // nights are intentionally empty, so they're not pending scans.
  const pendingScans = menu.meals
    .filter((m) => !(m.ingredients || []).length && !(m.tags || []).includes("eating-out"))
    .map((m) => ({
      title: m.title,
      day: m.day || "",
      source: m.source || "",
      cookbook: !m.sourceUrl,
    }));

  return {
    weekOf: menu.weekOf,
    generatedAt: new Date().toISOString(),
    targetServings,
    sections,
    excludedStaples: [...new Set(excluded)],
    pendingScans,
    totalItems: merged.size,
  };
}

export function formatQty(line) {
  if (line.qty == null) return line.hasUnquantified ? "as needed" : "";
  const q = Number.isInteger(line.qty) ? line.qty : line.qty;
  return `${q}${line.unit ? " " + line.unit : ""}${line.hasUnquantified ? " + more" : ""}`;
}

export function renderShoppingMarkdown(list) {
  const lines = [];
  lines.push(`# Shopping List — week of ${list.weekOf}`);
  lines.push("");
  if (list.targetServings) lines.push(`_Scaled to ${list.targetServings} servings._\n`);
  if (list.pendingScans?.length) {
    lines.push(`> ⚠️ **Incomplete — scan these before shopping** (no ingredients captured yet):`);
    for (const p of list.pendingScans) {
      lines.push(`> - ${p.day ? p.day + ": " : ""}${p.title}${p.source ? ` — ${p.source}` : ""}`);
    }
    lines.push("");
  }
  for (const section of list.sections) {
    lines.push(`## ${titleCase(section.category)}`);
    for (const item of section.items) {
      const qty = formatQty(item);
      const meta = qty ? ` — ${qty}` : "";
      lines.push(`- [ ] ${item.item}${meta}`);
    }
    lines.push("");
  }
  if (list.excludedStaples.length) {
    lines.push(`> Pantry staples assumed on hand (not listed): ${list.excludedStaples.join(", ")}.`);
  }
  return lines.join("\n");
}

function titleCase(s) {
  return s.replace(/(^|[-\s])\w/g, (m) => m.toUpperCase());
}

// Plain-text format for pasting into iPhone Notes.
// Each line is a bare item so Notes' "Format → Checklist" converts them in one tap.
export function renderNotesText(list, menu) {
  const lines = [];
  lines.push(`SHOPPING LIST — WEEK OF ${list.weekOf}`);
  if (list.targetServings) lines.push(`(${list.targetServings} servings)`);
  lines.push("");

  if (list.pendingScans?.length) {
    lines.push("⚠️ NEEDS SCAN (items missing until captured):");
    for (const p of list.pendingScans) {
      lines.push(`${p.day ? p.day + ": " : ""}${p.title}${p.source ? ` — ${p.source}` : ""}`);
    }
    lines.push("");
  }

  if (menu?.meals?.length) {
    lines.push("THIS WEEK'S MEALS");
    for (const meal of menu.meals) {
      lines.push(`${meal.day}: ${meal.title}`);
      if (meal.sourceUrl) lines.push(`  ${meal.sourceUrl}`);
    }
    lines.push("");
  }

  for (const section of list.sections) {
    lines.push(titleCase(section.category).toUpperCase());
    for (const item of section.items) {
      const qty = formatQty(item);
      lines.push(qty ? `${item.item} — ${qty}` : item.item);
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
