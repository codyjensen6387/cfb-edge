'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { TZ, StatRow, Ranked, TeamName, Rungs, MIN_PLAYER_GAMES, benchScore, TopList, useRememberedSet, MultiSelect } from './Board';
import { soccerProps } from '@/lib/soccer-props';

// ---------- Dates and kickoff windows (Central time) ----------

const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const todayKey = () => dayFmt.format(new Date());
function dateLabel(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' });
}
function kickoff(g, withDate = true) {
  if (!g.start) return 'TBD';
  const opts = { timeZone: TZ, hour: 'numeric', minute: '2-digit' };
  if (withDate) Object.assign(opts, { weekday: 'short', month: 'short', day: 'numeric' });
  return new Date(g.start).toLocaleString('en-US', opts);
}

// Champions League matches kick off in two windows: about 11:45 am and 2:00 pm Central.
const SLOTS = [
  { key: 'early', label: 'Early kickoff (about 11:45 am)' },
  { key: 'late', label: 'Late kickoff (about 2 pm)' },
];
const minuteFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
function slotOf(g) {
  if (!g.start) return 'late';
  const parts = Object.fromEntries(minuteFmt.formatToParts(new Date(g.start)).map((p) => [p.type, p.value]));
  return Number(parts.hour) * 60 + Number(parts.minute) < 13 * 60 + 30 ? 'early' : 'late';
}

const recText = (t) => (t ? `${t.w}-${t.d}-${t.l}` : '–');

// ---------- Results this season ----------

function resultFor(team, g) {
  const isHome = g.home === team;
  const gf = isHome ? g.homeScore : g.awayScore;
  const ga = isHome ? g.awayScore : g.homeScore;
  return { isHome, opp: isHome ? g.away : g.home, gf, ga, r: gf > ga ? 'W' : gf < ga ? 'L' : 'D' };
}

