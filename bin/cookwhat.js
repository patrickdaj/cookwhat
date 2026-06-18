#!/usr/bin/env node
import fs from "node:fs";
import { parseArgs } from "node:util";
import {
  ensureDirs,
  PATHS,
  weekOf,
  todayISO,
  c,
  die,
  readJson,
  writeJson,
  loadDotenv,
} from "../src/util.js";

loadDotenv();
import {
  DEFAULT_CONFIG,
  loadConfig,
  saveConfig,
  configExists,
  classifyProtein,
} from "../src/config.js";
import {
  loadMenu,
  saveMenu,
  listMenus,
  newMenu,
  addHistoryEntry,
} from "../src/store.js";
import { makeMeal, addMeal, checkPlan, hostOf } from "../src/plan.js";
import {
  buildShoppingList,
  renderShoppingMarkdown,
  renderNotesText,
  formatQty,
} from "../src/shopping.js";
import { queryHistory, suggestRedos } from "../src/history.js";

const argv = process.argv.slice(2);
const [cmd, sub, ...rest] = argv;

function flags(spec) {
  // Parse the args after the (cmd[, sub]) tokens.
  const startIdx = ["plan", "config"].includes(cmd) ? 2 : 1;
  const { values, positionals } = parseArgs({
    args: argv.slice(startIdx),
    options: spec,
    allowPositionals: true,
    strict: false,
  });
  return { values, positionals };
}

try {
  await main();
} catch (err) {
  die(err.message);
}

async function main() {
  switch (cmd) {
    case undefined:
    case "help":
    case "-h":
    case "--help":
      return printHelp();
    case "init":
      return cmdInit();
    case "config":
      return cmdConfig();
    case "plan":
      return cmdPlan();
    case "rate":
      return cmdRate();
    case "history":
      return cmdHistory();
    case "redos":
      return cmdRedos();
    case "shopping":
    case "list": // alias
      return cmdShopping();
    case "recipe":
      return cmdRecipe();
    default:
      die(`Unknown command "${cmd}". Run \`cookwhat help\`.`);
  }
}

// ---- init ------------------------------------------------------------------

function cmdInit() {
  ensureDirs();
  if (configExists()) {
    console.log(c.yellow("cookwhat.config.json already exists — leaving it untouched."));
  } else {
    saveConfig(DEFAULT_CONFIG);
    console.log(c.green("Created ") + "cookwhat.config.json");
  }
  if (!fs.existsSync(PATHS.history)) writeJson(PATHS.history, []);
  console.log(c.green("Ready.") + " Edit your preferences in cookwhat.config.json, then see docs/HOW_TO_USE.md.");
}

// ---- config ----------------------------------------------------------------

function cmdConfig() {
  const action = sub || "show";
  if (action === "show") {
    console.log(JSON.stringify(loadConfig(), null, 2));
    return;
  }
  if (action === "path") {
    console.log(PATHS.config);
    return;
  }
  if (action === "get") {
    const cfg = loadConfig();
    const val = getPath(cfg, rest[0]);
    console.log(typeof val === "object" ? JSON.stringify(val, null, 2) : String(val));
    return;
  }
  if (action === "set") {
    const cfg = loadConfig();
    const [keyPath, ...valParts] = rest;
    if (!keyPath) die("Usage: cookwhat config set <path> <value>");
    setPath(cfg, keyPath, parseValue(valParts.join(" ")));
    saveConfig(cfg);
    console.log(c.green("Set ") + keyPath);
    return;
  }
  die(`Unknown config action "${action}". Use show | get | set | path.`);
}

// ---- plan ------------------------------------------------------------------

