# How to use cookwhat

cookwhat plans **balanced weekly dinners** from reputable recipe sites, keeps a
**rating history** so you can re-cook the winners, and turns any set menu into a
**consolidated shopping list**.

The trick: **Claude is the chef's brain, the CLI is the kitchen notebook.** You
talk to Claude (in the Claude app or VS Code with this repo open); Claude
searches the web for real recipes, designs a balanced week around *your* rules,
and saves everything through the `cookwhat` command. You can also run the CLI
directly any time.

---

## 1. One-time setup

```bash
node bin/cookwhat.js init      # creates cookwhat.config.json + data/ folders
```

Optionally link it so you can type `cookwhat` instead of `node bin/cookwhat.js`:

```bash
npm link        # then: cookwhat help
```

Now **edit `cookwhat.config.json`** to make it yours — household size, "red meat
once a week", "I hate liver", favorite cuisines and sites, weeknight time
budget, etc. Every option is explained in [CONFIG.md](./CONFIG.md). You only do
this once (and tweak it whenever your tastes change).

### Optional: tap-to-start ⏱ timers on your iPhone

Recipe and cookbook steps render a small **⏱** link after every cooking time
("Bake **10–12 minutes** ⏱"). Tapping it starts a timer on your iPhone for that
many minutes. iOS has no direct URL for the stock Timer, so it goes through one
**Apple Shortcut you set up once** (per device — yours, your partner's, etc.):

1. Open the **Shortcuts** app → **+** → name it exactly **`Cook Timer`**.
2. Add the action **Start Timer**. Tap the duration, delete it, and instead
   insert the **Shortcut Input** as the value with the unit set to **minutes**.
   (Optionally add a **Text** action like "Cooking" and feed it as the timer
   label.)
3. Done. Now tapping a ⏱ link in Safari starts that timer. The first tap asks
   "Open in Shortcuts?" — allow it.

Notes: works on **iPhone/iPad in Safari only** (the links are harmless no-ops on
desktop/Android). For a range like 10–12 min, the timer uses the **lower** bound
so you check the food at its earliest doneness point.

---

## 2. Build a menu (the AI part)

Open this repo in the Claude app or VS Code and just ask. Claude reads your
config and `CLAUDE.md`, then runs the loop for you.

> **"Build me a balanced dinner menu for next week."**

Claude will:
1. Read your preferences and your `redos`/recent history.
2. **Search the web** (Serious Eats, NYT Cooking, Bon Appétit, …) for real,
   linked recipes.
3. Draft a balanced week (varied proteins/cuisines, weeknight-friendly,
   respecting your protein rules and dislikes).
4. Save it and run `cookwhat plan check` to confirm it follows your rules.
5. Show you the plan with links so you can swap anything.

Helpful follow-ups:
- *"Swap Thursday for something vegetarian and faster."*
- *"Include my top redo this week."*
- *"Make Saturday a project recipe; keep weeknights under 30 minutes."*
- *"Looks good — set it."*

Prefer to do it by hand? See [the CLI reference](#5-cli-reference) — you can
`plan new`, `plan add`, `plan check`, and `plan set` yourself.

---

## 3. Generate the shopping list

Once a menu is **set**:

> **"Make my shopping list for this week."**  → or →  `cookwhat shopping <date>`

You get a checklist grouped by store aisle, with quantities **consolidated
across recipes** (e.g. garlic from three dishes becomes one line) and pantry
staples removed. Need more servings for guests? `cookwhat shopping <date>
--servings 6`. It's saved to `data/shopping/<week>.md`.

---

## 4. Rate meals → smarter "redos"

After you cook, tell Claude or log it directly:

> **"We loved the Thai basil chicken — 5 stars, definitely a redo."**

```bash
cookwhat rate --title "Thai Basil Chicken" --rating 5 --redo \
  --cuisine thai --protein chicken --url "https://www.seriouseats.com/..."
```

Then `cookwhat redos` surfaces your best-loved meals to seed future weeks, and
`cookwhat history` is your searchable cooking log.

---

## 5. CLI reference

Run `node bin/cookwhat.js help` for the full list. Highlights:

| Command | What it does |
| --- | --- |
| `init` | Create config + data folders |
| `config show` / `config set <path> <value>` | View / edit preferences |
| `plan new [--week DATE]` | Start a draft menu (DATE = any day that week) |
| `plan add --week D --json '{...}'` | Add one meal |
| `plan import --week D --file plan.json` | Import a whole week |
| `plan show [DATE]` | Show a menu + rule check |
| `plan check [DATE]` | Validate against your config |
| `plan set [DATE]` | Finalize (blocked if rules fail) |
| `plan list` | List all menus |
| `rate --title .. --rating 1-5 [--redo]` | Log a cooked meal |
| `history [--cuisine x] [--min-rating 4]` | Browse the cooking log |
| `redos [--top N]` | Best meals to cook again |
| `shopping [DATE] [--servings N]` | Consolidated shopping list |

Dates: a "week" is identified by its **Monday**; pass any date in the week and
cookwhat snaps to that Monday.

---

## 6. Keeping your data

Your menus, history, and lists live in `data/` and are committed to git, so your
cooking history survives across machines and sessions. After setting a menu or
adding ratings, commit:

```bash
git add data/ && git commit -m "Menu + ratings for week of <date>"
```

Claude will offer to do this for you.

---

## How it fits together

```
              you ──▶ Claude (web search + judgment)
                         │  reads cookwhat.config.json (your rules)
                         │  reads redos / history (your tastes)
                         ▼
                   cookwhat CLI  ──▶  data/menus/<week>.json   (the plan)
                         │                data/history.json     (ratings)
                         ▼
                   plan check (rules)  ──▶  plan set
                         ▼
                   shopping  ──▶  data/shopping/<week>.md   (your grocery run)
```
