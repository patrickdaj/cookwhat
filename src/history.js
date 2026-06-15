import { loadHistory } from "./store.js";
import { hostOf } from "./plan.js";

// Filter cooked-meal history.
export function queryHistory({ cuisine, protein, minRating, search } = {}) {
  let entries = loadHistory();
  if (cuisine) entries = entries.filter((e) => (e.cuisine || "").includes(cuisine.toLowerCase()));
  if (protein) entries = entries.filter((e) => (e.protein || "").includes(protein.toLowerCase()));
  if (minRating) entries = entries.filter((e) => (e.rating || 0) >= minRating);
  if (search) {
    const s = search.toLowerCase();
    entries = entries.filter((e) => (e.title || "").toLowerCase().includes(s));
  }
  return entries.sort((a, b) => (a.date < b.date ? 1 : -1));
}

// "Redos": best-loved meals worth cooking again.
// Ranks by average rating across all times a title was cooked, requiring at
// least one entry flagged redo:true OR rating >= 4.
export function suggestRedos({ top = 10, minRating = 4 } = {}) {
  const entries = loadHistory();
  const byTitle = new Map();
  for (const e of entries) {
    const key = (e.title || "").trim().toLowerCase();
    if (!key) continue;
    if (!byTitle.has(key)) {
      byTitle.set(key, {
        title: e.title,
        cuisine: e.cuisine || "",
        protein: e.protein || "",
        sourceUrl: e.sourceUrl || "",
        source: e.source || (e.sourceUrl ? hostOf(e.sourceUrl) : ""),
        ratings: [],
        timesCooked: 0,
        lastCooked: e.date,
        anyRedo: false,
      });
    }
    const g = byTitle.get(key);
    g.timesCooked++;
    if (typeof e.rating === "number") g.ratings.push(e.rating);
    if (e.redo) g.anyRedo = true;
    if (e.date > g.lastCooked) g.lastCooked = e.date;
    if (!g.sourceUrl && e.sourceUrl) g.sourceUrl = e.sourceUrl;
  }

  const ranked = [...byTitle.values()]
    .map((g) => ({
      ...g,
      avgRating: g.ratings.length
        ? g.ratings.reduce((a, b) => a + b, 0) / g.ratings.length
        : null,
    }))
    .filter((g) => g.anyRedo || (g.avgRating != null && g.avgRating >= minRating))
    .sort((a, b) => {
      const ra = a.avgRating ?? 0;
      const rb = b.avgRating ?? 0;
      if (rb !== ra) return rb - ra;
      return b.timesCooked - a.timesCooked;
    });

  return ranked.slice(0, top);
}

// Titles cooked within the last N days — used to avoid over-repeating.
export function recentTitles(withinDays = 21) {
  const cutoff = new Date(Date.now() - withinDays * 86400000)
    .toISOString()
    .slice(0, 10);
  return [
    ...new Set(
      loadHistory()
        .filter((e) => e.date >= cutoff)
        .map((e) => e.title)
    ),
  ];
}
