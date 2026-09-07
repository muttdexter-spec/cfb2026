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

## Weekly refresh
1. Run the CFBD pull, then the grader (menu 4 or 6).
2. Extract the week's transcripts and append the new day blocks to `G` in `board-bundle.js`.
3. Menu **15** — recalibrate the model against the new lines.
4. Menu **14** — rebuild the data files, the bundle and the manifest.
5. Upload every file listed in `MANIFEST.txt` to the repo root.
6. Regenerate `ref-data.js` when the PFF power ratings change. It is generated, not
   hand-edited; the generator resolves rating shorthand (`S CAROLINA`, `NWESTERN`, `JAMES MAD`)
   to canonical CFBD school names via a checked alias table.

A pick's team resolves against the two teams in its own game, so house shorthand (`BAMA`,
`SCAR`, `TUL`) needs no alias list.
