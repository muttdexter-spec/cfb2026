# cfb2026 — pick board

Static site. No build step, no dependencies. Vercel serves the repo root as-is.

**State as of 2026-09-07.** Week 1 is graded across three shows — Cover 3 (56 positions), Big
Bets on Campus (47) and Barstool Pick Em (46), 149 in total. Week 2 (11–13 Sep) has a market but
no picks: no transcripts have been extracted yet, so the board carries Week 1 positions only.

## The three shows

| Show | Ledger label | Episode prefix | Positions | Confidence tiers |
| --- | --- | --- | --- | --- |
| Cover 3 | `Cover 3` | `C3_` | 55 | tier 3 **stated** (the three-star lock); 1 and 2 inferred |
| Big Bets on Campus | `BBOC` | `BBOC_` | 48 | all **inferred** |
| Barstool Pick Em | `Pick Em` | `PICKEM_` | 46 | tier 3 **stated** (the "mortal"); 1 and 2 inferred |

Tiers are not comparable across shows without reading that last column. The episode label
constants at the top of `board-bundle.js` carry it per episode, and the show filter on both
board pages splits by it.

**Barstool Pick Em is the weakest signal of the three and the ledger says so.** 67% of its
positions carry no supporting evidence at all (`evidence_grade` of `NONE` or `ASSERTION`),
against 46% across the full ledger. It contributes no injury news and no prop-relevant usage
notes. Its transcript also carries no speaker labels, so 22 of its 46 rows are attributed to
`Unnamed Picker (Pick Em)`, an `UNRESOLVED` collector entity that is held out of the host
baseline and is **not a person**.

## Pages
- `index.html` — landing, links the three views
- `Pick Board.dc.html` — desktop board
- `Pick Board Mobile.dc.html` — phone board
- `Picker Performance.dc.html` — picker analytics

The board pages were `Week 1 Pick Board*.dc.html`. They are week-agnostic now: the heading and
the standfirst come from `BOARD.META`, and the week is derived from the `pick_id` prefixes in
the ledger rather than from the pipeline's `current_week` — otherwise a Week 1 pick grid gets
labelled "Week 2" the moment the config rolls over.

## Data files
| File | Holds | Refresh |
| --- | --- | --- |
| `board-bundle.js` | `window.BOARD`: `META`, pick rows (`G`), weather defaults, and `LEDGER_CSV` / `REASON_CSV` / `COND_CSV` / `LINES_CSV` inlined | when picks or grades change |
| `ref-data.js` | `window.REF`: team aliases, FBS meta, power ratings, 888 scheduled games with venue/roof/kickoff | weekly, with the new PFF pull |
| `host_pick_ledger.csv` | graded ledger — the grader's `result`, `clv_points`, `closing_basis`, `ungradeable_reason`, plus `entity_type` / `in_host_baseline`, with the pre-grade values kept as `ledger_result` / `ledger_clv_points` | after every grading run |
| `reasoning.csv` | per-pick reasoning: thesis, mechanism, evidence grade, projection, counter-case, falsifier | as picks are written up |
| `market_lines.csv` | DraftKings / DraftKings_Alt / Bovada spread, total and moneyline per game, one row per game-book-snapshot | with each `/lines` pull |
| `results.csv` | finals and full line scores (Q1–Q4, 1H, 2H, OT) for every completed game | with each results pull |
| `game_conditions.csv` | manual weather overrides only; venue and roof come from the schedule | rarely |
| `odds-data.js` | `window.ODDS`: sportsbook consensus and per-book prices for every game the odds pull covers, keyed on `cfbd_game_id` | after every SGO transform |
| `model-data.js` | `window.MODEL`: team environment and player prop projections, same key | after every projection run |
| `odds-view.js` | the view layer both board pages share — de-vig, edge, line-move, best-price | hand-authored |

`Scraper\make_site_data.py` (menu option 14) rebuilds the ledger, the market file, the results
file, the bundle and `MANIFEST.txt` in place. Nothing in this folder is hand-edited except the pages themselves,
`ref-data.js`, and the `G` pick grid inside `board-bundle.js`.

