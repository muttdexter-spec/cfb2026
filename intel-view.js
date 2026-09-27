/*
 * intel-view.js - the injury tracker and the prop card on the board (window.IV).
 *
 * window.INTEL (intel-data.js, built by Scraper/make_intel_data.py) carries, for one
 * week, keyed on cfbd_game_id:
 *   - injury designations for the players the injury pass tracks (tiers A and B:
 *     the card's games in full, every other propped game's starting QB only),
 *   - unit-level impact (moderate or major only) for tier A games,
 *   - the prop card: every play with its layer, status, best price, EV band, stake
 *     and "take at or better", as the card file wrote them,
 *   - the injury reads attached to card plays,
 *   - the structural flag (21+ point favourite rushing prop) from the prop screen.
 *
 * This file never computes a number. It formats what the build wrote and decides
 * what to show where. Like odds-view.js it is shared by both board pages, so the
 * desktop and the phone say the same thing in the same words; unlike odds-view.js it
 * returns style objects too, because the chips are identical on both pages.
 *
 * Coverage is partial by design and every surface says so: a game with nothing listed
 * has no chip, and "no chip" means "nothing the tracker follows was listed", never
 * "healthy".
 */
(function () {
  'use strict';

  var IV = {};
  var MONO = "'IBM Plex Mono',ui-monospace,monospace";
  var SANS = "'IBM Plex Sans',system-ui,sans-serif";
  var INK = 'oklch(0.23 0.02 258)', SEC = 'oklch(0.44 0.015 255)', MUT = 'oklch(0.505 0.014 255)';

  // designation -> tone. OUT and Doubtful read red, Questionable and game-time amber,
  // Probable grey: a probable player is expected to play and is shown so the reader
  // knows the tracker looked, not because it moves anything.
  var TONE = {
    OUT: 'out', OUT1H: 'out', D: 'out', GTD: 'q', Q: 'q', P: 'p'
  };
  var TONES = {
    out: { bg: 'oklch(0.945 0.05 25)', fg: 'oklch(0.42 0.18 25)', line: 'oklch(0.80 0.09 25)' },
    q:   { bg: 'oklch(0.955 0.06 78)', fg: 'oklch(0.44 0.12 62)', line: 'oklch(0.82 0.09 72)' },
    p:   { bg: 'oklch(0.945 0.006 250)', fg: SEC, line: 'oklch(0.86 0.008 250)' },
    card:{ bg: 'oklch(0.95 0.04 150)', fg: 'oklch(0.38 0.11 150)', line: 'oklch(0.78 0.08 150)' },
    flag:{ bg: 'oklch(0.95 0.03 300)', fg: 'oklch(0.40 0.12 300)', line: 'oklch(0.82 0.06 300)' },
    unit:{ bg: 'oklch(0.955 0.03 220)', fg: 'oklch(0.40 0.10 220)', line: 'oklch(0.82 0.05 220)' }
  };
  var DESIG = { OUT: 'OUT', OUT1H: 'OUT 1H', D: 'DOUBTFUL', GTD: 'GAME-TIME', Q: 'QUESTIONABLE', P: 'PROBABLE' };
  var SHORT = { OUT: 'OUT', OUT1H: 'OUT 1H', D: 'D', GTD: 'GTD', Q: 'Q', P: 'P' };
  var SEVERE = { OUT: 1, OUT1H: 1, D: 1 };

  function I() { return window.INTEL || null; }
  IV.ready = function () { var i = I(); return !!(i && i.games); };
  IV.week = function () { var i = I(); return i ? i.week : null; };
  IV.forWeek = function (w) { return IV.ready() && Number(IV.week()) === Number(w); };

  // same normaliser as the build's pkey(): alphanumerics, generational suffix dropped
  function pkey(name) {
    return String(name || '').replace(/_/g, ' ').replace(/\b(JR|SR|II|III|IV|V)\b\.?/gi, '')
      .toUpperCase().replace(/&/g, 'AND').replace(/[^A-Z0-9]/g, '');
  }
  IV.pkey = pkey;

  function chipSt(tone, strong) {
    var t = TONES[tone] || TONES.p;
    return {
      display: 'inline-flex', alignItems: 'center', gap: '5px', maxWidth: '100%',
      font: (strong ? 500 : 400) + ' 11px/1.35 ' + MONO, color: t.fg, background: t.bg,
      padding: '2px 7px', borderRadius: '4px', boxShadow: 'inset 0 0 0 1px ' + t.line,
      whiteSpace: 'normal', overflowWrap: 'anywhere'
    };
  }
  function tagSt(tone) {
    var t = TONES[tone] || TONES.p;
    return { font: '600 9px/1 ' + MONO, letterSpacing: '0.06em', textTransform: 'uppercase',
             color: t.fg, opacity: 0.85, flex: 'none' };
  }
  IV.chipSt = chipSt; IV.tagSt = tagSt;

  function when(x) {
    if (!x.day) return '';
    var d = new Date(x.day + 'T12:00:00Z');
    var lbl = isNaN(d) ? x.day : d.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
    return lbl + (x.clock ? ' ' + x.clock : '');
  }
  IV.when = when;

  function game(gid) {
    var i = I();
    return (i && i.games && i.games[String(gid)]) || null;
  }
  function play(id) {
    var i = I(), ps = (i && i.card && i.card.plays) || [];
    for (var n = 0; n < ps.length; n++) if (ps[n].id === id) return ps[n];
    return null;
  }
  IV.game = game;

  // "at Arkansas" / "vs Colorado" for a team in a scheduled game
  var _gi = null;
  function vsText(gid, team) {
    var R = window.REF;
    if (!R || !R.GAMES) return '';
    if (!_gi) { _gi = {}; R.GAMES.forEach(function (g) { _gi[String(g.id)] = g; }); }
    var g = _gi[String(gid)];
    if (!g) return '';
    if (String(team) === String(g.a)) return (g.nz ? 'vs ' : 'at ') + g.h;
    if (String(team) === String(g.h)) return 'vs ' + g.a;
    return g.a + (g.nz ? ' vs ' : ' at ') + g.h;
  }
  IV.vsText = vsText;

  // A card play that is still something to act on. SETTLED and CLOSED stay on the
  // week panel (the record) but do not decorate the game row.
  function live(p) { return !/^(SETTLED|CLOSED)/i.test(p.status || ''); }
  function playText(p) {
    return p.player + ' ' + (p.side === 'UNDER' ? 'u' : 'o') + p.line + ' ' + (p.mkt || '');
  }

  /*
   * The line under a game's pick chips: live card plays first, then designations
   * (worst first, QBs first within a designation), then unit clusters. Probable
   * players are left off the row and kept for the detail panel and the week table.
   */
  IV.gameItems = function (gid) {
    var g = game(gid);
    if (!g) return null;
    var items = [];
    (g.card || []).forEach(function (id) {
      var p = play(id);
      if (!p || !live(p)) return;
      items.push({ tag: 'card', text: playText(p) + (p.book ? ' · ' + String(p.book).split(' (')[0] : '') +
                   (p.stake ? ' · ' + String(p.stake).split(' ')[0] + '%' : ''),
                   st: chipSt('card', true), tagSt: tagSt('card') });
    });
    (g.inj || []).forEach(function (x) {
      if (x.s === 'P') return;
      items.push({ tag: SHORT[x.s] || x.s, text: x.t + ' ' + x.pos + ' ' + x.p,
                   st: chipSt(TONE[x.s], x.pos === 'QB'), tagSt: tagSt(TONE[x.s]) });
    });
    (g.imp || []).forEach(function (u) {
      items.push({ tag: u.sev === 'major' ? 'unit major' : 'unit', text: u.t + ' ' + u.u + (u.names ? ': ' + u.names : ''),
                   st: chipSt('unit', u.sev === 'major'), tagSt: tagSt('unit') });
    });
    return items.length ? items : null;
  };

  function dayNum(iso) { var t = Date.parse(String(iso || '') + 'T00:00:00Z'); return isNaN(t) ? null : t; }

  /*
   * Injury news set against when a pick was made. `episodeDay` is the episode's
   * YYYY-MM-DD. A designation posted the day after or later is news the picker could
   * not have had; one posted the same day may or may not have been out before the
   * recording; one posted earlier was available to them.
   */
  IV.newsFor = function (gid, episodeDay) {
    var g = game(gid);
    if (!g || !g.inj || !g.inj.length) return [];
    var ep = dayNum(episodeDay);
    return g.inj.map(function (x) {
      var d = dayNum(x.day), rel = 'unknown';
      if (ep !== null && d !== null) rel = d > ep ? 'after' : d === ep ? 'same' : 'before';
      return { x: x, rel: rel };
    });
  };
  // the chip marker: something serious (OUT, Doubtful, or any QB listing below
  // Probable) was posted after the episode
  IV.pickMarker = function (gid, episodeDay) {
    var n = IV.newsFor(gid, episodeDay).filter(function (r) {
      return r.rel === 'after' && (SEVERE[r.x.s] || (r.x.pos === 'QB' && r.x.s !== 'P'));
    }).length;
    return n ? { text: '⚕ ' + n, st: { font: '600 10px/1 ' + MONO, padding: '2px 4px', borderRadius: '3px',
      background: TONES.out.bg, color: TONES.out.fg } } : null;
  };

  // rows for the detail panel of an open pick
  IV.detailRows = function (gid, episodeDay) {
    var REL = { after: 'posted after this pick', same: 'posted the day of the episode', before: 'known before the pick', unknown: '' };
    return IV.newsFor(gid, episodeDay).map(function (r) {
      var x = r.x;
      return {
        tag: SHORT[x.s] || x.s, tagSt: tagSt(TONE[x.s]), st: chipSt(TONE[x.s], x.pos === 'QB'),
        text: x.t + ' ' + x.pos + ' ' + x.p + (x.inj ? ' (' + x.inj + ')' : ''),
        meta: [x.src, when(x), REL[r.rel], x.pf === 'STILL_IN' ? 'projection still counts him' : x.pf === 'PRICED' ? 'already out of the projection' : '']
          .filter(Boolean).join(' · '),
        rel: r.rel
      };
    });
  };

  /*
   * Badges on a prop grid row: the card play on this player in this tab's family,
   * the structural flag, and the player's own designation. `fam` is the tab
   * (PASS, RUSH, REC, TD, COMBO); a card play or flag shows only on the tab its
   * market belongs to, a designation on every tab.
   */
  var FAM = { PASS: /^passing/, RUSH: /^rushing/, REC: /^receiv|^receptions/, TD: /touchdown/i, COMBO: /\+/ };
  IV.propBadges = function (gid, player, fam) {
    var g = game(gid);
    if (!g) return null;
    var k = pkey(player), out = [];
    var has = function (st) { return !fam || !FAM[fam] || FAM[fam].test(st || ''); };
    (g.card || []).forEach(function (id) {
      var p = play(id);
      if (!p || p.k !== k || !has(p.st)) return;
      out.push({ text: (live(p) ? 'CARD ' : String(p.status || '').split('/')[0] + ' ') +
                 (p.side === 'UNDER' ? 'u' : 'o') + p.line + (p.stake && live(p) ? ' · ' + String(p.stake).split(' ')[0] + '%' : ''),
                 st: chipSt(live(p) ? 'card' : 'p', true) });
    });
    (g.flags || []).forEach(function (f) {
      if (f.k !== k || !has(f.st)) return;
      out.push({ text: '21+ fav ' + (f.mkt || 'rush'), st: chipSt('flag', false) });
    });
    (g.inj || []).forEach(function (x) {
      if (x.k !== k) return;
      out.push({ text: SHORT[x.s] || x.s, st: chipSt(TONE[x.s], true) });
    });
    return out.length ? out : null;
  };

  /*
   * Everything the week panel shows. Returns null when the data is for another week,
   * so switching the board to Week 3 does not show Week 4's card.
   */
  IV.weekPanel = function (week) {
    if (!IV.forWeek(week)) return null;
    var i = I(), inj = i.injury || {}, card = i.card || null;
    var plays = (card && card.plays) || [];
    var liveN = plays.filter(live).length;
    var rows = [], units = [];
    Object.keys(i.games).forEach(function (gid) {
      (i.games[gid].inj || []).forEach(function (x) { rows.push({ gid: gid, x: x }); });
      (i.games[gid].imp || []).forEach(function (x) { units.push({ gid: gid, x: x }); });
    });
    var order = { OUT: 0, OUT1H: 1, D: 2, GTD: 3, Q: 4, P: 5 };
    rows.sort(function (a, b) {
      return (order[a.x.s] - order[b.x.s]) || ((a.x.pos === 'QB' ? 0 : 1) - (b.x.pos === 'QB' ? 0 : 1)) ||
             String(a.x.t).localeCompare(String(b.x.t));
    });
    var snap = card && card.snapshot ? String(card.snapshot) : '';
    var m = /(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})/.exec(snap);
    var snapTxt = snap;
    if (m) {
      var t = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
      snapTxt = snap.split('_')[0] + ' · ' + t.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: '2-digit' }) + ' ET';
    }
    var reads = (i.reads || []).map(function (r) {
      return {
        id: r.id, text: r.player + ' ' + (r.side === 'UNDER' ? 'u' : 'o') + ' ' + (r.mkt || ''),
        counts: r.counts || '', conv: r.conv || '', status: r.status || '', cond: r.cond || '', basis: r.basis || ''
      };
    });
    // "2026-09-25 22:46" (already Eastern) -> "Fri 25 Sep 10:46 PM ET"
    var up = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})/.exec(inj.updated_et || '');
    var upTxt = '';
    if (up) {
      var ud = new Date(Date.UTC(+up[1], +up[2] - 1, +up[3], +up[4], +up[5]));
      upTxt = ud.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }) + ' ' +
              ud.toLocaleTimeString('en-US', { timeZone: 'UTC', hour: 'numeric', minute: '2-digit' }) + ' ET';
    }
    return {
      injMeta: {
        players: inj.players || 0, games: inj.games || 0, listed: inj.listed || 0,
        tierA: inj.tier_a || 0, tierB: inj.tier_b || 0, updated: inj.updated_et || '', updatedTxt: upTxt
      },
      injRows: rows.map(function (r) {
        var x = r.x;
        return {
          gid: r.gid, tag: SHORT[x.s] || x.s, tagSt: tagSt(TONE[x.s]), st: chipSt(TONE[x.s], x.pos === 'QB'),
          game: vsText(r.gid, x.t),
          team: x.t, player: x.p, pos: x.pos, tier: x.tier, desig: DESIG[x.s] || x.d || x.s,
          injury: x.inj || '', src: x.src || '', when: when(x),
          proj: x.pf === 'STILL_IN' ? 'still in projection' : x.pf === 'PRICED' ? 'out of projection' : x.pf === 'NOT_IN_PROJ' ? 'not projected' : '',
          note: x.note || ''
        };
      }).concat(units.map(function (u) {
        return {
          gid: u.gid, tag: u.x.sev === 'major' ? 'unit major' : 'unit', tagSt: tagSt('unit'), st: chipSt('unit', u.x.sev === 'major'),
          game: vsText(u.gid, u.x.t), team: u.x.t, player: u.x.u + ' cluster', pos: '', tier: 'A',
          desig: u.x.sev, injury: '', src: u.x.basis || '', when: '', proj: '', note: u.x.names || ''
        };
      })),
      card: card ? {
        file: card.file, snapshot: snapTxt, live: liveN, total: plays.length,
        plays: plays.map(function (p) {
          return {
            id: p.id, gid: p.gid, live: live(p), text: playText(p), team: p.team || '',
            layer: p.layer || '', status: p.status || '', book: p.book || '', take: p.take || '',
            ev: [p.ev_base, p.ev_cons].filter(Boolean).join(' / '), stake: p.stake || '',
            kick: p.kick || '', reason: p.reason || '', move: p.move || '', risk: p.risk || '',
            inj: p.inj && (p.inj.flag || (p.inj.s && p.inj.s !== 'NR' && p.inj.s !== 'ACTIVE'))
              ? [p.inj.s && p.inj.s !== 'NR' && p.inj.s !== 'ACTIVE' ? 'player listed ' + String(DESIG[p.inj.s] || p.inj.s).toLowerCase() : '', p.inj.note || ''].filter(Boolean).join(' \u00b7 ')
              : '',
            st: chipSt(live(p) ? 'card' : 'p', true)
          };
        })
      } : null,
      reads: reads
    };
  };

  window.IV = IV;
})();
