# 🍳 cookwhat

**An AI-augmented weekly menu builder.** Plan balanced dinners from reputable
recipe sites (Serious Eats, NYT Cooking, Bon Appétit, ATK, Smitten Kitchen, King
Arthur…), keep a rating history so you can re-cook the winners, and turn any set
menu into a consolidated shopping list.

> **The idea:** *Claude is the chef's brain; this CLI is the kitchen notebook.*
> You chat with Claude (in the Claude app or VS Code with this repo open); Claude
> **web-searches for real recipes**, designs a balanced week around **your
> rules**, and saves everything through the `cookwhat` command. Run the CLI
> directly any time too.

---

## Quick start

```bash
node bin/cookwhat.js init     # create config + data folders
# edit cookwhat.config.json to taste (see docs/CONFIG.md)
```

Then open the repo in Claude and say:

> *"Build me a balanced dinner menu for next week, then make the shopping list."*

Claude reads your config, searches reputable sites for real linked recipes,
drafts a balanced week, validates it against your rules, and generates the list.

Prefer the terminal? It's a full CLI too:

```bash
node bin/cookwhat.js plan new --week 2026-06-15
node bin/cookwhat.js plan check 2026-06-15
node bin/cookwhat.js plan set  2026-06-15
node bin/cookwhat.js shopping  2026-06-15
node bin/cookwhat.js redos
```

`npm link` lets you drop the `node bin/` prefix and just type `cookwhat`.

---

## What it does

- **🗓️ Balanced menus** — varied proteins & cuisines, weeknight time budgets,
  nutrition goals. Rules like *"red meat once a week"* and *"I hate liver"* live
  in one config file and are enforced by a validator.
- **🌐 Real recipes** — Claude pulls actual, linked recipes from sites *you*
  trust (configurable), via web search.
- **⭐ History & redos** — rate what you cook; `cookwhat redos` resurfaces your
  greatest hits to seed future weeks.
- **🛒 Shopping lists** — consolidates ingredients across recipes (3 dishes'
  garlic → one line), groups by store aisle, drops pantry staples, scales to any
  serving count.

---

## How it works

```
   you ──▶ Claude (web search + judgment, guided by CLAUDE.md / the skill)
                    │   reads cookwhat.config.json   (your rules & tastes)
                    │   reads redos + history        (what you've loved)
                    ▼
              cookwhat CLI ──▶ data/menus/<week>.json   the plan
                    │              data/history.json      ratings
                    │              data/shopping/<week>.md the grocery run
                    ▼
              plan check (rules) ──▶ plan set ──▶ shopping
```

The `cookwhat` CLI is **zero-dependency Node** (uses only the standard library).
All your data is plain JSON/Markdown in `data/`, committed to git so your
cooking history travels with you.

---

## Docs

- **[docs/HOW_TO_USE.md](docs/HOW_TO_USE.md)** — the full walkthrough (start here)
- **[docs/CONFIG.md](docs/CONFIG.md)** — every preference explained
- **[prompts/build-menu.md](prompts/build-menu.md)** — copy-paste prompts
- **[CLAUDE.md](CLAUDE.md)** — how Claude drives the workflow

## Develop

```bash
npm test        # zero-dependency smoke tests
```

## Why "interactive AI" instead of an API key?

cookwhat deliberately keeps no embedded model calls — you drive it with Claude
in the app or VS Code, so the smart parts (live web search for current recipes,
judgment about balance and substitutions) use whatever Claude session you're in,
with no key to manage. The repo ships the rulebook (`cookwhat.config.json`), the
memory (`data/`), the tooling (`cookwhat` CLI), and the instructions
(`CLAUDE.md` + a Claude Code skill) that make that collaboration reliable.
