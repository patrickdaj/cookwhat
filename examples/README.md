# Examples

A worked example of a full week, so you can see the shapes before running your
own. These are samples only — your real data lives in `../data/`.

| File | What it is |
| --- | --- |
| `sample-plan-import.json` | A whole week in the format Claude writes, then loads with `cookwhat plan import --week <date> --file <this>`. |
| `sample-menu.json` | The same week after import — the on-disk menu format (`data/menus/<week>.json`). |
| `sample-shopping-list.md` | The consolidated shopping list `cookwhat shopping` produces from that menu. |
| `sample-history.json` | Example rating history (`data/history.json`) that powers `cookwhat redos`. |

Try it in a throwaway location without touching your real data:

```bash
COOKWHAT_HOME=/tmp/cookwhat-demo node bin/cookwhat.js init
COOKWHAT_HOME=/tmp/cookwhat-demo node bin/cookwhat.js plan new --week 2026-06-08
COOKWHAT_HOME=/tmp/cookwhat-demo node bin/cookwhat.js plan import --week 2026-06-08 --file examples/sample-plan-import.json
COOKWHAT_HOME=/tmp/cookwhat-demo node bin/cookwhat.js plan check 2026-06-08
COOKWHAT_HOME=/tmp/cookwhat-demo node bin/cookwhat.js shopping 2026-06-08
```
