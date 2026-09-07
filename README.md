# cfb2026 — pick board

Static site. No build step, no dependencies. Vercel serves the repo root as-is.

## Pages
- `index.html` — landing, links the three views
- `Week 1 Pick Board.dc.html` — desktop board
- `Week 1 Pick Board Mobile.dc.html` — phone board
- `Picker Performance.dc.html` — picker analytics

## Data files
| File | Holds | Refresh |
| --- | --- | --- |
| `board-bundle.js` | `window.BOARD`: pick rows, weather defaults, and `LEDGER_CSV` inlined | when picks or grades change |
| `ref-data.js` | `window.REF`: team aliases, FBS meta, power ratings, 888 scheduled games with venue/roof/kickoff | weekly, with the new PFF pull |
| `host_pick_ledger.csv` | source ledger (also inlined into board-bundle.js) | as grades land |
| `reasoning.csv` | per-pick reasoning: thesis, mechanism, evidence grade, projection, counter-case, falsifier (also inlined as `REASON_CSV`) | as picks are written up |
| `game_conditions.csv` | manual weather overrides only; venue and roof now come from the schedule | rarely |

## Weekly refresh
1. Drop the new PFF power ratings and any updated schedule export in.
2. Regenerate `ref-data.js` — it is generated, not hand-edited. The generator resolves rating shorthand (`S CAROLINA`, `NWESTERN`, `JAMES MAD`) to canonical CFBD school names via a checked alias table.
3. Paste the updated ledger into `LEDGER_CSV` inside `board-bundle.js` and replace `host_pick_ledger.csv`.

## Model
Model line = home power rating − away rating + 2.0 home-field (0 at neutral sites).
- Spread edge = model margin − number cited.
- Moneyline edge = model margin − the fair margin implied by the cited price (normal margin model, sd 16).
- Totals, team totals, halves and quarters are unmodelable: the ratings carry no pace number, and a full-game margin cannot price a half.

A pick's team resolves against the two teams in its own game, so house shorthand (`BAMA`, `SCAR`, `TUL`) needs no alias list.
