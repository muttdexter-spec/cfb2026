# cfb2026: pick board

Static site. No build step, no dependencies beyond the files here. Vercel serves the repo root as-is
from `main`; the laptop's `cfb2026_upload\` folder is a clone of this repo and the source of truth for
the hand-authored files.

The board is an observational tracker, not a tipping service. Two rules shape almost everything on it:

- **CLV is measured against `CLOSE_PROXY`**, the last line CFBD recorded, not a verified close. No
  picker is ranked on it until the manual Saturday closes have been compared against it.
- **The ratings model does not beat the market.** Fitted on 223 games (home-field 4.07, scale 1.306),
  it misses the market by 7.61 points (sd) and misses real margins by more than the market does
  (MAE 12.88 against 10.98 on 157 finished games). Its number is shown as a delta, never as an edge.

## Pages

| Page | What it is |
| --- | --- |
| `index.html` | Landing page. On a phone the phone board is listed first |
| `Pick Board.dc.html` | Desktop board: every scheduled game for the week, host positions, graded results, markets, props, injuries, the prop card |
| `Pick Board Mobile.dc.html` | The same board laid out for a phone. Opens on the games; filters are one tap away |
| `Picker Performance.dc.html` | Each host's record: CLV and win rate with sample sizes and 95% intervals, over time, by stated confidence and by evidence grade. Not a ranking |

The two board pages share their data and view logic through `odds-view.js` and `intel-view.js`, but
each still carries its own copy of the page logic (about 1,000 identical lines). A fix to one has to
be made to the other; see "Known issues".

## Data files

| File | Holds | Built by |
| --- | --- | --- |
| `board-bundle.js` | `window.BOARD`: the hand-authored `G` pick grid and episode labels, then `META` and the inlined ledger, reasoning, conditions, lines and results CSVs | top by hand; `META` and CSVs by `make_site_data.py` (menu 14) |
| `ref-data.js` | `window.REF`: schedule, team aliases, PFF power ratings | external PFF generator (last run 5 Sep; see Known issues) |
| `odds-data.js` | `window.ODDS`: sportsbook consensus and per-book prices for the current week's games, keyed on `cfbd_game_id`. Loaded with the page | `make_odds_data.py` (menu 16) |
| `odds-props.js` | `window.ODDS_P`: the player props, once the build writes them to their own file (`ODDS.props_file` names it). Loaded when a markets panel first opens. Not there yet: today the props are still inside `odds-data.js`, and the board reads them from either place | patched `make_odds_data.py` (menu 16) |
| `model-data.js` | `window.MODEL`: team environment and player prop projections from `prop_projections.py`. Loaded when a markets panel first opens; the pages read only its environment card | `make_odds_data.py` (menu 16) |
| `intel-data.js` | `window.INTEL`: the injury tracker and the prop card for the current week, joined to the schedule | `make_intel_data.py` (new) |
| `odds-view.js` | view layer for prices: de-vig, consensus, best price, line move, prop grids | by hand |
| `intel-view.js` | view layer for the injury tracker and the prop card | by hand |
| `support.js` | the page runtime (loads React from unpkg) | generated, never edit |
| `host_pick_ledger.csv`, `reasoning.csv`, `market_lines.csv`, `results.csv`, `game_conditions.csv` | the same data as the inlined CSVs, kept for reference. No page fetches them | menu 14 / by hand |

## How the pages load

The data files are plain `<script>` tags in the page's `<head>`, not in the runtime's
`<helmet>`. The runtime re-inserts every helmet script after it boots, after the browser has
already run them once while parsing, so a data file in the helmet is downloaded and evaluated
twice. Keep new data files in `<head>`.

`model-data.js` (818 KB) and, once the build splits them out, the player props (91% of the
odds file) are fetched by `odds-view.js` the first time a markets panel opens. Until they land the
panel shows the game markets and a "Loading props..." tab; if the props file is missing the tab
says "Props unavailable". In a headless Chromium test at 4x CPU slowdown on an emulated 4G
connection, this took the phone board's first render from about 2.7 s to 2.4 s, its script requests
from 15 to 7, and its first-load transfer from about 860 KB to 650 KB gzipped (the second copies
were re-sent in full in that test; on Vercel they would mostly have been revalidated). The props
split, when the build makes it, takes about 270 KB more off.

## Weekly refresh

1. Menu **4** (Monday pull and grade), then work `_UNRESOLVED.csv`, then menu **11** (backup).
2. New week's picks: extract, append to `CFB Picks\`, add the week's day blocks to `G` in
   `board-bundle.js` and its rows to `reasoning.csv` and `game_conditions.csv`.