function cmdPlan() {
  const action = sub || "show";
  const cfg = loadConfig();

  if (action === "new") {
    const { values } = flags({ week: { type: "string" } });
    const week = weekOf(values.week);
    if (loadMenu(week)) die(`A menu for week ${week} already exists. Use \`plan show ${week}\`.`);
    const menu = newMenu(week, cfg);
    saveMenu(menu);
    console.log(c.green("Created draft menu for week of ") + week);
    return;
  }

  if (action === "add") {
    const { values } = flags({
      week: { type: "string" },
      json: { type: "string" },
      day: { type: "string" },
      slot: { type: "string" },
      role: { type: "string" },
      title: { type: "string" },
      url: { type: "string" },
      source: { type: "string" },
      cuisine: { type: "string" },
      protein: { type: "string" },
      active: { type: "string" },
      total: { type: "string" },
      servings: { type: "string" },
      notes: { type: "string" },
    });
    const week = weekOf(values.week);
    const menu = loadMenu(week) || newMenu(week, cfg);
    let input;
    if (values.json) {
      input = JSON.parse(values.json);
    } else {
      input = {
        day: values.day,
        slot: values.slot,
        role: values.role,
        title: values.title,
        url: values.url,
        source: values.source || (values.url ? hostOf(values.url) : ""),
        cuisine: values.cuisine,
        protein: values.protein,
        activeTimeMin: values.active,
        totalTimeMin: values.total,
        servings: values.servings,
        notes: values.notes,
      };
    }
    if (!input.title) die("A meal needs at least --title (or json with title).");
    const meal = makeMeal(input, cfg);
    addMeal(menu, meal);
    saveMenu(menu);
    console.log(c.green("Added ") + `${meal.day ? meal.day + " " : ""}${meal.title}`);
    return;
  }

  if (action === "import") {
    const { values } = flags({ week: { type: "string" }, file: { type: "string" } });
    const week = weekOf(values.week);
    if (!values.file) die("Usage: cookwhat plan import --week DATE --file plan.json");
    const data = readJson(values.file);
    if (!data) die(`Could not read ${values.file}`);
    const menu = loadMenu(week) || newMenu(week, cfg);
    const meals = Array.isArray(data) ? data : data.meals || [];
    if (data.servingsDefault) menu.servingsDefault = data.servingsDefault;
    for (const m of meals) addMeal(menu, makeMeal(m, cfg));
    saveMenu(menu);
    console.log(c.green(`Imported ${meals.length} meal(s) `) + `into week of ${week}`);
    return;
  }

  if (action === "remove" || action === "rm") {
    const { values } = flags({
      week: { type: "string" },
      day: { type: "string" },
      title: { type: "string" },
    });
    const week = weekOf(values.week);
    const menu = loadMenu(week);
    if (!menu) die(`No menu for week ${week}.`);
    const before = menu.meals.length;
    const titleLc = (values.title || "").toLowerCase();
    menu.meals = menu.meals.filter((m) => {
      if (values.day && m.day !== values.day) return true;
      if (titleLc && (m.title || "").toLowerCase() !== titleLc) return true;
      return false; // matched day (and title, if given) → remove
    });
    saveMenu(menu);
    const what = values.title ? `"${values.title}"` : "meal(s)";
    console.log(c.green(`Removed ${before - menu.meals.length} ${what} `) + `on ${values.day || "all days"}`);
    return;
  }

  if (action === "list") {
    const menus = listMenus();
    if (!menus.length) return console.log(c.dim("No menus yet. Run `cookwhat plan new`."));
    for (const m of menus) {
      console.log(
        `${c.bold(m.weekOf)}  ${statusBadge(m.status)}  ${c.dim(m.meals.length + " meals")}`
      );
    }
    return;
  }

  if (action === "set") {
    const week = weekOf(rest[0]);
    const menu = loadMenu(week);
    if (!menu) die(`No menu for week ${week}.`);
    const result = checkPlan(menu, cfg);
    if (result.errors.length) {
      console.log(c.red("Cannot set — fix these errors first:"));
      result.errors.forEach((e) => console.log("  " + c.red("✗ ") + e));
      die("Plan has rule violations.");
    }
    menu.status = "set";
    menu.setAt = new Date().toISOString();
    saveMenu(menu);
    console.log(c.green("Menu set for week of ") + week + c.dim("  → run `cookwhat shopping " + week + "`"));
    return;
  }

  if (action === "check") {
    const week = weekOf(rest[0]);
    const menu = loadMenu(week);
    if (!menu) die(`No menu for week ${week}.`);
    return printCheck(menu, cfg);
  }

  if (action === "show") {
    const week = weekOf(rest[0]);
    const menu = loadMenu(week);
    if (!menu) die(`No menu for week ${week}. Run \`cookwhat plan new --week ${week}\`.`);
    return printMenu(menu, cfg);
  }

  die(`Unknown plan action "${action}". Use new|add|import|remove|list|show|check|set.`);
}

