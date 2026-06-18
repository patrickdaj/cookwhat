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
   `nutrition.goals`. Pull ingredient lists from the actual recipes. **Build
   full dinners** (see "Full meals" below): most days should land a protein, a
   vegetable, and a carb.
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

## Full meals (protein + veggie + carb)

Every dinner should be a **complete meal: a protein, a vegetable, and some kind
of carb** (rice, potatoes, bread, pasta, grain). **It's about the *meal*, not
about having a separate side** — a one-bowl/one-pan dish that already contains
all three (a salmon rice bowl with edamame, a shrimp fried rice with spinach) is
a full meal and needs nothing added. This is a design rule for *you* — the CLI
doesn't validate meal composition, so it won't show up in `plan check`.

- **Audit each day for the three components across the whole plate** (main's own
  ingredients + any sides). Watch for the common gap: a stir-fry or protein over
  rice whose only "vegetable" is really an aromatic/herb (onion, garlic, basil,
  scallion, ginger) — that's missing a *real* veg. Likewise a protein-and-salad
  plate with no starch is missing a carb.
- **Fill only the missing component** — don't bolt a redundant side onto an
  already-complete dish. Add the missing piece however fits best: an in-dish
  ingredient (e.g. toss long beans into the pad krapow) *or* a side dish (a veg
  side, a starch). Match it to the cuisine.
- Pull added sides from the user's pools first: **Paprika recipes and cookbooks**
  are full of veg sides and salads. Trivial carbs (steamed rice, crusty bread)
  can just be ingredient lines on the main — see Sides rules below.
- Breakfasts (e.g. a Sunday Huevos) are exempt; this is about dinners.

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

## Source mix & freshness

Pull from **all four pools** and don't skew to any one: redos/history, the user's
Paprika recipes, their cookbooks (title placeholders, scanned on demand), and
fresh web finds. Crucially, **"fresh" does not mean web-only** — most of the
user's own catalog is *uncooked*, so it's new-to-them:

- **Redos** (in history, rated ≥4) — loved repeats; seed a week with a few.
- **Cooked & meh** (rated 1–3 in history) — deprioritize; don't re-suggest soon.
  Also respect `avoidRepeatWithinDays` for anything cooked recently.
- **Owned but uncooked = the big freshness pool.** Paprika recipes with **no
  rating** (~40% of the import) and any cookbook recipe not yet cooked are new
  experiences from the user's own shelves. Leaning here *is* bringing fresh
  stuff, and it works through the library the user already paid for. (Signal: a
  Paprika recipe JSON with no `rating`, or a history with no entry for that
  title, hasn't been cooked.)
- **New web finds** — genuine discovery beyond the collection; sprinkle 1–2 in
  most weeks so the rotation keeps growing.

A good week blends these — a redo or two for comfort, several uncooked-owned
picks (Paprika + book placeholders), and a new web recipe or two. When you
present the plan, label which pool each pick came from so the balance is visible.

## Weekly sourcing strategy (the blend)

Aim each week for a deliberate mix across the pools — keeps things fresh, works
through the cookbook library, and still revisits loved meals. For a ~6–7-dinner
week, target roughly:

- **1–2 cookbook** dishes — a **"featured book of the week."** Pick one book and
  pull 1–2 fitting recipes as title placeholders (scan when cooking). **Rotate
  the featured book** so the whole shelf gets sampled — look at recent weeks and
  feature one that's been neglected. The library is large (~1,300 catalogued
  across 6 books; only Meathead is scanned), so there's years of new-to-them
  material here.
- **2–3 Paprika uncooked** (unrated) — the big fresh-to-you pool (~160 recipes).
- **1–2 new web** picks from `preferredSites` — discovery that grows the DB.
- **~1 redo every other week** — a loved older recipe (history rating ≥4) for
  comfort. Not every week; respect `avoidRepeatWithinDays`.

Within that blend, also hit the standing targets:

