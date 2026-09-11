/*
 * odds-view.js - the sportsbook + model view layer, shared by both board pages.
 *
 * window.ODDS  (odds-data.js)  consensus and per-book prices, keyed cfbd_game_id
 * window.MODEL (model-data.js) team environment and player prop projections
 *
 * Everything here is a pure function of those two globals plus a game id. It
 * returns plain view-model objects - text, numbers, tone strings - and never any
 * styling, because the desktop and mobile pages size and colour their own chrome.
 * Both pages call the same functions, so a change to how a price is de-vigged or
 * an edge is computed happens once.
 *
 * Two things are deliberate and worth not undoing:
 *
 * 1. `fair` and `book` are different numbers. SGO's book price is the consensus of
 *    what the books actually post, vig included. Its fair price is de-vigged. The
 *    board shows the book price - that is what you can bet - and uses the fair
 *    price only to compute an edge, because comparing a model probability against
 *    a vigged price would credit the model with the hold.
 *
 * 2. Every projection carries bet_eligible=FALSE today. `edge` is returned, but so
 *    is `eligible`, and the pages render the blocked state rather than hiding it.
 *    A projection shown next to a price reads as a recommendation unless it says
 *    otherwise in the same glance.
 */
(function () {
  'use strict';

  var OV = {};

  // ---- number formatting -------------------------------------------------
  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  function sgn(n, dp) {
    if (!isNum(n)) return '';
    var s = Math.abs(n).toFixed(dp === undefined ? 1 : dp).replace(/\.0$/, '');
    return (n > 0 ? '+' : n < 0 ? '−' : '') + s;
  }
  function plain(n) {
    if (!isNum(n)) return '';
    return String(Math.round(n * 100) / 100);
  }
  // American prices keep the ASCII hyphen: they are copied out and pasted into
  // bet slips, and a minus sign is not a hyphen.
  function price(p) {
    if (!isNum(p)) return '';
    return (p > 0 ? '+' : '') + String(Math.round(p));
  }
  OV.sgn = sgn; OV.plain = plain; OV.price = price; OV.isNum = isNum;

  // ---- probability -------------------------------------------------------
  function impl(p) {
    if (!isNum(p) || p === 0) return null;
    return p > 0 ? 100 / (p + 100) : Math.abs(p) / (Math.abs(p) + 100);
  }
  function toAmerican(q) {
    if (!isNum(q) || q <= 0 || q >= 1) return null;
    return q >= 0.5 ? -Math.round(100 * q / (1 - q)) : Math.round(100 * (1 - q) / q);
  }
  // Two-way de-vig by proportional (multiplicative) normalisation. With only one
  // side priced there is nothing to normalise against, so the raw implied
  // probability is returned and `vigged` says so.
  function deVig(a, b) {
    var ia = impl(a), ib = impl(b);
    if (ia === null) return null;
    if (ib === null) return { p: ia, vigged: true, hold: null };
    var s = ia + ib;
    return { p: ia / s, vigged: false, hold: s - 1 };
  }
  OV.impl = impl; OV.toAmerican = toAmerican; OV.deVig = deVig;

  // standard normal CDF (Abramowitz & Stegun 26.2.17)
  function normCdf(z) {
    var t = 1 / (1 + 0.2316419 * Math.abs(z));
    var d = 0.3989422804014327 * Math.exp(-z * z / 2);
    var p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 +
            t * (-1.821255978 + t * 1.330274429))));
    return z > 0 ? 1 - p : p;
  }
  OV.normCdf = normCdf;

  /*
   * P(stat > line) from a projection.
   *
   * The projection ships a ladder of (line, p_over) pairs it computed directly.
   * Inside the ladder those are the model's own numbers and are used as-is, with
   * linear interpolation between rungs. Outside it, fall back to a normal on
   * (mu, sd) and mark the result extrapolated - the ladder is built around the
   * market's expected range, and a line well outside it is exactly where a normal
   * tail is least trustworthy.
   */
  function pOver(m, line) {
    if (!m || !isNum(line)) return null;
    var ln = m.ln || [];
    for (var i = 0; i < ln.length; i++) {
      if (Math.abs(ln[i][0] - line) < 1e-9) return { p: ln[i][1], src: 'ladder' };
    }
    for (var j = 0; j < ln.length - 1; j++) {
      var a = ln[j], b = ln[j + 1];
      if (line > a[0] && line < b[0]) {
        var w = (line - a[0]) / (b[0] - a[0]);
        return { p: a[1] + w * (b[1] - a[1]), src: 'interp' };
      }
    }
    if (!isNum(m.mu) || !isNum(m.sd) || m.sd <= 0) return null;
    return { p: 1 - normCdf((line - m.mu) / m.sd), src: 'normal' };
  }
  OV.pOver = pOver;

  // ---- globals -----------------------------------------------------------
  function O() { return window.ODDS || null; }
  function M() { return window.MODEL || null; }
  OV.ready = function () { return !!(window.ODDS && window.ODDS.G); };
  OV.meta = function () {
    var o = O();
    return o ? { asOf: o.as_of, snapshot: o.snapshot, week: o.week, join: o.join } : null;
  };
  OV.week = function () { var o = O(); return o ? o.week : null; };

  var BOOKS = null;
  OV.books = function () {
    if (BOOKS) return BOOKS;
    var o = O();
    BOOKS = ((o && o.books) || []).map(function (b) {
      return { id: b[0], label: b[1], mono: b[2], bg: b[3], fg: b[4] };
    });
    return BOOKS;
  };
  OV.book = function (id) {
    var all = OV.books();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return { id: id, label: id, mono: (id || '?').slice(0, 3).toUpperCase(), bg: '#6b7280', fg: '#ffffff' };
  };

  // cells the builder could not cross-check against a book: SGO's own consensus,
  // kept because an unverifiable number beats none, but not silently
  OV.unchecked = function (gid) {
    var g = OV.game(gid), n = 0;
    if (!g) return 0;
    Object.keys(g.M).forEach(function (b) {
      Object.keys(g.M[b]).forEach(function (s) { if (g.M[b][s].x) n++; });
    });
    return n;
  };

  OV.game = function (gid) {
    var o = O();
    return (o && o.G && o.G[String(gid)]) || null;
  };
  OV.has = function (gid) { return !!OV.game(gid); };

  // ---- game markets ------------------------------------------------------
  // side -> the label the board shows, given the two team abbreviations
  function sideLabel(bucket, side, ha) {
    if (bucket === 'TOTAL' || bucket === 'TOTAL_1H') return side === 'over' ? 'Over' : 'Under';
    if (bucket === 'TEAM_TOTAL' || bucket === 'TEAM_TOTAL_1H') {
      var bits = String(side).split('_');
      return (bits[0] === 'home' ? ha.h : bits[0] === 'away' ? ha.a : '?') +
             ' ' + (bits[1] === 'over' ? 'over' : 'under');
    }
    return side === 'home' ? ha.h : side === 'away' ? ha.a : side;
  }
  var BUCKET_LABEL = {
    SPREAD: 'Spread', TOTAL: 'Total', ML: 'Moneyline', TEAM_TOTAL: 'Team total',
    SPREAD_1H: '1H spread', TOTAL_1H: '1H total', TEAM_TOTAL_1H: '1H team total'
  };
  OV.bucketLabel = function (b) { return BUCKET_LABEL[b] || b; };

  // a market with no line (moneyline) prints its price where the line goes
  function lineText(bucket, cell) {
    if (bucket === 'ML') return '';
    if (!isNum(cell.l)) return '';
    return (bucket === 'SPREAD' || bucket === 'SPREAD_1H') ? sgn(cell.l) : plain(cell.l);
  }

  /*
   * Rows for the Game tab. One row per (market, side), each carrying the current
   * consensus price, the opening price, and the move between them.
   *
   * `ha` is {h, a} - whatever short names the caller wants on the two sides.
   */
  OV.gameMarkets = function (gid, ha) {
    var g = OV.game(gid);
    if (!g) return [];
    var o = O(), order = (o && o.gameBuckets) || Object.keys(g.M);
    var out = [];
    order.forEach(function (bucket) {
      var slot = g.M[bucket];
      if (!slot) return;
      Object.keys(slot).sort().forEach(function (side) {
        var c = slot[side];
        var move = null;
        if (bucket === 'ML') {
          if (isNum(c.p) && isNum(c.op)) move = c.p - c.op;
        } else if (isNum(c.l) && isNum(c.ol)) {
          move = c.l - c.ol;
        }
        out.push({
          bucket: bucket, label: BUCKET_LABEL[bucket] || bucket,
          side: side, sideLabel: sideLabel(bucket, side, ha),
          line: lineText(bucket, c), price: price(c.p),
          openLine: bucket === 'ML' ? '' : (isNum(c.ol) ? ((bucket === 'SPREAD' || bucket === 'SPREAD_1H') ? sgn(c.ol) : plain(c.ol)) : ''),
          openPrice: price(c.op),
          hasOpen: isNum(c.ol) || isNum(c.op),
          move: move, moveText: move ? (bucket === 'ML' ? sgn(move, 0) : sgn(move)) : '',
          fair: price(c.fp), fairLine: isNum(c.fl) ? plain(c.fl) : '',
          raw: c
        });
      });
    });
    return out;
  };

  /*
   * The same markets, but one row per book. Books with nothing on that market are
   * dropped rather than shown empty - SGO's per-book coverage is genuinely patchy
   * (2 of 39 rush-attempt markets carry any book breakdown at all) and an empty
   * cell reads as a missing feature rather than a missing price.
   */
  OV.bookRows = function (gid, bucket, ha) {
    var g = OV.game(gid);
    if (!g) return [];
    var sides = g.M[bucket] ? Object.keys(g.M[bucket]).sort() : [];
    var out = [];
    OV.books().forEach(function (bk) {
      var slot = g.B[bk.id] && g.B[bk.id][bucket];
      if (!slot) return;
      var cells = sides.map(function (side) {
        var v = slot[side];
        return {
          side: side, sideLabel: sideLabel(bucket, side, ha),
          line: v && isNum(v[0]) ? ((bucket === 'SPREAD' || bucket === 'SPREAD_1H') ? sgn(v[0]) : plain(v[0])) : '',
          price: v ? price(v[1]) : '',
          has: !!v
        };
      });
      if (!cells.some(function (c) { return c.has; })) return;
      out.push({ book: bk, cells: cells, best: false });
    });
    markBest(out);
    return out;
  };

  /*
   * Flag the best price on each side.
   *
   * "Best" is the highest American price among the books hanging the line that
   * most books hang. Two things this deliberately does not do:
   *
   * - It does not compare across different numbers. Books do post different
   *   numbers on the same prop - one book had a receiving-yards over at 20.5 and
   *   another at 49.5 - and a price at a number nobody else offers is a different
   *   bet, not a better one. Those rows show their own line and carry no flag.
   * - It does not assume higher is better. On a spread a higher number favours
   *   the side holding it, but on an over a LOWER number does, and picking the
   *   highest would have recommended the 49.5 as the best receiving-yards over on
   *   the board. The modal line sidesteps the direction question entirely.
   */
  function modeOf(vals) {  // also used by the book comparison above
    var best = null, count = -1;
    vals.slice().sort(function (a, b) { return a - b; }).forEach(function (v) {
      var c = 0;
      vals.forEach(function (x) { if (x === v) c++; });
      if (c > count) { best = v; count = c; }
    });
    return best;
  }
  function markBest(rows) {
    if (!rows.length) return;
    var n = rows[0].cells.length;
    var parse = function (t) { return parseFloat(String(t).replace('−', '-')); };
    for (var i = 0; i < n; i++) {
      var lines = [];
      rows.forEach(function (r) {
        var c = r.cells[i];
        if (!c.has) return;
        var l = parse(c.line);
        if (isFinite(l)) lines.push(l);
      });
      var target = lines.length ? modeOf(lines) : null;
      var bestPrice = null, bestIdx = -1;
      rows.forEach(function (r, ri) {
        var c = r.cells[i];
        if (!c.has) return;
        var l = parse(c.line);
        if (target !== null && isFinite(l) && l !== target) return;
        var p = parse(c.price);
        if (!isFinite(p)) return;
        if (bestPrice === null || p > bestPrice) { bestPrice = p; bestIdx = ri; }
      });
      // a lone quote is not a shopped price
      if (bestIdx >= 0 && rows.length > 1) rows[bestIdx].cells[i].best = true;
    }
  }

  // ---- the collapsed row chip -------------------------------------------
  /*
   * What the game row shows without being expanded: the current number and the
   * opening number beside it. Returns null when the game has no SGO event, so the
   * caller can fall back to the CFBD chip it already had.
   */
  OV.rowChip = function (gid, ha) {
    var g = OV.game(gid);
    if (!g) return null;
    var sp = g.M.SPREAD, to = g.M.TOTAL, ml = g.M.ML;
    var cur = [], open = [], moved = false;

    if (sp && (sp.home || sp.away)) {
      var fav = (sp.home && isNum(sp.home.l) && sp.home.l <= 0) ? 'home' : 'away';
      var c = sp[fav] || sp.home || sp.away;
      if (c && isNum(c.l)) {
        cur.push((fav === 'home' ? ha.h : ha.a) + ' ' + sgn(c.l));
        if (isNum(c.ol)) {
          open.push((fav === 'home' ? ha.h : ha.a) + ' ' + sgn(c.ol));
          if (c.ol !== c.l) moved = true;
        }
      }
    }
    if (to && to.over && isNum(to.over.l)) {
      cur.push('o' + plain(to.over.l));
      if (isNum(to.over.ol)) {
        open.push('o' + plain(to.over.ol));
        if (to.over.ol !== to.over.l) moved = true;
      }
    }
    if (!cur.length && ml && ml.home && isNum(ml.home.p)) {
      cur.push(ha.h + ' ' + price(ml.home.p));
      if (isNum(ml.home.op)) open.push(ha.h + ' ' + price(ml.home.op));
    }
    if (!cur.length) return null;
    return {
      text: cur.join('  ·  '),
      open: open.length ? open.join('  ·  ') : null,
      moved: moved,
      books: g.nb || 0
    };
  };

  // ---- player props ------------------------------------------------------
  var PROP_LABEL = {
    passing_yards: 'Pass yds', passing_touchdowns: 'Pass TD',
    passing_attempts: 'Pass att', passing_completions: 'Completions',
    passing_interceptions: 'INT thrown', passing_longestCompletion: 'Longest comp',
    rushing_yards: 'Rush yds', rushing_attempts: 'Rush att',
    rushing_touchdowns: 'Rush TD', rushing_longestRush: 'Longest rush',
    receiving_yards: 'Rec yds', receiving_receptions: 'Receptions',
    receiving_touchdowns: 'Rec TD', receiving_longestReception: 'Longest rec',
    touchdowns: 'Anytime TD', firstTouchdown: 'First TD', lastTouchdown: 'Last TD',
    'passing+rushing_yards': 'Pass + rush yds', 'rushing+receiving_yards': 'Rush + rec yds'
  };
  /*
   * Touchdown markets arrive twice - once as a yes/no and once as an over/under
   * at 0.5 - and the over/under form also carries the 2+ ladder on the same
   * statID. Putting the threshold in the label makes each one a distinct column
   * that says what it is, so the cell never has to print a line: "2+ TD" already
   * means 1.5, and "yes/no" in a Line column is not information.
   */
  var TD_STAT = {
    touchdowns: 'TD', passing_touchdowns: 'pass TD',
    receiving_touchdowns: 'rec TD', rushing_touchdowns: 'rush TD',
    firstTouchdown: null, lastTouchdown: null
  };
  OV.propLabel = function (p) {
    var base = PROP_LABEL[p.st] || p.st;
    var noun = TD_STAT[p.st];
    if (noun && p.bt === 'ou' && isNum(p.l) && p.l > 0.5) {
      return Math.ceil(p.l) + '+ ' + noun;
    }
    return base;
  };
  // A market with no line worth printing: every yes/no, and every touchdown
  // market, because "2+ rec TD" already says the line is 1.5.
  function priceOnly(stat, betType) {
    return betType === 'yn' || TD_STAT.hasOwnProperty(stat);
  }
  // Two rows describe the same bet when they land on the same threshold, whether
  // one is written as a yes/no and the other as an over/under at 0.5. This is a
  // different question from whether the cell prints a line, so it has its own key.
  function betKey(r) {
    if (r.betType === 'yn') return 'YN';
    if (TD_STAT.hasOwnProperty(r.stat) && r.lineNum === 0.5) return 'YN';
    return String(r.lineNum);
  }

  OV.families = function () {
    var o = O();
    return ((o && o.families) || []).map(function (f) { return { id: f[0], label: f[1] }; });
  };
  OV.familyCounts = function (gid) {
    var g = OV.game(gid), out = {};
    if (!g) return out;
    Object.keys(g.P || {}).forEach(function (k) { out[k] = g.P[k].length; });
    return out;
  };

  /*
   * Rows for a prop tab.
   *
   * Each row is one market: the player, what is being priced, the line, both
   * sides' current prices, the opening prices, and - where the projection reaches
   * this player and this statID - the model's number and the edge against the
   * de-vigged price.
   */
  OV.props = function (gid, fam, opts) {
    var g = OV.game(gid);
    if (!g || !g.P || !g.P[fam]) return [];
    opts = opts || {};
    var rows = g.P[fam].map(function (p) {
      var yn = p.bt === 'yn';
      var overKey = yn ? 'yes' : 'over', underKey = yn ? 'no' : 'under';
      var a = p.sides[overKey] || null, b = p.sides[underKey] || null;

      /*
       * The probability the edge is measured against.
       *
       * SGO ships a de-vigged fair price per side and it is populated even where
       * one side has no book quote, so it is the first choice. De-vigging the two
       * book prices is the fallback. Taking a single vigged book price as a
       * probability is the last resort and is flagged, because on a long-shot
       * anytime-TD market the hold is most of the number: a lone +377 implies 21%
       * where the fair price implies about 17%, and an edge computed off the
       * former reads four points worse than it is.
       */
      /*
       * SGO's fair price is derived from its own consensus, and that consensus is
       * not dependable: 31% of its prices fell outside the range of every book
       * they claimed to summarise, so the board rebuilds them from the per-book
       * quotes in make_odds_data.py. De-vigging those rebuilt prices ourselves is
       * therefore the first choice, and SGO's fair is only the fallback for a
       * market with one side priced, where there is no pair to de-vig.
       *
       * The fair price also has a second failure: it sometimes refers to a
       * different number than the book is pricing. Antwan Raymond's 2+ TD carries
       * a book line of 1.5 and a fair line of 0.5 at exactly +100 - a placeholder,
       * not a quote, and 494 of 2,695 priced sides carry that +100. It is only
       * trusted when its line is the line the book is pricing.
       */
      var fairUsable = function (c) {
        if (!c || !isNum(c.fp)) return false;
        if (!isNum(c.l) && !isNum(c.fl)) return true;   // yes/no market, no line
        return isNum(c.fl) && isNum(c.l) && c.fl === c.l;
      };
      var dv, probBasis;
      if (a && isNum(a.p) && b && isNum(b.p)) {
        dv = deVig(a.p, b.p);
        probBasis = 'devig';
      } else if (fairUsable(a)) {
        var fa = impl(a.fp), fb = fairUsable(b) ? impl(b.fp) : null;
        dv = { p: fb === null ? fa : fa / (fa + fb), vigged: false, hold: null };
        probBasis = 'fair';
      } else {
        dv = deVig(a && a.p, b && b.p);
        probBasis = dv ? (dv.vigged ? 'vigged' : 'devig') : null;
      }

      var row = {
        player: p.n, id: p.id, bucket: p.b, stat: p.st, betType: p.bt,
        label: OV.propLabel(p),
        line: isNum(p.l) ? plain(p.l) : (yn ? 'yes/no' : ''),
        lineNum: isNum(p.l) ? p.l : null,
        overLabel: yn ? 'Yes' : 'Over', underLabel: yn ? 'No' : 'Under',
        over: a ? price(a.p) : '', under: b ? price(b.p) : '',
        openOver: a && isNum(a.op) ? price(a.op) : '',
        openUnder: b && isNum(b.op) ? price(b.op) : '',
        openLine: a && isNum(a.ol) ? plain(a.ol) : '',
        hasOpen: !!(a && (isNum(a.op) || isNum(a.ol))),
        lineMoved: !!(a && isNum(a.ol) && isNum(p.l) && a.ol !== p.l),
        marketProb: dv ? dv.p : null,
        probBasis: probBasis,
        hold: dv && isNum(dv.hold) ? dv.hold : null,
        priced: !!((a && isNum(a.p)) || (b && isNum(b.p))),
        bookCount: Object.keys(p.bk || {}).length,
        books: p.bk || {},
        model: null, edge: null, edgeText: '', modelText: '', tone: null,
        eligible: false, note: ''
      };

      var m = p.m;
      if (m) {
        row.pos = m.pos;
        row.modelMean = isNum(m.mu) ? plain(m.mu) : '';
        row.modelability = m.mod || '';
        row.extrapolated = !!m.xf;
        // the anytime-TD market has no line to read a ladder at: the projection's
        // own p(TD) is the answer, and 2+ has its own column on the same row
        var mp = null, src = '';
        if (p.st === 'touchdowns') {
          if (p.td2) { mp = isNum(m.p2) ? m.p2 : null; src = 'p2'; }
          else if (m.ln && m.ln.length) { mp = m.ln[0][1]; src = 'ladder'; }
          if (isNum(m.mu)) row.modelText = (100 * (mp === null ? 0 : mp)).toFixed(0) + '%';
        } else if (isNum(p.l)) {
          var po = pOver(m, p.l);
          if (po) { mp = po.p; src = po.src; }
          row.modelText = isNum(m.mu) ? plain(m.mu) : '';
        }
        if (mp !== null) {
          row.modelProb = mp;
          /*
           * A fair price is only meaningful inside a sane probability band. AJ
           * Surace is Rutgers' backup QB and the projection has him at 8.4 pass
           * attempts against a market line of 30.5; the normal tail six standard
           * deviations out returns a probability of about 4e-11, and converting
           * that to American odds printed +2827537705 in the column. The
           * disagreement is real and the edge still says so, but the price is not
           * a number anyone can act on and it is not shown.
           */
          var inBand = mp >= 0.01 && mp <= 0.99;
          var asPct = /%$/.test(row.modelText || '');
          row.modelPrice = inBand ? price(toAmerican(mp))
            : (asPct ? null : (mp < 0.01 ? '<1%' : '>99%'));
          row.probSource = src;
          if (row.marketProb !== null) {
            row.edge = mp - row.marketProb;
            row.edgeText = (row.edge >= 0 ? '+' : '−') +
                           Math.abs(100 * row.edge).toFixed(1) + ' pt';
            row.tone = row.edge >= 0.03 ? 'good' : row.edge <= -0.03 ? 'bad' : 'flat';
          }
        }
        row.model = m;
        row.note = m.mod === 'NOT_BETTABLE'
          ? 'model calls this market not bettable'
          : m.mod === 'WEAK' ? 'weak model node' : '';
        if (row.extrapolated) {
          row.note = (row.note ? row.note + ' · ' : '') + 'spread outside the fit range';
        }
        if (src === 'normal') {
          row.note = (row.note ? row.note + ' · ' : '') + 'line outside the projected ladder';
        }
        if (probBasis === 'vigged') {
          row.note = (row.note ? row.note + ' · ' : '') + 'edge against a one-sided price, vig included';
        }
      }
      return row;
    });

    // A market with no book quote on either side cannot be bet and renders as a
    // row of dashes. SGO carries a fair price for some of these; that is a
    // reference number, not an offer, and it does not belong on a betting board.
    rows = rows.filter(function (r) { return r.priced; });
    if (opts.modelOnly) rows = rows.filter(function (r) { return r.model; });
    if (opts.sort === 'edge') {
      rows.sort(function (x, y) {
        var a = x.edge === null ? -99 : x.edge, b = y.edge === null ? -99 : y.edge;
        return b - a;
      });
    } else if (opts.sort === 'odds') {
      rows.sort(oddsFirst);
    }
    return rows;
  };

  /*
   * Shortest price first - the likeliest thing at the top.
   *
   * Sorting the American number itself would work on a touchdown board by
   * accident, because American odds happen to be monotonic in probability, but
   * it breaks the moment a market has a line: every receiving over is priced
   * within a few cents of -110, so the order would be noise. Sort on the
   * de-vigged probability, then break the tie on the line, which puts the player
   * with the biggest number on top of a yardage tab and the likeliest scorer on
   * top of a touchdown tab under one rule.
   */
  function oddsFirst(x, y) {
    var a = probOf(x), b = probOf(y);
    if (a === null && b === null) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    if (Math.abs(b - a) > 0.005) return b - a;
    var al = lineOf(x), bl = lineOf(y);
    if (al === null && bl === null) return 0;
    if (al === null) return 1;
    if (bl === null) return -1;
    return bl - al;
  }
  function probOf(r) {
    var v = r.anchor ? r.anchor.prob : r.marketProb;
    return isNum(v) ? v : null;
  }
  function lineOf(r) {
    var v = r.anchor ? r.anchor.line : r.lineNum;
    return isNum(v) ? v : null;
  }

  // per-book prices for one prop row, same shape as bookRows
  OV.propBooks = function (row) {
    var out = [];
    var overKey = row.betType === 'yn' ? 'yes' : 'over';
    var underKey = row.betType === 'yn' ? 'no' : 'under';
    OV.books().forEach(function (bk) {
      var slot = row.books[bk.id];
      if (!slot) return;
      var a = slot[overKey], b = slot[underKey];
      if (!a && !b) return;
      out.push({
        book: bk,
        cells: [
          { side: overKey, sideLabel: row.overLabel, has: !!a,
            line: a && isNum(a[0]) ? plain(a[0]) : '', price: a ? price(a[1]) : '' },
          { side: underKey, sideLabel: row.underLabel, has: !!b,
            line: b && isNum(b[0]) ? plain(b[0]) : '', price: b ? price(b[1]) : '' }
        ]
      });
    });
    markBest(out);
    return out;
  };

  /* ------------------------------------------------------------------------
   * Compact grids.
   *
   * The long form is one row per market per side, which is how the data arrives
   * and the wrong way round for reading. A game ran to 14 rows to say six things,
   * and a touchdown tab ran to 18 rows for seven players with three dead columns.
   *
   * Both grids pivot: rows are the thing you are looking up (a team, a player)
   * and columns are the markets. That is 4 rows for a game and roughly 70% fewer
   * on the prop tabs, and it puts a player's whole card on one line.
   *
   * Opening numbers move inline, as a "was" line under the current price, and
   * only when something actually moved - most of them did not, and printing an
   * unchanged open on every row doubled the height to say nothing.
   * ---------------------------------------------------------------------- */

  // one cell of the game grid
  function gcell(r, prefix) {
    if (!r) return null;
    var main, cost, was = null;
    if (r.bucket === 'ML') {
      // the price IS the number on a moneyline
      main = r.price; cost = '';
      if (r.openPrice && r.openPrice !== r.price) was = r.openPrice;
    } else {
      main = (prefix ? prefix + ' ' : '') + r.line;
      cost = r.price;
      if (r.openLine && r.openLine !== r.line) {
        was = (prefix ? prefix + ' ' : '') + r.openLine + (r.openPrice ? '  ' + r.openPrice : '');
      } else if (r.openPrice && r.openPrice !== r.price) {
        was = r.openPrice;
      }
    }
    return { main: main, cost: cost, was: was };
  }

  // a team total is one line with two prices, so it fits in a single cell
  function ttCell(slot, side) {
    var o = slot[side + '_over'], u = slot[side + '_under'];
    if (!o && !u) return null;
    var line = (o && o.line) || (u && u.line) || '';
    var cost = [o && o.price ? 'o' + o.price : '', u && u.price ? 'u' + u.price : ''].filter(Boolean).join('  ');
    var ol = o && o.openLine;
    return { main: line, cost: cost, was: (ol && ol !== line) ? ol : null };
  }

  /*
   * Rows are the two teams, columns are the markets, in two sections: full game
   * and first half. `ha` needs `a`/`h` (short) and `aFull`/`hFull` for the row
   * label - the row has a column of its own now, so it can carry the real name.
   */
  OV.gameGrid = function (gid, ha) {
    var g = OV.game(gid);
    if (!g) return null;
    var by = {};
    OV.gameMarkets(gid, ha).forEach(function (r) {
      (by[r.bucket] = by[r.bucket] || {})[r.side] = r;
    });

    function section(label, sp, to, ml, tt) {
      var cols = [];
      if (by[sp]) cols.push({ key: 'sp', label: 'Spread' });
      if (by[to]) cols.push({ key: 'to', label: 'Total' });
      if (ml && by[ml]) cols.push({ key: 'ml', label: 'Moneyline' });
      if (by[tt]) cols.push({ key: 'tt', label: 'Team total' });
      if (!cols.length) return null;
      var rows = [];
      ['away', 'home'].forEach(function (side) {
        var cells = cols.map(function (c) {
          if (c.key === 'sp') return gcell(by[sp][side]);
          if (c.key === 'to') return gcell(by[to][side === 'away' ? 'over' : 'under'],
                                          side === 'away' ? 'O' : 'U');
          if (c.key === 'ml') return gcell(by[ml][side]);
          return ttCell(by[tt], side);
        });
        if (cells.some(Boolean)) {
          rows.push({
            label: side === 'away' ? (ha.aFull || ha.a) : (ha.hFull || ha.h),
            sub: null, side: side, cells: cells
          });
        }
      });
      return rows.length ? { label: label, cols: cols, rows: rows } : null;
    }

    var out = [
      section(null, 'SPREAD', 'TOTAL', 'ML', 'TEAM_TOTAL'),
      section('1st half', 'SPREAD_1H', 'TOTAL_1H', null, 'TEAM_TOTAL_1H')
    ].filter(Boolean);
    return out.length ? { kind: 'game', sections: out } : null;
  };

  /* ------------------------------------------------------------------------
   * Book comparison.
   *
   * The per-side chip strip needed 18 rows and 8 chips each to say what a game's
   * eight books are offering. This pivots it the same way the rest of the board
   * is pivoted: one row per book, one column per market, and the whole of a
   * book's card on a single line.
   *
   * A cell carries one line and two prices, which is complete: the home spread is
   * always the away spread negated and the under shares the over's number, so
   * printing both sides' lines would be printing the same number twice.
   * ---------------------------------------------------------------------- */

  // The book whose prices you actually bet. Pinned to the top of the comparison
  // and the only row that carries a delta against the market, because a delta on
  // every row is a table nobody reads. One string to change.
  var PRIMARY = 'draftkings';
  OV.primaryBook = function () { return PRIMARY; };

  function consQuote(g, bucket, side) {
    var c = g.M[bucket] && g.M[bucket][side];
    return c ? { l: c.l, p: c.p } : null;
  }
  function bookQuote(g, book, bucket, side) {
    var v = g.B[book] && g.B[book][bucket] && g.B[book][bucket][side];
    return v ? { l: v[0], p: v[1] } : null;
  }
  function pairCell(A, B, col) {
    if (!A && !B) return null;
    var line = A && isNum(A.l) ? A.l : (B && isNum(B.l) ? B.l : null);
    return {
      line: (col.noLine || !isNum(line)) ? '' : (col.signed ? sgn(line) : plain(line)),
      lineNum: isNum(line) ? line : null,
      pa: A && isNum(A.p) ? price(A.p) : '', pan: A && isNum(A.p) ? A.p : null,
      pb: B && isNum(B.p) ? price(B.p) : '', pbn: B && isNum(B.p) ? B.p : null,
      bestA: false, bestB: false
    };
  }

  /*
   * How the primary book compares with the market on one cell.
   *
   * Reported in probability points, positive meaning the book's implied
   * probability is lower - you are paying less for the same outcome. Cents would
   * be the more familiar unit but it is only well defined while both prices sit
   * on the same side of even money, and -105 against +102 is exactly the case
   * where you want the comparison to still work.
   *
   * A price is only comparable at the same number, so a different line is
   * reported as a line difference and no price delta is claimed.
   */
  function deltaVs(cons, book) {
    if (!cons || !book) return null;
    if (isNum(cons.lineNum) && isNum(book.lineNum) && cons.lineNum !== book.lineNum) {
      return { lineDiff: book.lineNum - cons.lineNum };
    }
    var da = (isNum(cons.pan) && isNum(book.pan)) ? impl(cons.pan) - impl(book.pan) : null;
    var db = (isNum(cons.pbn) && isNum(book.pbn)) ? impl(cons.pbn) - impl(book.pbn) : null;
    if (da === null && db === null) return null;
    return { a: da, b: db };
  }

  // best price per side, among the books hanging the line most of them hang
  function markBestPairs(rows, ci) {
    var quotes = [];
    rows.forEach(function (r, i) {
      var c = r.cells[ci];
      if (c && !r.isConsensus) quotes.push({ i: i, c: c });
    });
    if (quotes.length < 2) return;
    var lines = quotes.filter(function (q) { return isNum(q.c.lineNum); })
                      .map(function (q) { return q.c.lineNum; });
    var target = lines.length ? modeOf(lines) : null;
    ['pan', 'pbn'].forEach(function (key, n) {
      var best = null, at = -1;
      quotes.forEach(function (q) {
        if (target !== null && isNum(q.c.lineNum) && q.c.lineNum !== target) return;
        if (!isNum(q.c[key])) return;
        if (best === null || q.c[key] > best) { best = q.c[key]; at = q.i; }
      });
      if (at >= 0) rows[at].cells[ci][n ? 'bestB' : 'bestA'] = true;
    });
  }

  OV.bookGrid = function (gid, ha) {
    var g = OV.game(gid);
    if (!g) return null;

    function section(label, sp, to, ml, tt) {
      var cols = [];
      if (g.M[sp]) cols.push({ key: sp, a: 'away', b: 'home', signed: true,
                               label: BUCKET_LABEL[sp], pair: ha.a + ' / ' + ha.h });
      if (g.M[to]) cols.push({ key: to, a: 'over', b: 'under',
                               label: BUCKET_LABEL[to], pair: 'O / U' });
      if (ml && g.M[ml]) cols.push({ key: ml, a: 'away', b: 'home', noLine: true,
                                     label: BUCKET_LABEL[ml], pair: ha.a + ' / ' + ha.h });
      if (g.M[tt]) {
        cols.push({ key: tt, a: 'away_over', b: 'away_under',
                    label: ha.a + ' total', pair: 'O / U' });
        cols.push({ key: tt, a: 'home_over', b: 'home_under',
                    label: ha.h + ' total', pair: 'O / U' });
      }
      if (!cols.length) return null;

      var consRow = {
        label: 'Market', isConsensus: true, primary: false, book: null,
        cells: cols.map(function (c) {
          return pairCell(consQuote(g, c.key, c.a), consQuote(g, c.key, c.b), c);
        })
      };
      var rows = [consRow];
      OV.books().forEach(function (bk) {
        if (!g.B[bk.id]) return;
        var cells = cols.map(function (c) {
          return pairCell(bookQuote(g, bk.id, c.key, c.a), bookQuote(g, bk.id, c.key, c.b), c);
        });
        if (!cells.some(Boolean)) return;
        rows.push({ label: bk.label, book: bk, isConsensus: false,
                    primary: bk.id === PRIMARY, cells: cells });
      });
      if (rows.length < 2) return null;

      cols.forEach(function (c, ci) { markBestPairs(rows, ci); });
      // the delta only goes on the book you bet
      rows.forEach(function (r) {
        if (!r.primary) return;
        r.cells.forEach(function (c, ci) {
          if (c) c.delta = deltaVs(consRow.cells[ci], c);
        });
      });
      return { label: label, cols: cols, rows: rows };
    }

    var out = [
      section(null, 'SPREAD', 'TOTAL', 'ML', 'TEAM_TOTAL'),
      section('1st half', 'SPREAD_1H', 'TOTAL_1H', null, 'TEAM_TOTAL_1H')
    ].filter(Boolean);
    return out.length ? { kind: 'books', sections: out } : null;
  };

  // Column order per family. Anything not listed sorts after, in first-seen order.
  var PROP_COLS = {
    TD:    ['Anytime TD', '2+ TD', '3+ TD', 'First TD', 'Last TD'],
    PASS:  ['Pass yds', 'Pass TD', '2+ pass TD', '3+ pass TD', 'Pass att', 'Completions',
            'INT thrown', 'Longest comp'],
    RUSH:  ['Rush yds', 'Rush att', 'Rush TD', '2+ rush TD', 'Longest rush'],
    REC:   ['Rec yds', 'Receptions', 'Rec TD', '2+ rec TD', 'Longest rec'],
    COMBO: ['Pass + rush yds', 'Rush + rec yds']
  };
  function pcell(r) {
    var bare = priceOnly(r.stat, r.betType);
    var main, cost;
    if (bare) {
      main = r.over; cost = r.under || '';
    } else {
      main = r.line;
      cost = [r.over, r.under].filter(Boolean).join('  ');
    }
    var was = null;
    if (!bare && r.lineMoved && r.openLine) {
      was = r.openLine + (r.openOver ? '  ' + r.openOver : '');
    } else if (r.openOver && r.openOver !== r.over) {
      was = r.openOver;
    }
    return {
      main: main, cost: cost, was: was,
      model: r.modelText ? (r.modelText + (r.modelPrice ? '  ' + r.modelPrice : '')) : null,
      edge: r.edgeText || null, tone: r.tone,
      // the projection exists but the model says not to price off it
      soft: r.modelability === 'NOT_BETTABLE',
      // the number came from a tail or a one-sided price; marked, not hidden
      approx: /ladder|one-sided/.test(r.note || ''),
      _key: betKey(r), _books: r.bookCount || 0,
      // kept for sorting: the formatted strings above cannot be compared
      _prob: r.marketProb, _line: r.lineNum
    };
  }

  OV.propGrid = function (gid, fam, opts) {
    var rows = OV.props(gid, fam, {});
    if (!rows.length) return null;
    opts = opts || {};

    var pref = PROP_COLS[fam] || [], seen = [];
    rows.forEach(function (r) { if (seen.indexOf(r.label) < 0) seen.push(r.label); });
    var cols = seen.slice().sort(function (a, b) {
      var ia = pref.indexOf(a), ib = pref.indexOf(b);
      if (ia < 0) ia = 100 + seen.indexOf(a);
      if (ib < 0) ib = 100 + seen.indexOf(b);
      return ia - ib;
    }).map(function (l) { return { key: l, label: l }; });

    var order = [], byKey = {}, soft = 0, approx = 0, modelled = 0;
    rows.forEach(function (r) {
      var c = pcell(r), k = r.player, n = 0;

      // Walk to the first row of this player that does not already hold this
      // market. Two rows for the SAME bet - the yes/no and the over/under at 0.5
      // - are one market written twice, so the better-priced one wins and no new
      // row is made. Two rows at genuinely different numbers (one book hung a
      // receiving over at 20.5 and another at 49.5) are different bets and each
      // keeps its own row.
      while (byKey[k] && byKey[k].cells[r.label]) {
        var have = byKey[k].cells[r.label];
        if (have._key === c._key) {
          if (c._books > have._books) byKey[k].cells[r.label] = c;
          return;
        }
        n++; k = r.player + '\u2009#' + n;
      }
      if (!byKey[k]) {
        byKey[k] = { player: r.player, pos: r.pos || '', cells: {}, best: null };
        order.push(k);
      }
      byKey[k].cells[r.label] = c;
      if (c.soft) soft++;
      if (c.approx) approx++;
      if (r.model) modelled++;
      if (r.edge !== null && r.edge !== undefined &&
          (byKey[k].best === null || r.edge > byKey[k].best)) byKey[k].best = r.edge;
    });

    var out = order.map(function (k) {
      var pl = byKey[k];
      var cells = cols.map(function (c) { return pl.cells[c.key] || null; });
      // A pivoted row spans several markets, so an odds sort needs one of them to
      // sort on. The leftmost populated cell is the anchor: columns are ordered
      // by importance, so on a touchdown tab that is Anytime TD and on a
      // receiving tab it is Rec yds - the market you would rank the player by.
      var anchor = null;
      for (var i = 0; i < cells.length && !anchor; i++) {
        if (cells[i]) anchor = { prob: cells[i]._prob, line: cells[i]._line };
      }
      return { label: pl.player, sub: pl.pos, best: pl.best, anchor: anchor, cells: cells };
    });
    if (opts.sort === 'edge') {
      out.sort(function (a, b) {
        return (b.best === null ? -99 : b.best) - (a.best === null ? -99 : a.best);
      });
    } else if (opts.sort === 'odds') {
      out.sort(oddsFirst);
    }
    return {
      kind: 'prop', sections: [{ label: null, cols: cols, rows: out }],
      modelled: modelled, total: rows.length, soft: soft, approx: approx
    };
  };

  // ---- model layer -------------------------------------------------------
  /*
   * The team environment card: what the projection cascade expects each side to
   * do before any player is priced. Returns null when this game was not in the
   * projection population - it covers FBS-vs-FBS games with a market spread only,
   * which is 49 of the schedule's 86 in the week it was fitted for.
   */
  OV.env = function (gid, home, away) {
    var m = M();
    var e = m && m.env && m.env[String(gid)];
    if (!e) return null;
    var out = [];
    [[away, 'away'], [home, 'home']].forEach(function (pair) {
      var t = e[pair[0]];
      if (!t) return;
      out.push({
        team: pair[0], side: pair[1],
        spread: sgn(t.sp), total: plain(t.tot),
        rows: [
          { label: 'plays', value: plain(t.plays), sd: isNum(t.playsSd) ? '±' + plain(t.playsSd) : '' },
          { label: 'pass att', value: plain(t.pa), sd: isNum(t.paSd) ? '±' + plain(t.paSd) : '' },
          { label: 'rush att', value: plain(t.ra), sd: isNum(t.raSd) ? '±' + plain(t.raSd) : '' },
          { label: 'off TD', value: plain(t.td), sd: '' },
          { label: 'pass rate', value: isNum(t.passRate) ? (100 * t.passRate).toFixed(1) + '%' : '', sd: '' },
          { label: 'sec/play', value: plain(t.secPerPlay), sd: '' },
          { label: 'opp rush', value: isNum(t.oppRush) ? t.oppRush.toFixed(3) + '×' : '', sd: '' },
          { label: 'opp pass', value: isNum(t.oppPass) ? t.oppPass.toFixed(3) + '×' : '', sd: '' }
        ],
        tdSource: t.tdSrc
      });
    });
    return out.length ? out : null;
  };

  OV.modelNote = function () {
    var m = M();
    return (m && m.note) || '';
  };

  // Every projection is blocked from betting today. Surfaced as one line so both
  // pages say the same thing in the same words.
  OV.eligibilityNote = function () {
    return 'Projections only — bet_eligible is FALSE on every row (c_prop NOT_YET_POPULATED). ' +
           'No prop has been graded, so the two-condition rule cannot be evaluated.';
  };

  window.OV = OV;
})();
