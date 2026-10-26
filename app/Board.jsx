'use client';

import { useMemo, useState } from 'react';

const TZ = 'America/Chicago';
const pct = (w, l) => (w + l > 0 ? w / (w + l) : null);
const fmtPct = (p) => (p === null ? '–' : `${Math.round(p * 100)}%`);
const fmtNum = (n) => (n === null || n === undefined ? '–' : n.toFixed(1));

function kickoff(iso) {
  if (!iso) return 'TBD';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function lineText(g) {
  const { spread, total } = g.line;
  let s = 'No line yet';
  if (spread !== null) s = spread === 0 ? 'Pick’em' : spread < 0 ? `${g.home} ${spread}` : `${g.away} -${spread}`;
  return { spread: s, total: total !== null ? `O/U ${total}` : null };
}

function rates(t, minGames) {
  if (!t) return { ats: null, over: null };
  const atsN = t.ats.w + t.ats.l, ouN = t.ou.o + t.ou.u;
  return {
    ats: atsN >= minGames ? pct(t.ats.w, t.ats.l) : null,
    over: ouN >= minGames ? pct(t.ou.o, t.ou.u) : null,
  };
}

function flagsFor(away, home, th, minGames) {
  const a = rates(away, minGames), h = rates(home, minGames);
  const flags = [];
  if (a.over !== null && h.over !== null) {
    if (a.over >= th && h.over >= th) flags.push({ key: 'over', label: 'Both hitting the over' });
    if (a.over <= 1 - th && h.over <= 1 - th) flags.push({ key: 'under', label: 'Both hitting the under' });
  }
  if (a.ats !== null && h.ats !== null) {
    const good = a.ats >= th && h.ats <= 1 - th ? away : h.ats >= th && a.ats <= 1 - th ? home : null;
    if (good) flags.push({ key: 'ats', label: `ATS mismatch, edge ${good.name}` });
  }
  return flags;
}

function rankTone(rank, total) {
  if (!rank) return '';
  if (rank <= 25) return 'good';
  if (rank > total - 25) return 'bad';
  return '';
}

function Bar({ value, th, side }) {
  const w = value === null ? 0 : Math.round(value * 100);
  const tone = value === null ? '' : value >= th ? 'hot' : value <= 1 - th ? 'cold' : '';
  return (
    <span className={`bar ${side}`} aria-hidden="true">
      <span className={`fill ${tone}`} style={{ width: `${w}%` }} />
    </span>
  );
}

function StatRow({ label, away, home, children }) {
  return (
    <div className="row">
      <div className="cell away">{away}</div>
      <div className="label">{label}</div>
      <div className="cell home">{home}</div>
      {children}
    </div>
  );
}

function Ranked({ value, rank, total }) {
  return (
    <span className="ranked">
      <span className="val">{fmtNum(value)}</span>
      {rank ? <span className={`rk ${rankTone(rank, total)}`}>#{rank}</span> : null}
    </span>
  );
}

function TeamName({ team, fallback }) {
  return (
    <div className="team">
      {team?.logo ? <img src={team.logo} alt="" width="28" height="28" loading="lazy" /> : <span className="logo-blank" />}
      <span className="name">{team?.name || fallback}</span>
      {team?.conference ? <span className="conf">{team.conference}</span> : null}
    </div>
  );
}

function GameCard({ g, teams, th, minGames, rankedCount }) {
  const A = teams[g.away], H = teams[g.home];
  const flags = flagsFor(A, H, th, minGames);
  const ra = rates(A, minGames), rh = rates(H, minGames);
  const line = lineText(g);
  const rec = (t) => (t ? `${t.su.w}-${t.su.l}` : '–');
  const ats = (t) => (t ? `${t.ats.w}-${t.ats.l}${t.ats.p ? `-${t.ats.p}` : ''}` : '–');
  const ou = (t) => (t ? `${t.ou.o}-${t.ou.u}${t.ou.p ? `-${t.ou.p}` : ''}` : '–');
  const r = (t, k) => <Ranked value={t?.avg[k] ?? null} rank={t?.ranks[k]} total={rankedCount} />;

  return (
    <article className={`game ${flags.length ? 'flagged' : ''}`}>
      <header className="game-head">
        <TeamName team={A} fallback={g.away} />
        <span className="at">{g.neutral ? 'vs' : '@'}</span>
        <TeamName team={H} fallback={g.home} />
      </header>
      <p className="meta">
        <span>{kickoff(g.start)}</span>
        <span className="line">{line.spread}</span>
        {line.total ? <span className="line">{line.total}</span> : null}
      </p>
      {flags.length ? (
        <ul className="flags">
          {flags.map((f) => <li key={f.key} className={`flag ${f.key}`}>{f.label}</li>)}
        </ul>
      ) : null}

      <div className="tape">
        <StatRow label="Record" away={rec(A)} home={rec(H)} />
        <StatRow
          label="Against the spread"
          away={<><span className="pct">{fmtPct(ra.ats)}</span> {ats(A)}</>}
          home={<>{ats(H)} <span className="pct">{fmtPct(rh.ats)}</span></>}
        >
          <div className="bars"><Bar value={ra.ats} th={th} side="l" /><Bar value={rh.ats} th={th} side="r" /></div>
        </StatRow>
        <StatRow
          label="Over / under, over %"
          away={<><span className="pct">{fmtPct(ra.over)}</span> {ou(A)}</>}
          home={<>{ou(H)} <span className="pct">{fmtPct(rh.over)}</span></>}
        >
          <div className="bars"><Bar value={ra.over} th={th} side="l" /><Bar value={rh.over} th={th} side="r" /></div>
        </StatRow>

        <h3 className="group">Offense per game</h3>
        <StatRow label="Points" away={r(A, 'ppg')} home={r(H, 'ppg')} />
        <StatRow label="Pass yards" away={r(A, 'passOff')} home={r(H, 'passOff')} />
        <StatRow label="Rush yards" away={r(A, 'rushOff')} home={r(H, 'rushOff')} />

        <h3 className="group">Defense per game, allowed</h3>
        <StatRow label="Points" away={r(A, 'ppgAllowed')} home={r(H, 'ppgAllowed')} />
        <StatRow label="Pass yards" away={r(A, 'passDef')} home={r(H, 'passDef')} />
        <StatRow label="Rush yards" away={r(A, 'rushDef')} home={r(H, 'rushDef')} />
      </div>
    </article>
  );
}

export default function Board({ data }) {
  const { teams, schedule, year, missingWeeks, updatedAt } = data;
  const weeks = useMemo(() => [...new Set(schedule.map((g) => g.week))].sort((a, b) => a - b), [schedule]);
  const [week, setWeek] = useState(weeks[0] ?? null);
  const [threshold, setThreshold] = useState(65);
  const [minGames, setMinGames] = useState(4);
  const [show, setShow] = useState('all');
  const [query, setQuery] = useState('');

  const th = threshold / 100;
  const rankedCount = useMemo(() => Object.values(teams).filter((t) => t.ranks.ppg).length, [teams]);

  const games = useMemo(() => {
    const q = query.trim().toLowerCase();
    return schedule
      .filter((g) => g.week === week)
      .filter((g) => !q || g.home.toLowerCase().includes(q) || g.away.toLowerCase().includes(q))
      .filter((g) => {
        if (show === 'all') return true;
        const f = flagsFor(teams[g.away], teams[g.home], th, minGames).map((x) => x.key);
        return show === 'flagged' ? f.length > 0 : f.includes(show);
      });
  }, [schedule, week, query, show, teams, th, minGames]);

  const updated = new Date(updatedAt).toLocaleString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  return (
    <main className="wrap">
      <header className="top">
        <h1 className="title">CFB Edge</h1>
        <p className="sub">{year} FBS season. Records use the closing consensus line. Updated {updated} CT.</p>
      </header>

      <section className="controls" aria-label="Filters">
        <label>
          <span>Week</span>
          <select value={week ?? ''} onChange={(e) => setWeek(Number(e.target.value))}>
            {weeks.map((w) => <option key={w} value={w}>Week {w}</option>)}
          </select>
        </label>
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
        <label>
          <span>Flag at {threshold}%+</span>
          <input type="range" min="55" max="85" step="5" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
        </label>
        <label>
          <span>Min. games with a line</span>
          <input type="number" min="1" max="12" value={minGames} onChange={(e) => setMinGames(Math.max(1, Number(e.target.value) || 1))} />
        </label>
        <label className="search">
          <span>Team</span>
          <input type="search" placeholder="Search a team" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      </section>

      {missingWeeks.length ? (
        <p className="notice">Yardage stats are missing for week {missingWeeks.sort((a, b) => a - b).join(', ')}. They’ll fill in on the next refresh.</p>
      ) : null}

      {weeks.length === 0 ? (
        <p className="notice">No upcoming regular-season games. The season’s schedule may not be posted yet, or the regular season is over.</p>
      ) : games.length === 0 ? (
        <p className="notice">No games match these filters. Lower the flag percentage or switch Show to All games.</p>
      ) : (
        <div className="games">
          {games.map((g) => <GameCard key={g.id} g={g} teams={teams} th={th} minGames={minGames} rankedCount={rankedCount} />)}
        </div>
      )}

      <footer className="foot">Data from CollegeFootballData.com. Rankings are among FBS teams, per game. Pushes are left out of percentages.</footer>
    </main>
  );
}