// ---- rate ------------------------------------------------------------------

async function cmdRate() {
  const { values } = flags({
    title: { type: "string" },
    rating: { type: "string" },
    redo: { type: "boolean" },
    date: { type: "string" },
    cuisine: { type: "string" },
    protein: { type: "string" },
    url: { type: "string" },
    source: { type: "string" },
    notes: { type: "string" },
    week: { type: "string" },
  });

  // Interactive mode: no --title supplied → walk through the week's meals.
  if (!values.title) {
    const { createInterface } = await import("node:readline/promises");
    const rl = createInterface({ input: process.stdin, output: process.stdout });

    // Find the week to rate: explicit --week, or most recent set menu.
    let week;
    if (values.week) {
      week = weekOf(values.week);
    } else {
      const menus = listMenus();
      const target = menus.find((m) => m.status === "set") || menus[0];
      if (!target) die("No menus found. Cook something first!");
      week = target.weekOf;
    }

    const menu = loadMenu(week);
    if (!menu || !menu.meals.length) die(`No meals in menu for week ${week}.`);

    console.log(c.bold(`\nRating meals for week of ${week}\n`) + c.dim("Press Enter to skip a meal.\n"));

    let logged = 0;
    for (const meal of menu.meals) {
      console.log(c.bold(`${meal.day}: ${meal.title}`));
      if (meal.sourceUrl) console.log(c.dim("  " + meal.sourceUrl));

      const rawRating = await rl.question("  Rating 1-5 (Enter to skip): ");
      if (!rawRating.trim()) {
        console.log(c.dim("  skipped\n"));
        continue;
      }
      const rating = Number(rawRating.trim());
      if (isNaN(rating) || rating < 1 || rating > 5) {
        console.log(c.yellow("  Invalid rating — skipped.\n"));
        continue;
      }

      const rawRedo = await rl.question("  Would you make this again? (y/n): ");
      const redo = rawRedo.trim().toLowerCase() === "y";

      const notes = await rl.question("  Notes (optional): ");

      const entry = {
        date: todayISO(),
        title: meal.title,
        rating,
        redo,
        cuisine: meal.cuisine || "",
        protein: meal.protein || "",
        sourceUrl: meal.sourceUrl || "",
        source: meal.source || "",
        notes: notes.trim(),
      };
      addHistoryEntry(entry);
      console.log(
        c.green("  Logged ") + c.dim(`${rating}★${redo ? ", redo" : ""}`) + "\n"
      );
      logged++;
    }

    rl.close();
    console.log(c.green(`Done. ${logged} meal(s) rated.`));
    return;
  }

  // Non-interactive: original flag-based path.
  const rating = values.rating != null ? Number(values.rating) : null;
  if (rating != null && (rating < 1 || rating > 5)) die("--rating must be 1-5.");
  const entry = {
    date: values.date || todayISO(),
    title: values.title,
    rating,
    redo: !!values.redo,
    cuisine: (values.cuisine || "").toLowerCase(),
    protein: (values.protein || "").toLowerCase(),
    sourceUrl: values.url || "",
    source: values.source || (values.url ? hostOf(values.url) : ""),
    notes: values.notes || "",
  };
  addHistoryEntry(entry);
  console.log(
    c.green("Logged ") + `${entry.title} ` + c.dim(`(${rating ? rating + "★" : "no rating"}${entry.redo ? ", redo" : ""})`)
  );
}

// ---- history ---------------------------------------------------------------

