// Zero-dependency smoke tests. Run with: npm test
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Isolate all file I/O in a temp dir.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cookwhat-"));
process.env.COOKWHAT_HOME = tmp;

const { DEFAULT_CONFIG, classifyProtein } = await import("../src/config.js");
const { makeMeal, checkPlan } = await import("../src/plan.js");
const { buildShoppingList } = await import("../src/shopping.js");
const { suggestRedos } = await import("../src/history.js");
const { saveHistory } = await import("../src/store.js");
const { normalizeItem, weekOf } = await import("../src/util.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log("  \x1b[32m✓\x1b[0m " + name);
}

const cfg = structuredClone(DEFAULT_CONFIG);

test("classifyProtein maps words to categories", () => {
  assert.equal(classifyProtein("ground beef", cfg), "red_meat");
  assert.equal(classifyProtein("chicken thigh", cfg), "poultry");
  assert.equal(classifyProtein("salmon", cfg), "seafood");
  assert.equal(classifyProtein("chickpea", cfg), "vegetarian");
  assert.equal(classifyProtein("", cfg), "unknown");
});

test("normalizeItem singularizes and strips noise", () => {
  assert.equal(normalizeItem("Tomatoes (ripe)"), "tomato");
  assert.equal(normalizeItem("CLOVES of garlic"), "clove of garlic");
});

test("weekOf returns the Sunday of the week", () => {
  assert.equal(weekOf("2026-06-14"), "2026-06-14"); // a Sunday
  assert.equal(weekOf("2026-06-18"), "2026-06-14"); // Thursday -> Sun
  assert.equal(weekOf("2026-06-21"), "2026-06-21"); // a Sunday
});

test("checkPlan flags too much red meat as an error", () => {
  const menu = {
    weekOf: "2026-06-15",
    meals: [
      makeMeal({ day: "Mon", title: "Steak", protein: "beef" }, cfg),
      makeMeal({ day: "Tue", title: "Burgers", protein: "beef" }, cfg),
    ],
  };
  const res = checkPlan(menu, cfg);
  assert.ok(res.errors.some((e) => /red meat/i.test(e)), "expected red meat error");
});

test("checkPlan flags disliked ingredients", () => {
  const menu = {
    weekOf: "2026-06-15",
    meals: [makeMeal({ day: "Mon", title: "Liver and onions", protein: "beef" }, cfg)],
  };
  const res = checkPlan(menu, cfg);
  assert.ok(res.errors.some((e) => /liver/i.test(e)), "expected liver error");
});

test("buildShoppingList consolidates like items without double counting", () => {
  const menu = {
    weekOf: "2026-06-15",
    servingsDefault: 4,
    meals: [
      makeMeal(
        { day: "Mon", title: "A", servings: 4, ingredients: [{ item: "garlic", qty: 3, unit: "clove" }] },
        cfg
      ),
      makeMeal(
        { day: "Tue", title: "B", servings: 4, ingredients: [{ item: "garlic", qty: 4, unit: "clove" }] },
        cfg
      ),
    ],
  };
  const list = buildShoppingList(menu, cfg);
  const garlic = list.sections.flatMap((s) => s.items).find((i) => i.item === "garlic");
  assert.equal(garlic.qty, 7, "garlic should sum to 7, got " + garlic.qty);
});

test("buildShoppingList scales to target servings", () => {
  const menu = {
    weekOf: "2026-06-15",
    meals: [
      makeMeal(
        { day: "Mon", title: "A", servings: 4, ingredients: [{ item: "rice", qty: 2, unit: "cup" }] },
        cfg
      ),
    ],
  };
  const list = buildShoppingList(menu, cfg, { targetServings: 6 });
  const rice = list.sections.flatMap((s) => s.items).find((i) => i.item === "rice");
  assert.equal(rice.qty, 3, "rice should scale 2 -> 3 cups");
});

test("buildShoppingList excludes pantry staples but keeps named variants", () => {
  const menu = {
    weekOf: "2026-06-15",
    meals: [
      makeMeal(
        {
          day: "Mon",
          title: "A",
          servings: 4,
          ingredients: [
            { item: "kosher salt", qty: 1, unit: "tsp" },
            { item: "jasmine rice", qty: 2, unit: "cup" },
          ],
        },
        cfg
      ),
    ],
  };
  const list = buildShoppingList(menu, cfg);
  const items = list.sections.flatMap((s) => s.items).map((i) => i.item);
  assert.ok(!items.includes("kosher salt"), "salt variant should be excluded");
  assert.ok(items.includes("jasmine rice"), "jasmine rice should NOT be excluded");
});

test("suggestRedos ranks loved meals and drops low ratings", () => {
  saveHistory([
    { date: "2026-05-01", title: "Tacos", rating: 5, redo: true, cuisine: "mexican" },
    { date: "2026-05-08", title: "Tacos", rating: 5, cuisine: "mexican" },
    { date: "2026-05-02", title: "Bad Soup", rating: 2 },
  ]);
  const redos = suggestRedos({ top: 5 });
  assert.equal(redos[0].title, "Tacos");
  assert.equal(redos[0].timesCooked, 2);
  assert.ok(!redos.some((r) => r.title === "Bad Soup"), "low-rated meal should be excluded");
});

console.log(`\n\x1b[32m${passed} tests passed\x1b[0m`);
fs.rmSync(tmp, { recursive: true, force: true });
