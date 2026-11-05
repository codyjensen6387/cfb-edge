'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  TZ, pct, fmtPct, signed, lineText, teamResult, rates, flagsFor, recText, atsText, ouText,
  Bar, StatRow, Ranked, TeamName, Rungs, MIN_PLAYER_GAMES, benchScore, TopList,
  useRememberedSet, MultiSelect,
} from './Board';
import { hoopsProps } from '@/lib/hoops-props';

const CONFS = ['ACC', 'Big 12', 'Big East', 'Big Ten', 'SEC', 'Pac-12'];

// ---------- Dates and tip-off windows (Central time) ----------

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const todayKey = () => dayFmt.format(new Date());
function dateLabel(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
}
function tipoff(g, withDate = true) {
  if (!g.start) return 'TBD';
  if (g.tbd) return withDate ? `${dateLabel(g.date)}, time TBD` : 'Time TBD';
  const opts = { timeZone: TZ, hour: 'numeric', minute: '2-digit' };
  if (withDate) Object.assign(opts, { weekday: 'short', month: 'short', day: 'numeric' });
  return new Date(g.start).toLocaleString('en-US', opts);
}

const TIP_SLOTS = [
  { key: 'early', label: 'Early (before 5 pm)' },
  { key: 'eve', label: 'Evening (5–8 pm)' },
  { key: 'late', label: 'Late (8 pm or later)' },
  { key: 'tbd', label: 'Time not set yet', extra: true },
];
const hourFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', hourCycle: 'h23' });
function tipSlot(g) {
  if (!g.start || g.tbd) return 'tbd';
  const h = Number(hourFmt.format(new Date(g.start)));
  return h < 17 ? 'early' : h < 20 ? 'eve' : 'late';
}

// ---------- Player props ----------

function StatLine({ label, s, n, th }) {
  return (
    <div className="hline">
      <span className="hlabel">{label}</span>
      <span className="pstat havg">{s.avg.toFixed(1)}</span>
      <Rungs rungs={s.rungs} n={n} th={th} />
    </div>
  );
}

function HoopsTeamProps({ name, players, th }) {
  const list = useMemo(() => hoopsProps(players), [players]);
  return (
    <div className="tprops">
      {name ? <h4 className="tprops-name">{name}</h4> : null}
      {list.length === 0 ? <p className="muted">No player stats yet.</p> : null}
      {list.map((p) => (
        <div className="pblock hblock" key={p.name}>
          <div className="prow">
            <span className="pname">{p.name}</span>
            <span className="pstat">{p.min.toFixed(1)} min, {p.n} {p.n === 1 ? 'game' : 'games'}</span>
          </div>
          <StatLine label="PTS" s={p.pts} n={p.n} th={th} />
          <StatLine label="REB" s={p.reb} n={p.n} th={th} />
          <StatLine label="AST" s={p.ast} n={p.n} th={th} />
          <StatLine label="3PM" s={p.tpm} n={p.n} th={th} />
        </div>
      ))}
    </div>
  );
}

// ---------- Game card ----------

