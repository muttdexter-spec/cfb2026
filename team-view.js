/*
 * team-view.js - team context on the pick board (window.TV).
 *
 * window.TEAMBRIEF (team-brief.js, built by Scraper/make_team_data.py) carries, for the
 * board's current week, a compact record per FBS team:
 *   - season form: record, conference record, ATS against CLOSE_PROXY, average cover
 *     margin, the last three results, and the PFF vintages as pointers (never an edge),
 *   - availability: the top rows of the attrition ledger (official conference reports,
 *     the weekly injury pass, what was said on air, and box-score absences marked [INF]),
 *     each with the player's production per game and share of his unit,
 *   - what Cover 3 and BBOC said about the team for this week's game, and in the three
 *     weeks before it,
 *   - the preseason Summer School falsifiers and confirmers (or the synthesis read when
 *     one has been written).
 * The full record for any team is on Team Context.html.
 *
 * The file is fetched shortly after the page paints, not with it, so the phone board's
 * first render does not wait for it. Until it lands no game shows a Context button,
 * and on any week other than the brief's own week none ever does.
 *
 * Like intel-view.js this file never computes a number. It formats what the build
 * wrote. Host claims are the qualitative layer and are labelled as said, not as fact.
 */
(function () {
  'use strict';

  var TV = {};
  var MONO = "'IBM Plex Mono',ui-monospace,monospace";
  var SANS = "'IBM Plex Sans',system-ui,sans-serif";
  var INK = 'oklch(0.23 0.02 258)', SEC = 'oklch(0.44 0.015 255)', MUT = 'oklch(0.505 0.014 255)';
  var LINE = 'oklch(0.895 0.006 250)';
  var TONES = {
    out:  { bg: 'oklch(0.945 0.05 25)',  fg: 'oklch(0.42 0.18 25)',  line: 'oklch(0.80 0.09 25)' },
    q:    { bg: 'oklch(0.955 0.06 78)',  fg: 'oklch(0.44 0.12 62)',  line: 'oklch(0.82 0.09 72)' },
    p:    { bg: 'oklch(0.945 0.006 250)', fg: SEC, line: 'oklch(0.86 0.008 250)' },
    inf:  { bg: 'oklch(0.97 0.004 250)', fg: MUT, line: 'oklch(0.88 0.008 250)' },
    back: { bg: 'oklch(0.95 0.04 150)',  fg: 'oklch(0.38 0.11 150)', line: 'oklch(0.78 0.08 150)' },
    pos:  { bg: 'oklch(0.95 0.04 150)',  fg: 'oklch(0.38 0.11 150)', line: 'oklch(0.78 0.08 150)' },
    neg:  { bg: 'oklch(0.945 0.05 25)',  fg: 'oklch(0.42 0.18 25)',  line: 'oklch(0.80 0.09 25)' },
    neu:  { bg: 'oklch(0.955 0.03 220)', fg: 'oklch(0.40 0.10 220)', line: 'oklch(0.82 0.05 220)' },
    pri:  { bg: 'oklch(0.95 0.03 300)',  fg: 'oklch(0.40 0.12 300)', line: 'oklch(0.82 0.06 300)' }
  };
  // availability tag -> tone
  var ATONE = { OUT: 'out', SZN: 'out', D: 'out', Q: 'q', GTD: 'q', P: 'p', BACK: 'back', INF: 'inf', SAID: 'q' };
  var TYPE_GROUP = {
    ATTRITION: 'avail', PERSONNEL: 'avail', MARKET: 'mkt',
    PERFORMANCE: 'play', SCHEME: 'play', COACHING: 'play', SITUATIONAL: 'play', OUTLOOK: 'play', RECRUITING: 'play', OTHER: 'play'
  };
  var GROUPS = [
    { id: 'avail', label: 'Availability and personnel, as said on air' },
    { id: 'mkt', label: 'Market and picks' },
    { id: 'play', label: 'Matchup, form, coaching, spot' }
  ];
  var GROUP_CAP = 8;

  function B() { return window.TEAMBRIEF || null; }

  // ---------------------------------------------------------------- loading
  var st = { started: false, failed: false, cbs: [] };
  function fire() {
    var cbs = st.cbs; st.cbs = [];
    cbs.forEach(function (f) { try { f(); } catch (e) { /* a page callback must not break the loader */ } });
  }
  TV.ensure = function (cb, now) {
    if (B()) return true;
    if (cb && st.cbs.indexOf(cb) < 0) st.cbs.push(cb);
    if (!st.started && typeof document !== 'undefined') {
      st.started = true;
      var go = function () {
        var s = document.createElement('script');
        s.src = './team-brief.js';
        s.async = true;
        s.onload = function () { st.failed = !B(); fire(); };
        s.onerror = function () { st.failed = true; fire(); };
        document.head.appendChild(s);
      };
      if (now) go(); else setTimeout(go, 700);
    }
    return false;
  };
  TV.ready = function () { return !!B(); };
  TV.failed = function () { return st.failed; };
  TV.week = function () { var b = B(); return b ? b.week : null; };
  TV.forWeek = function (w) { var b = B(); return !!(b && Number(b.week) === Number(w)); };

  function team(name) {
    var b = B();
    if (!b || !name) return null;
    if (b.teams[name]) return b.teams[name];
    var k = b.alias && b.alias[String(name).toLowerCase()];
    return k ? b.teams[k] || null : null;
  }
  TV.team = team;
  TV.href = function (name) { var b = B(); return (b && b.page ? b.page : 'Team Context.html') + '#team=' + encodeURIComponent(name); };

  // ---------------------------------------------------------------- styles
  function tagSt(tone) {
    var t = TONES[tone] || TONES.p;
    return { flex: 'none', font: '600 9px/1.5 ' + MONO, letterSpacing: '0.05em', textTransform: 'uppercase',
             color: t.fg, background: t.bg, boxShadow: 'inset 0 0 0 1px ' + t.line, padding: '1px 5px',
             borderRadius: '3px', marginRight: '6px', whiteSpace: 'nowrap' };
  }
  function rowSt(mobile) {
    return { display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: '0 0', padding: mobile ? '5px 0' : '4px 0',
             borderTop: '1px solid oklch(0.93 0.004 250)', minWidth: 0 };
  }
  function textSt(mobile) {
    return { font: '400 ' + (mobile ? '12.5px/1.45 ' : '12px/1.45 ') + SANS, color: INK, minWidth: 0, flex: '1 1 160px', overflowWrap: 'anywhere' };
  }
  function metaSt(mobile) {
    return { display: 'block', flex: '1 1 100%', font: '400 ' + (mobile ? '10.5px/1.45 ' : '10.5px/1.45 ') + MONO, color: MUT,
             marginTop: '1px', overflowWrap: 'anywhere' };
  }
  function labelSt() {
    return { font: '500 9.5px/1 ' + MONO, textTransform: 'uppercase', letterSpacing: '0.07em', color: MUT, margin: '11px 0 4px' };
  }

  function row(tag, tone, text, meta, title, mobile) {
    return { tag: tag || '', tagSt: tagSt(tone), text: text || '', textSt: textSt(mobile),
             meta: meta || '', metaSt: metaSt(mobile), title: title || '', st: rowSt(mobile) };
  }
  function plain(text, meta, mobile) { return row('', 'p', text, meta, '', mobile); }

  // ---------------------------------------------------------------- formatting
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function day(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? MON[+m[2] - 1] + ' ' + (+m[3]) : (iso || '');
  }
  function sgn(x) { return x === null || x === undefined || x === '' ? '' : (Number(x) > 0 ? '+' : '') + x; }
  function showOf(e) { return /^BBOC/.test(e || '') ? 'BBOC' : /^C3/.test(e || '') ? 'Cover 3' : ''; }

  function claimRow(c, tagText, mobile) {
    var tone = c.dir === 'P' ? 'pos' : c.dir === 'N' ? 'neg' : 'neu';
    var flags = [];
    if (c.pr) flags.push('speaker said already priced');
    if (c.ds) flags.push('disputed on air');
    var meta = [c.s, showOf(c.e) + ' ' + day(c.d) + ' @' + (c.ts || ''), c.y.toLowerCase(), c.g ? c.g.toLowerCase() : '']
      .filter(Boolean).join(' · ') + (flags.length ? ' · ' + flags.join(' · ') : '');
    var title = (c.q ? '"' + c.q + '"  ' : '') + c.e + '@' + c.ts;
    return row(tagText, tone, c.c + (c.n ? ' [' + c.n + ']' : ''), meta, title, mobile);
  }

  function attRow(a, mobile) {
    var tone = ATONE[a.t] || 'p';
    var tag = a.t === 'SZN' ? 'out szn' : a.t === 'BACK' ? 'back' : a.t === 'SAID' ? 'said' : a.t.toLowerCase();
    return row(tag, tone, [a.pos, a.p].filter(Boolean).join(' '), a.m, a.ti || '', mobile);
  }

  function formRows(t, mobile) {
    var out = [];
    var f = [t.rec + (t.crec ? ' (' + t.crec + ' conf)' : ''), 'ATS ' + t.ats + ' vs CLOSE_PROXY'];
    if (t.cm !== null && t.cm !== undefined) f.push('avg cover ' + sgn(t.cm));
    out.push(plain(f.join(' · '), '', mobile));
    if (t.pr) {
      var p = t.pr, bits = [];
      if (p.w4 !== undefined) bits.push('PFF W4 ' + p.w4 + ' (#' + p.r4 + ')');
      if (p.w0 !== undefined) bits.push('W0 ' + p.w0 + ' (#' + p.r0 + ')');
      if (p.d !== undefined && p.d !== null) bits.push('change ' + sgn(p.d));
      if (bits.length) out.push(plain(bits.join(' · '), 'a pointer to pff_ratings_vintages.csv, not an edge', mobile));
    }
    (t.last || []).forEach(function (g) {
      out.push(plain('Wk ' + g.w + ' ' + g.r + ' ' + g.sc + ' ' + (g.s === 'A' ? 'at ' : 'vs ') + g.o,
        g.cl !== null && g.cl !== undefined && g.cl !== '' ? 'closed ' + sgn(g.cl) + (g.at ? ' · ATS ' + g.at : '') : 'no close on file', mobile));
    });
    return out;
  }

  function nameMeta(t, name) {
    if (!t) return 'no team context (not an FBS team in the brief)';
    return [t.conf, t.hc].filter(Boolean).join(' · ');
  }

  // ---------------------------------------------------------------- button
  /*
   * The Context button for a game row. `baseSt` is the page's own mini-button style
   * so the desktop and the phone keep their own sizes. `onLoad` re-renders the page
   * when the brief lands; it is also what makes the button appear.
   */
  TV.button = function (sg, week, open, onToggle, onLoad, baseSt) {
    TV.ensure(onLoad);
    var b = B();
    if (!b || !sg || Number(b.week) !== Number(week)) return null;
    var a = team(sg.a), h = team(sg.h);
    if (!a && !h) return null;
    var nOut = (a ? a.outN || 0 : 0) + (h ? h.outN || 0 : 0);
    var nWk = (a ? a.wkN || 0 : 0) + (h ? h.wkN || 0 : 0);
    var bits = [];
    if (nOut) bits.push(nOut + ' out');
    if (nWk) bits.push(nWk + (nWk === 1 ? ' note' : ' notes'));
    return {
      label: 'Context', sub: bits.join(' · '),
      subSt: { font: '400 10px/1 ' + MONO, textTransform: 'none', letterSpacing: 0, opacity: 0.85 },
      caret: open ? '▲' : '▼', expanded: open ? 'true' : 'false',
      st: Object.assign({ display: 'inline-flex', alignItems: 'center', gap: '6px' }, baseSt || {}),
      click: onToggle
    };
  };

  // ---------------------------------------------------------------- panel
  TV.panel = function (sg, week, onClose, mobile) {
    var b = B();
    var head = {
      wrapSt: { margin: '10px 0 4px', border: '1px solid oklch(0.87 0.01 250)', borderRadius: mobile ? '9px' : '8px',
                background: 'oklch(1 0 0)', padding: mobile ? '10px 12px 12px' : '10px 14px 12px', minWidth: 0 },
      headSt: { display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 10px', paddingBottom: '8px',
                borderBottom: '1px solid ' + LINE },
      title: 'Team context', titleSt: { font: '600 13.5px/1.3 ' + SANS, color: INK },
      sub: '', subSt: { font: '400 10.5px/1.4 ' + MONO, color: MUT },
      links: [], close: onClose,
      closeSt: { flex: 'none', cursor: 'pointer', font: '400 14px/1 ' + SANS, width: '22px', height: '22px', border: '1px solid oklch(0.83 0.008 250)',
                 borderRadius: '5px', background: 'oklch(1 0 0)', color: SEC, padding: 0 },
      msg: null, msgSt: { font: '400 12px/1.5 ' + SANS, color: MUT, margin: '10px 0 0' },
      cols: [], cols2: [], secs: [],
      colsSt: { display: 'flex', flexWrap: 'wrap', gap: '6px 22px', margin: '2px 0 0' },
      secHeadSt: labelSt(),
      note: '', noteSt: { font: '400 10.5px/1.5 ' + MONO, color: MUT, margin: '12px 0 0', maxWidth: '110ch' }
    };
    if (!b) {
      TV.ensure(null, true);
      head.msg = st.failed ? 'team-brief.js did not load, so there is no team context on this page. The team pages still work.' : 'Loading team context…';
      return head;
    }
    var names = [sg.a, sg.h];
    var ts = names.map(team);
    var shortOf = function (i) { var t = ts[i]; return t && t.id ? t.id : String(names[i] || '').slice(0, 4).toUpperCase(); };
    head.sub = 'Week ' + b.week + ' · built ' + b.as_of + ' · host notes from ' + b.eps + ' episodes through ' + day(b.last_ep);
    head.links = names.map(function (n, i) {
      return ts[i] ? { label: n + ' ↗', href: TV.href(n),
                       st: { font: '500 11px/1 ' + MONO, color: 'oklch(0.42 0.16 258)', textDecoration: 'none', whiteSpace: 'nowrap' } } : null;
    }).filter(Boolean);

    var colSt = { flex: mobile ? '1 1 100%' : '1 1 300px', minWidth: 0 };
    var nameSt = { font: '600 13px/1.3 ' + SANS, color: INK, margin: '10px 0 0' };
    var nmMetaSt = { font: '400 10.5px/1.3 ' + MONO, color: MUT, marginLeft: '8px' };

    // top row: form and availability, one column per team (away first, as the title reads)
    head.cols = names.map(function (n, i) {
      var t = ts[i];
      var secs = [];
      if (t) {
        secs.push({ label: 'Season so far', labelSt: labelSt(), rows: formRows(t, mobile) });
        var ar = (t.att || []).map(function (a) { return attRow(a, mobile); });
        if (!ar.length) ar = [plain('Nothing on record from the conference reports, the injury pass or the podcasts.', 'no row is not the same as healthy', mobile)];
        secs.push({ label: 'Availability' + (t.attMore ? ' · ' + t.attMore + ' more on the team page' : ''), labelSt: labelSt(), rows: ar });
        if (t.po) secs.push({ label: 'Portal 2026', labelSt: labelSt(),
          rows: [plain(t.po[0] + ' in / ' + t.po[1] + ' out', '4★ and up: ' + t.po[2] + ' in / ' + t.po[3] + ' out (CFBD portal feed)', mobile)] });
      }
      return { st: colSt, name: n, nameSt: nameSt, meta: nameMeta(t, n), metaSt: nmMetaSt, secs: secs };
    });

    // middle: what was said about this game, both teams, grouped
    var said = [];
    ts.forEach(function (t, i) { (t && t.wk || []).forEach(function (c) { said.push({ c: c, i: i }); }); });
    GROUPS.forEach(function (gr) {
      var rows = said.filter(function (x) { return (TYPE_GROUP[x.c.y] || 'play') === gr.id; });
      rows.sort(function (x, y) { return String(y.c.d + y.c.ts).localeCompare(String(x.c.d + x.c.ts)); });
      if (!rows.length) return;
      var more = rows.length > GROUP_CAP ? rows.length - GROUP_CAP : 0;
      head.secs.push({
        label: 'Said about this game · ' + gr.label + (more ? ' · ' + more + ' more on the team pages' : ''),
        labelSt: labelSt(),
        rows: rows.slice(0, GROUP_CAP).map(function (x) { return claimRow(x.c, shortOf(x.i), mobile); })
      });
    });
    if (!head.secs.length) {
      head.secs.push({ label: 'Said about this game', labelSt: labelSt(),
        rows: [plain('Neither show has been extracted saying anything about this game yet.', 'Cover 3 and BBOC episodes for Week ' + b.week + ' through ' + day(b.last_ep), mobile)] });
    }

    // bottom row: earlier notes and the preseason prior, one column per team
    head.cols2 = names.map(function (n, i) {
      var t = ts[i];
      var secs = [];
      if (t) {
        var rc = (t.rc || []).map(function (c) { return claimRow(c, 'Wk' + String(c.w || '').replace('WK', ''), mobile); });
        secs.push({ label: 'Earlier host notes (last three weeks)', labelSt: labelSt(),
                    rows: rc.length ? rc : [plain('None extracted.', '', mobile)] });
        if (t.syn) {
          var sy = t.syn;
          secs.push({ label: 'Read · judgment layer · ' + (sy.trend || '') + ' · confidence ' + (sy.conf || '?'), labelSt: labelSt(),
                      rows: [plain(sy.read, sy.asof ? 'as of ' + sy.asof : '', mobile)]
                        .concat((sy.fired || []).map(function (f) { return row('fired', 'neg', f.item, f.ev, '', mobile); })) });
        }
        if (t.pri) {
          var p = t.pri;
          var pr = (p.fal || []).map(function (x) { return row('falsifier', 'pri', x, '', '', mobile); })
            .concat((p.con || []).map(function (x) { return row('confirmer', 'pri', x, '', '', mobile); }));
          secs.push({ label: 'Preseason prior · Summer School dossier · as of ' + p.asof + ' · ' + p.days + ' days old', labelSt: labelSt(),
                      rows: pr.length ? pr : [plain('Dossier lists no falsifiers.', '', mobile)] });
        } else {
          secs.push({ label: 'Preseason prior', labelSt: labelSt(), rows: [plain('No Summer School dossier for this team.', '', mobile)] });
        }
      }
      return { st: colSt, name: n, nameSt: nameSt, meta: '', metaSt: nmMetaSt, secs: secs };
    });

    head.note = 'Host notes are what was said on air (the qualitative layer), not facts; the team tag is green when the note favours that team, red when it goes against it. ' +
      'Availability: OUT/D/Q from the conference reports or the injury pass, SAID = only said on air, INF = missing from box scores (weak). ' +
      'ATS is graded against CLOSE_PROXY, not a verified close. Ratings are pointers, never an edge.';
    return head;
  };

  window.TV = TV;
})();