function SeasonResults({ team, games, exclude, onOpen }) {
  const list = games
    .filter((g) => g.completed && g.homeScore !== null && g.id !== exclude && (g.home === team || g.away === team))
    .sort((a, b) => String(b.start).localeCompare(String(a.start)));
  if (!list.length) return <p className="muted hist-empty">No results yet</p>;
  return (
    <ul className="hist">
      {list.map((g) => {
        const r = resultFor(team, g);
        return (
          <li key={g.id}>
            <span className={`res res-${r.r}`}>{r.r}</span>
            <span className="hist-score">{r.gf}-{r.ga}</span>
            <span className="hist-opp">
              {g.neutral ? 'vs' : r.isHome ? 'vs' : '@'}{' '}
              <button type="button" className="linkish" onClick={() => onOpen(r.opp)}>{r.opp}</button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ---------- Player props ----------

function StatLine({ label, s, n, th, suffix }) {
  return (
    <div className="hline">
      <span className="hlabel">{label}</span>
      <span className="pstat havg">{s.avg.toFixed(1)}</span>
      <Rungs rungs={s.rungs} n={n} th={th} suffix={suffix} />
    </div>
  );
}

function SoccerTeamProps({ name, players, th }) {
  const list = useMemo(() => soccerProps(players), [players]);
  return (
    <div className="tprops">
      {name ? <h4 className="tprops-name">{name}</h4> : null}
      {list.length === 0 ? <p className="muted">No player stats yet.</p> : null}
      {list.map((p) => (
        <div className="pblock hblock sblock" key={p.name}>
          <div className="prow">
            <span className="pname">{p.name}</span>
            <span className="pstat">{p.n} {p.n === 1 ? 'match' : 'matches'}, {p.starts} {p.starts === 1 ? 'start' : 'starts'}</span>
          </div>
          <StatLine label="Goals" s={p.goals} n={p.n} th={th} />
          <StatLine label="Shots" s={p.shots} n={p.n} th={th} />
          <StatLine label="SOT" s={p.sot} n={p.n} th={th} />
          <StatLine label="G+A" s={p.ga} n={p.n} th={th} />
        </div>
      ))}
    </div>
  );
}

// ---------- Game card ----------

function GameCard({ g, teams, games, players, th, total, onOpen }) {
  const A = teams[g.away], H = teams[g.home];
  // Highlight the split that applies to this match: home team at home, away team away.
  const cell = (t, k, mode) => (
    <span className={mode === 'on' ? 'focus' : mode === 'off' ? 'dim' : ''}>
      <Ranked value={t?.avg[k] ?? null} rank={t?.ranks[k]} total={total} digits={2} />
    </span>
  );
  const on = g.neutral ? null : 'on';
  const off = g.neutral ? null : 'off';

  return (
    <article className="game">
      <header className="game-head">
        <TeamName team={A} fallback={g.away} onOpen={onOpen} />
        <span className="at">{g.neutral ? 'vs' : '@'}</span>
        <TeamName team={H} fallback={g.home} onOpen={onOpen} />
      </header>
      <p className="meta"><span>{kickoff(g)}</span>{g.neutral ? <span>Neutral site</span> : null}</p>
      {g.completed && g.homeScore !== null ? (
        <div className="result"><p className="final">Final: {g.away} {g.awayScore}, {g.home} {g.homeScore}</p></div>
      ) : null}

      <div className="tape">
        <StatRow label="Record (W-D-L)" away={recText(A)} home={recText(H)} />

        <h3 className="group">Goals for, per match</h3>
        <StatRow label="All matches" away={cell(A, 'gf')} home={cell(H, 'gf')} />
        <StatRow label="At home" away={cell(A, 'homeGf', off)} home={cell(H, 'homeGf', on)} />
        <StatRow label="Away" away={cell(A, 'awayGf', on)} home={cell(H, 'awayGf', off)} />

        <h3 className="group">Goals against, per match</h3>
        <StatRow label="All matches" away={cell(A, 'ga')} home={cell(H, 'ga')} />
        <StatRow label="At home" away={cell(A, 'homeGa', off)} home={cell(H, 'homeGa', on)} />
        <StatRow label="Away" away={cell(A, 'awayGa', on)} home={cell(H, 'awayGa', off)} />

        <h3 className="group">Champions League results this season</h3>
        <div className="hist-pair">
          <SeasonResults team={g.away} games={games} exclude={g.id} onOpen={onOpen} />
          <SeasonResults team={g.home} games={games} exclude={g.id} onOpen={onOpen} />
        </div>
      </div>

      <details className="props">
        <summary>Player props</summary>
        <SoccerTeamProps name={g.away} players={players[g.away]} th={th} />
        <SoccerTeamProps name={g.home} players={players[g.home]} th={th} />
      </details>
    </article>
  );
}

// ---------- Team page ----------

function TeamView({ name, teams, games, players, th, total, onOpen, onClose }) {
  const t = teams[name];
  const schedule = useMemo(() => games.filter((g) => g.home === name || g.away === name), [games, name]);
  if (!t) {
    return (
      <section className="teamview">
        <button type="button" className="back" onClick={onClose}>All matches</button>
        <p className="notice">No Champions League team named {name}.</p>
      </section>
    );
  }
  const splits = [
    ['Goals for, all', 'gf'], ['Goals for, at home', 'homeGf'], ['Goals for, away', 'awayGf'],
    ['Goals against, all', 'ga'], ['Goals against, at home', 'homeGa'], ['Goals against, away', 'awayGa'],
  ];
  return (
    <section className="teamview">
      <button type="button" className="back" onClick={onClose}>All matches</button>
      <header className="team-hero">
        {t.logo ? <img src={t.logo} alt="" width="56" height="56" onError={(e) => { e.currentTarget.style.display = 'none'; }} /> : null}
        <div><h2 className="hero-name">{t.name}</h2></div>
      </header>
      <dl className="summary">
        <div><dt>Record (W-D-L)</dt><dd>{recText(t)}</dd></div>
        <div><dt>Matches</dt><dd>{t.games.all} <span className="muted">{t.games.home} home, {t.games.away} away</span></dd></div>
      </dl>
      <dl className="rankgrid">
        {splits.map(([label, k]) => (
          <div key={k}><dt>{label}</dt><dd><Ranked value={t.avg[k]} rank={t.ranks[k]} total={total} digits={2} /></dd></div>
        ))}
      </dl>

      <h3 className="section-h">Schedule</h3>
      <div className="table-wrap">
        <table className="sched">
          <thead><tr><th>Date</th><th>Opponent</th><th>Result</th></tr></thead>
          <tbody>
            {schedule.map((g) => {
              const r = resultFor(name, g);
              const done = g.completed && g.homeScore !== null;
              return (
                <tr key={g.id} className={done ? '' : 'upcoming'}>
                  <td>{dateLabel(g.date)}</td>
                  <td className="opp">
                    <span className="muted">{g.neutral || r.isHome ? 'vs' : '@'}</span>{' '}
                    {teams[r.opp] ? <button type="button" className="linkish" onClick={() => onOpen(r.opp)}>{r.opp}</button> : r.opp}
                  </td>
                  <td>{done ? <span className={r.r === 'W' ? 'win' : r.r === 'L' ? 'loss' : 'muted'}>{r.r} {r.gf}-{r.ga}</span> : <span className="muted">{kickoff(g, false)}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <h3 className="section-h">Player props</h3>
      <SoccerTeamProps players={players[name]} th={th} />
    </section>
  );
}

// ---------- Top props for the day ----------

function TopProps({ games, teams, players, th, onOpen }) {
  const pools = useMemo(() => {
    const out = { goals: [], shots: [], sot: [], ga: [] };
    for (const g of games) {
      for (const [team, opp, isHome] of [[g.away, g.home, false], [g.home, g.away, true]]) {
        const who = { team, opp, at: g.neutral || isHome ? 'vs' : '@', when: kickoff(g, false) };
        for (const p of soccerProps(players[team])) {
          for (const k of Object.keys(out)) out[k].push({ ...who, name: p.name, n: p.n, avg: p[k].avg, rungs: p[k].rungs });
        }
      }
    }
    return out;
  }, [games, players]);

  const sorted = useMemo(() => {
    const byBench = (list) => list.filter((r) => r.n >= MIN_PLAYER_GAMES).map((r) => ({ ...r, s: benchScore(r, th) }))
      .sort((a, b) => b.s.cleared - a.s.cleared || b.s.total - a.s.total || b.avg - a.avg);
    return Object.fromEntries(Object.entries(pools).map(([k, v]) => [k, byBench(v)]));
  }, [pools, th]);

  if (!games.length) return <p className="notice">No matches left to show for this day with these filters.</p>;
  return (
    <>
      <p className="muted tp-note">
        Top 6 players per team by shots (goals count double), ranked by how many of their benchmarks they clear at your
        highlight % or better (green), then by overall hit rate. Champions League matches only; players need {MIN_PLAYER_GAMES}+ appearances.
      </p>
      <div className="tp-grid">
        <TopList title="Goals" list={sorted.goals} unit="goals/match" th={th} onOpen={onOpen} />
        <TopList title="Shots" list={sorted.shots} unit="shots/match" th={th} onOpen={onOpen} />
        <TopList title="Shots on target" list={sorted.sot} unit="on target/match" th={th} onOpen={onOpen} />
        <TopList title="Goals + assists" list={sorted.ga} unit="G+A/match" th={th} onOpen={onOpen} />
      </div>
    </>
  );
}

// ---------- Page ----------

export default function Soccer({ data }) {
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
  const [query, setQuery] = useState('');
  const [showStarted, setShowStarted] = useState(false);
  const [teamView, setTeamView] = useState(null);
  const [now, setNow] = useState(null);
  const [today, setToday] = useState(null);
  const [hiddenSlots, setHiddenSlots] = useRememberedSet('ucledge.hiddenSlots');
  const savedScroll = useRef(0);

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
  const total = Object.keys(teams).length;
  const q = query.trim().toLowerCase();
  const teamMatches = useMemo(() => (q ? Object.keys(teams).filter((n) => n.toLowerCase().includes(q)).sort().slice(0, 8) : []), [q, teams]);
  const matchesQuery = (g) => !q || g.home.toLowerCase().includes(q) || g.away.toLowerCase().includes(q);
  const hasStarted = (g) => g.completed || (now !== null && Boolean(g.start) && Date.parse(g.start) <= now);

  const allDay = games.filter((g) => g.date === date);
  const dayIsDone = allDay.length > 0 && allDay.every((g) => g.completed);
  const dayGames = allDay.filter(matchesQuery);
  const openGames = dayIsDone ? dayGames : dayGames.filter((g) => !hasStarted(g));
  const startedGames = dayIsDone ? [] : dayGames.filter(hasStarted);
  const propGames = dayGames.filter((g) => dayIsDone || !hasStarted(g)).filter((g) => !hiddenSlots.has(slotOf(g)));

  const card = (g) => <GameCard key={g.id} g={g} teams={teams} games={games} players={players} th={th} total={total} onOpen={openTeam} />;
  const updated = new Date(updatedAt).toLocaleString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  return (
    <main className="wrap">
      <header className="top">
        <h1 className="title">Champions League</h1>
        <p className="sub">{season}–{String(season + 1).slice(2)} Champions League. Stats count Champions League matches only. Updated {updated} CT.</p>
      </header>

      <section className="controls" aria-label="Filters">
        {!teamView ? (
          <>
            <label>
              <span>Match day</span>
              <select value={date ?? ''} onChange={(e) => setDate(e.target.value)}>
                {dates.map((d) => <option key={d} value={d}>{dateLabel(d)}{d === today ? ' (today)' : ''}</option>)}
              </select>
            </label>
            {view === 'props' ? <MultiSelect label="Kickoff" options={SLOTS} hidden={hiddenSlots} setHidden={setHiddenSlots} /> : null}
          </>
        ) : null}
        <label>
          <span>Highlight at {threshold}%+</span>
          <input type="range" min="50" max="85" step="5" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
        </label>
        {!teamView ? (
          <label className="search">
            <span>Team</span>
            <input type="search" placeholder="Search a team" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
        ) : null}
      </section>

      {teamView ? (
        <TeamView name={teamView} teams={teams} games={games} players={players} th={th} total={total} onOpen={openTeam} onClose={closeTeam} />
      ) : (
        <>
          {teamMatches.length ? (
            <div className="team-matches">
              <span className="muted">Open a team:</span>
              {teamMatches.map((n) => <button type="button" key={n} className="pill" onClick={() => openTeam(n)}>{n}</button>)}
            </div>
          ) : null}

          <div className="viewtabs" role="tablist" aria-label="View">
            <button type="button" role="tab" aria-selected={view === 'games'} className={view === 'games' ? 'on' : ''} onClick={() => setView('games')}>Matches</button>
            <button type="button" role="tab" aria-selected={view === 'props'} className={view === 'props' ? 'on' : ''} onClick={() => setView('props')}>Top props for the day</button>
          </div>

          {dates.length === 0 ? (
            <p className="notice">No Champions League matches posted yet.</p>
          ) : view === 'props' ? (
            <TopProps games={propGames} teams={teams} players={players} th={th} onOpen={openTeam} />
          ) : dayGames.length === 0 ? (
            <p className="notice">No matches for that team on this day.</p>
          ) : (
            <>
              {openGames.length ? <div className="games">{openGames.map(card)}</div> : <p className="notice">Every match shown for {dateLabel(date)} has kicked off.</p>}
              {startedGames.length ? (
                <div className="started">
                  <button type="button" className="pill started-toggle" aria-expanded={showStarted} onClick={() => setShowStarted((v) => !v)}>
                    {showStarted ? 'Hide' : 'Show'} {startedGames.length} started or finished {startedGames.length === 1 ? 'match' : 'matches'}
                  </button>
                  {showStarted ? <div className="games">{startedGames.map(card)}</div> : null}
                </div>
              ) : null}
            </>
          )}
        </>
      )}

      <footer className="foot">
        Data from ESPN’s public scoreboard and match reports (unofficial; it can change without notice).
        Rankings are among this season’s Champions League teams. A player’s matches are the ones he started or came on in.
      </footer>
    </main>
  );
}
