#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const DATA = join(ROOT, 'data');
const DOCS = join(ROOT, 'docs');

function readJson(p) { return JSON.parse(readFileSync(p, 'utf8')); }
function ensureDir(p) { mkdirSync(p, { recursive: true }); }
function write(p, s) { ensureDir(dirname(p)); writeFileSync(p, s, 'utf8'); }

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

function stars(n) {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

// ---- Menu pages ------------------------------------------------------------

function buildMenuPage(menu, ratingsByTitle, recipesByMealId) {
  const out = [];
  out.push(`# Week of ${fmtDate(menu.weekOf)}\n`);

  // Summary table
  out.push('| Day | Meal | Cuisine | Protein | Source |');
  out.push('|-----|------|---------|---------|--------|');
  for (const m of menu.meals) {
    const src = m.sourceUrl
      ? `[${m.source || m.sourceUrl}](${m.sourceUrl})`
      : (m.source || '—');
    out.push(`| **${m.day}** | ${m.title} | ${m.cuisine || '—'} | ${m.protein || '—'} | ${src} |`);
  }
  out.push('');

  // Per-meal detail
  for (const m of menu.meals) {
    const recipe = recipesByMealId[m.id];
    out.push(`## ${m.day} — ${m.title}\n`);

    // AI cliff notes right up top if available
    if (recipe?.ai?.cliffNotes) {
      out.push(`*${recipe.ai.cliffNotes}*\n`);
    }

    const meta = [];
    if (m.sourceUrl) meta.push(`**Source:** [${m.source || m.sourceUrl}](${m.sourceUrl})`);
    if (recipe) meta.push(`**Recipe:** [Full recipe & instructions →](../recipes/${m.id}.md)`);
    if (m.cuisine) meta.push(`**Cuisine:** ${m.cuisine}`);
    if (m.protein) meta.push(`**Protein:** ${m.protein}`);

    const times = [];
    if (recipe?.prepTime) times.push(`${recipe.prepTime} prep`);
    else if (m.activeTimeMin) times.push(`${m.activeTimeMin} min active`);
    if (recipe?.totalTime) times.push(`${recipe.totalTime} total`);
    else if (m.totalTimeMin) times.push(`${m.totalTimeMin} min total`);
    if (times.length) meta.push(`**Time:** ${times.join(' · ')}`);

    if (m.tags?.length) meta.push(`**Tags:** ${m.tags.join(', ')}`);
    if (meta.length) out.push(meta.join('  \n') + '\n');

    if (m.notes) out.push(`> ${m.notes}\n`);

    // Key tips from AI
    if (recipe?.ai?.keyTips?.length) {
      out.push('!!! tip "Key Tips"');
      for (const tip of recipe.ai.keyTips) {
        out.push(`    - ${tip}`);
      }
      out.push('');
    }

    // Ratings
    const key = (m.title || '').toLowerCase().trim();
    const ratings = ratingsByTitle[key];
    if (ratings?.length) {
      for (const r of ratings) {
        const redoFlag = r.redo ? ' · would cook again' : '';
        out.push(`**Rating:** ${stars(r.rating)} ${r.rating}/5 · ${r.date}${redoFlag}`);
        if (r.notes) out.push(`  \n> *${r.notes}*`);
        out.push('');
      }
    }

    out.push('---\n');
  }

  return out.join('\n');
}

// ---- Recipe pages ----------------------------------------------------------

function buildRecipePage(stored, meal) {
  const out = [];
  const title = stored.name || meal?.title || 'Recipe';
  out.push(`# ${title}\n`);

  if (stored.ai?.cliffNotes) {
    out.push(`*${stored.ai.cliffNotes}*\n`);
  }

  // Meta bar
  const meta = [];
  if (stored.url) meta.push(`[Original recipe →](${stored.url})`);
  if (meal?.day && meal?.weekOf) meta.push(`Week of ${fmtDate(meal.weekOf)}, ${meal.day}`);
  if (stored.author) meta.push(`By ${stored.author}`);
  if (meta.length) out.push(meta.join(' · ') + '\n');

  // Times + yield
  const times = [];
  if (stored.prepTime) times.push(`Prep: ${stored.prepTime}`);
  if (stored.cookTime) times.push(`Cook: ${stored.cookTime}`);
  if (stored.totalTime) times.push(`Total: ${stored.totalTime}`);
  if (stored.recipeYield) times.push(`Yield: ${stored.recipeYield}`);
  if (times.length) out.push(times.join(' · ') + '\n');

  // Key tips admonition
  if (stored.ai?.keyTips?.length) {
    out.push('!!! tip "Key Tips"');
    for (const tip of stored.ai.keyTips) {
      out.push(`    - ${tip}`);
    }
    out.push('');
  }

  // Ingredients
  if (stored.recipeIngredient?.length) {
    out.push('## Ingredients\n');
    for (const ing of stored.recipeIngredient) {
      out.push(`- [ ] ${ing}`);
    }
    out.push('');
  }

  // Instructions
  if (stored.recipeInstructions?.length) {
    out.push('## Instructions\n');
    stored.recipeInstructions.forEach((step, i) => {
      out.push(`${i + 1}. ${step}`);
    });
    out.push('');
  }

  out.push(`---\n*Fetched ${stored.fetchedAt?.slice(0, 10) || ''}*`);

  return out.join('\n');
}

// ---- History page ----------------------------------------------------------

function buildHistoryPage(history) {
  const out = ['# Ratings & Reviews\n'];

  if (!history.length) {
    out.push('No ratings yet.\n');
    return out.join('\n');
  }

  const sorted = [...history].sort((a, b) => b.date.localeCompare(a.date));

  for (const r of sorted) {
    out.push(`## ${r.title}\n`);
    out.push(`${stars(r.rating)} **${r.rating}/5** · ${fmtDate(r.date)}`);

    const meta = [];
    if (r.cuisine) meta.push(`Cuisine: ${r.cuisine}`);
    if (r.protein) meta.push(`Protein: ${r.protein}`);
    if (r.redo) meta.push('Would cook again ✓');
    if (meta.length) out.push(meta.join(' · '));

    if (r.sourceUrl) out.push(`[Recipe →](${r.sourceUrl})`);
    if (r.notes) out.push(`\n> ${r.notes}`);
    out.push('\n---\n');
  }

  return out.join('\n');
}

// ---- Index page ------------------------------------------------------------

function buildIndexPage(latestMenu, shoppingWeeks, recipesByMealId) {
  const label = fmtDate(latestMenu.weekOf);
  const out = ['# cookwhat\n'];
  out.push(`**This week: ${label}**\n`);

  out.push('| Day | Meal | Cuisine |');
  out.push('|-----|------|---------|');
  for (const m of latestMenu.meals) {
    const recipeLink = recipesByMealId[m.id]
      ? ` [📖](recipes/${m.id}.md)`
      : '';
    out.push(`| **${m.day}** | [${m.title}](menus/${latestMenu.weekOf}.md)${recipeLink} | ${m.cuisine || '—'} |`);
  }
  out.push('');

  const links = [`[Full menu →](menus/${latestMenu.weekOf}.md)`];
  if (shoppingWeeks.includes(latestMenu.weekOf)) {
    links.push(`[Shopping list →](shopping/${latestMenu.weekOf}.md)`);
  }
  out.push(links.join(' · ') + '\n');

  return out.join('\n');
}

// ---- mkdocs.yml ------------------------------------------------------------

function buildMkdocsYml(menus, shoppingWeeks) {
  const menuEntries = menus
    .map(m => `    - '${fmtDate(m.weekOf)}': menus/${m.weekOf}.md`)
    .join('\n');

  const shopEntries = shoppingWeeks
    .map(w => `    - '${fmtDate(w)}': shopping/${w}.md`)
    .join('\n');

  return `site_name: cookwhat
site_description: AI-augmented weekly menu plans and shopping lists
theme:
  name: material
  palette:
    scheme: default
    primary: green
    accent: orange
  features:
    - navigation.sections
    - navigation.top
    - search.highlight

# Recipe pages are linked from meal sections, not listed in nav
not_in_nav: |
  recipes/*

nav:
  - Home: index.md
  - Menus:
${menuEntries}
  - Shopping Lists:
${shopEntries}
  - Ratings: history.md
  - Reference:
    - How to Use: HOW_TO_USE.md
    - Config: CONFIG.md
`;
}

// ---- main ------------------------------------------------------------------

function main() {
  // Load ratings
  const histPath = join(DATA, 'history.json');
  const history = existsSync(histPath) ? readJson(histPath) : [];
  const ratingsByTitle = {};
  for (const r of history) {
    const k = (r.title || '').toLowerCase().trim();
    (ratingsByTitle[k] ??= []).push(r);
  }

  // Load stored recipes indexed by mealId
  const recipesDir = join(DATA, 'recipes');
  const recipesByMealId = {};
  if (existsSync(recipesDir)) {
    for (const f of readdirSync(recipesDir).filter(f => f.endsWith('.json'))) {
      const r = readJson(join(recipesDir, f));
      if (r.mealId) recipesByMealId[r.mealId] = r;
    }
  }

  // Menus sorted latest-first
  const menuFiles = readdirSync(join(DATA, 'menus'))
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse();
  const menus = menuFiles.map(f => readJson(join(DATA, 'menus', f)));

  // Shopping lists
  const shopFiles = readdirSync(join(DATA, 'shopping'))
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse();
  const shoppingWeeks = shopFiles.map(f => f.replace('.md', ''));

  // Build a lookup of mealId → { meal, weekOf } for recipe pages
  const mealLookup = {};
  for (const menu of menus) {
    for (const meal of menu.meals) {
      mealLookup[meal.id] = { ...meal, weekOf: menu.weekOf };
    }
  }

  ensureDir(join(DOCS, 'menus'));
  ensureDir(join(DOCS, 'shopping'));
  ensureDir(join(DOCS, 'recipes'));

  // Menu pages
  for (const menu of menus) {
    write(
      join(DOCS, 'menus', `${menu.weekOf}.md`),
      buildMenuPage(menu, ratingsByTitle, recipesByMealId)
    );
  }

  // Shopping lists
  for (const f of shopFiles) {
    const content = readFileSync(join(DATA, 'shopping', f), 'utf8');
    write(join(DOCS, 'shopping', f), content);
  }

  // Recipe pages
  let recipeCount = 0;
  for (const [mealId, stored] of Object.entries(recipesByMealId)) {
    const meal = mealLookup[mealId];
    write(join(DOCS, 'recipes', `${mealId}.md`), buildRecipePage(stored, meal));
    recipeCount++;
  }

  // History
  write(join(DOCS, 'history.md'), buildHistoryPage(history));

  // Index
  if (menus.length) {
    write(join(DOCS, 'index.md'), buildIndexPage(menus[0], shoppingWeeks, recipesByMealId));
  }

  // mkdocs.yml
  write(join(ROOT, 'mkdocs.yml'), buildMkdocsYml(menus, shoppingWeeks));

  console.log(
    `Docs built: ${menus.length} menu(s), ${shoppingWeeks.length} shopping list(s), ` +
    `${recipeCount} recipe(s), ${history.length} rating(s)`
  );
}

main();
