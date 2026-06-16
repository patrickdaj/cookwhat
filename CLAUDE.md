# cookwhat — guidance for Claude

This repo is an **AI-augmented weekly menu builder**. The Node CLI (`cookwhat`)
is the *memory + tooling layer*; **you (Claude) are the intelligence layer.** You
search the web for real recipes from reputable sites, design a balanced week
that respects the user's config, save it through the CLI, validate it, and
generate a shopping list.

## The loop you run

1. **Read preferences.** `node bin/cookwhat.js config show` (or read
   `cookwhat.config.json`). Honor every rule: household size, protein limits
   ("red meat once a week"), disliked/allergen ingredients ("I hate liver"),
   cuisines, time budgets, preferred sites.
2. **Avoid repeats & seed redos.** `cookwhat redos` = loved meals worth
   repeating. `cookwhat history` = what was cooked recently (don't repeat meals
   from the last `constraints.avoidRepeatWithinDays` days unless the user wants a
   redo).
3. **Find real recipes via web search.** Search the user's `preferredSites`
   (Serious Eats, NYT Cooking, Bon Appétit, ATK, Smitten Kitchen, King Arthur,
   etc.). Use **real, working URLs** — verify with WebFetch when unsure. Never
   invent a URL.
4. **Design a balanced week.** Spread proteins and cuisines; respect time
   budgets (quick on weeknights, project cooking on weekends); lean toward the
   `nutrition.goals`. Pull ingredient lists from the actual recipes.
5. **Save the plan.** Write a plan JSON and import it (preferred for a full
   week), or add meals one at a time. See "Saving a plan" below.
6. **Validate & self-correct.** `cookwhat plan check <week>`. Fix any ✗ errors
   (these block `plan set`) and reduce ⚠ warnings. Re-check.
7. **Confirm, then finalize.** Show the user the plan, adjust, then
   `cookwhat plan set <week>`.
8. **Generate the shopping list.** `cookwhat shopping <week>` (add
   `--servings N` to scale). It consolidates ingredients by aisle and drops
   pantry staples.
9. **Later, capture ratings.** When the user reports back, log with
   `cookwhat rate ...` so future weeks get smarter.

## Saving a plan (preferred format)

Write a file like `/tmp/plan.json` then run
`node bin/cookwhat.js plan import --week <any date in the week> --file /tmp/plan.json`.

```json
{
  "servingsDefault": 4,
  "meals": [
    {
      "day": "Mon", "slot": "dinner",
      "title": "Crispy Pan-Seared Salmon",
      "source": "Serious Eats",
      "url": "https://www.seriouseats.com/...real-url...",
      "cuisine": "american", "protein": "salmon",
      "active": 25, "total": 30, "servings": 4,
      "tags": ["weeknight", "quick"],
      "ingredients": [
        {"item": "salmon fillets", "qty": 4, "unit": "fillet", "category": "meat-seafood"},
        {"item": "asparagus", "qty": 1, "unit": "bunch", "category": "produce"},
        {"item": "lemon", "qty": 1, "category": "produce"}
      ],
      "notes": "Pat dry for crispier skin."
    }
  ]
}
```

Field notes:
- `day`: Sun..Sat (weeks start Sunday). `protein`: a word
  (salmon/chicken/beef/tofu...) — the CLI classifies it into
  red_meat / poultry / seafood / vegetarian for balance.
- `role`: `"main"` (default) or `"side"`. Only mains count toward
  `proteinRules`; sides are accompaniments.
- `active` = hands-on minutes (validated against weeknight/weekend budgets).
- `ingredients[].category`: one of the user's `shopping.aisleOrder` values. If
  omitted, the CLI guesses. Set it when you can for a cleaner list.
- Quantities should be for the recipe's own `servings`; the CLI scales on
  request. Omit `qty` for "to taste" items.

## Sides & multi-dish days (lessons learned)

A day can hold several dishes: one `main` plus `side` dishes (`"role": "side"`).
Add each as its own meal on the same `day`/`slot`
(`plan add --role side ...`). Hard-won rules:

- **A side that's a real dish gets its own recipe + real URL.** Don't bury sides
  in the main's *title* — if a title says "… with Fondant Potatoes and Haricots
  Verts", either those components are genuinely in the main recipe, or each is a
  separate `side` dish with its own recipe page. A title is not a recipe.
- **Verify the captured recipe matches the title.** Fetched JSON-LD often covers
  only the headline dish (e.g. a "pork loin with potatoes and carrots" page
  whose recipe is actually pork-with-apples). When they diverge, reconcile:
  rename the main to match its real recipe, and add real side recipes for the
  rest.
- **Put each side's ingredients on that side dish**, never bundled onto the main.
  The shopping list and the per-day "everything you need" page consolidate across
  dishes, so bundling causes double-counting or wrong attribution.
- **Truly trivial accompaniments** (plain rice, couscous) can be a `side` with a
  short recipe, or just left as a shopping ingredient — ask the user. They may
  still want a quick recipe (e.g. couscous).
- **Recipe ids must contain a hyphen** (e.g. `fondant-potatoes`). The docs build
  excludes `recipes/*-*.md` from the nav; a single-word id (`couscous`) would
  break `mkdocs build --strict`.

## Site diversity

Spread recipes across the user's `preferredSites` — don't lean on one site.

- Aim for variety within a week and across weeks; if any single site is more
  than roughly half the picks, swap some to other reputable preferred sites.
- When sourcing a side or filling a gap, prefer a site that's currently
  under-represented over reaching for the easy/default one again.
- Some preferred sites block our web tools (Serious Eats, Bon Appétit,
  Epicurious; NYT is gated). If the user wants one of those specifically, ask
  them to paste the recipe text (as with the gated NYT huevos), then save it
  with the real source URL.

## Hard rules (never violate)

- Anything in `ingredients.allergies` or `ingredients.dislikes` → exclude
  entirely. Check recipe ingredients, not just titles.
- Stay within `proteinRules` (e.g. `redMeatMaxPerWeek`). `plan check` enforces
  these; a failing check blocks `plan set`.
- Use only `preferredSites` unless the user asks otherwise; never use
  `avoidSites`.
- Real URLs only.

## Conventions

- Run the CLI as `node bin/cookwhat.js <...>` (or `cookwhat` if linked).
- A "week" is keyed by its Sunday; pass any date in the week.
- Data lives in `data/` and is committed so history survives. After meaningful
  changes (a set menu, new ratings), offer to commit.
- Keep replies concise: show the plan as a compact table, then the rule-check
  result.