3. Menu **6** if a ledger changed, **14**, **15**, **16**, **14** again, **7** (the gate).
4. After the injury pass (`cfb_injury_pass.py merge`, `injury_tools.py flag-card`) and after each prop
   card update: `py -3 Scraper\make_intel_data.py` (week defaults to `current_week`). It reads the
   week's files in `Odds Scraper\cfb_edge\ref\` and `cfb_data\projections_v1\finetune_WKnn\` and writes
   `intel-data.js`. No other step is needed for an injury-only update.
5. In `cfb2026_upload\`: `git pull` first (the repo may have commits made elsewhere), then
   `git add -A`, `git commit`, `git push`. Vercel deploys on the push.

## What the board shows

**Games.** Every game on the selected week's schedule, not only the ones with a pick. A game whose
schedule kickoff is still the 5 Sep placeholder (`tbd`) takes its kickoff from the newest CFBD line
capture, so it sorts into its real slot and can go live and final. A game with a final score is shown
as finished whatever the clock says.

**Positions.** One chip per host position. After the game is graded the chip carries the result
(W / L / P) from the ledger; the detail panel shows margin, CLV against `CLOSE_PROXY` and the pick id.
The grid has no `pick_id`, so the join is by picker, game and market signature; 527 of 533 grid
positions resolve to exactly one ledger row, and the rest show "no ledger row joined".
The `Δ` beside a position is the ratings model minus the cited number. It is not coloured as an edge.
The `⇄` marker, the Opposed filter and the "split" note pair positions on the same bet: opposite
teams on the full-game side (spread or moneyline), over against under on one total, or the same
period's derivative. A game-total over and a team-total under can both win, so they do not pair.

**Evidence grade.** Each chip carries the grade of the argument behind it, from the reasoning or
ledger row (DESIGN_BRIEF 4 calls it the most important field): a solid tag for charted or stat cited,
an outlined tag for base rate, roster, scheme or market, a dashed tag for motivation, assertion or none
offered. It is carried by weight, not colour, because colour already means side and the bar means
tier. The Evidence filter narrows the board to one grade, or to charted and stat cited together. The
performance page's Evidence grade table gives CLV and win rate by grade with n and 95% intervals.
A grade is tested against the other grades pooled only once it has 10 CLV rows; with Weeks 1 to 3
graded none separates, and three grades are still too small to test.

**By side / By CLV.** Chips are coloured by side until every scheduled game carrying a position that
week has a result; then chips and ticks are coloured by CLV against `CLOSE_PROXY` (beat, same number,
worse, no CLV), with the number in place of `Δ`: points on sides and totals, probability points on a
moneyline (PODCAST_BOARD_SPEC 4). A position whose game is not on the schedule does not hold the week
back. The legend changes with the mode; the toggle beside it holds until the week changes. The
explanations sit behind "Chip key"; the line saying the model delta is noise stays in view.

**Time to kickoff.** Games kicking off in the next 24 hours show "in 2h 05m". The next close to
capture, the next kickoff among the games on screen that carry a position, is marked in amber on
those games and named in the heading of its day, once it is within 36 hours.

**Weather** is silent unless a threshold trips at the kickoff hour (PODCAST_BOARD_SPEC 2.3): wind
15 mph or more, gusts 25 or more, rain 60% or more, 95°F or hotter, 32°F or colder. Indoor games show
a dome marker. The "conditions pulled" notes no longer render. That includes the three Week 1 heat
notes: the conditions file holds no temperature reading for any of those games, and one is a host's
on-air heat-index remark (110F at Alabama).

**Disputed rows** (`CFB Picks\LEDGER_DEFECTS.csv`) keep their graded result and stay out of every CLV
mean. **Non-host entities** (guests, producers, show-level designations, unresolved pickers) come from
`entity_type` / `in_host_baseline` in the ledger and are out of the performance page by default.

**This week.** Two panels above the slate:

- *Prop card*: every play on the current card file (`WKnn_CARD_*.csv`, else `WKnn_FINAL_CARD.csv`) as
  the file wrote it: layer, status, best book and price, the price to take it at or better, EV base /
  conservative, stake as % of bankroll, reason, line move, injury flags on teammates. Live plays also
  appear on their game row and as a `CARD` badge on the player's row in the prop tab.
- *Injury tracker*: every designation the injury pass recorded, with its source and posting time, and
  unit clusters (moderate or major) for tier A games. Coverage is the pass's tiers only: every priced
  player in the card's games (tier A) and the starting QB of every other propped game (tier B). No
  chip on a game means nothing tracked was listed, not that the team is healthy.

A position whose game later gets an OUT, a doubtful or a QB designation posted after the episode it
came from carries a `⚕ n` marker; the detail panel lists each designation as posted after, the same
day as, or before the pick.

**Props.** The prop tabs show the rebuilt consensus per player and market, one row per player. The
model column is `prop_projections.py`, shown as a reference: out of sample on 639 two-sided lines
(Weeks 2 and 3) no version of the model beat the market, so its delta is not coloured. Tab counts are
the cells the tab's grid shows: priced markets, one over/under per player and stat, and a yes/no and
its over/under at 0.5 counted once. The default sort groups by market (the grid by each player's
leftmost market) and puts the biggest number first on markets with a line and the likeliest first on
yes/no and touchdown markets.

**Prices as of.** Every markets panel says when its prices were captured, in Eastern time (on a
Saturday that is usually the night before).

## Sportsbook markets (design notes worth keeping)

- **Consensus is rebuilt from the per-book quotes**: the modal line, then the median price in
  probability space among the books hanging it. SGO's own consensus put 31% of its NCAAF prices
  outside the range of the books it claimed to summarise.
- **Opening numbers are rebuilt the same way**; SGO's event-level `open*` fields are wrong on the
  moneyline.
- **Best price compares like with like**: the best price among books hanging the line most books
  hang, and only when at least two books quote that side.
- **De-vig needs one line**: two sides are normalised against each other only when both are priced at
  the same number.
- **SGO's fair price is checked against its own book price** before it stands in for a de-vig: on 198
  of the 2,493 markets that fall back to it, it sat more than 10 points of probability away (Jadan
  Baugh anytime TD: book -424, fair +198), mostly on rows where a first-half quote shares the
  full-game row. Such a market is measured against its vigged price, and says so.
- **A moneyline moves in cents from even money**: -103 to +142 is 45 cents, not 245.
- **A line difference has no good/bad colour** in the book comparison: one cell holds both sides, and
  a number that helps one side hurts the other.
- **Periods.** `ODDS.periods = "game"` says the build kept full-game props only. Without it the board
  claims no best price on yes/no and touchdown rows and says why under the tab.
- `DraftKings` and `DraftKings_Alt` are different CFBD feeds. Never merge them.

## Known issues

- **First-half player props.** `make_odds_data.py` keys props without SGO's `period_id`, so a 1H line
  arrived as a second full-game row (DeSean Bishop 79.5 rush yards and his 1H 40.5), and a yes/no
  market with no line (anytime TD) can mix its 1H and full-game quotes in one row: in the 26 Sep MID
  snapshot 240 of 1,874 yes/no rows quoted by two or more books have books 1.8 times or more apart
  (Dallas Wilson: FanDuel +145, BetMGM +115, Bovada +150, DraftKings +600). The board keeps one
  over/under row per player and stat, says how many it hid, and flags the yes/no and touchdown rows
  until the build sets `periods`. The fix is in the patched `make_odds_data.py` (full-game props only,
  `periods: "game"`, and the props split into `odds-props.js`); it needs a menu 16 run.
- **`ref-data.js` is the 5 Sep generation**: preseason (2026W0) ratings, and 41 of 71 Week 4 and 41 of
  59 Week 5 games still flagged TBD. The board works around the kickoffs; the ratings need the
  generator, which is not in `Scraper\`.
- **`model-data.js` is the original projection run**, not the fine-tuned overlay, and carries no run
  id or timestamp.
- **Weather.** `game_conditions.csv` stores `kickoff_iso` in the venue's local time; the board now
  asks Open-Meteo for venue-local hours. Week 3 has no rows.
- **Two copies of the board logic.** Desktop and phone pages duplicate their data and join functions.
  Moving them into a shared file like `odds-view.js` is the next structural fix.
- **Still open, small:** the CFBD market chip takes every field from the best-ranked line row, so a
  game whose DraftKings row has no total (Houston at Texas Tech) shows none even where CLOSE_PROXY has
  52.5; games in `G` that match no scheduled game share one "unconfirmed" day header; "BSU" in `G`
  matches neither team; the unnamed "RUT ML" position is coded as the other direction from Rutgers'
  -29.5, which makes a false 2-1 split; both unnamed pickers share one record.