function cmdHistory() {
  const { values } = flags({
    cuisine: { type: "string" },
    protein: { type: "string" },
    "min-rating": { type: "string" },
    search: { type: "string" },
  });
  const entries = queryHistory({
    cuisine: values.cuisine,
    protein: values.protein,
    minRating: values["min-rating"] ? Number(values["min-rating"]) : undefined,
    search: values.search,
  });
  if (!entries.length) return console.log(c.dim("No history entries match."));
  for (const e of entries) {
    const stars = e.rating ? c.yellow("★".repeat(e.rating) + c.dim("☆".repeat(5 - e.rating))) : c.dim("—");
    console.log(
      `${c.dim(e.date)}  ${stars}  ${c.bold(e.title)}${e.redo ? c.green(" ⟲") : ""}`
    );
    const meta = [e.cuisine, e.protein, e.source].filter(Boolean).join(" · ");
    if (meta) console.log("   " + c.dim(meta));
    if (e.notes) console.log("   " + c.dim("“" + e.notes + "”"));
  }
}

// ---- redos -----------------------------------------------------------------

function cmdRedos() {
  const { values } = flags({ top: { type: "string" }, "min-rating": { type: "string" } });
  const redos = suggestRedos({
    top: values.top ? Number(values.top) : 10,
    minRating: values["min-rating"] ? Number(values["min-rating"]) : 4,
  });
  if (!redos.length)
    return console.log(c.dim("No redo candidates yet. Rate some meals with `cookwhat rate ... --redo`."));
  console.log(c.bold("Top redos — meals worth cooking again:\n"));
  redos.forEach((r, i) => {
    const avg = r.avgRating != null ? r.avgRating.toFixed(1) + "★" : "—";
    console.log(`${c.dim((i + 1) + ".")} ${c.bold(r.title)}  ${c.yellow(avg)} ${c.dim(`(×${r.timesCooked})`)}`);
    const meta = [r.cuisine, r.protein, r.source].filter(Boolean).join(" · ");
    if (meta) console.log("   " + c.dim(meta));
    if (r.sourceUrl) console.log("   " + c.cyan(r.sourceUrl));
  });
}

// ---- shopping --------------------------------------------------------------

function cmdShopping() {
  const cfg = loadConfig();
  const { values, positionals } = flags({
    servings: { type: "string" },
    print: { type: "boolean" },
    notes: { type: "boolean" },
    week: { type: "string" },
  });
  const week = weekOf(values.week || positionals[0]);
  const menu = loadMenu(week);
  if (!menu) die(`No menu for week ${week}.`);
  if (!menu.meals.length) die(`Menu for ${week} has no meals yet.`);

  const list = buildShoppingList(menu, cfg, {
    targetServings: values.servings ? Number(values.servings) : null,
  });
  const md = renderShoppingMarkdown(list);

  // Persist both JSON and Markdown.
  writeJson(`${PATHS.shopping}/${week}.json`, list);
  fs.writeFileSync(`${PATHS.shopping}/${week}.md`, md + "\n");

  if (values.notes) {
    // Plain-text output for copy-pasting into iPhone Notes.
    console.log(renderNotesText(list, menu));
  } else if (values.print) {
    console.log(md);
  } else {
    printShopping(list);
    console.log(
      c.dim(`\nSaved to data/shopping/${week}.md and ${week}.json  ` +
        `(use --print to dump markdown, --notes for iPhone Notes)`)
    );
  }
}

// ---- pretty printers -------------------------------------------------------

function statusBadge(status) {
  return status === "set" ? c.green("[set]") : c.yellow("[draft]");
}

function printMenu(menu, cfg) {
  console.log(`${c.bold("Menu — week of " + menu.weekOf)}  ${statusBadge(menu.status)}`);
  console.log(c.dim(`Default servings: ${menu.servingsDefault}`));
  console.log("");
  for (const m of menu.meals) {
    const cat = classifyProtein(m.protein, cfg);
    const time = m.activeTimeMin ? `${m.activeTimeMin}m active` : "";
    console.log(`${c.bold((m.day || "—").padEnd(4))} ${m.title}`);
    const meta = [m.cuisine, cat !== "unknown" ? cat : null, m.source, time]
      .filter(Boolean)
      .join(" · ");
    if (meta) console.log("     " + c.dim(meta));
    if (m.sourceUrl) console.log("     " + c.cyan(m.sourceUrl));
  }
  console.log("");
  const res = checkPlan(menu, cfg);
  printCheckSummary(res);
}