## The model

**Model line** = `scale × (home rating − away rating) + home-field`, home-field 0 at neutral
sites. Both constants are **fitted, not assumed**. `Scraper\calibrate_model.py` (menu option 15)
regresses the market number on the rating difference across every rated game that has a posted
line — no outcomes required, so it works before a ball is snapped — and writes the result into
`BOARD.META.model`.

As of 2026-09-07, on 101 non-neutral games: **home-field 4.94, scale 1.306**, residual sd 7.35,
R² 0.791. The board previously used 2.0 and 1.0. Those assumed values left the model leaning
toward away teams by about 5.5 points on the games the ledger actually covers, which inflated
the measured edge on every away-side pick and deflated it on every home-side pick — a
distortion of the ranking, not of the mean.

**The model does not beat the market and is not treated as a source of edge.** Against real
margins on 47 completed rated games: model MAE 16.27, market MAE 14.45. A model that predicts
margins worse than the number it is arguing with cannot, on its own, establish that the market
is wrong. The Edge column is a sanity check on the price. An edge under the residual sd — 7.35
points today — is inside the model's own noise, and that figure, not a round number, is the
threshold the performance page counts against.

Spread edge = model margin − number cited. Moneyline edge = model margin − the fair margin
implied by the cited price (normal margin model, sd 16). Totals, team totals, halves and
quarters are unmodelable: the ratings carry no pace term and a full-game margin cannot price
a half.

## The market chip

Reads `market_lines.csv`, preferring DraftKings over DraftKings_Alt over Bovada, and `CURRENT`
over `CLOSE_PROXY` over `OPEN`. A `close~` suffix means the number shown is `CLOSE_PROXY`, not a
verified close. A blank chip is a real answer: no book in the CFBD feed carried that market at
pull time. Coverage today is 99/99 Week 1 games, 49/86 Week 2, 5/75 Week 3.

`DraftKings` and `DraftKings_Alt` are two different feeds, not a spelling variant — they
disagree on spread in 16.7% of shared games and on total in 11.5%, and the Alt feed carries no
opening numbers and no moneylines. Do not merge them.

## Finals

Before `results.csv` existed the board had no score source at all — `ref-data.js` carries the
schedule and no points, so any game past kickoff + 3h30 sat on "final pending" forever. It now
shows the actual final. Games still reading "final pending" are ones the last pull ran before;
the next pull clears them. This is a separate file rather than extra fields in `ref-data.js`
because that file is regenerated from the PFF export by a generator outside this pipeline, and
anything hand-added to it disappears the next time that runs.

## Disputed rows

A row listed in `CFB Picks\LEDGER_DEFECTS.csv` is marked `disputed` in the ledger and counted on
the page. **Its graded result is left exactly as the grader scored it.** Nobody here knows the
right answer, and silently flipping or dropping a result would be a worse lie than showing one
that may be wrong. Three Week 1 rows are currently disputed; see that file for what is wrong
with each and what resolving it would change. Two of them are the same cited Rutgers number
logged by two pickers, eight points away from the closing number — they carry the largest CLV
figures in the ledger, and dropping them roughly halves the mean CLV of both pickers. **No Pick
Em CLV figure should be quoted until that number is settled from the audio.**

## CLV, and who counts as a host

CLV is computed against `CLOSE_PROXY`, CFBD's last recorded number. It is stable (1,587 of
1,587 matched rows unchanged across a 48-minute post-kickoff window) but it has never been
checked against a real close. Until five manual closes are captured and compared, every CLV
figure carries an unquantified error and no picker should be ranked on it.

Derivative markets — halves, quarters, team totals — grade fine from line scores but have no
CFBD market, so they can never produce CLV. CFBD publishes no juice on spreads or totals, so
`clv_pct` is uncomputable; only `clv_points` exists. So do back-filled numbers — see the section above.

