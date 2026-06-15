import { PATHS, readJson, writeJson, exists } from "./util.js";

// The default configuration. Every option is documented in docs/CONFIG.md.
// `cookwhat init` writes this to cookwhat.config.json so you can edit it.
export const DEFAULT_CONFIG = {
  household: {
    people: 4,
    adults: 2,
    kids: 2,
    defaultServings: 4,
    notes: "",
  },

  schedule: {
    // Which days to plan dinners for. Trim this if you don't cook every night.
    daysToPlan: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    // Meal slots per day. Add "lunch"/"breakfast" if you plan those too.
    mealsPerDay: ["dinner"],
    // Days treated as "weekend" for time/effort budgets below.
    weekendDays: ["Sat", "Sun"],
  },

  preferences: {
    // Cuisines you love get prioritized; "avoid" are excluded.
    cuisines: {
      love: ["italian", "thai", "mexican", "mediterranean"],
      ok: ["american", "indian", "chinese", "japanese", "french", "korean"],
      avoid: [],
    },
    // Reputable recipe sites to draw from, in rough priority order.
    preferredSites: [
      "seriouseats.com",
      "cooking.nytimes.com",
      "bonappetit.com",
      "americastestkitchen.com",
      "smittenkitchen.com",
      "kingarthurbaking.com",
      "thekitchn.com",
      "epicurious.com",
    ],
    // Sites to never pull recipes from.
    avoidSites: [],
  },

  // Weekly balance rules. The validator (`cookwhat plan check`) enforces these.
  proteinRules: {
    redMeatMaxPerWeek: 1, // "red meat once a week" — beef, pork, lamb, etc.
    poultryMaxPerWeek: 3,
    seafoodMinPerWeek: 1,
    vegetarianMinPerWeek: 2,
    vegetarianMaxPerWeek: null, // null = no cap; set to 0 to exclude entirely
    noRepeatProteinTwoDaysInRow: true,
    // Override how a protein word maps to a category. Defaults below.
    classification: {
      red_meat: ["beef", "pork", "lamb", "veal", "goat", "venison", "bison", "sausage", "bacon"],
      poultry: ["chicken", "turkey", "duck"],
      seafood: ["fish", "salmon", "tuna", "cod", "shrimp", "scallop", "crab", "lobster", "clam", "mussel", "seafood"],
      vegetarian: ["tofu", "tempeh", "bean", "lentil", "chickpea", "egg", "paneer", "vegetable", "veg", "vegetarian", "vegan", "mushroom"],
    },
  },

  ingredients: {
    // Hard avoids — flagged as errors if they appear in any meal.
    dislikes: ["liver", "organ meat", "raw oyster"],
    // Allergies — always treated as hard, safety-critical avoids.
    allergies: [],
    favorites: [],
    // Pantry staples you always have. Excluded from shopping lists.
    pantryStaples: [
      "salt", "black pepper", "olive oil", "vegetable oil", "water",
      "butter", "all-purpose flour", "sugar",
      "baking soda", "baking powder", "soy sauce",
    ],
  },

  // Effort / time budgets used by the validator and by Claude when planning.
  constraints: {
    maxActiveMinutesWeeknight: 45,
    maxActiveMinutesWeekend: 120,
    weeknightDifficulty: "easy-to-medium", // free text guidance for Claude
    leftoversOk: true,
    // Avoid repeating meals cooked in the last N days (unless it's a "redo").
    avoidRepeatWithinDays: 21,
    useSeasonalProduce: true,
  },

  // Nutrition goals the plan should lean toward (guidance for Claude).
  nutrition: {
    goals: ["vegetable-forward", "whole-grains-over-refined", "limit-deep-fried", "balanced-macros"],
    notes: "",
  },

  shopping: {
    excludePantryStaples: true,
    // Order categories appear in your store, for an efficient shop.
    aisleOrder: [
      "produce", "meat-seafood", "dairy", "bakery", "deli",
      "pantry", "canned", "spices", "frozen", "beverages", "other",
    ],
  },
};

export function loadConfig({ required = true } = {}) {
  const cfg = readJson(PATHS.config, null);
  if (!cfg) {
    if (required) {
      throw new Error(
        "No cookwhat.config.json found. Run `cookwhat init` to create one."
      );
    }
    return structuredClone(DEFAULT_CONFIG);
  }
  // Shallow-merge defaults so new options appear for old config files.
  return deepMerge(structuredClone(DEFAULT_CONFIG), cfg);
}

export function saveConfig(cfg) {
  writeJson(PATHS.config, cfg);
}

export function configExists() {
  return exists(PATHS.config);
}

function deepMerge(base, override) {
  if (Array.isArray(override)) return override; // arrays replace, not merge
  if (override && typeof override === "object" && !Array.isArray(override)) {
    const out = { ...base };
    for (const k of Object.keys(override)) {
      out[k] =
        base && typeof base[k] === "object" && !Array.isArray(base[k])
          ? deepMerge(base[k] ?? {}, override[k])
          : override[k];
    }
    return out;
  }
  return override;
}

// Map a free-text protein word to a balance category.
export function classifyProtein(protein, cfg) {
  if (!protein) return "unknown";
  const p = String(protein).toLowerCase();
  const map = cfg.proteinRules.classification;
  for (const [category, words] of Object.entries(map)) {
    if (words.some((w) => p.includes(w))) return category;
  }
  return "other";
}
