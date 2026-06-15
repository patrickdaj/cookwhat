import { round, normalizeItem } from "./util.js";

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
      const norm = normalizeItem(ing.item);
      const unit = (ing.unit || "").toLowerCase().trim();
      const key = `${norm}|${unit}`;
      const category = ing.category || guessCategory(ing.item);
      if (!merged.has(key)) {
        merged.set(key, {
          item: ing.item,
          qty: null,
          unit,
          category,
          fromMeals: [],
          hasUnquantified: false,
        });
      }
      const line = merged.get(key);
      if (ing.qty != null) {
        line.qty = (line.qty || 0) + ing.qty * scale;
      } else {
        line.hasUnquantified = true;
      }
      if (!line.fromMeals.includes(meal.title)) line.fromMeals.push(meal.title);
    }
  }

  // Group by category, ordered per config.
  const byCat = new Map();
  for (const line of merged.values()) {
    if (line.qty != null) line.qty = round(line.qty, 2);
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

  return {
    weekOf: menu.weekOf,
    generatedAt: new Date().toISOString(),
    targetServings,
    sections,
    excludedStaples: [...new Set(excluded)],
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
export function renderNotesText(list) {
  const lines = [];
  lines.push(`SHOPPING LIST — WEEK OF ${list.weekOf}`);
  if (list.targetServings) lines.push(`(${list.targetServings} servings)`);
  lines.push("");
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
