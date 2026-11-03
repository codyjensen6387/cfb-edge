// Pure functions for college basketball: CollegeBasketballData rows in, the site's cbb.json out.
// Only teams in the six power conferences get records, rankings and player props.

import { pick, consensusLine } from './build.mjs';

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const round1 = (n) => (n === null ? null : Math.round(n * 10) / 10);

// Conference names show up as abbreviations or full names; map all of them.
const POWER = {
  acc: 'ACC', atlanticcoast: 'ACC',
  big12: 'Big 12', b12: 'Big 12', bigtwelve: 'Big 12',
  bigeast: 'Big East', be: 'Big East',
  bigten: 'Big Ten', big10: 'Big Ten', b1g: 'Big Ten', b10: 'Big Ten',
  sec: 'SEC', southeastern: 'SEC',
  pac12: 'Pac-12', p12: 'Pac-12', pacific12: 'Pac-12', pac: 'Pac-12',
};
export const POWER_CONFS = ['ACC', 'Big 12', 'Big East', 'Big Ten', 'SEC', 'Pac-12'];
export function powerConf(name) {
  if (!name) return null;
  const key = String(name).toLowerCase().replace(/conference/g, '').replace(/[^a-z0-9]/g, '');
  return POWER[key] || null;
}

export const espnLogo = (sourceId) => (sourceId ? `https://a.espncdn.com/i/teamlogos/ncaa/500/${sourceId}.png` : null);

// Calendar day in Central time ("2026-11-02"). TBD games only have a real date, read in UTC.
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' });
export function dayKey(start, tbd) {
  if (!start) return null;
  const d = new Date(start);
  return tbd ? d.toISOString().slice(0, 10) : dayFmt.format(d);
}

export function normalizeCbbGame(g) {
  const status = String(pick(g, 'status') || '').toLowerCase();
  const homePoints = num(pick(g, 'homePoints', 'home_points'));
  const awayPoints = num(pick(g, 'awayPoints', 'away_points'));
  const start = pick(g, 'startDate', 'start_date') || null;
  const oldEnough = start && Date.now() - Date.parse(start) > 4 * 3600 * 1000;
  return {
    id: pick(g, 'id'),
    start,
    tbd: Boolean(pick(g, 'startTimeTbd', 'startTimeTBD', 'start_time_tbd')),
    neutral: Boolean(pick(g, 'neutralSite', 'neutral_site')),
    status,
    completed: status === 'final' || (!status && homePoints !== null && awayPoints !== null && oldEnough),
    home: pick(g, 'homeTeam', 'home_team'),
    away: pick(g, 'awayTeam', 'away_team'),
    homeConf: powerConf(pick(g, 'homeConference', 'home_conference')),
    awayConf: powerConf(pick(g, 'awayConference', 'away_conference')),
    homePoints,
    awayPoints,
  };
}

// One team's side of a game box score.
export function trimTeamBox(row) {
  const t = pick(row, 'teamStats') || {};
  const o = pick(row, 'opponentStats') || {};
  const fg = (s, k) => num(pick(pick(s, 'fieldGoals') || {}, k));
  const tp = (s, k) => num(pick(pick(s, 'threePointFieldGoals') || {}, k));
  const reb = (s) => num(pick(pick(s, 'rebounds') || {}, 'total'));
  return {
    id: pick(row, 'gameId', 'id'),
    team: pick(row, 'team'),
    box: {
      fgm: fg(t, 'made'), fga: fg(t, 'attempted'), tpm: tp(t, 'made'), tpa: tp(t, 'attempted'), reb: reb(t),
      ofgm: fg(o, 'made'), ofga: fg(o, 'attempted'), otpm: tp(o, 'made'), otpa: tp(o, 'attempted'), oreb: reb(o),
    },
  };
}

// One team's players from a game: [athleteId, name, minutes, points, rebounds, assists, threesMade].
export function trimPlayerBox(row) {
  const players = (pick(row, 'players') || [])
    .map((p) => [
      String(pick(p, 'athleteId', 'id') ?? pick(p, 'name')),
      String(pick(p, 'name') || '').trim(),
      num(pick(p, 'minutes')) ?? 0,
      num(pick(p, 'points')) ?? 0,
      num(pick(pick(p, 'rebounds') || {}, 'total')) ?? 0,
      num(pick(p, 'assists')) ?? 0,
      num(pick(pick(p, 'threePointFieldGoals') || {}, 'made')) ?? 0,
    ])
    .filter((p) => p[1] && (p[2] > 0 || p[3] > 0));
  return { id: pick(row, 'gameId', 'id'), team: pick(row, 'team'), players };
}

