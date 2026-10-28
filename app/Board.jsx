'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { teamProps } from '@/lib/props';

const TZ = 'America/Chicago';
const pct = (w, l) => (w + l > 0 ? w / (w + l) : null);
const fmtPct = (p) => (p === null ? '–' : `${Math.round(p * 100)}%`);
const fmtNum = (n) => (n === null || n === undefined ? '–' : n.toFixed(1));
const signed = (n) => (n === 0 ? 'PK' : n > 0 ? `+${n}` : `${n}`);

// TBD games carry a placeholder clock time, so only their date (read in UTC) means anything.
function kickoff(g, withTime = true) {
  if (!g.start) return 'TBD';
  const d = new Date(g.start);
  if (g.tbd) return `${d.toLocaleString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })}${withTime ? ', time TBD' : ''}`;
  const opts = { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' };
  if (withTime) Object.assign(opts, { hour: 'numeric', minute: '2-digit' });
  return d.toLocaleString('en-US', opts);
}
function shortKick(g) {
  if (!g.start) return 'TBD';
  const d = new Date(g.start);
  if (g.tbd) return `${d.toLocaleString('en-US', { timeZone: 'UTC', weekday: 'short' })} TBD`;
  return d.toLocaleString('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

// Kickoff windows for the props page, in Central time.
const SLOTS = [
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat-early', label: 'Saturday early (11 am–2 pm)' },
  { key: 'sat-aft', label: 'Saturday afternoon (2–6 pm)' },
  { key: 'sat-eve', label: 'Saturday evening (6–11 pm)' },
  { key: 'other', label: 'Sunday or Monday', extra: true },
  { key: 'tbd', label: 'Time not set yet', extra: true },
];
const slotFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', hourCycle: 'h23' });
function slotOf(g) {
  if (!g.start || g.tbd) return 'tbd';
  const parts = Object.fromEntries(slotFmt.formatToParts(new Date(g.start)).map((p) => [p.type, p.value]));
  const hour = Number(parts.hour);
  switch (parts.weekday) {
    case 'Tue': return 'tue';
    case 'Wed': return 'wed';
    case 'Thu': return 'thu';
    case 'Fri': return 'fri';
    case 'Sat': return hour < 14 ? 'sat-early' : hour < 18 ? 'sat-aft' : 'sat-eve';
    default: return 'other';
  }
}

function lineText(g) {
  let s = 'No line';
  if (g.spread !== null) s = g.spread === 0 ? 'Pick’em' : g.spread < 0 ? `${g.home} ${g.spread}` : `${g.away} -${g.spread}`;
  return { spread: s, total: g.total !== null ? `O/U ${g.total}` : null };
}

// Result of a finished game against the closing line, from one team's side.
function teamResult(team, g) {
  const isHome = g.home === team;
  const pf = isHome ? g.homePoints : g.awayPoints;
  const pa = isHome ? g.awayPoints : g.homePoints;
  const spread = g.spread === null ? null : isHome ? g.spread : -g.spread;
  const out = { isHome, pf, pa, spread, ats: null, atsBy: null, ou: null, sum: null };
  if (!g.completed || pf === null) return out;
  if (spread !== null) {
    const m = pf - pa + spread;
    out.ats = m > 0 ? 'cover' : m < 0 ? 'miss' : 'push';
    out.atsBy = Math.abs(m);
  }
  if (g.total !== null) {
    out.sum = pf + pa;
    out.ou = out.sum > g.total ? 'over' : out.sum < g.total ? 'under' : 'push';
  }
  return out;
}

function rates(t, minGames) {
  if (!t) return { ats: null, over: null };
  return {
    ats: t.ats.w + t.ats.l >= minGames ? pct(t.ats.w, t.ats.l) : null,
    over: t.ou.o + t.ou.u >= minGames ? pct(t.ou.o, t.ou.u) : null,
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

const rankTone = (rank, total) => (!rank ? '' : rank <= 25 ? 'good' : rank > total - 25 ? 'bad' : '');
const recText = (t) => (t ? `${t.su.w}-${t.su.l}` : '–');
const atsText = (t) => (t ? `${t.ats.w}-${t.ats.l}${t.ats.p ? `-${t.ats.p}` : ''}` : '–');
const ouText = (t) => (t ? `${t.ou.o}-${t.ou.u}${t.ou.p ? `-${t.ou.p}` : ''}` : '–');

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

function TeamName({ team, fallback, onOpen }) {
  const inner = (
    <>
      {team?.logo ? <img src={team.logo} alt="" width="28" height="28" loading="lazy" /> : <span className="logo-blank" />}
      <span className="name">{team?.name || fallback}</span>
      {team?.conference ? <span className="conf">{team.conference}</span> : null}
    </>
  );
  return team ? (
    <button type="button" className="team" onClick={() => onOpen(team.name)} aria-label={`Open ${team.name} schedule`}>{inner}</button>
  ) : (
    <div className="team">{inner}</div>
  );
}

// ---------- Player props ----------

function Rungs({ rungs, n, th, suffix = '' }) {
  return (
    <div className="rungs">
      {rungs.map(({ t, hits }) => (
        <span key={t} className={`chip ${hits / n >= th ? 'hit' : ''}`}>
          <span className="chip-t">{t}+{suffix}</span> {hits}/{n}
        </span>
      ))}
    </div>
  );
}

function TeamProps({ name, players, includeFcs, th }) {
  const p = useMemo(() => teamProps(players, includeFcs), [players, includeFcs]);
  const empty = !p.touchdowns.length && !p.passer.length && !p.rushers.length && !p.receivers.length;
  return (
    <div className="tprops">
      {name ? <h4 className="tprops-name">{name}</h4> : null}
      {empty ? <p className="muted">No player stats yet.</p> : null}

      {p.touchdowns.length ? (
        <div className="pgroup">
          <h5>Rushing and receiving touchdowns</h5>
          {p.touchdowns.map((r) => (
            <div className="prow" key={r.name}>
              <span className="pname">{r.name}</span>
              <span className={`chip ${r.tdGames / r.n >= th ? 'hit' : ''}`}>TD in {r.tdGames}/{r.n}</span>
              <span className="pstat">{r.td} total</span>
            </div>
          ))}
        </div>
      ) : null}

      {p.passer.map((r) => (
        <div className="pgroup" key={r.name}>
          <h5>Passing</h5>
          <div className="prow">
            <span className="pname">{r.name}</span>
            <span className="pstat">{fmtNum(r.avg)} yds, {r.tdAvg.toFixed(1)} TD per game</span>
          </div>
          <Rungs rungs={r.rungs} n={r.n} th={th} />
          <Rungs rungs={r.tdRungs} n={r.n} th={th} suffix=" TD" />
        </div>
      ))}

      {[['Rushing', p.rushers], ['Receiving', p.receivers]].map(([label, list]) =>
        list.length ? (
          <div className="pgroup" key={label}>
            <h5>{label}</h5>
            {list.map((r) => (
              <div key={r.name} className="pblock">
                <div className="prow">
                  <span className="pname">{r.name}</span>
                  <span className="pstat">{fmtNum(r.avg)} yds{r.recAvg ? `, ${r.recAvg.toFixed(1)} rec` : ''} per game</span>
                </div>
                <Rungs rungs={r.rungs} n={r.n} th={th} />
                {r.recRungs?.length ? <Rungs rungs={r.recRungs} n={r.n} th={th} suffix=" rec" /> : null}
              </div>
            ))}
          </div>
        ) : null
      )}
    </div>
  );
}

// ---------- Game card ----------

function GameCard({ g, teams, players, th, minGames, rankedCount, includeFcs, onOpen }) {
  const A = teams[g.away], H = teams[g.home];
  const flags = flagsFor(A, H, th, minGames);
  const ra = rates(A, minGames), rh = rates(H, minGames);
  const line = lineText(g);
  const r = (t, k) => <Ranked value={t?.avg[k] ?? null} rank={t?.ranks[k]} total={rankedCount} />;

  let result = null;
  if (g.completed && g.homePoints !== null) {
    const home = teamResult(g.home, g);
    const coverText =
      home.ats === null ? null : home.ats === 'push' ? 'Push against the spread' : `${home.ats === 'cover' ? g.home : g.away} covered by ${home.atsBy}`;
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
        <span>{kickoff(g, !g.completed)}</span>
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
        <ul className="flags">
          {flags.map((f) => <li key={f.key} className={`flag ${f.key}`}>{f.label}</li>)}
        </ul>
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
        <StatRow label="Pass yards" away={r(A, 'passOff')} home={r(H, 'passOff')} />
        <StatRow label="Rush yards" away={r(A, 'rushOff')} home={r(H, 'rushOff')} />

        <h3 className="group">Defense per game, allowed</h3>
        <StatRow label="Points" away={r(A, 'ppgAllowed')} home={r(H, 'ppgAllowed')} />
        <StatRow label="Pass yards" away={r(A, 'passDef')} home={r(H, 'passDef')} />
        <StatRow label="Rush yards" away={r(A, 'rushDef')} home={r(H, 'rushDef')} />
      </div>

      <details className="props">
        <summary>Player props</summary>
        <TeamProps name={g.away} players={players[g.away]} includeFcs={includeFcs} th={th} />
        <TeamProps name={g.home} players={players[g.home]} includeFcs={includeFcs} th={th} />
      </details>
    </article>
  );
}

// ---------- Team page ----------

function TeamView({ name, teams, games, players, th, includeFcs, rankedCount, onOpen, onClose }) {
  const t = teams[name];
  const schedule = useMemo(() => games.filter((g) => g.home === name || g.away === name), [games, name]);
  if (!t) {
    return (
      <section className="teamview">
        <button type="button" className="back" onClick={onClose}>All games</button>
        <p className="notice">No FBS team named {name}.</p>
      </section>
    );
  }
  const atsP = pct(t.ats.w, t.ats.l), overP = pct(t.ou.o, t.ou.u);
  const ranks = [
    ['Points', 'ppg'], ['Pass yards', 'passOff'], ['Rush yards', 'rushOff'],
    ['Points allowed', 'ppgAllowed'], ['Pass yards allowed', 'passDef'], ['Rush yards allowed', 'rushDef'],
  ];

  return (
    <section className="teamview">
      <button type="button" className="back" onClick={onClose}>All games</button>
      <header className="team-hero">
        {t.logo ? <img src={t.logo} alt="" width="56" height="56" /> : null}
        <div>
          <h2 className="hero-name">{t.name}</h2>
          <p className="muted">{t.conference}</p>
        </div>
      </header>

      <dl className="summary">
        <div><dt>Record</dt><dd>{recText(t)}</dd></div>
        <div><dt>Against the spread</dt><dd>{atsText(t)} <span className="muted">{fmtPct(atsP)}</span></dd></div>
        <div><dt>Over / under</dt><dd>{ouText(t)} <span className="muted">{fmtPct(overP)} over</span></dd></div>
      </dl>

      <dl className="rankgrid">
        {ranks.map(([label, k]) => (
          <div key={k}>
            <dt>{label}</dt>
            <dd><Ranked value={t.avg[k]} rank={t.ranks[k]} total={rankedCount} /></dd>
          </div>
        ))}
      </dl>

      <h3 className="section-h">Schedule</h3>
      <div className="table-wrap">
        <table className="sched">
          <thead>
            <tr><th>Wk</th><th>Opponent</th><th>Result</th><th>Spread</th><th>ATS</th><th>Total</th><th>O/U</th></tr>
          </thead>
          <tbody>
            {schedule.map((g) => {
              const res = teamResult(name, g);
              const opp = res.isHome ? g.away : g.home;
              const oppIsFbs = Boolean(teams[opp]);
              const done = g.completed && res.pf !== null;
              return (
                <tr key={g.id} className={done ? '' : 'upcoming'}>
                  <td>{g.week}</td>
                  <td className="opp">
                    <span className="muted">{g.neutral ? 'vs' : res.isHome ? 'vs' : '@'}</span>{' '}
                    {oppIsFbs ? <button type="button" className="linkish" onClick={() => onOpen(opp)}>{opp}</button> : opp}
                    {!oppIsFbs ? <span className="tag">FCS</span> : null}
                  </td>
                  <td>{done ? <span className={res.pf > res.pa ? 'win' : 'loss'}>{res.pf > res.pa ? 'W' : 'L'} {res.pf}-{res.pa}</span> : <span className="muted">{kickoff(g)}</span>}</td>
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
      <TeamProps players={players[name]} includeFcs={includeFcs} th={th} />
    </section>
  );
}

// ---------- Top props this week ----------

const TOP_N = 12;
const MIN_PLAYER_GAMES = 3;

// Most of his own benchmarks cleared at the flag % or better, then highest overall hit rate.
function benchScore(r, th) {
  const rates = r.rungs.map((x) => x.hits / r.n);
  return { cleared: rates.filter((x) => x >= th).length, total: rates.reduce((a, b) => a + b, 0) };
}

function TopList({ title, list, unit, th, onOpen, isTd }) {
  const [all, setAll] = useState(false);
  const shown = all ? list : list.slice(0, TOP_N);
  return (
    <section className="tp-card">
      <h3 className="tp-title">{title}</h3>
      {list.length === 0 ? <p className="muted">No players yet.</p> : null}
      <ol className="tp-list">
        {shown.map((r, i) => (
          <li className="tp-row" key={`${r.team}-${r.name}`}>
            <span className="tp-rank">{i + 1}</span>
            <div className="tp-main">
              <div className="tp-who">
                <span className="pname">{r.name}</span>
                <span className="muted">
                  <button type="button" className="linkish" onClick={() => onOpen(r.team)}>{r.team}</button> {r.at} {r.opp}
                </span>
                <span className="tp-when">{r.when}</span>
              </div>
              <div className="tp-line">
                {isTd ? (
                  <>
                    <span className={`chip ${r.hits / r.n >= th ? 'hit' : ''}`}>TD in {r.hits}/{r.n}</span>
                    <span className="pstat">{r.td} total</span>
                  </>
                ) : (
                  <>
                    <span className="pstat">{r.avg.toFixed(1)} {unit}</span>
                    {r.rungs.map(({ t, hits }) => (
                      <span key={t} className={`chip ${hits / r.n >= th ? 'hit' : ''}`}><span className="chip-t">{t}+</span> {hits}/{r.n}</span>
                    ))}
                  </>
                )}
              </div>
            </div>
          </li>
        ))}
      </ol>
      {list.length > TOP_N ? (
        <button type="button" className="pill" onClick={() => setAll((v) => !v)}>{all ? 'Show top ' + TOP_N : `Show all ${list.length}`}</button>
      ) : null}
    </section>
  );
}

function TopProps({ games, teams, players, includeFcs, th, onOpen }) {
  const pools = useMemo(() => {
    const out = { td: [], rush: [], recYds: [], catches: [], passYds: [], passTd: [] };
    for (const g of games) {
      for (const [team, opp, isHome] of [[g.away, g.home, false], [g.home, g.away, true]]) {
        if (!teams[team]) continue; // FCS teams have no player data
        const p = teamProps(players[team], includeFcs);
        const who = { team, opp, at: g.neutral || isHome ? 'vs' : '@', when: shortKick(g) };
        p.touchdowns.forEach((r) => out.td.push({ ...who, name: r.name, n: r.n, hits: r.tdGames, td: r.td }));
        p.rushers.forEach((r) => out.rush.push({ ...who, name: r.name, n: r.n, avg: r.avg, rungs: r.rungs }));
        p.receivers.forEach((r) => {
          out.recYds.push({ ...who, name: r.name, n: r.n, avg: r.avg, rungs: r.rungs });
          if (r.recRungs?.length) out.catches.push({ ...who, name: r.name, n: r.n, avg: r.recAvg, rungs: r.recRungs });
        });
        p.passer.forEach((r) => {
          out.passYds.push({ ...who, name: r.name, n: r.n, avg: r.avg, rungs: r.rungs });
          out.passTd.push({ ...who, name: r.name, n: r.n, avg: r.tdAvg, rungs: r.tdRungs });
        });
      }
    }
    return out;
  }, [games, teams, players, includeFcs]);

  const sorted = useMemo(() => {
    const enough = (r) => r.n >= MIN_PLAYER_GAMES;
    const byBench = (list) => list.filter(enough).map((r) => ({ ...r, s: benchScore(r, th) }))
      .sort((a, b) => b.s.cleared - a.s.cleared || b.s.total - a.s.total || b.avg - a.avg);
    return {
      td: pools.td.filter(enough).sort((a, b) => b.hits / b.n - a.hits / a.n || b.td - a.td || b.n - a.n),
      rush: byBench(pools.rush), recYds: byBench(pools.recYds), catches: byBench(pools.catches),
      passYds: byBench(pools.passYds), passTd: byBench(pools.passTd),
    };
  }, [pools, th]);

  if (!games.length) return <p className="notice">No games left to show for this week with these filters.</p>;
  return (
    <>
      <p className="muted tp-note">
        Players from this week’s games, ranked by how many of their benchmarks they clear at your flag % or better (green),
        then by overall hit rate. Players need {MIN_PLAYER_GAMES}+ games.
      </p>
      <div className="tp-grid">
        <TopList title="Touchdowns (rush + rec)" list={sorted.td} th={th} onOpen={onOpen} isTd />
        <TopList title="Rushing yards" list={sorted.rush} unit="yds/g" th={th} onOpen={onOpen} />
        <TopList title="Receiving yards" list={sorted.recYds} unit="yds/g" th={th} onOpen={onOpen} />
        <TopList title="Receptions" list={sorted.catches} unit="rec/g" th={th} onOpen={onOpen} />
        <TopList title="Passing yards" list={sorted.passYds} unit="yds/g" th={th} onOpen={onOpen} />
        <TopList title="Passing TDs" list={sorted.passTd} unit="TD/g" th={th} onOpen={onOpen} />
      </div>
    </>
  );
}

// ---------- Conference menu ----------

const CONF_KEY = 'cfbedge.hiddenConfs';
const SLOT_KEY = 'cfbedge.hiddenSlots';

function useRememberedSet(key) {
  const [value, setValue] = useState(() => new Set());
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setValue(new Set(JSON.parse(raw)));
    } catch { /* storage unavailable; start with everything shown */ }
  }, [key]);
  const set = (next) => {
    setValue(next);
    try { localStorage.setItem(key, JSON.stringify([...next])); } catch { /* ignore */ }
  };
  return [value, set];
}

function MultiSelect({ label, options, hidden, setHidden }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  const shown = options.filter((o) => !hidden.has(o.key)).length;
  const summary = shown === options.length ? 'All' : shown === 0 ? 'None' : `${shown} of ${options.length}`;
  const toggle = (k) => {
    const next = new Set(hidden);
    next.has(k) ? next.delete(k) : next.add(k);
    setHidden(next);
  };

  return (
    <div className="confmenu" ref={ref}>
      <span className="ctl-label">{label}</span>
      <button type="button" className="confbtn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        {summary} <span aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="confpanel" role="group" aria-label={label}>
          <div className="confactions">
            <button type="button" onClick={() => setHidden(new Set([...hidden].filter((k) => !options.some((o) => o.key === k))))}>Select all</button>
            <button type="button" onClick={() => setHidden(new Set([...hidden, ...options.map((o) => o.key)]))}>Clear all</button>
          </div>
          {options.map((o) => (
            <label key={o.key} className="confitem">
              <input type="checkbox" checked={!hidden.has(o.key)} onChange={() => toggle(o.key)} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---------- Page ----------

export default function Board({ data }) {
  const { teams, games, players, year, updatedAt } = data;
  const weeks = useMemo(() => [...new Set(games.map((g) => g.week))].sort((a, b) => a - b), [games]);
  const firstOpen = useMemo(() => games.find((g) => !g.completed)?.week ?? weeks[weeks.length - 1] ?? null, [games, weeks]);

  const [week, setWeek] = useState(firstOpen);
  const [threshold, setThreshold] = useState(65);
  const [minGames, setMinGames] = useState(4);
  const [show, setShow] = useState('all');
  const [query, setQuery] = useState('');
  const [includeFcs, setIncludeFcs] = useState(true);
  const [teamView, setTeamView] = useState(null);
  const [showStarted, setShowStarted] = useState(false);
  const [view, setView] = useState('games');
  const [now, setNow] = useState(null);
  const [hiddenConfs, setHiddenConfs] = useRememberedSet(CONF_KEY);
  const [hiddenSlots, setHiddenSlots] = useRememberedSet(SLOT_KEY);
  const savedScroll = useRef(0);

  // A game counts as started once kickoff passes, even before the next data update marks it final.
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  const conferences = useMemo(
    () => [...new Set(Object.values(teams).map((t) => t.conference).filter(Boolean))].sort(),
    [teams]
  );
  // Show a game if either team's conference is selected. FCS opponents have none, so the FBS team decides.
  const confVisible = (g) => {
    const confs = [teams[g.home]?.conference, teams[g.away]?.conference].filter(Boolean);
    return confs.length === 0 || confs.some((c) => !hiddenConfs.has(c));
  };

  // Team pages live at #team/Name so the back button and gesture work.
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

  const weekGames = useMemo(() => {
    return games
      .filter((g) => g.week === week)
      .filter((g) => !q || g.home.toLowerCase().includes(q) || g.away.toLowerCase().includes(q))
      .filter(confVisible)
      .filter((g) => {
        if (show === 'all') return true;
        const f = flagsFor(teams[g.away], teams[g.home], th, minGames).map((x) => x.key);
        return show === 'flagged' ? f.length > 0 : f.includes(show);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games, week, q, show, teams, th, minGames, hiddenConfs]);

  const updated = new Date(updatedAt).toLocaleString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const weekIsDone = games.filter((g) => g.week === week).every((g) => g.completed);
  const hasStarted = (g) => g.completed || (now !== null && Boolean(g.start) && Date.parse(g.start) <= now);
  const openGames = weekIsDone ? weekGames : weekGames.filter((g) => !hasStarted(g));
  const startedGames = weekIsDone ? [] : weekGames.filter(hasStarted);
  const propGames = useMemo(() => {
    return games
      .filter((g) => g.week === week)
      .filter((g) => !q || g.home.toLowerCase().includes(q) || g.away.toLowerCase().includes(q))
      .filter(confVisible)
      .filter((g) => weekIsDone || !hasStarted(g))
      .filter((g) => !hiddenSlots.has(slotOf(g)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [games, week, q, hiddenConfs, hiddenSlots, weekIsDone, now]);
  // Extra windows (Sunday/Monday, time not set) only appear when this week has such games.
  const slotOptions = useMemo(() => {
    const present = new Set(games.filter((g) => g.week === week).map(slotOf));
    return SLOTS.filter((o) => !o.extra || present.has(o.key));
  }, [games, week]);
  const card = (g) => (
    <GameCard
      key={g.id} g={g} teams={teams} players={players} th={th} minGames={minGames}
      rankedCount={rankedCount} includeFcs={includeFcs} onOpen={openTeam}
    />
  );

  const controls = (
    <section className="controls" aria-label="Filters">
      {!teamView ? (
        <>
          <label>
            <span>Week</span>
            <select value={week ?? ''} onChange={(e) => setWeek(Number(e.target.value))}>
              {weeks.map((w) => <option key={w} value={w}>Week {w}{w === firstOpen ? ' (next up)' : ''}</option>)}
            </select>
          </label>
          {view === 'games' ? <label>
            <span>Show</span>
            <select value={show} onChange={(e) => setShow(e.target.value)}>
              <option value="all">All games</option>
              <option value="flagged">Any flag</option>
              <option value="over">Both hitting the over</option>
              <option value="under">Both hitting the under</option>
              <option value="ats">ATS mismatch</option>
            </select>
          </label> : null}
          <MultiSelect label="Conferences" options={conferences.map((c) => ({ key: c, label: c }))} hidden={hiddenConfs} setHidden={setHiddenConfs} />
          {view === 'props' ? <MultiSelect label="Kickoff" options={slotOptions} hidden={hiddenSlots} setHidden={setHiddenSlots} /> : null}
        </>
      ) : null}
      <label>
        <span>Flag at {threshold}%+</span>
        <input type="range" min="55" max="85" step="5" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
      </label>
      {!teamView && view === 'games' ? (
        <label>
          <span>Min. games with a line</span>
          <input type="number" min="1" max="12" value={minGames} onChange={(e) => setMinGames(Math.max(1, Number(e.target.value) || 1))} />
        </label>
      ) : null}
      <label className="check">
        <input type="checkbox" checked={includeFcs} onChange={(e) => setIncludeFcs(e.target.checked)} />
        <span>Count FCS games in player props</span>
      </label>
      {!teamView ? (
        <label className="search">
          <span>Team</span>
          <input type="search" placeholder="Search a team" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
      ) : null}
    </section>
  );

  return (
    <main className="wrap">
      <header className="top">
        <h1 className="title">CFB Edge</h1>
        <p className="sub">{year} FBS season. Records are season totals against the closing line. Updated {updated} CT.</p>
      </header>

      {controls}

      {teamView ? (
        <TeamView
          name={teamView} teams={teams} games={games} players={players} th={th}
          includeFcs={includeFcs} rankedCount={rankedCount} onOpen={openTeam} onClose={closeTeam}
        />
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
            <button type="button" role="tab" aria-selected={view === 'props'} className={view === 'props' ? 'on' : ''} onClick={() => setView('props')}>Top props this week</button>
          </div>

          {weekIsDone && week !== null ? <p className="muted weeknote">Week {week} is final. Records and stats shown are current season totals.</p> : null}

          {view === 'props' ? (
            <TopProps games={propGames} teams={teams} players={players} includeFcs={includeFcs} th={th} onOpen={openTeam} />
          ) : weeks.length === 0 ? (
            <p className="notice">No regular-season games posted yet.</p>
          ) : weekGames.length === 0 ? (
            <p className="notice">No games match these filters. Check the conference menu, lower the flag percentage, or switch Show to All games.</p>
          ) : (
            <>
              {openGames.length ? (
                <div className="games">{openGames.map(card)}</div>
              ) : (
                <p className="notice">Every game shown for week {week} has kicked off.</p>
              )}
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
        Data from CollegeFootballData.com. Rankings are among FBS teams, per game. Pushes are left out of percentages.
        Player games count every game a player recorded a pass, rush or catch.
      </footer>
    </main>
  );
}