`entity_type` and `in_host_baseline` come from `dim_hosts.csv` and are re-derived at build time.
**28 of the 149 Week 1 rows sit outside the host baseline:** 24 unresolved (two from a recurring
unnamed Cover 3 picker, 22 from Barstool Pick Em's unattributable middle card and round-table
talk), three guest picks, and one show-level branded designation that is not a person. They are
carried, labelled, and kept out of every host's record. The producer entity is now at zero rows
and is deliberately kept in `dim_hosts.csv` — deleting it would send the next producer pick into
a host's record through the `UNMAPPED` default.

## Picks with no number said on air

A pick where the picker named a side but never a number is **back-filled from the market** and
graded; if no market exists to infer from, it is removed from the ledger entirely. The number comes from `market_lines.csv` on the standard book preference at the
`CLOSE_PROXY` snapshot, and the row carries `number_source = MARKET_INFERRED` in the ledger. Six
Week 1 rows were back-filled.

**Where CFBD publishes no market, the pick is removed rather than carried.** A first-half total
and a team total cannot be inferred at any tier, so `W01-054` and `W01-067` were deleted from the
ledger on 2026-09-07 and preserved in `CFB Picks\_REMOVED_NO_NUMBER.csv` with the reason. The
ledger is 149 rows. `pick_id` is never renumbered, so those two ids are permanent gaps in the
sequence. Neither row had ever graded, so no picker's record moved.

Between the back-fill and the removal, ungradeable fell from **12 to 4** — and not one of the
four is a missing number. Three are the unplayed SMU–Florida State game and one is the resolver
defect below.

**These rows never produce a CLV figure.** `grade_picks.py` blocks them with
`NUMBER_INFERRED_FROM_MARKET`. A number taken from the market cannot measure movement against the
market — the answer is zero by construction, and six zeros in a picker's mean would read as
handicapping. Four of the six belong to one picker.

One thing to hold on to. **CFBD has no line snapshot from any episode's recording date** — the
only captures are 6 Sep 12:12Z, 7 Sep 01:50Z and 7 Sep 20:11Z. The entries bracketing a 2–3
September recording are `OPEN` and `CLOSE_PROXY`, which move 1.50 points apart on spreads and 1.68
on totals on average, so an inferred number carries about ±1.5 points of error — larger than most
real CLV in this ledger.

For Week 1 specifically, all six back-filled results are the same whether the `OPEN` or the
`CLOSE_PROXY` number is used. That will not always be true and is worth re-checking weekly.

## Rows that still do not grade

Four: three because SMU–Florida State has not been played, and one — `W01-151` — because the grader resolves a game from the team named
in `side` and then narrows on the UTC kickoff date, and Stanford played twice in Week 1. That last
one is a latent grader defect, not a ledger error, and it is left visible rather than forced
through with a hand-supplied game id.

## Every game, not only the picked ones

The board used to iterate the pick grid in `board-bundle.js`, so a game nobody had
a position on **did not exist on the page**. Week 1 rendered 50 games out of 99, and
the market and the model had nowhere to be shown on the other 49.

It now iterates `REF.GAMES` for the selected week and hangs the pick grid on top.
Week 1 renders 99 games and all 141 positions; Week 2 renders 86 games and no
positions, which is the truth about Week 2.

Two new filters sit at the front of the bar:

- **Week** — every week the schedule carries, labelled with its game count, its
  pick count, and whether the odds pull covers it. It defaults to the week the odds
  snapshot covers, because that is the live slate.
- **Games** — all / with a host pick / no host pick / priced games only. "With a
  host pick" respects the picker, tier, show and market filters, so it means *a
  position that survives the current filters*, not *any position at all*.

A position whose matchup does not resolve against the schedule is still carried.
`LIU at Kansas` is one: the show's shorthand for Long Island University is not in
the alias table, so it falls back to matching on the one side that does resolve,
and if even that fails it is appended to the week the pick grid belongs to rather
than dropped. **That fallback only runs on the pick grid's own week** — otherwise a
Week 1 position would attach itself to a Week 2 game whenever the same team is home
in both.

## Sportsbook markets

