# Configuration reference (`cookwhat.config.json`)

Everything that makes a plan "yours" lives here. Run `cookwhat init` to create
the file with sensible defaults, then edit it. Claude reads this on every plan
and treats it as the rulebook; the `plan check` validator enforces the hard
rules.

Edit the file directly, or use the CLI:

```bash
cookwhat config show
cookwhat config get proteinRules.redMeatMaxPerWeek
cookwhat config set proteinRules.redMeatMaxPerWeek 2
cookwhat config set ingredients.dislikes '["liver","cilantro"]'
```

---

## `household`
| Field | Meaning |
| --- | --- |
| `people`, `adults`, `kids` | Who you're cooking for (context for Claude). |
| `defaultServings` | Servings used when a meal doesn't specify one, and the base for shopping-list scaling. |
| `notes` | Free text ("toddler, mild spice"; "we love leftovers for lunch"). |

## `schedule`
| Field | Meaning |
| --- | --- |
| `daysToPlan` | Which days to plan, e.g. `["Mon".."Sun"]`. Trim if you don't cook nightly. |
| `mealsPerDay` | Slots per day. Default `["dinner"]`; add `"lunch"`/`"breakfast"`. |
| `weekendDays` | Days that get the *weekend* time budget (more involved cooking). |

## `preferences`
| Field | Meaning |
| --- | --- |
| `cuisines.love` / `.ok` / `.avoid` | Prioritize, allow, or exclude cuisines. `avoid` is a hard rule. |
| `preferredSites` | Reputable sites Claude pulls recipes from, in priority order. |
| `avoidSites` | Sites to never use (hard rule). |

## `proteinRules` — weekly balance (enforced by `plan check`)
| Field | Meaning |
| --- | --- |
| `redMeatMaxPerWeek` | e.g. `1` for "red meat once a week". Exceeding it is an **error**. |
| `poultryMaxPerWeek` | Soft cap (warning). |
| `seafoodMinPerWeek` | Aim for at least this much fish/seafood (warning if under). |
| `vegetarianMinPerWeek` | Minimum meatless dinners (warning if under). |
| `noRepeatProteinTwoDaysInRow` | Warn when the same protein lands on back-to-back days. |
| `classification` | Maps protein words → categories (`red_meat`, `poultry`, `seafood`, `vegetarian`). Add words to fix mis-categorization. |

> Pork is treated as **red meat** by default — move it to `poultry`/its own
> bucket via `classification` if you prefer.

## `ingredients`
| Field | Meaning |
| --- | --- |
| `dislikes` | Hard avoid — a match anywhere in a meal is an **error** (e.g. `"liver"`). |
| `allergies` | Hard, safety-critical avoid (errors). |
| `favorites` | Ingredients to lean into (guidance for Claude). |
| `pantryStaples` | Things you always have; excluded from shopping lists. Single words match as whole words (`"salt"` also hides "kosher salt"); keep meal-specific items like `"jasmine rice"` off the list so they still get listed. |

## `constraints`
| Field | Meaning |
| --- | --- |
| `maxActiveMinutesWeeknight` | Hands-on time budget Mon–Fri (warning if exceeded). |
| `maxActiveMinutesWeekend` | Budget for weekend days. |
| `weeknightDifficulty` | Free-text guidance ("easy-to-medium"). |
| `leftoversOk` | Whether Claude can plan dishes that intentionally make leftovers. |
| `avoidRepeatWithinDays` | Don't repeat a meal cooked within this many days (unless it's a deliberate redo). |
| `useSeasonalProduce` | Bias toward in-season ingredients. |

## `nutrition`
| Field | Meaning |
| --- | --- |
| `goals` | Tags Claude leans toward ("vegetable-forward", "whole-grains-over-refined", …). |
| `notes` | Free text ("lower sodium", "high protein for training"). |

## `shopping`
| Field | Meaning |
| --- | --- |
| `excludePantryStaples` | Drop `pantryStaples` from generated lists. |
| `aisleOrder` | Category order for the shopping list, matching your store's layout. These are also the valid `category` values for ingredients. |

---

### Example tweaks

```bash
# Family of 4, two veg nights minimum, red meat twice a week
cookwhat config set household.defaultServings 4
cookwhat config set proteinRules.vegetarianMinPerWeek 2
cookwhat config set proteinRules.redMeatMaxPerWeek 2

# Only cook Sun–Thu
cookwhat config set schedule.daysToPlan '["Sun","Mon","Tue","Wed","Thu"]'

# Never any cilantro or liver
cookwhat config set ingredients.dislikes '["liver","cilantro","raw oyster"]'
```
