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

function localISO(d) {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${da}`;
}

// Sunday of the week containing `d`. Weeks start on Sunday.
function sundayOf(d) {
  const x = new Date(d);
  x.setDate(x.getDate() - x.getDay());
  return localISO(x);
}

function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return localISO(d);
}

function stars(n) {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

// Decode HTML entities that arrive in JSON-LD recipe names (e.g. &#8217; &amp;).
function decodeEntities(s) {
  if (!s) return s;
  return String(s)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

// ---- Ratings helpers (shared by menu & recipe pages) -----------------------

function avgRating(ratings) {
  const rs = ratings.filter(r => typeof r.rating === 'number');
  if (!rs.length) return null;
  return rs.reduce((a, b) => a + b.rating, 0) / rs.length;
}

// One-line summary, e.g. "★★★★☆ 4.0/5 · 2 reviews · would cook again ✓"
function ratingSummaryLine(ratings) {
  const avg = avgRating(ratings);
  const parts = [];
  if (avg != null) parts.push(`${stars(Math.round(avg))} **${avg.toFixed(1)}/5**`);
  parts.push(`${ratings.length} review${ratings.length > 1 ? 's' : ''}`);
  if (ratings.some(r => r.redo)) parts.push('would cook again ✓');
  return parts.join(' · ');
}

// Full per-review block, newest first.
function renderReviews(ratings, heading = '## My Reviews & Ratings') {
  const out = [heading + '\n'];
  const sorted = [...ratings].sort((a, b) => b.date.localeCompare(a.date));
  for (const r of sorted) {
    const redoFlag = r.redo ? ' · would cook again ✓' : '';
    out.push(`${stars(r.rating)} **${r.rating}/5** · ${fmtDate(r.date)}${redoFlag}`);
    if (r.notes) out.push(`\n> *${r.notes}*`);
    out.push('');
  }
  return out.join('\n');
}

function ratingsFor(ratingsByTitle, ...titles) {
  for (const t of titles) {
    const key = (t || '').toLowerCase().trim();
    if (key && ratingsByTitle[key]?.length) return ratingsByTitle[key];
  }
  return null;
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

function buildRecipePage(stored, meal, ratings) {
  const out = [];
  const title = decodeEntities(stored.name || meal?.title || 'Recipe');
  out.push(`# ${title}\n`);

  if (stored.ai?.cliffNotes) {
    out.push(`*${stored.ai.cliffNotes}*\n`);
  }

  // Your rating front and center, so you know if it's a keeper.
  if (ratings?.length) {
    out.push(ratingSummaryLine(ratings) + '\n');
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

  // Full reviews & ratings, co-located with the recipe.
  if (ratings?.length) {
    out.push(renderReviews(ratings));
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

// ---- Index page (dashboard) ------------------------------------------------

// One dashboard section for a given week (this week / next week).
function buildWeekSection(label, week, menu, shoppingWeeks, recipesByMealId) {
  const out = [`## ${label} · ${fmtDate(week)}\n`];
  if (!menu || !menu.meals.length) {
    out.push('_Nothing planned yet — ask Claude to build this week\'s menu._\n');
    out.push(`[Browse menus](menus/index.md){ .md-button }\n`);
    return out.join('\n');
  }
  out.push('| Day | Meal | Cuisine |');
  out.push('|-----|------|---------|');
  for (const m of menu.meals) {
    const recipeLink = recipesByMealId[m.id] ? ` [📖](recipes/${m.id}.md)` : '';
    out.push(`| **${m.day}** | [${m.title}](menus/${week}.md)${recipeLink} | ${m.cuisine || '—'} |`);
  }
  out.push('');
  const buttons = [`[View full menu](menus/${week}.md){ .md-button .md-button--primary }`];
  if (shoppingWeeks.includes(week)) {
    buttons.push(`[Shopping list](shopping/${week}.md){ .md-button }`);
  }
  out.push(buttons.join(' ') + '\n');
  return out.join('\n');
}

function buildIndexPage(ctx) {
  const { thisWeek, nextWeek, thisWeekMenu, nextWeekMenu, shoppingWeeks, recipesByMealId } = ctx;
  const out = ['# cookwhat\n'];
  out.push('Your weekly meal plans, shopping lists, and recipes — all in one place.\n');
  out.push(buildWeekSection('This week', thisWeek, thisWeekMenu, shoppingWeeks, recipesByMealId));
  out.push(buildWeekSection('Next week', nextWeek, nextWeekMenu, shoppingWeeks, recipesByMealId));
  out.push('---\n');
  out.push('### Browse\n');
  out.push(
    '[All menus](menus/index.md){ .md-button } ' +
    '[Shopping lists](shopping/index.md){ .md-button } ' +
    '[Recipes](recipes/index.md){ .md-button } ' +
    '[Ratings](history.md){ .md-button }\n'
  );
  return out.join('\n');
}

// ---- Section landing pages -------------------------------------------------

function buildMenusIndex(menus, shoppingWeeks) {
  const out = ['# Menus\n'];
  if (!menus.length) { out.push('No menus yet.\n'); return out.join('\n'); }
  out.push('| Week | Meals | Shopping |');
  out.push('|------|-------|----------|');
  for (const m of menus) {
    const shop = shoppingWeeks.includes(m.weekOf)
      ? `[list →](../shopping/${m.weekOf}.md)`
      : '—';
    out.push(`| [${fmtDate(m.weekOf)}](${m.weekOf}.md) | ${m.meals.length} | ${shop} |`);
  }
  out.push('');
  return out.join('\n');
}

function buildShoppingIndex(shoppingWeeks) {
  const out = ['# Shopping Lists\n'];
  if (!shoppingWeeks.length) { out.push('No shopping lists yet.\n'); return out.join('\n'); }
  for (const w of shoppingWeeks) {
    out.push(`- [Week of ${fmtDate(w)}](${w}.md)`);
  }
  out.push('');
  return out.join('\n');
}

function buildRecipesIndex(recipesByMealId, mealLookup, ratingsByTitle) {
  const out = ['# Recipes\n'];
  const rows = Object.entries(recipesByMealId).map(([mealId, stored]) => {
    const meal = mealLookup[mealId] || {};
    const name = decodeEntities(stored.name || meal.title || 'Recipe');
    const ratings = ratingsFor(ratingsByTitle, meal.title, stored.name);
    const avg = ratings ? avgRating(ratings) : null;
    let host = '';
    try { host = stored.url ? new URL(stored.url).hostname.replace(/^www\./, '') : ''; } catch {}
    return {
      name,
      mealId,
      cuisine: meal.cuisine || '—',
      protein: meal.protein || '—',
      rating: avg != null ? `${stars(Math.round(avg))} ${avg.toFixed(1)}` : '—',
      source: stored.url ? `[${host}](${stored.url})` : '—',
    };
  }).sort((a, b) => a.name.localeCompare(b.name));

  if (!rows.length) { out.push('No recipes captured yet.\n'); return out.join('\n'); }

  out.push('| Recipe | Cuisine | Protein | My Rating | Source |');
  out.push('|--------|---------|---------|-----------|--------|');
  for (const r of rows) {
    out.push(`| [${r.name}](${r.mealId}.md) | ${r.cuisine} | ${r.protein} | ${r.rating} | ${r.source} |`);
  }
  out.push('');
  return out.join('\n');
}

// ---- mkdocs.yml ------------------------------------------------------------

function buildMkdocsYml(menus, navWeeks) {
  // navWeeks: [{ label: 'This Week', week: '2026-06-14' }, ...] — quick-access
  // tabs that jump straight to a week's menu. Browse sections are single
  // landing pages so the bar stays tidy as weeks accumulate.
  const navWeekSet = new Set(navWeeks.map(n => n.week));
  const weekTabs = navWeeks
    .map(n => `  - ${n.label}: menus/${n.week}.md`)
    .join('\n');

  // Detail pages are reached via links, not listed in nav. Menu weeks that are
  // promoted to a quick-access tab must NOT also be listed here (mkdocs --strict
  // errors on overlap), so list only the remaining menu weeks explicitly.
  const notInNav = [
    ...menus.filter(m => !navWeekSet.has(m.weekOf)).map(m => `  menus/${m.weekOf}.md`),
    '  shopping/2*.md',
    '  recipes/*-*.md',
  ].join('\n');

  return `site_name: cookwhat
site_description: AI-augmented weekly menu plans and shopping lists
theme:
  name: material
  palette:
    scheme: default
    primary: green
    accent: orange
  features:
    - navigation.tabs
    - navigation.tabs.sticky
    - navigation.top
    - navigation.instant
    - search.highlight
    - search.suggest

markdown_extensions:
  - admonition
  - attr_list
  - md_in_html
  - tables
  - pymdownx.superfences
  - pymdownx.details
  - pymdownx.tasklist:
      custom_checkbox: true
  - toc:
      permalink: true

not_in_nav: |
${notInNav}

nav:
  - Home: index.md
${weekTabs ? weekTabs + '\n' : ''}  - Menus: menus/index.md
  - Shopping: shopping/index.md
  - Recipes: recipes/index.md
  - Ratings: history.md
  - Help:
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
  const menusByWeek = {};
  for (const menu of menus) {
    menusByWeek[menu.weekOf] = menu;
    for (const meal of menu.meals) {
      mealLookup[meal.id] = { ...meal, weekOf: menu.weekOf };
    }
  }

  // This week / next week, relative to build time (weeks start Sunday).
  // COOKWHAT_TODAY=YYYY-MM-DD overrides "today" for previewing other weeks.
  const today = process.env.COOKWHAT_TODAY
    ? new Date(process.env.COOKWHAT_TODAY + 'T00:00:00')
    : new Date();
  const thisWeek = sundayOf(today);
  const nextWeek = addDays(thisWeek, 7);
  const thisWeekMenu = menusByWeek[thisWeek];
  const nextWeekMenu = menusByWeek[nextWeek];

  // Quick-access tabs only for weeks that actually have a menu (avoids
  // linking to a page that doesn't exist, which --strict would reject).
  const navWeeks = [];
  if (thisWeekMenu) navWeeks.push({ label: 'This Week', week: thisWeek });
  if (nextWeekMenu) navWeeks.push({ label: 'Next Week', week: nextWeek });

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
    const ratings = ratingsFor(ratingsByTitle, meal?.title, stored.name);
    write(join(DOCS, 'recipes', `${mealId}.md`), buildRecipePage(stored, meal, ratings));
    recipeCount++;
  }

  // Section landing pages
  write(join(DOCS, 'menus', 'index.md'), buildMenusIndex(menus, shoppingWeeks));
  write(join(DOCS, 'shopping', 'index.md'), buildShoppingIndex(shoppingWeeks));
  write(join(DOCS, 'recipes', 'index.md'), buildRecipesIndex(recipesByMealId, mealLookup, ratingsByTitle));

  // History
  write(join(DOCS, 'history.md'), buildHistoryPage(history));

  // Index (dashboard)
  write(join(DOCS, 'index.md'), buildIndexPage({
    thisWeek, nextWeek, thisWeekMenu, nextWeekMenu, shoppingWeeks, recipesByMealId,
  }));

  // mkdocs.yml
  write(join(ROOT, 'mkdocs.yml'), buildMkdocsYml(menus, navWeeks));

  console.log(
    `Docs built: ${menus.length} menu(s), ${shoppingWeeks.length} shopping list(s), ` +
    `${recipeCount} recipe(s), ${history.length} rating(s)`
  );
}

main();
