'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { TZ } from './Board';
import { parseSplash, matchGame, compare } from '@/lib/splash';

const STORE_KEY = 'cst.splash';
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '');
const pts = (n) => `${Math.abs(n)} ${Math.abs(n) === 1 ? 'pt' : 'pts'}`;
const signed = (n) => (n === 0 ? 'PK' : n > 0 ? `+${n}` : `${n}`);

// "Notre Dame -5.5" from Team A's spread.
function favText(teamA, teamB, spreadA) {
  if (spreadA === null || spreadA === undefined) return '–';
  if (spreadA === 0) return 'Pick’em';
  return spreadA < 0 ? `${teamA} ${spreadA}` : `${teamB} -${spreadA}`;
}

function useSaved() {
  const [saved, setSaved] = useState(null);
  useEffect(() => {
    try { const raw = localStorage.getItem(STORE_KEY); if (raw) setSaved(JSON.parse(raw)); } catch { /* nothing saved */ }
  }, []);
  const save = (text) => {
    const next = text ? { text, savedAt: new Date().toISOString() } : null;
    setSaved(next);
    try { next ? localStorage.setItem(STORE_KEY, JSON.stringify(next)) : localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
  };
  return [saved, save];
}

function MoveRow({ g, c }) {
  const bigSpread = c.spreadMove !== null && Math.abs(c.spreadMove) >= 3;
  return (
    <li className="mv-row">
      <div className="mv-head">
        <span className={`tag ${g.league}`}>{g.league === 'nfl' ? 'NFL' : 'CFB'}</span>
        <span className="mv-teams">{g.teamA} vs {g.teamB}</span>
        <span className="tp-when">{g.time || g.day || ''}</span>
      </div>
      <div className="mv-line">
        <span className="mv-label">Spread</span>
        <span>Splash <b>{favText(g.teamA, g.teamB, g.spreadA)}</b></span>
        <span className="muted">now {favText(g.teamA, g.teamB, c.curA)}</span>
        {c.spreadMove ? <span className={`chip ${bigSpread ? 'big' : ''}`}>moved {pts(c.spreadMove)}</span> : <span className="muted">no change</span>}
        {c.keys.map((k) => <span key={k} className="chip key">key {k}</span>)}
        {c.flipped ? <span className="chip key">favorite flipped</span> : null}
        {c.spreadValue ? <span className="mv-value">Better number: {c.spreadValue.team} {signed(c.spreadValue.line)}</span> : null}
      </div>
      <div className="mv-line">
        <span className="mv-label">Total</span>
        <span>Splash <b>{g.total ?? '–'}</b></span>
        <span className="muted">now {c.curTotal ?? '–'}</span>
        {c.totalMove ? <span className={`chip ${Math.abs(c.totalMove) >= 3 ? 'big' : ''}`}>moved {pts(c.totalMove)}</span> : <span className="muted">no change</span>}
        {c.totalValue ? <span className="mv-value">Better number: {c.totalValue} {g.total}</span> : null}
      </div>
    </li>
  );
}

export default function Lines({ football }) {
  const [saved, save] = useSaved();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const [live, setLive] = useState({ cfb: null, nfl: null, cfbAt: null, nflAt: null, errors: [] });
  const [loading, setLoading] = useState(false);
  const [league, setLeague] = useState('all');
  const [sortBy, setSortBy] = useState('spread');
  const [minMove, setMinMove] = useState(0.5);
  const [includeFinal, setIncludeFinal] = useState(false);

  const parsed = useMemo(() => (saved ? parseSplash(saved.text) : null), [saved]);

  const fetchLines = useCallback(async (withCollege) => {
    if (!parsed) return;
    setLoading(true);
    try {
      const qs = new URLSearchParams();
      if (parsed.nflWeek) qs.set('nflWeek', parsed.nflWeek);
      if (withCollege && parsed.cfbWeek) { qs.set('cfb', '1'); qs.set('cfbWeek', parsed.cfbWeek); }
      const res = await fetch(`/api/lines?${qs}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Live lines returned ${res.status}`);
      const d = await res.json();
      setLive((prev) => ({
        cfb: d.cfb ?? prev.cfb, cfbAt: d.cfb ? d.fetchedAt : prev.cfbAt,
        nfl: d.nfl ?? prev.nfl, nflAt: d.nfl ? d.fetchedAt : prev.nflAt,
        errors: d.errors || [],
      }));
    } catch (e) {
      setLive((prev) => ({ ...prev, errors: [e.message] }));
    } finally {
      setLoading(false);
    }
  }, [parsed]);

  // NFL lines are free to fetch, so get them as soon as the page has a paste.
  useEffect(() => { if (parsed?.nflWeek) fetchLines(false); }, [parsed, fetchLines]);

  // College lines from the last site update, until Refresh pulls live ones.
  const siteCollege = useMemo(() => {
    if (!football || !parsed?.cfbWeek) return [];
    const abbr = (n) => football.teams[n]?.abbr || null;
    return football.games.filter((g) => g.week === parsed.cfbWeek).map((g) => ({
      league: 'cfb', id: g.id, start: g.start,
      homeSide: { names: [g.home], abbr: abbr(g.home) }, awaySide: { names: [g.away], abbr: abbr(g.away) },
      spread: g.spread, total: g.total, src: g.spreadSrc || 'CollegeFootballData',
    }));
  }, [football, parsed]);

  const results = useMemo(() => {
    if (!parsed) return { moved: [], still: [], unmatched: [] };
    const current = [...(live.cfb ?? siteCollege), ...(live.nfl ?? [])];
    const moved = [], still = [], unmatched = [];
    for (const g of parsed.games) {
      if (league !== 'all' && g.league !== league) continue;
      if (!includeFinal && g.status === 'final') continue;
      const m = matchGame(g, current);
      if (!m) { unmatched.push(g); continue; }
      const c = compare(g, m);
      const sm = Math.abs(c.spreadMove ?? 0), tm = Math.abs(c.totalMove ?? 0);
      (sm >= minMove || tm >= minMove ? moved : still).push({ g, c, sm, tm });
    }
    moved.sort((a, b) => (sortBy === 'spread' ? b.sm - a.sm || b.tm - a.tm : b.tm - a.tm || b.sm - a.sm));
    return { moved, still, unmatched };
  }, [parsed, live, siteCollege, league, includeFinal, minMove, sortBy]);

  const counts = parsed ? {
    cfb: parsed.games.filter((g) => g.league === 'cfb').length,
    nfl: parsed.games.filter((g) => g.league === 'nfl').length,
  } : null;

  const showPaste = !saved || editing;
  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    save(text);
    setDraft('');
    setEditing(false);
    setLive({ cfb: null, nfl: null, cfbAt: null, nflAt: null, errors: [] });
  };

  return (
    <main className="wrap">
      <header className="top">
        <h1 className="title">Line Movement</h1>
        <p className="sub">Paste your Splash picks page to see which locked lines have moved the most since, and which side now has the better number.</p>
      </header>

      {showPaste ? (
        <section className="paste">
          <label htmlFor="splash-paste" className="muted">In Splash, select all the text on your picks page, copy it, and paste it here.</label>
          <textarea id="splash-paste" rows={7} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Paste the Splash picks page here" />
          <div className="paste-actions">
            <button type="button" className="pill primary" onClick={submit} disabled={!draft.trim()}>Save lines</button>
            {saved ? <button type="button" className="pill" onClick={() => { setEditing(false); setDraft(''); }}>Cancel</button> : null}
          </div>
        </section>
      ) : (
        <section className="paste saved">
          <p>
            <b>{parsed.games.length} games saved</b> ({counts.cfb} college, {counts.nfl} NFL)
            {parsed.cfbWeek ? `, CFB week ${parsed.cfbWeek}` : ''}{parsed.nflWeek ? `, NFL week ${parsed.nflWeek}` : ''}.
            {parsed.lock ? ` Picks lock ${parsed.lock}.` : ''} <span className="muted">Saved {fmtTime(saved.savedAt)} on this device.</span>
          </p>
          <div className="paste-actions">
            <button type="button" className="pill" onClick={() => setEditing(true)}>Replace lines</button>
            <button type="button" className="pill" onClick={() => save(null)}>Clear</button>
          </div>
        </section>
      )}

      {parsed && !parsed.games.length ? (
        <p className="notice">Couldn’t find any games in that text. Make sure you copied the whole picks page, including the spreads and O/U lines.</p>
      ) : null}

      {parsed && parsed.games.length ? (
        <>
          <section className="controls" aria-label="Filters">
            <label>
              <span>League</span>
              <select value={league} onChange={(e) => setLeague(e.target.value)}>
                <option value="all">College and NFL</option>
                <option value="cfb">College only</option>
                <option value="nfl">NFL only</option>
              </select>
            </label>
            <label>
              <span>Sort by</span>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="spread">Biggest spread moves</option>
                <option value="total">Biggest total moves</option>
              </select>
            </label>
            <label>
              <span>Moved at least</span>
              <select value={minMove} onChange={(e) => setMinMove(Number(e.target.value))}>
                {[0.5, 1, 1.5, 2, 3].map((v) => <option key={v} value={v}>{v} {v === 1 ? 'pt' : 'pts'}</option>)}
              </select>
            </label>
            <label className="check">
              <input type="checkbox" checked={includeFinal} onChange={(e) => setIncludeFinal(e.target.checked)} />
              <span>Include finished games</span>
            </label>
            <button type="button" className="pill primary refresh" onClick={() => fetchLines(true)} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh live lines'}
            </button>
          </section>

          <p className="muted src-note">
            College lines: {live.cfb ? `live, ${fmtTime(live.cfbAt)} CT` : `last site update, ${fmtTime(football?.updatedAt)} CT (tap Refresh for live)`}.
            {' '}NFL lines: {live.nfl ? `ESPN, ${fmtTime(live.nflAt)} CT` : loading ? 'loading…' : 'not loaded yet'}.
          </p>
          {live.errors.length ? <p className="notice">{live.errors.join(' ')}</p> : null}

          {results.moved.length ? (
            <ol className="mv-list">{results.moved.map(({ g, c }) => <MoveRow key={g.key} g={g} c={c} />)}</ol>
          ) : (
            <p className="notice">No lines have moved {minMove}+ points yet.</p>
          )}

          {results.still.length ? (
            <details className="mv-more">
              <summary>{results.still.length} {results.still.length === 1 ? 'game' : 'games'} moved less than {minMove} {minMove === 1 ? 'pt' : 'pts'}</summary>
              <ol className="mv-list">{results.still.map(({ g, c }) => <MoveRow key={g.key} g={g} c={c} />)}</ol>
            </details>
          ) : null}

          {results.unmatched.length ? (
            <details className="mv-more">
              <summary>{results.unmatched.length} {results.unmatched.length === 1 ? 'game' : 'games'} without a current line to compare</summary>
              <ul className="mv-unmatched">
                {results.unmatched.map((g) => <li key={g.key}>{g.league === 'nfl' ? 'NFL' : 'CFB'}: {g.teamA} vs {g.teamB}</li>)}
              </ul>
              <p className="muted">These usually match after a refresh. If one never does, the team name is spelled differently between Splash and the line source.</p>
            </details>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
