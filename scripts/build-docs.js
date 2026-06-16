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

function buildMenuPage(menu, ratingsByTitle) {
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
    out.push(`## ${m.day} — ${m.title}\n`);

    const meta = [];
    if (m.sourceUrl) meta.push(`**Source:** [${m.source || m.sourceUrl}](${m.sourceUrl})`);
    if (m.cuisine) meta.push(`**Cuisine:** ${m.cuisine}`);
    if (m.protein) meta.push(`**Protein:** ${m.protein}`);

    const times = [];
    if (m.activeTimeMin) times.push(`${m.activeTimeMin} min active`);
    if (m.totalTimeMin) times.push(`${m.totalTimeMin} min total`);
    if (times.length) meta.push(`**Time:** ${times.join(' · ')}`);

    if (m.tags?.length) meta.push(`**Tags:** ${m.tags.join(', ')}`);
    if (meta.length) out.push(meta.join('  \n') + '\n');

    if (m.notes) out.push(`> ${m.notes}\n`);

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

function buildIndexPage(latestMenu, shoppingWeeks) {
  const label = fmtDate(latestMenu.weekOf);
  const out = ['# cookwhat\n'];
  out.push(`**This week: ${label}**\n`);

  out.push('| Day | Meal | Cuisine |');
  out.push('|-----|------|---------|');
  for (const m of latestMenu.meals) {
    out.push(`| **${m.day}** | [${m.title}](menus/${latestMenu.weekOf}.md) | ${m.cuisine || '—'} |`);
  }
  out.push('');

  const links = [`[Full menu →](menus/${latestMenu.weekOf}.md)`];
  if (shoppingWeeks.includes(latestMenu.weekOf)) {
    links.push(`[Shopping list →](shopping/${latestMenu.weekOf}.md)`);
  }
  out.push(links.join(' · ') + '\n');

  return out.join('\n');
}

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

function main() {
  // Load ratings indexed by title
  const histPath = join(DATA, 'history.json');
  const history = existsSync(histPath) ? readJson(histPath) : [];
  const ratingsByTitle = {};
  for (const r of history) {
    const k = (r.title || '').toLowerCase().trim();
    (ratingsByTitle[k] ??= []).push(r);
  }

  // Menus sorted latest-first
  const menuFiles = readdirSync(join(DATA, 'menus'))
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse();
  const menus = menuFiles.map(f => readJson(join(DATA, 'menus', f)));

  // Shopping lists (only .md)
  const shopFiles = readdirSync(join(DATA, 'shopping'))
    .filter(f => f.endsWith('.md'))
    .sort()
    .reverse();
  const shoppingWeeks = shopFiles.map(f => f.replace('.md', ''));

  ensureDir(join(DOCS, 'menus'));
  ensureDir(join(DOCS, 'shopping'));

  for (const menu of menus) {
    write(join(DOCS, 'menus', `${menu.weekOf}.md`), buildMenuPage(menu, ratingsByTitle));
  }

  for (const f of shopFiles) {
    const content = readFileSync(join(DATA, 'shopping', f), 'utf8');
    write(join(DOCS, 'shopping', f), content);
  }

  write(join(DOCS, 'history.md'), buildHistoryPage(history));

  if (menus.length) {
    write(join(DOCS, 'index.md'), buildIndexPage(menus[0], shoppingWeeks));
  }

  write(join(ROOT, 'mkdocs.yml'), buildMkdocsYml(menus, shoppingWeeks));

  console.log(
    `Docs built: ${menus.length} menu(s), ${shoppingWeeks.length} shopping list(s), ${history.length} rating(s)`
  );
}

main();
