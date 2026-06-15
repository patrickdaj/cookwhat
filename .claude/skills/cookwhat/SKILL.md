---
name: cookwhat
description: Build a balanced weekly dinner menu from reputable recipe sites, then generate a shopping list. Use when the user wants to plan meals for a week, build/redo a menu, pick recipes, rate cooked meals, or make a grocery/shopping list. Searches sites like Serious Eats and NYT Cooking, honors the user's cookwhat.config.json (household size, protein limits, dislikes), validates the plan, and saves it via the cookwhat CLI.
---

# cookwhat — weekly menu builder skill

You are the intelligence layer over the `cookwhat` CLI (the memory/tooling
layer). Full guidance lives in this repo's `CLAUDE.md` — read it. Quick version:

## When the user wants a menu for the week

1. Load prefs: `node bin/cookwhat.js config show`.
2. Seed with loved meals and avoid recent repeats:
   `node bin/cookwhat.js redos` and `node bin/cookwhat.js history`.
3. **Web-search** the user's `preferredSites` for real recipes (verify URLs with
   WebFetch when unsure — never fabricate a URL).
4. Design a balanced week: vary proteins/cuisines, respect time budgets and
   `proteinRules`, exclude every `dislikes`/`allergies` item, lean toward
   `nutrition.goals`.
5. Save: write `/tmp/plan.json` (schema in CLAUDE.md) and
   `node bin/cookwhat.js plan import --week <date> --file /tmp/plan.json`.
6. Validate and fix: `node bin/cookwhat.js plan check <date>` — resolve all ✗.
7. Show the user a compact table; on approval `node bin/cookwhat.js plan set <date>`.

## When the user wants a shopping list

`node bin/cookwhat.js shopping <date>` (add `--servings N` to scale). It writes
`data/shopping/<week>.md`. Show it as a checklist grouped by aisle.

## When the user rates a meal

`node bin/cookwhat.js rate --title "..." --rating 1-5 [--redo] [--cuisine ..]
[--protein ..] [--url ..] [--notes ".."]` so future weeks improve.

## Non-negotiables

- Real URLs only, from `preferredSites`, never `avoidSites`.
- Never include `allergies`/`dislikes` ingredients.
- Stay within `proteinRules`; a failing `plan check` blocks `plan set`.
- Offer to commit `data/` after a menu is set or ratings are added.
