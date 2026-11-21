# Nutrition estimates

Each meal on a menu has an estimated **per-serving nutrition block**, written by
Claude when it plans the week. The estimates support weight loss, sodium
tracking and macro tracking:

- `plan check` prints per-day totals and compares dinners against your targets.
- `cookwhat nutrition <week> --json` gives a separate photo-tracker app the
  numbers for a planned meal, so it doesn't have to estimate them from a picture.

Menus from the week of 2026-11-22 on carry these blocks. Older menus aren't
backfilled, so `plan check` on an older week warns about every meal.

## Schema (version 1)

The menu has `"nutritionSchemaVersion": 1` at the top level, and each meal has
a `nutrition` object:

```json
"nutrition": {
  "perServing": {
    "calories": 440, "proteinG": 34, "carbsG": 22, "fatG": 22,
    "saturatedFatG": 6, "fiberG": 3, "sodiumMg": 590, "potassiumMg": 970
  },
  "servings": 6,
  "servingDescription": "1 1/3 thighs with about 1 1/2 cups broth, potatoes and fennel",
  "method": "estimated",
  "confidence": "medium",
  "sodiumConfidence": "low",
  "sodiumDrivers": ["added kosher salt", "canned diced tomatoes", "low-sodium chicken broth"],
  "assumptions": ["salt to taste assumed 1 1/2 tsp Diamond Crystal kosher in total"],
  "estimatedAt": "2026-11-21"
}
```

| Field | Rule |
| --- | --- |
| `perServing` | All eight keys are required and must be non-negative numbers. Calories and milligrams are rounded to 10, grams to 1 (the CLI rounds them on import). |
| `servings` | The meal's own `servings`, which is the divisor for the estimate. The CLI fills it in if it's left out, and rejects a value that doesn't match. |
| `servingDescription` | A portion a person can recognize on a plate. The tracker shows it when asking how much was eaten. |
| `method` | `estimated` (Claude, from the ingredients), `source` (the recipe's published nutrition) or `manual`. |
| `confidence`, `sodiumConfidence` | `high`, `medium` or `low`. Sodium is rated separately. |
| `sodiumDrivers` | Up to three ingredients that contribute the most sodium. |
| `assumptions` | Short strings for anything the estimate depends on. |
| `estimatedAt` | The date of the estimate, as `YYYY-MM-DD`. |

`plan import` and `plan add` reject a malformed block, and a rejected import
saves nothing. A meal with no block is still accepted; `plan check` warns about
it.

## How Claude estimates

Claude estimates the numbers while building the plan, from the meal's own
ingredient list. No external nutrition database is used; close enough is the
accepted standard.

- **Estimate from the ingredients as written in the menu,** including changes
  recorded in ingredient notes (halved, swapped, omitted).
- **Estimate what is eaten, not what is bought.** Account for bone-in weights,
  drained cans, skimmed fat, oil left in the pan and discarded marinade.
- **Divide by the meal's `servings`,** and write a `servingDescription` that
  matches that division.
- **Give each menu entry its own block.** A main and its sides are separate
  entries and are not combined. A component that's eaten in one dish but listed
  on another for shopping (the rouille's baguette becoming the garlic toasts) is
  counted where it's eaten, with an assumption saying so.
- **Cross-check against published nutrition.** When the source recipe in
  `data/recipes/` (or its page) publishes nutrition, compare against it. If
  calories differ by more than 20%, record the reason in `assumptions`. Prefer
  the estimate when the ingredients were modified.
- **Give batch meals one block.** A batch that covers more than one day carries
  its block once, on the entry where it's cooked, with a `covers-<day>` tag
  (such as `covers-mon`) for each leftover day. The per-day totals count it on
  those days too.

### Sodium

Sodium is the least reliable number in an ingredient-based estimate, and it's
one of the three things being tracked, so it gets explicit rules.

- **Count all added salt.** Where a recipe says "to taste", assume a specific
  amount and record it in `assumptions`.
- **Record the salt type** whenever salt is measured by volume. Diamond Crystal
  kosher salt has roughly half the sodium of table salt per teaspoon. Rough
  values per teaspoon: Diamond Crystal 1,120 mg, Morton kosher 1,920 mg, table
  salt 2,330 mg.
- **Use low-sodium product values only when the ingredient line says
  low-sodium or no-salt-added.**
- **State the absorbed fraction** for brines, marinades and salted cooking
  water.
- **Set `sodiumConfidence` to `low`** whenever the estimate depends on salt to
  taste, a brine, or an unspecified brand of broth, soy sauce, fish sauce or
  cheese.
- **Fill `sodiumDrivers`** so the largest sources show up in `plan check` and
  in the tracker.

## Targets

In `cookwhat.config.json`:

```json
"nutrition": {
  "targets": { "calories": 2000, "proteinG": 120, "sodiumMg": 1500 },
  "dinnerShare": 0.4
}
```

- `targets` holds optional **daily** values for these keys: `calories`,
  `proteinG`, `carbsG`, `fatG`, `saturatedFatG`, `fiberG` and `sodiumMg`. With
  no targets set, the comparison is off.
- `dinnerShare` (default 0.4) is the fraction of a day's targets a dinner should
  fit within.

`plan check` warns when a day's dinner goes over its share of a **ceiling**
target: calories, carbs, fat, saturated fat or sodium. Protein and fiber are
amounts to reach, so they're shown in the totals but never flagged for going
over. These are warnings and never block `plan set`. A day whose dinner has a
dish tagged `holiday` or `celebration` still gets totals but no target
warnings.

## Commands

- `cookwhat plan check <week>` prints per-day totals and warns about meals with
  a missing or invalid block. A day's totals are one serving of every dish eaten
  that day, per person, including `covers-<day>` leftovers.
- `cookwhat nutrition <week>` prints each meal's per-serving numbers and the
  per-day totals.
- `cookwhat nutrition <week> --json` prints the same data for other tools.

## Tracker contract

The photo tracker is a separate project. It reads menu files (or `nutrition
--json`) and never writes to this repo.

| It reads | Used for |
| --- | --- |
| `nutritionSchemaVersion` | Refusing a file it doesn't understand |
| `weekOf`, `meals[].day`, `meals[].slot` | Knowing which meals are planned today |
| `meals[].id`, `title`, `role` | Matching a photo to a planned dish |
| `meals[].nutrition.perServing` | The numbers logged |
| `meals[].nutrition.servingDescription` | Asking how much of a serving was eaten |
| `meals[].nutrition.confidence`, `sodiumConfidence` | Marking a logged entry as approximate |

Changes to these fields are additive within a schema version. Renaming or
removing a field increments `nutritionSchemaVersion`. This repo is public, so
daily food logs, photos and body weight stay in the tracker's own storage.