`Scraper\make_odds_data.py` (menu option **16**) reads the newest
`fact_odds_model_*.csv` and `fact_odds_all_*.csv` out of `Odds Scraper\out`, joins
them to the schedule, and writes `odds-data.js`. It spends no SGO object and makes
no network call.

**The join happens here, once.** SGO emits raw team names with
`join_status=UNRESOLVED` by design. An event matches a scheduled game when at least
one resolved side lands on the same side of that game, the kickoffs are within a
day, and the match is unique. Requiring both sides would drop every FBS-vs-FCS game
— the FCS side is not in the alias table — and dropping the date guard would let
next week's games claim this week's, which SGO's 8-day window makes a live problem:
Syracuse at Pittsburgh on 17 Sep is in the current snapshot and would otherwise have
claimed UCF at Pittsburgh purely on the home team.

Current coverage: **83 of 86 Week 2 games priced across 8 books.** The three that
are not — Buffalo at Florida International, Robert Morris at Akron, West Georgia at
Arkansas State — have no SGO event at all, and their rows render with no market
chip. That is a real answer, not a failure. The run report lists them every time.

Each game row carries the consensus number and, shaded beside it, the opening
number. The book count used to sit on that chip and no longer does — `Compare
books` answers that question properly. `Markets` expands into tabs: **Game** (spread, total, moneyline, team total
and the three 1H markets), one tab per prop family (**Passing, Rushing, Receiving,
Touchdowns, Combo**), and **Model**.

### The tables are pivoted, and that is the whole point

The data arrives as one row per market per side, which is how a feed is shaped and
the wrong way round for reading. Rendered literally, a game ran to **14 rows to say
six things** and a touchdown tab to 18 rows for seven players with three columns
that were empty on every one of them.

Both tables now pivot: **rows are the thing you are looking up** — a team, a player
— and **columns are the markets**. A game is 2 rows plus 2 for the first half. A
player's whole card is one line. Measured on the same game, at the same width:

| Tab | Before | After |
| --- | --- | --- |
| Game | 1,312 px | 343 px |
| Touchdowns | 2,810 px | 873 px |
| Receiving | 1,447 px | 519 px |

Across the week that is 68–87% fewer rows on the prop tabs and 14 rows down to 4 on
every game.

Three rules keep it that way:

- **A column that is empty is not drawn.** Nobody prices the `no` side of an anytime
  touchdown, and most games have no projection, so those columns simply do not
  exist on that tab rather than rendering a wall of dashes.
- **The opening number appears only where it moved**, inline under the current
  price rather than in a column of its own. Most opens are unchanged, and printing
  them all doubled the height to say nothing.
- **The threshold lives in the column name.** "2+ rec TD" already means the line is
  1.5, so the cell shows a price and nothing else, and `yes/no` never appears in a
  Line column. This also collapses the duplicate SGO ships for every touchdown
  market — once as a yes/no, once as an over/under at 0.5 — into one cell, keeping
  whichever is priced at more books.

`Sort` cycles the prop tabs through three orders. **Odds is the default**:
shortest price first, which puts the likeliest scorer at the top of a touchdown
tab. Sorting the American number directly would work there by accident - American
odds happen to be monotonic in probability - but it falls apart on a yardage tab
where every over is priced within a few cents of -110, so the sort runs on the
de-vigged probability and breaks ties on the line. One rule, and the biggest
receiving number lands on top of the receiving tab. The other two orders are
`edge` (biggest model edge first) and `A-Z`.

### Compare books

`Compare books` pivots once more: **one row per book, one column per market**, with
a market-consensus row on top to read against. The per-side chip strip it replaces
needed 18 rows of 8 chips to say the same thing — 3,300 px against 797.

A cell is the line followed by both sides' prices, which is complete rather than
abbreviated: the home spread is always the away spread negated and the under shares
the over's number, so printing both lines would be printing the same number twice.
The column header carries which two sides the prices belong to (`RUTG / BC`,
`O / U`). Green marks the best price on that side among the books hanging the line
most of them hang — the same modal-line rule the sort uses, for the same reason.

