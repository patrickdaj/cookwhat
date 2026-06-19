# Source cookbook PDFs

Drop your scanned/exported **cookbook PDFs here** — one file per book. This is
the reference/source layer the recipe catalogs are built from.

## Rules
- **Everything in this folder is gitignored except this README.** The PDFs are
  copyrighted source material and **never get committed or pushed** — only the
  *extracted* catalogs in `data/cookbooks/*.json` are committed.
- Name each PDF to match its catalog file so they're easy to pair, e.g.:
  - `complete-mediterranean.pdf` → `data/cookbooks/complete-mediterranean.json`
  - `foodlab.pdf` → `data/cookbooks/foodlab.json`
  - `salt-fat-acid-heat.pdf` → `data/cookbooks/salt-fat-acid-heat.json`

## How it's used
When a book recipe is planned as a placeholder and it's time to cook it, the
page is read **from the PDF here** (or a photo you paste) to capture the real
`ingredients`, ordered `steps[]`, and mined `tips[]` into the catalog's
`captured` block — then the menu's recipe detail + shopping list are filled in.
So a PDF here means a book can be captured on demand without re-scanning by hand.

(See the "Cookbooks" section of `CLAUDE.md` for the full placeholder →
scan-on-demand workflow.)
