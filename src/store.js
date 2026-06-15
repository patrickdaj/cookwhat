import fs from "node:fs";
import path from "node:path";
import { PATHS, readJson, writeJson, weekOf } from "./util.js";

// ---- Menus -----------------------------------------------------------------

export function menuPath(week) {
  return path.join(PATHS.menus, `${week}.json`);
}

export function loadMenu(week) {
  return readJson(menuPath(week), null);
}

export function saveMenu(menu) {
  writeJson(menuPath(menu.weekOf), menu);
}

export function listMenus() {
  if (!fs.existsSync(PATHS.menus)) return [];
  return fs
    .readdirSync(PATHS.menus)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJson(path.join(PATHS.menus, f)))
    .filter(Boolean)
    .sort((a, b) => (a.weekOf < b.weekOf ? 1 : -1));
}

export function newMenu(week, cfg) {
  return {
    weekOf: week || weekOf(),
    createdAt: new Date().toISOString(),
    status: "draft", // draft | set
    servingsDefault: cfg.household.defaultServings,
    meals: [],
  };
}

// ---- History / ratings -----------------------------------------------------

export function loadHistory() {
  return readJson(PATHS.history, []) || [];
}

export function saveHistory(entries) {
  writeJson(PATHS.history, entries);
}

export function addHistoryEntry(entry) {
  const all = loadHistory();
  all.push(entry);
  saveHistory(all);
  return entry;
}