**DraftKings is pinned under the market row and tinted**, and is the only row that
carries a delta, because a delta on every row is a table nobody reads. The delta is
in probability points against the consensus, positive meaning you are paying less
for the same outcome: DK at -108 against a market -115 reads `+1.6`. Cents would be
the more familiar unit but it is only well defined while both prices sit on the same
side of even money, and -105 against +102 is exactly the case where you want the
comparison to still work. A book hanging a *different number* is reported as a line
difference and no price delta is claimed, because prices are only comparable at the
same line.

The primary book is one string — `PRIMARY` at the top of the book-comparison block
in `odds-view.js`. Changing it moves the pin, the tint and the delta together. Its
badge is also outlined in the prop tabs' chip strips.

The prop tabs keep the long per-market list under `Compare books`: a compact cell
cannot also hold eight books, and comparing books is inherently the long view.

### Four things about the prices that are not obvious

**Every consensus number on the board is recomputed from the per-book quotes.
SGO's own consensus fields are not dependable.** 1,425 of its 4,553 NCAAF
consensus prices — **31%** — fall outside the range of every book they claim to
summarise, which cannot be a summary of anything. Florida A&M at Miami is priced
by exactly two books, +8000 and +5000, and SGO's consensus for that side was
**+1232**: a 57.5-point underdog quoted at a 7.5% win probability. The worst case
in the snapshot is a consensus of −101 on a market both books hang at +4000. After
the rebuild, **zero** game-market prices sit outside their own books and **zero**
show a line no book hangs.

The rebuild takes the modal line and then the median price among the books hanging
*that* line — filtering to the line matters, because averaging a −3 and a −3.5
price produces a number for a bet nobody offers.

**The line vote prefers the books that agree with SGO, and only overrules it when
none of them do.** SGO flags a book row `is_alt_line` when its line differs from
the consensus, which splits the books for free. It has to work in both directions.
Florida A&M's 1st-half total: SGO says 32.5, the three books that price it say
36.5, 36.5 and 35.5 — every row is flagged, nobody offers 32.5, so the fallback
fires and 36.5 wins. Florida A&M's team total: one book at 2.5 agreeing with the
consensus and one at 0.5 flagged — a plain modal vote breaks that tie toward the
lower number and swings a team total from 2.5 to 0.5 on a coin flip, so the
unflagged book wins and it stays 2.5.

Where a market has no per-book rows at all — 2,557 cells, mostly thin prop markets
— SGO's number is kept and the cell is flagged, and the panel footer says how many
on that game could not be checked.

**Opening numbers are rebuilt the same way, not taken from SGO's event-level
`open*` fields.** Those are wrong on the moneyline. Rutgers at Boston College
carries an event-level open of −300 on one side and −233 on the other — both sides
favourites, which cannot happen — while all eight books report opens between +132
and +150 against a current +140. 583 opening numbers in the current snapshot differ
from the event-level value.

**Prices are averaged in probability space, never arithmetically — and that median
must not be rounded.** American odds are discontinuous at even money: +100 and −103
are almost the same price and 203 apart as numbers. Two books opened one receptions
market at exactly those two, and the arithmetic mean printed as an opening price of
**−2**. Converting to probability first fixes that, but the probability median then
has to be carried at full precision: two books at +8000 and +5000 have a median
implied probability of 0.01598, and rounding that to 0.02 converts back to +4900 —
a price neither book offers and 1,250 points short of the shorter of the two.

**The best-price flag compares like for like.** Books do post different numbers on
the same prop — one book had a receiving-yards over at 20.5 and another at 49.5 —
so "best" means the best price *among the books hanging the line most books hang*.
A quote at a number nobody else offers is a different bet, not a better one, and it
carries no flag. This also sidesteps direction: higher is better on a spread and
lower is better on an over, and picking the highest line would have called that 49.5
the best receiving-yards over on the board.

## Model numbers on the board