function GameCard({ g, teams, players, th, minGames, rankedCount, onOpen }) {
  const A = teams[g.away], H = teams[g.home];
  const flags = flagsFor(A, H, th, minGames);
  const ra = rates(A, minGames), rh = rates(H, minGames);
  const line = lineText(g);
  const r = (t, k) => <Ranked value={t?.avg[k] ?? null} rank={t?.ranks[k]} total={rankedCount} />;

  let result = null;
  if (g.completed && g.homePoints !== null) {
    const home = teamResult(g.home, g);
    const coverText = home.ats === null ? null : home.ats === 'push' ? 'Push against the spread' : `${home.ats === 'cover' ? g.home : g.away} covered by ${home.atsBy}`;
    const ouLine = home.ou === null ? null : home.ou === 'push' ? `Push on the total (${home.sum})` : `${home.ou === 'over' ? 'Over' : 'Under'} (${home.sum} points)`;
    result = (
      <div className="result">
        <p className="final">Final: {g.away} {g.awayPoints}, {g.home} {g.homePoints}</p>
        <p className="outcome">
          {coverText ? <span>{coverText}</span> : null}
          {ouLine ? <span className={`ou-${home.ou}`}>{ouLine}</span> : null}
        </p>
      </div>
    );
  }

  return (
    <article className={`game ${flags.length ? 'flagged' : ''}`}>
      <header className="game-head">
        <TeamName team={A} fallback={g.away} onOpen={onOpen} />
        <span className="at">{g.neutral ? 'vs' : '@'}</span>
        <TeamName team={H} fallback={g.home} onOpen={onOpen} />
      </header>
      <p className="meta">
        <span>{tipoff(g)}</span>
        <span className="line">{line.spread}</span>
        {line.total ? <span className="line">{line.total}</span> : null}
      </p>
      {g.spreadSrc || g.totalSrc ? (
        <p className="src">
          {g.spreadSrc === g.totalSrc || !g.totalSrc ? `Line from ${g.spreadSrc}` : !g.spreadSrc ? `Total from ${g.totalSrc}` : `Spread from ${g.spreadSrc}, total from ${g.totalSrc}`}
        </p>
      ) : null}
      {result}
      {flags.length ? (
        <ul className="flags">{flags.map((f) => <li key={f.key} className={`flag ${f.key}`}>{f.label}</li>)}</ul>
      ) : null}

      <div className="tape">
        <StatRow label="Record" away={recText(A)} home={recText(H)} />
        <StatRow
          label="Against the spread"
          away={<><span className="pct">{fmtPct(ra.ats)}</span> {atsText(A)}</>}
          home={<>{atsText(H)} <span className="pct">{fmtPct(rh.ats)}</span></>}
        >
          <div className="bars"><Bar value={ra.ats} th={th} side="l" /><Bar value={rh.ats} th={th} side="r" /></div>
        </StatRow>
        <StatRow
          label="Over / under, over %"
          away={<><span className="pct">{fmtPct(ra.over)}</span> {ouText(A)}</>}
          home={<>{ouText(H)} <span className="pct">{fmtPct(rh.over)}</span></>}
        >
          <div className="bars"><Bar value={ra.over} th={th} side="l" /><Bar value={rh.over} th={th} side="r" /></div>
        </StatRow>

        <h3 className="group">Offense per game</h3>
        <StatRow label="Points" away={r(A, 'ppg')} home={r(H, 'ppg')} />
        <StatRow label="FG %" away={r(A, 'fgPct')} home={r(H, 'fgPct')} />
        <StatRow label="3-point %" away={r(A, 'tpPct')} home={r(H, 'tpPct')} />
        <StatRow label="Rebounds" away={r(A, 'rpg')} home={r(H, 'rpg')} />

        <h3 className="group">Defense per game, allowed</h3>
        <StatRow label="Points" away={r(A, 'ppgAllowed')} home={r(H, 'ppgAllowed')} />
        <StatRow label="FG %" away={r(A, 'oFgPct')} home={r(H, 'oFgPct')} />
        <StatRow label="3-point %" away={r(A, 'oTpPct')} home={r(H, 'oTpPct')} />
        <StatRow label="Rebounds" away={r(A, 'orpg')} home={r(H, 'orpg')} />
      </div>

      {A || H ? (
        <details className="props">
          <summary>Player props</summary>
          {A ? <HoopsTeamProps name={g.away} players={players[g.away]} th={th} /> : null}
          {H ? <HoopsTeamProps name={g.home} players={players[g.home]} th={th} /> : null}
        </details>
      ) : null}
    </article>
  );
}

// ---------- Team page ----------

