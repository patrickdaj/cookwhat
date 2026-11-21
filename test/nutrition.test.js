// Nutrition estimates: validator, per-day totals, plan check and CLI.
// Zero-dependency, like smoke.test.js. Run with: npm test
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cookwhat-nutr-"));
process.env.COOKWHAT_HOME = tmp;

const { DEFAULT_CONFIG } = await import("../src/config.js");
const { makeMeal, checkPlan } = await import("../src/plan.js");
const {
  validateNutrition,
  nutritionByDay,
  targetWarnings,
  roundPerServing,
  daysEaten,
  PER_SERVING_KEYS,
} = await import("../src/nutrition.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log("  \x1b[32m✓\x1b[0m " + name);
}

const cfg = structuredClone(DEFAULT_CONFIG);

function block(over = {}) {
  return {
    perServing: {
      calories: 480,
      proteinG: 38,
      carbsG: 24,
      fatG: 22,
      saturatedFatG: 5,
      fiberG: 4,
      sodiumMg: 620,
      potassiumMg: 900,
    },
    servings: 4,
    servingDescription: "1 thigh plus about 1.5 cups broth and vegetables",
    method: "estimated",
    confidence: "medium",
    sodiumConfidence: "low",
    sodiumDrivers: ["chicken broth", "added salt"],
    assumptions: ["1 tsp Diamond Crystal kosher salt total"],
    estimatedAt: "2026-11-20",
    ...over,
  };
}

test("validateNutrition accepts a complete block", () => {
  assert.deepEqual(validateNutrition(block(), { servings: 4 }), []);
});

test("validateNutrition reports each missing perServing key", () => {
  const b = block();
  delete b.perServing.sodiumMg;
  delete b.perServing.potassiumMg;
  const errs = validateNutrition(b);
  assert.ok(errs.some((e) => /sodiumMg is missing/.test(e)));
  assert.ok(errs.some((e) => /potassiumMg is missing/.test(e)));
});

test("validateNutrition rejects negative and non-numeric values", () => {
  const b = block();
  b.perServing.fatG = -3;
  b.perServing.fiberG = "4";
  const errs = validateNutrition(b);
  assert.ok(errs.some((e) => /fatG must not be negative/.test(e)));
  assert.ok(errs.some((e) => /fiberG must be a number/.test(e)));
});

test("validateNutrition rejects unknown enum values", () => {
  const errs = validateNutrition(block({ method: "guessed", confidence: "very", sodiumConfidence: "" }));
  assert.ok(errs.some((e) => /^method must be one of/.test(e)));
  assert.ok(errs.some((e) => /^confidence must be one of/.test(e)));
  assert.ok(errs.some((e) => /^sodiumConfidence must be one of/.test(e)));
});

test("validateNutrition checks servings, drivers, assumptions and date", () => {
  const errs = validateNutrition(
    block({ servings: 6, sodiumDrivers: ["a", "b", "c", "d"], assumptions: "none", estimatedAt: "Nov 20" }),
    { servings: 4 }
  );
  assert.ok(errs.some((e) => /does not match the meal's servings/.test(e)));
  assert.ok(errs.some((e) => /at most 3/.test(e)));
  assert.ok(errs.some((e) => /assumptions must be a list/.test(e)));
  assert.ok(errs.some((e) => /estimatedAt/.test(e)));
});

test("roundPerServing rounds calories and mg to 10, grams to 1", () => {
  const r = roundPerServing({ calories: 483, proteinG: 37.6, sodiumMg: 624, potassiumMg: 905, fiberG: 4.4 });
  assert.equal(r.calories, 480);
  assert.equal(r.proteinG, 38);
  assert.equal(r.sodiumMg, 620);
  assert.equal(r.potassiumMg, 910);
  assert.equal(r.fiberG, 4);
});

test("makeMeal keeps nutrition, rounds it, and fills in servings", () => {
  const b = block();
  delete b.servings;
  b.perServing.calories = 487;
  const m = makeMeal({ day: "Sun", title: "A", servings: 6, nutrition: b }, cfg);
  assert.equal(m.nutrition.servings, 6);
  assert.equal(m.nutrition.perServing.calories, 490);
});

function menuWith(meals) {
  return { weekOf: "2026-11-22", nutritionSchemaVersion: 1, meals: meals.map((m) => makeMeal(m, cfg)) };
}

test("nutritionByDay sums one serving of each dish per day, including covers-<day>", () => {
  const menu = menuWith([
    { day: "Sun", title: "Main", protein: "chicken", servings: 4, tags: ["covers-mon"], nutrition: block() },
    { day: "Sun", title: "Side", role: "side", servings: 4, nutrition: block() },
    { day: "Tue", title: "Other", protein: "fish", servings: 4, nutrition: block() },
  ]);
  const days = nutritionByDay(menu);
  const sun = days.find((d) => d.day === "Sun");
  const mon = days.find((d) => d.day === "Mon");
  assert.equal(sun.totals.calories, 960);
  assert.equal(sun.totals.sodiumMg, 1240);
  assert.equal(mon.totals.calories, 480, "Monday gets the covered leftover only");
  assert.ok(mon.dishes[0].leftover);
  assert.deepEqual(days.map((d) => d.day), ["Sun", "Mon", "Tue"]);
  for (const k of PER_SERVING_KEYS) assert.equal(typeof sun.totals[k], "number");
});

test("daysEaten ignores non-day covers tags", () => {
  assert.deepEqual(daysEaten({ day: "Sun", tags: ["covers-mon", "covers-lunch", "batch"] }), ["Sun", "Mon"]);
});

test("nutritionByDay leaves out invalid blocks and counts them as missing", () => {
  const menu = menuWith([
    { day: "Sun", title: "Good", servings: 4, nutrition: block() },
    { day: "Sun", title: "None", servings: 4 },
  ]);
  const sun = nutritionByDay(menu)[0];
  assert.equal(sun.totals.calories, 480);
  assert.equal(sun.missing.length, 1);
});

test("checkPlan warns (does not fail) on a meal missing nutrition", () => {
  const menu = menuWith([
    { day: "Sun", title: "Has it", protein: "chicken", servings: 4, nutrition: block() },
    { day: "Mon", title: "Lacks it", protein: "fish", servings: 4 },
  ]);
  const res = checkPlan(menu, cfg);
  assert.ok(res.warnings.some((w) => /"Lacks it" \(Mon\) has no nutrition estimate/.test(w)));
  assert.ok(!res.warnings.some((w) => /"Has it"/.test(w) && /nutrition/.test(w)));
  assert.ok(!res.errors.some((e) => /nutrition/i.test(e)), "nutrition never produces errors");
  assert.ok(res.nutrition.days.length >= 1, "per-day totals are returned");
});

test("target comparison is off without targets and warns over the dinner share", () => {
  const menu = menuWith([{ day: "Sun", title: "Salty", servings: 4, nutrition: block() }]);
  const days = nutritionByDay(menu);
  assert.deepEqual(targetWarnings(days, cfg), [], "no targets set → no warnings");
  const withTargets = structuredClone(cfg);
  withTargets.nutrition.targets = { sodiumMg: 1500, calories: 2000, fiberG: 5, proteinG: 50 };
  const w = targetWarnings(days, withTargets); // share 0.4: sodium 600, kcal 800
  assert.equal(w.length, 1, "only sodium is over (fiber/protein are floors, never flagged)");
  assert.match(w[0], /Sun dinner is 620 sodium \(mg\), over its 40% share/);
  withTargets.nutrition.dinnerShare = 0.5; // sodium limit 750
  assert.deepEqual(targetWarnings(days, withTargets), []);
});

// ---- CLI -------------------------------------------------------------------

const BIN = fileURLToPath(new URL("../bin/cookwhat.js", import.meta.url));
function cli(...args) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd: tmp,
    env: { ...process.env, COOKWHAT_HOME: tmp, NO_COLOR: "1" },
    encoding: "utf8",
  });
}
function writePlan(name, meals) {
  const f = path.join(tmp, name);
  fs.writeFileSync(f, JSON.stringify({ meals }));
  return f;
}

assert.equal(cli("init").status, 0, "init should succeed");

test("plan import rejects a missing key, a negative number or an unknown method", () => {
  const missing = block();
  delete missing.perServing.fiberG;
  const negative = block();
  negative.perServing.calories = -10;
  for (const [i, nb] of [missing, negative, block({ method: "vibes" })].entries()) {
    const f = writePlan(`bad${i}.json`, [{ day: "Sun", title: "Bad", servings: 4, nutrition: nb }]);
    const r = cli("plan", "import", "--week", "2026-11-22", "--file", f);
    assert.notEqual(r.status, 0, `import ${i} should fail`);
    assert.match(r.stdout + r.stderr, /Invalid nutrition/);
  }
  assert.ok(!fs.existsSync(path.join(tmp, "data", "menus", "2026-11-22.json")), "nothing saved");
});

test("plan add rejects an invalid nutrition block", () => {
  const r = cli("plan", "add", "--week", "2026-11-29", "--json",
    JSON.stringify({ day: "Sun", title: "Bad", servings: 4, nutrition: block({ confidence: "sure" }) }));
  assert.notEqual(r.status, 0);
});

test("plan import accepts valid blocks and nutrition --json returns the tracker fields", () => {
  const f = writePlan("good.json", [
    { id: "main-dish", day: "Sun", title: "Main", protein: "chicken", servings: 4, tags: ["covers-mon"], nutrition: block() },
    { id: "side-dish", day: "Sun", title: "Side", role: "side", servings: 4, nutrition: block() },
  ]);
  const imp = cli("plan", "import", "--week", "2026-11-22", "--file", f);
  assert.equal(imp.status, 0, imp.stdout + imp.stderr);
  const r = cli("nutrition", "2026-11-22", "--json");
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.nutritionSchemaVersion, 1);
  assert.equal(out.weekOf, "2026-11-22");
  for (const m of out.meals) {
    for (const k of ["id", "day", "slot", "title", "role"]) assert.ok(m[k], `meal.${k}`);
    assert.ok(m.nutrition.perServing && m.nutrition.servingDescription);
    assert.ok(m.nutrition.confidence && m.nutrition.sodiumConfidence);
  }
  assert.equal(out.dayTotals.find((d) => d.day === "Sun").totals.calories, 960);
  assert.equal(out.dayTotals.find((d) => d.day === "Mon").totals.calories, 480);
  const check = cli("plan", "check", "2026-11-22");
  assert.match(check.stdout, /Per-day totals/);
  assert.doesNotMatch(check.stdout, /nutrition estimate/);
});

console.log(`\n\x1b[32m${passed} nutrition tests passed\x1b[0m`);
fs.rmSync(tmp, { recursive: true, force: true });