export function buildCbb(state) {
  const powerTeams = { ...state.teams };
  // Fall back to the conferences on game rows if the team list missed anyone.
  for (const g of Object.values(state.games)) {
    if (g.homeConf && !powerTeams[g.home]) powerTeams[g.home] = { conference: g.homeConf, logo: null };
    if (g.awayConf && !powerTeams[g.away]) powerTeams[g.away] = { conference: g.awayConf, logo: null };
  }
  const isPower = (name) => Boolean(powerTeams[name]);

  const games = Object.values(state.games)
    .filter((g) => (isPower(g.home) || isPower(g.away)) && g.status !== 'cancelled')
    .map((g) => {
      const line = state.lines[g.id] || {};
      return {
        id: g.id, start: g.start, tbd: g.tbd, neutral: g.neutral, completed: g.completed,
        date: dayKey(g.start, g.tbd),
        home: g.home, away: g.away, homePoints: g.homePoints, awayPoints: g.awayPoints,
        spread: line.spread ?? null, total: line.total ?? null,
        spreadSrc: line.spreadSrc ?? null, totalSrc: line.totalSrc ?? null,
      };
    })
    .filter((g) => g.date)
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
  const gamesById = Object.fromEntries(games.map((g) => [g.id, g]));

  // Team records, ATS, O/U and per-game stats.
  const T = {};
  for (const [name, info] of Object.entries(powerTeams)) {
    T[name] = {
      name, conference: info.conference, logo: info.logo,
      su: { w: 0, l: 0 }, ats: { w: 0, l: 0, p: 0 }, ou: { o: 0, u: 0, p: 0 },
      pts: { for: 0, against: 0, games: 0 },
      box: { fgm: 0, fga: 0, tpm: 0, tpa: 0, reb: 0, ofgm: 0, ofga: 0, otpm: 0, otpa: 0, oreb: 0, games: 0 },
      ranks: {},
    };
  }
  for (const g of games) {
    if (!g.completed || g.homePoints === null || g.awayPoints === null) continue;
    const H = T[g.home], A = T[g.away];
    const margin = g.homePoints - g.awayPoints;
    if (H) { H.pts.for += g.homePoints; H.pts.against += g.awayPoints; H.pts.games++; margin > 0 ? H.su.w++ : H.su.l++; }
    if (A) { A.pts.for += g.awayPoints; A.pts.against += g.homePoints; A.pts.games++; margin < 0 ? A.su.w++ : A.su.l++; }
    if (g.spread !== null) {
      const cover = margin + g.spread;
      if (cover === 0) { if (H) H.ats.p++; if (A) A.ats.p++; }
      else {
        if (H) cover > 0 ? H.ats.w++ : H.ats.l++;
        if (A) cover < 0 ? A.ats.w++ : A.ats.l++;
      }
    }
    if (g.total !== null) {
      const sum = g.homePoints + g.awayPoints;
      const k = sum > g.total ? 'o' : sum < g.total ? 'u' : 'p';
      if (H) H.ou[k]++;
      if (A) A.ou[k]++;
    }
  }
  for (const [gameId, sides] of Object.entries(state.box)) {
    if (!gamesById[gameId]) continue;
    for (const [team, b] of Object.entries(sides)) {
      const t = T[team];
      if (!t || Object.values(b).some((v) => v === null)) continue;
      for (const k of Object.keys(b)) t.box[k] += b[k];
      t.box.games++;
    }
  }
  const list = Object.values(T);
  const ratio = (m, a) => (a > 0 ? (100 * m) / a : null);
  for (const t of list) {
    const pg = t.pts.games, b = t.box, bg = b.games;
    t.avg = {
      ppg: pg ? t.pts.for / pg : null,
      ppgAllowed: pg ? t.pts.against / pg : null,
      fgPct: bg ? ratio(b.fgm, b.fga) : null,
      tpPct: bg ? ratio(b.tpm, b.tpa) : null,
      rpg: bg ? b.reb / bg : null,
      oFgPct: bg ? ratio(b.ofgm, b.ofga) : null,
      oTpPct: bg ? ratio(b.otpm, b.otpa) : null,
      orpg: bg ? b.oreb / bg : null,
    };
  }
  const rankBy = (key, higherIsBetter) => {
    const rated = list.filter((t) => t.avg[key] !== null)
      .sort((a, b) => (higherIsBetter ? b.avg[key] - a.avg[key] : a.avg[key] - b.avg[key]));
    rated.forEach((t, i) => {
      const prev = rated[i - 1];
      t.ranks[key] = prev && prev.avg[key] === t.avg[key] ? prev.ranks[key] : i + 1;
    });
  };
  rankBy('ppg', true); rankBy('fgPct', true); rankBy('tpPct', true); rankBy('rpg', true);
  rankBy('ppgAllowed', false); rankBy('oFgPct', false); rankBy('oTpPct', false); rankBy('orpg', false);

  const teams = {};
  for (const t of list) {
    const avg = Object.fromEntries(Object.entries(t.avg).map(([k, v]) => [k, round1(v)]));
    teams[t.name] = { name: t.name, conference: t.conference, logo: t.logo, su: t.su, ats: t.ats, ou: t.ou, avg, ranks: t.ranks };
  }

  // Player game logs: [yyyymmdd, opponentIsPower, minutes, points, rebounds, assists, threesMade].
  const byTeam = {};
  for (const [gameId, sides] of Object.entries(state.players)) {
    const g = gamesById[gameId];
    if (!g || !g.completed) continue;
    const date = Number(g.date.replace(/-/g, ''));
    for (const [team, players] of Object.entries(sides)) {
      if (!T[team]) continue;
      const opp = team === g.home ? g.away : g.home;
      const roster = (byTeam[team] ||= {});
      for (const [id, name, min, pts, reb, ast, tpm] of players) {
        const e = (roster[id] ||= { n: name, g: [] });
        e.g.push([date, isPower(opp) ? 1 : 0, min, pts, reb, ast, tpm]);
      }
    }
  }
  const players = {};
  for (const [team, roster] of Object.entries(byTeam)) {
    players[team] = Object.values(roster)
      .map((p) => ({ ...p, g: p.g.sort((a, b) => a[0] - b[0]) }))
      .sort((a, b) => b.g.reduce((s, x) => s + x[2], 0) - a.g.reduce((s, x) => s + x[2], 0))
      .slice(0, 8);
  }

  return { season: state.season, teams, games, players };
}

export { consensusLine };