function TeamView({ name, teams, games, players, th, rankedCount, onOpen, onClose }) {
  const t = teams[name];
  const schedule = useMemo(() => games.filter((g) => g.home === name || g.away === name), [games, name]);
  if (!t) {
    return (
      <section className="teamview">
        <button type="button" className="back" onClick={onClose}>All games</button>
        <p className="notice">No power-conference team named {name}.</p>
      </section>
    );
  }
  const ranks = [
    ['Points', 'ppg'], ['FG %', 'fgPct'], ['3-point %', 'tpPct'], ['Rebounds', 'rpg'],
    ['Points allowed', 'ppgAllowed'], ['Opponent FG %', 'oFgPct'], ['Opponent 3-point %', 'oTpPct'], ['Rebounds allowed', 'orpg'],
  ];
  return (
    <section className="teamview">
      <button type="button" className="back" onClick={onClose}>All games</button>
      <header className="team-hero">
        {t.logo ? <img src={t.logo} alt="" width="56" height="56" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : null}
        <div>
          <h2 className="hero-name">{t.name}</h2>
          <p className="muted">{t.conference}</p>
        </div>
      </header>

      <dl className="summary">
        <div><dt>Record</dt><dd>{recText(t)}</dd></div>
        <div><dt>Against the spread</dt><dd>{atsText(t)} <span className="muted">{fmtPct(pct(t.ats.w, t.ats.l))}</span></dd></div>
        <div><dt>Over / under</dt><dd>{ouText(t)} <span className="muted">{fmtPct(pct(t.ou.o, t.ou.u))} over</span></dd></div>
      </dl>
      <dl className="rankgrid">
        {ranks.map(([label, k]) => (
          <div key={k}><dt>{label}</dt><dd><Ranked value={t.avg[k]} rank={t.ranks[k]} total={rankedCount} /></dd></div>
        ))}
      </dl>

      <h3 className="section-h">Schedule</h3>
      <div className="table-wrap">
        <table className="sched">
          <thead>
            <tr><th>Date</th><th>Opponent</th><th>Result</th><th>Spread</th><th>ATS</th><th>Total</th><th>O/U</th></tr>
          </thead>
          <tbody>
            {schedule.map((g) => {
              const res = teamResult(name, g);
              const opp = res.isHome ? g.away : g.home;
              const oppIsPower = Boolean(teams[opp]);
              const done = g.completed && res.pf !== null;
              return (
                <tr key={g.id} className={done ? '' : 'upcoming'}>
                  <td>{dateLabel(g.date)}</td>
                  <td className="opp">
                    <span className="muted">{g.neutral || res.isHome ? 'vs' : '@'}</span>{' '}
                    {oppIsPower ? <button type="button" className="linkish" onClick={() => onOpen(opp)}>{opp}</button> : opp}
                  </td>
                  <td>{done ? <span className={res.pf > res.pa ? 'win' : 'loss'}>{res.pf > res.pa ? 'W' : 'L'} {res.pf}-{res.pa}</span> : <span className="muted">{tipoff(g, false)}</span>}</td>
                  <td>{res.spread === null ? '–' : signed(res.spread)}</td>
                  <td>{res.ats ? <span className={`ats-${res.ats}`}>{res.ats === 'push' ? 'Push' : `${res.ats === 'cover' ? 'Cover' : 'Miss'} by ${res.atsBy}`}</span> : '–'}</td>
                  <td>{g.total ?? '–'}</td>
                  <td>{res.ou ? <span className={`ou-${res.ou}`}>{res.ou === 'push' ? 'Push' : res.ou === 'over' ? 'Over' : 'Under'} ({res.sum})</span> : '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3 className="section-h">Player props</h3>
      <HoopsTeamProps players={players[name]} th={th} />
    </section>
  );
}

// ---------- Top props for the day ----------

function TopProps({ games, teams, players, th, onOpen }) {
  const pools = useMemo(() => {
    const out = { pts: [], reb: [], ast: [], tpm: [] };
    for (const g of games) {
      for (const [team, opp, isHome] of [[g.away, g.home, false], [g.home, g.away, true]]) {
        if (!teams[team]) continue; // props only for power-conference teams
        const who = { team, opp, at: g.neutral || isHome ? 'vs' : '@', when: tipoff(g, false) };
        for (const p of hoopsProps(players[team])) {
          for (const k of Object.keys(out)) out[k].push({ ...who, name: p.name, n: p.n, avg: p[k].avg, rungs: p[k].rungs });
        }
      }
    }
    return out;
  }, [games, teams, players]);

  const sorted = useMemo(() => {
    const byBench = (list) => list.filter((r) => r.n >= MIN_PLAYER_GAMES).map((r) => ({ ...r, s: benchScore(r, th) }))
      .sort((a, b) => b.s.cleared - a.s.cleared || b.s.total - a.s.total || b.avg - a.avg);
    return Object.fromEntries(Object.entries(pools).map(([k, v]) => [k, byBench(v)]));
  }, [pools, th]);

  if (!games.length) return <p className="notice">No games left to show for this day with these filters.</p>;
  return (
    <>
      <p className="muted tp-note">
        Top 5 players by minutes from each power-conference team playing, ranked by how many of their benchmarks they clear
        at your flag % or better (green), then by overall hit rate. Players need {MIN_PLAYER_GAMES}+ games.
      </p>
      <div className="tp-grid">
        <TopList title="Points" list={sorted.pts} unit="pts/g" th={th} onOpen={onOpen} />
        <TopList title="Rebounds" list={sorted.reb} unit="reb/g" th={th} onOpen={onOpen} />
        <TopList title="Assists" list={sorted.ast} unit="ast/g" th={th} onOpen={onOpen} />
        <TopList title="3-pointers made" list={sorted.tpm} unit="3PM/g" th={th} onOpen={onOpen} />
      </div>
    </>
  );
}

// ---------- Page ----------

export default function Hoops({ data }) {
  const { teams, games, players, season, updatedAt } = data;
  const dates = useMemo(() => [...new Set(games.map((g) => g.date))].sort(), [games]);
  // Start from the day the data was built (same on server and browser), then jump to the real today.
  const defaultDate = useMemo(() => {
    const built = dayFmt.format(new Date(updatedAt));
    return dates.find((d) => d >= built) ?? dates[dates.length - 1] ?? null;
  }, [dates, updatedAt]);

  const [date, setDate] = useState(defaultDate);
  const [view, setView] = useState('games');
  const [threshold, setThreshold] = useState(65);
  const [minGames, setMinGames] = useState(4);
  const [show, setShow] = useState('all');
  const [query, setQuery] = useState('');
  const [showStarted, setShowStarted] = useState(false);
  const [teamView, setTeamView] = useState(null);
  const [now, setNow] = useState(null);
  const [today, setToday] = useState(null);
  const [hiddenConfs, setHiddenConfs] = useRememberedSet('cbbedge.hiddenConfs');
  const [hiddenSlots, setHiddenSlots] = useRememberedSet('cbbedge.hiddenSlots');
  const savedScroll = useRef(0);

  // The page is built ahead of time, so "today" is settled once it opens in the browser.
  useEffect(() => {
    const t = todayKey();
    setToday(t);
    setDate(dates.find((x) => x >= t) ?? dates[dates.length - 1] ?? null);
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, [dates]);

  useEffect(() => {
    const read = () => {
      const m = window.location.hash.match(/^#team\/(.+)$/);
      const next = m ? decodeURIComponent(m[1]) : null;
      setTeamView(next);
      if (next) window.scrollTo(0, 0);
      else requestAnimationFrame(() => window.scrollTo(0, savedScroll.current));
    };
    read();
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);
  const openTeam = (name) => {
    if (!window.location.hash.startsWith('#team/')) savedScroll.current = window.scrollY;
    window.location.hash = `team/${encodeURIComponent(name)}`;
  };
  const closeTeam = () => { window.location.hash = ''; };

  const th = threshold / 100;
  const rankedCount = useMemo(() => Object.values(teams).filter((t) => t.ranks.ppg).length, [teams]);
  const q = query.trim().toLowerCase();
  const teamMatches = useMemo(() => (q ? Object.keys(teams).filter((n) => n.toLowerCase().includes(q)).sort().slice(0, 8) : []), [q, teams]);
  const confVisible = (g) => {
    const confs = [teams[g.home]?.conference, teams[g.away]?.conference].filter(Boolean);
    return confs.length === 0 || confs.some((c) => !hiddenConfs.has(c));
  };
  const matchesQuery = (g) => !q || g.home.toLowerCase().includes(q) || g.away.toLowerCase().includes(q);
  const hasStarted = (g) => g.completed || (now !== null && Boolean(g.start) && !g.tbd && Date.parse(g.start) <= now);

  const allToday = games.filter((g) => g.date === date);
  const dayIsDone = allToday.length > 0 && allToday.every((g) => g.completed);
  const dayGames = allToday.filter(matchesQuery).filter(confVisible).filter((g) => {
    if (show === 'all') return true;
    const f = flagsFor(teams[g.away], teams[g.home], th, minGames).map((x) => x.key);
    return show === 'flagged' ? f.length > 0 : f.includes(show);
  });
  const openGames = dayIsDone ? dayGames : dayGames.filter((g) => !hasStarted(g));
  const startedGames = dayIsDone ? [] : dayGames.filter(hasStarted);
  const propGames = allToday.filter(matchesQuery).filter(confVisible)
    .filter((g) => dayIsDone || !hasStarted(g))
    .filter((g) => !hiddenSlots.has(tipSlot(g)));
  const slotOptions = TIP_SLOTS.filter((o) => !o.extra || allToday.some((g) => tipSlot(g) === o.key));

  const card = (g) => (
    <GameCard key={g.id} g={g} teams={teams} players={players} th={th} minGames={minGames} rankedCount={rankedCount} onOpen={openTeam} />
  );
  const updated = new Date(updatedAt).toLocaleString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return (
    <main className="wrap">
      <header className="top">
        <h1 className="title">College Basketball</h1>
        <p className="sub">{season - 1}–{String(season).slice(2)} power-conference season. Records are season totals against the closing line. Updated {updated} CT.</p>
      </header>

      <section className="controls" aria-label="Filters">
        {!teamView ? (
          <>
            <label>
              <span>Date</span>
              <select value={date ?? ''} onChange={(e) => setDate(e.target.value)}>
                {dates.map((d) => <option key={d} value={d}>{dateLabel(d)}{d === today ? ' (today)' : ''}</option>)}
              </select>
            </label>
            {view === 'games' ? (
              <label>
                <span>Show</span>
                <select value={show} onChange={(e) => setShow(e.target.value)}>
                  <option value="all">All games</option>
                  <option value="flagged">Any flag</option>
                  <option value="over">Both hitting the over</option>
                  <option value="under">Both hitting the under</option>
                  <option value="ats">ATS mismatch</option>
                </select>
              </label>
            ) : null}
            <MultiSelect label="Conferences" options={CONFS.map((c) => ({ key: c, label: c }))} hidden={hiddenConfs} setHidden={setHiddenConfs} />
            {view === 'props' ? <MultiSelect label="Tip-off" options={slotOptions} hidden={hiddenSlots} setHidden={setHiddenSlots} /> : null}
          </>
        ) : null}
        <label>
          <span>Flag at {threshold}%+</span>
          <input type="range" min="55" max="85" step="5" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
        </label>
        {!teamView && view === 'games' ? (
          <label>
            <span>Min. games with a line</span>
            <input type="number" min="1" max="30" value={minGames} onChange={(e) => setMinGames(Math.max(1, Number(e.target.value) || 1))} />
          </label>
        ) : null}
        {!teamView ? (
          <label className="search">
            <span>Team</span>
            <input type="search" placeholder="Search a team" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        ) : null}
      </section>

      {teamView ? (
        <TeamView name={teamView} teams={teams} games={games} players={players} th={th} rankedCount={rankedCount} onOpen={openTeam} onClose={closeTeam} />
      ) : (
        <>
          {teamMatches.length ? (
            <div className="team-matches">
              <span className="muted">Open a team:</span>
              {teamMatches.map((n) => <button type="button" key={n} className="pill" onClick={() => openTeam(n)}>{n}</button>)}
            </div>
          ) : null}

          <div className="viewtabs" role="tablist" aria-label="View">
            <button type="button" role="tab" aria-selected={view === 'games'} className={view === 'games' ? 'on' : ''} onClick={() => setView('games')}>Games</button>
            <button type="button" role="tab" aria-selected={view === 'props'} className={view === 'props' ? 'on' : ''} onClick={() => setView('props')}>Top props for the day</button>
          </div>

          {dayIsDone ? <p className="muted weeknote">All games on {dateLabel(date)} are final. Records and stats shown are current season totals.</p> : null}

          {dates.length === 0 ? (
            <p className="notice">No power-conference games posted yet.</p>
          ) : view === 'props' ? (
            <TopProps games={propGames} teams={teams} players={players} th={th} onOpen={openTeam} />
          ) : dayGames.length === 0 ? (
            <p className="notice">No games match these filters. Check the conference menu, lower the flag percentage, or switch Show to All games.</p>
          ) : (
            <>
              {openGames.length ? <div className="games">{openGames.map(card)}</div> : <p className="notice">Every game shown for {dateLabel(date)} has tipped off.</p>}
              {startedGames.length ? (
                <div className="started">
                  <button type="button" className="pill started-toggle" aria-expanded={showStarted} onClick={() => setShowStarted((v) => !v)}>
                    {showStarted ? 'Hide' : 'Show'} {startedGames.length} started or finished {startedGames.length === 1 ? 'game' : 'games'}
                  </button>
                  {showStarted ? <div className="games">{startedGames.map(card)}</div> : null}
                </div>
              ) : null}
            </>
          )}
        </>
      )}

      <footer className="foot">
        Data from CollegeBasketballData.com. Rankings are among power-conference teams, per game. Pushes are left out of percentages.
        Player props cover each power team’s top 5 players by minutes.
      </footer>
    </main>
  );
}