`model-data.js` carries `prop_projections.py`'s output: the team environment for
each side (plays, pass and rush attempts, projected offensive TDs, pass rate,
seconds per play, opponent multipliers) and every player prop projection, joined to
the market by **statID**, not by SGO's bucket. The bucket is too coarse —
`PASS_OTHER` holds passing attempts, completions *and* a yes/no interception market,
and a 31-attempt projection hung off a yes/no price would be a wrong number rendered
with full confidence.

Each cell carries the projection under the price: the projected mean (or the TD
probability), the model's fair price, and the edge — the model's probability minus
the market's, in percentage points — tinted green or red. A greyed projection is one
the model itself calls `NOT_BETTABLE`; a `~` means the number was read off a normal
tail outside the projected ladder or against a one-sided price. Both markers are
explained in the footer of the tab they appear on. The market probability comes from de-vigging the two rebuilt book
prices; where only one side is priced there is no pair to de-vig, so SGO's fair
price is used if its line matches the line the book is pricing; failing that, a
single vigged price, flagged on the row. SGO's fair is the fallback rather than the
first choice because it is derived from the same consensus that is wrong 31% of the
time. It has a second failure of its own: **494 of 2,695 priced sides carry a fair
price of exactly +100 against a different fair line — a placeholder, not a quote,
and it is ignored.**

**Every projected row is `bet_eligible=FALSE` and the board says so on every prop
tab.** `c_prop` is `NOT_YET_POPULATED`: no prop has been graded, so the
two-condition rule cannot be evaluated. These are projections, not recommendations.
753 of the 2,127 priced prop markets carry one; the projection population is
FBS-vs-FBS games that had a market spread when it was fitted, which is 49 games, and
kickers and most FCS players sit outside it.

## Week 2 (added 2026-09-10)

The board now carries two weeks. 257 positions: Week 1's 149 plus 108 from Week 2
(BBOC Sixth Gear 9 Sep, `W02-009` to `W02-018`; Cover 3 LOCKS 10 Sep, `W02-019` to
`W02-078`; Barstool Pick Em 9 Sep cards and mortals, `W02-079` to `W02-117`). `W02-001` to `W02-008`, the Cover 3 Tuesday leans, are reserved and not yet
ingested. Week 2 is ungraded: no Week 2 game has kicked off.

- `G` in `board-bundle.js` holds both weeks. Both board pages now place each grid game in
  its own week (`gridWeek()`: the schedule's week, or the week nearest the day block's
  date when the matchup does not resolve). Before this, any grid game outside
  `board_week` leaked onto that week's slate, so a two-week grid could not work.
- `game_conditions.csv` carries the 34 Week 2 games with a position, so they show weather.
- The episode filters in the show menu still name Week 1 episodes only. The show-level
  filters (Cover 3, BBOC) cover Week 2.
- Lock Infinity (Iowa -13.5: `W02-019`, `W02-042`, `W02-056`, `W02-062`) is one exposure,
  not four. Consensus is priced.
- Model chips on Week 2 picks are the board's model versus the cited number. They are not
  a bet signal: the model's own noise is 7.35 points.

## Weekly refresh
1. Run the CFBD pull, then the grader (menu 4 or 6).
2. Extract the week's transcripts and append the new day blocks to `G` in `board-bundle.js`.
3. Menu **15** — recalibrate the model against the new lines.
4. Run the SGO pull and its transform (`Odds Scraper\run_odds_pull.bat`, options 4
   then 7), then menu **16** — rebuild `odds-data.js` and `model-data.js`. Read the
   join report: anything under `[UNPRICED]` renders with no market chip.
5. Menu **14** — rebuild the data files, the bundle and the manifest.
6. Upload every file listed in `MANIFEST.txt` to the repo root.
7. Regenerate `ref-data.js` when the PFF power ratings change. It is generated, not
   hand-edited; the generator resolves rating shorthand (`S CAROLINA`, `NWESTERN`, `JAMES MAD`)
   to canonical CFBD school names via a checked alias table.

A pick's team resolves against the two teams in its own game, so house shorthand (`BAMA`,
`SCAR`, `TUL`) needs no alias list.
