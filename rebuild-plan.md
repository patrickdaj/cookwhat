# Menu Rebuild Plan — Mediterranean + Asian focus

**Run this on the desktop** (it can fetch real ingredients from the preferred
sites and run the AI pass; the cloud container can't — sites 403 there).

## Rules to honor (from cookwhat.config.json)
- Per week: **red meat ≤1, poultry ≤3, seafood ≥1, vegetarian ≤1**, no same
  protein two days in a row.
- **Exclude:** liver, organ meat, **curry**, **broccoli** (so: no curries, and
  watch broccoli/broccoli-rabe). Keep dairy lowish, beans low.
- **Swordfish:** fine in a stew/braise, NOT grilled (prep-dependent dislike).
- Weeknight active ≤45 min, weekend ≤120. ~2+ Asian/week. Full plates
  (protein + real veg + carb).

## PROTECT — do not touch
- **June 21, Mon — Chicken au Poivre** + Fondant Potatoes + Haricots Verts (boss dinner)
- **June 28, Sat — Grilled Ribeye + Beef Butter** + Crispy Smashed Potatoes + Grilled Asparagus (July 4th)

## Good news: most dinners already fit — only these are off-theme to SWAP
| Week | Day | Remove (off-theme) | → Replace with (Med/Asian) | Cuisine/Protein | Source |
|------|-----|--------------------|----------------------------|-----------------|--------|
| 06-21 | Wed | Honey Mustard Sheet-Pan Chicken (american) | **Soy-Glazed / Cashew Chicken** | chinese / poultry | Woks of Life (fetch) |
| 06-21 | Fri | Championship Bacon-Wrapped Shrimp (american) | **Greek-Style Shrimp with Tomatoes & Feta** | mediterranean / seafood | Complete Med **p.269** |
| 06-28 | Tue | Grilled Shrimp Tacos (mexican) | **Pan-Roasted Halibut with Chermoula** | mediterranean / seafood | Complete Med **p.247** |
| 06-28 | Fri | Cornell Chicken (american) | **Chicken alla Diavola** (grilled) | italian-med / poultry | Complete Med **p.299** |
| 07-05 | Thu | Buttery Lemon-Herb Roast Chicken (american) | **Chicken Teriyaki** or **Oyakodon** | japanese / poultry | Just One Cookbook (fetch) |

*(Sunday June 21 "Huevos Rancheros" is a weekend **breakfast**, not a dinner — leave it unless you want it gone.)*

After the 5 swaps, every week lands ~3 Asian + Med rest, and still passes the
protein rules (spot-check each with `cookwhat plan check`). Keep the dishes already
on-theme: Yellowtail Teriyaki, Pork Milanese, Spanish Braised Chicken, Sicilian
Fish Stew, Thai Basil Chicken, Miso Chicken, Maple-Miso Salmon, Grilled Trout,
Dakgalbi, Skillet Salmon, My Mother's Meatballs, Karaage, Brown Butter Scallops.

## If you'd rather rebuild fuller — candidate bench

### Mediterranean (from the Complete Mediterranean catalog — page refs; no fetch, scan to capture)
- **Poultry:** Za'atar-Rubbed Butterflied Chicken p.298 · Grilled Chicken Souvlaki p.300 · Roasted Chicken w/ Fennel, Olive & Orange p.296 · Chicken in Turkish Walnut Sauce p.294
- **Seafood:** Greek-Style Shrimp w/ Tomatoes & Feta p.269 · Garlicky Roasted Shrimp w/ Parsley & Anise p.271 · Pan-Roasted Sea Bass w/ Green Olive-Almond-Orange Relish p.255 · Whole Roasted Snapper w/ Citrus Vinaigrette p.260 · Provençal Braised Hake p.247 · Sicilian Fish Stew p.267 (swordfish — stew, OK)
- **Red meat (use the 1/week slot):** Grilled Beef Kebabs (Lemon-Rosemary) p.307 · Grilled Lamb Kofte p.321 · Spice-Rubbed Pork Tenderloin p.315
- **Lighter/veg-forward:** Shakshuka p.330 · Chopped Greek Salad p.836-area · Spanish Tortilla

### Asian (web — desktop fetches from preferred sites; no curries)
- **Japanese (justonecookbook.com):** Salmon Teriyaki · Oyakodon · Buta no Shogayaki (ginger pork) · Gyudon (beef) · Saba Shioyaki · Yaki Udon
- **Chinese (thewoksoflife.com):** Cantonese Steamed Fish · Char Siu · Cashew Chicken · Black Pepper Beef · Kung Pao Chicken · Shrimp w/ Garlic Sauce · Mapo Tofu (the veg pick)
- **Korean (maangchi.com):** Bulgogi (beef) · Bibimbap · Japchae · Jeyuk Bokkeum (spicy pork) · Dak Bulgogi
- **Thai (no curry):** Pad Krapow · Pad See Ew · Pad Thai · Thai Basil Shrimp · Larb Gai
- **Vietnamese:** Caramel Salmon (Cá Kho) · Lemongrass Chicken · Shaking Beef (Food Lab)

## Desktop execution checklist
1. `git pull origin main`
2. For each swap: `cookwhat plan add` the new main (+ its veg/carb sides). Web picks → `cookwhat recipe fetch` for real ingredients; cookbook picks → scan p.NNN and capture **ingredients + ordered steps + mined tips**.
3. `cookwhat plan check <week>` — fix any ✗ (protein caps, no back-to-back).
4. `cookwhat shopping <week>` to regenerate lists.
5. `cookwhat plan set <week>` and commit.