function printCheck(menu, cfg) {
  const res = checkPlan(menu, cfg);
  console.log(c.bold(`Checking menu for week of ${menu.weekOf}\n`));
  console.log(
    c.dim("Protein balance: ") +
      Object.entries(res.counts)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k}:${n}`)
        .join("  ")
  );
  console.log("");
  printCheckSummary(res, { verbose: true });
}

function printCheckSummary(res, { verbose = false } = {}) {
  if (res.errors.length) {
    res.errors.forEach((e) => console.log(c.red("✗ ") + e));
  }
  if (res.warnings.length) {
    res.warnings.forEach((w) => console.log(c.yellow("⚠ ") + w));
  }
  if (verbose && res.info.length) {
    res.info.forEach((i) => console.log(c.dim("· " + i)));
  }
  if (!res.errors.length && !res.warnings.length) {
    console.log(c.green("✓ Plan satisfies all rules."));
  }
}

function printShopping(list) {
  console.log(c.bold(`Shopping list — week of ${list.weekOf}`));
  if (list.targetServings) console.log(c.dim(`Scaled to ${list.targetServings} servings`));
  console.log("");
  for (const section of list.sections) {
    console.log(c.bold(section.category.toUpperCase()));
    for (const item of section.items) {
      const qty = formatQty(item);
      console.log(`  ☐ ${item.item}${qty ? c.dim("  — " + qty) : ""}`);
    }
    console.log("");
  }
  if (list.excludedStaples.length)
    console.log(c.dim(`Assumed on hand: ${list.excludedStaples.join(", ")}`));
  if (list.pendingScans?.length) {
    console.log(
      "\n" + c.yellow(`⚠ ${list.pendingScans.length} dish(es) need a scan — items missing until captured:`)
    );
    for (const p of list.pendingScans) {
      console.log(
        "  " + c.yellow("• ") + `${p.day ? p.day + ": " : ""}${p.title}` +
          (p.source ? c.dim(`  — ${p.source}`) : "")
      );
    }
  }
}

// ---- recipe ----------------------------------------------------------------

async function cmdRecipe() {
  const action = sub || "fetch";

  if (action === "fetch") {
    const { values } = flags({
      week: { type: "string" },
      all: { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      ai: { type: "boolean", default: false },
      "no-ai": { type: "boolean", default: false },
    });

    // The paid Haiku annotation (analyzeWithAI) is OFF by default for an
    // interactive single-week fetch — Claude in the editor fills the `ai` block
    // instead (free, and can mine the article prose for the author's real tips).
    // It turns ON automatically for headless `--all` batch runs, where there's
    // no Claude in the loop. Either default is overridable: --ai forces it on,
    // --no-ai forces it off (and wins over everything).
    const useAI = values["no-ai"] ? false : (values.ai || values.all);

    const { fetchRecipe, analyzeWithAI } = await import("../src/recipe-fetch.js");

    fs.mkdirSync(PATHS.recipes, { recursive: true });

    let menus;
    if (values.all) {
      menus = listMenus().map((m) => loadMenu(m.weekOf)).filter(Boolean);
    } else {
      const week = weekOf(values.week);
      const menu = loadMenu(week);
      if (!menu) die(`No menu for week ${week}.`);
      menus = [menu];
    }

    const meals = menus.flatMap((m) => m.meals).filter((m) => m.sourceUrl);
    if (!meals.length) die("No meals with URLs found.");

    let fetched = 0, skipped = 0, failed = 0;

    for (const meal of meals) {
      const file = `${PATHS.recipes}/${meal.id}.json`;
      if (!values.force && fs.existsSync(file)) {
        console.log(c.dim(`  skip  ${meal.title}`));
        skipped++;
        continue;
      }

      process.stdout.write(`  fetch  ${meal.title}... `);

      try {
        const recipe = await fetchRecipe(meal.sourceUrl);
        let ai = null;

        if (useAI) {
          try {
            ai = await analyzeWithAI(recipe);
          } catch (e) {
            process.stdout.write(c.yellow(`(AI: ${e.message}) `));
          }
        }

        writeJson(file, {
          mealId: meal.id,
          fetchedAt: new Date().toISOString(),
          ...recipe,
          ai,
        });

        console.log(c.green("✓"));
        fetched++;
      } catch (e) {
        console.log(c.red(`✗  ${e.message}`));
        failed++;
      }

      // Polite pause between requests
      await new Promise((r) => setTimeout(r, 900));
    }

    console.log(
      `\n${c.green(fetched + " fetched")}  ${c.dim(skipped + " skipped")}  ` +
        (failed ? c.red(failed + " failed") : c.dim("0 failed"))
    );
    return;
  }

  die(`Unknown recipe action "${action}". Use: fetch`);
}

// ---- tiny helpers ----------------------------------------------------------

function getPath(obj, p) {
  return p.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
}
function setPath(obj, p, val) {
  const keys = p.split(".");
  const last = keys.pop();
  const target = keys.reduce((o, k) => (o[k] ??= {}), obj);
  target[last] = val;
}
function parseValue(s) {
  if (s === "true") return true;
  if (s === "false") return false;
  if (s !== "" && !isNaN(Number(s))) return Number(s);
  try {
    if (s.startsWith("[") || s.startsWith("{")) return JSON.parse(s);
  } catch {}
  return s;
}

function printHelp() {
  console.log(`${c.bold("cookwhat")} — AI-augmented weekly menu builder

${c.bold("Setup")}
  cookwhat init                       Create config + data folders
  cookwhat config show|get|set|path   View / edit preferences

${c.bold("Planning a week")}  (Claude usually does these for you)
  cookwhat plan new   [--week DATE]   Start a draft menu (week = Mon of that week)
  cookwhat plan add   --week D --json '{...}'   Add a meal from JSON
  cookwhat plan add   --week D --day Mon --title "..." --url ... --protein fish --active 30
  cookwhat plan import --week D --file plan.json  Import a whole proposed plan
  cookwhat plan show  [week]          Show a menu (+ rule check)
  cookwhat plan check [week]          Validate against your config rules
  cookwhat plan list                  List all menus
  cookwhat plan set   [week]          Finalize a menu (blocks if errors)
  cookwhat plan remove --week D --day Mon

${c.bold("History, ratings & redos")}
  cookwhat rate                       Interactive: rate each meal in the current week
  cookwhat rate [--week DATE]         Interactive: rate meals for a specific week
  cookwhat rate --title "..." --rating 5 --redo --cuisine thai --protein chicken --url ...
  cookwhat history [--cuisine x] [--protein x] [--min-rating 4] [--search x]
  cookwhat redos [--top 10]           Best-loved meals to cook again

${c.bold("Recipes")}
  cookwhat recipe fetch [--week DATE] [--all] [--force] [--ai] [--no-ai]
    Downloads JSON-LD from each meal's source URL, stores in data/recipes/.
    The ai block (cliff notes + key tips) is left for Claude to fill in;
    --all turns on the paid Haiku fallback for headless batch runs.
    --all     Fetch all weeks, not just current (enables AI annotation)
    --force   Re-fetch even if already stored
    --ai      Force the paid Haiku annotation (needs ANTHROPIC_API_KEY)
    --no-ai   Skip AI annotation (wins over --ai/--all)

${c.bold("Shopping")}
  cookwhat shopping [week] [--servings N] [--print] [--notes]
    --print   Markdown to stdout
    --notes   Plain text for iPhone Notes copy-paste

${c.dim("Dates are any day in the target week; the Monday is used as the key.")}
${c.dim("See docs/HOW_TO_USE.md for the full AI-driven workflow.")}`);
}