- **~2 Asian dinners/week.** The user wants more Asian — rotate across
  japanese / thai / chinese / korean / vietnamese (don't repeat the same one
  twice in one week). Lean on the under-used Asian preferred sites:
  **thewoksoflife** (Chinese), **justonecookbook** (Japanese), and **maangchi**
  (Korean — never used yet), plus Asian Paprika picks and Asian cookbooks.
- Spread proteins/cuisines and respect all `proteinRules` + time budgets. Label
  each pick's pool when you present the plan so the balance is visible.

Targets, not quotas — flex for holidays, travel weeks, or a specific request.

## Cookbooks (the user's physical books)

The user owns physical cookbooks, catalogued in `data/cookbooks/*.json` (e.g.
`meathead.json`, `foodlab.json`). These are **a reference layer for you** — the
CLI does *not* read them. Each file lists the book's recipes as
`{title, page, chapter}`, sometimes with `fitsMenu`/`flag` hints, and — once a
page has been scanned — a `captured` block (`ingredients`, `method`, `makes`)
and `scanned: true`.

Use them as a **third sourcing pool** alongside redos/history and web search.
When designing a week, scan the catalogs for recipes that fit the user's config
(cuisine, `proteinRules`, time, dislikes — the `flag` fields mark
broccoli/bean-heavy items). Cookbook recipes also **sidestep the site-blocking
problem** (nothing to fetch), so they're reliable picks.

To put a cookbook recipe on a menu — **plan by title now, scan on demand later.**
Scanning every book up front is a ton of work, so don't. Two stages:

1. **Placeholder now (no scan).** Add it as a normal meal with
   `source: "Book Title (Author) — p.NNN"` and **no `url`**. Set
   `cuisine`/`protein`/`role`/`active` from the title + catalog entry — these are
   categorization (so the balance + time checks still work), not fabricated
   ingredients. Leave `ingredients: []` and add the tag **`"needs-scan"`**. If the
   catalog already has a `captured` block, use it and skip the placeholder.
2. **Scan on demand, before that week's shopping/cooking.** Ask the user to scan
   the specific page(s), capture the real `ingredients`/`method` into the meal,
   **and** store the `captured` block back in the catalog (reusable forever). Then
   re-run `cookwhat shopping` so the list is complete.

Rules for the workflow:
- **Never fabricate ingredients** from a title or memory — a placeholder carries
  *no* ingredients until scanned. (Cuisine/protein from the title is fine;
  inventing an ingredient list is not.)
- A `needs-scan` placeholder contributes **nothing to the shopping list.** When
  you generate shopping for a week, first check for `needs-scan` meals and tell
  the user exactly which book pages to scan — those items are missing until then.
- Find what's pending: grep menus for cookbook meals (no `sourceUrl`) whose
  `ingredients` is empty, or that carry the `needs-scan` tag.
- `plan check` emits a benign `⚠ "…" has no source URL` for cookbook dishes —
  expected, **not** a blocker; don't "fix" it with a fake URL. `recipe fetch`
  skips no-URL meals automatically.
- Catalogs come from a book's table of contents; transcribing titles + page
  numbers is fine, but a recipe's ingredient list/method is only recorded from an
  actual scan of that page.

## Hard rules (never violate)

- Anything in `ingredients.allergies` or `ingredients.dislikes` → exclude
  entirely. Check recipe ingredients, not just titles.
- Stay within `proteinRules` (e.g. `redMeatMaxPerWeek`). `plan check` enforces
  these; a failing check blocks `plan set`.
- Use only `preferredSites` unless the user asks otherwise; never use
  `avoidSites`.
- Real URLs only — **except** recipes sourced from the user's catalogued
  cookbooks, which use `source: "Book (Author) — p.NNN"` and no URL (see
  Cookbooks above). Never fabricate a URL or cookbook ingredient data.

## Conventions

- Run the CLI as `node bin/cookwhat.js <...>` (or `cookwhat` if linked).
- A "week" is keyed by its Sunday; pass any date in the week.
- Data lives in `data/` and is committed so history survives. After meaningful
  changes (a set menu, new ratings), offer to commit.
- Keep replies concise: show the plan as a compact table, then the rule-check
  result.
