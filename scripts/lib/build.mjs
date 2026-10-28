// Pure functions: raw CollegeFootballData rows in, the site's season.json out.

// The API has used both snake_case and camelCase over time; accept either.
export const pick = (o, ...keys) => {
  for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};
const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const round1 = (n) => (n === null ? null : Math.round(n * 10) / 10);

export function normalizeGame(g) {
  return {
    id: pick(g, 'id'),
    week: pick(g, 'week'),
    start: pick(g, 'startDate', 'start_date') || null,
    completed: Boolean(pick(g, 'completed')),
    neutral: Boolean(pick(g, 'neutralSite', 'neutral_site')),
    home: pick(g, 'homeTeam', 'home_team'),
    away: pick(g, 'awayTeam', 'away_team'),
    homePoints: num(pick(g, 'homePoints', 'home_points')),
    awayPoints: num(pick(g, 'awayPoints', 'away_points')),
  };
}

// Which number to use when sources disagree. Real sportsbooks first, by the number most of
// them agree on (ties go to this order). CFBD's "consensus" entry and model sites are fallbacks,
// since they can be averages like -0.25 that no book actually posts.
const PREFERRED = ['draftkings', 'espn bet', 'fanduel', 'betmgm', 'caesars', 'william hill', 'bovada'];
const NOT_A_BOOK = ['consensus', 'numberfire', 'teamrankings'];
const prefRank = (name) => {
  const i = PREFERRED.findIndex((p) => name.toLowerCase().includes(p));
  return i === -1 ? PREFERRED.length : i;
};
const toHalf = (v) => Math.round(v * 2) / 2;

function chooseNumber(books, key) {
  const withValue = books.filter((b) => b[key] !== null);
  if (!withValue.length) return { value: null, src: null };
  const real = withValue.filter((b) => !NOT_A_BOOK.some((x) => b.name.toLowerCase().includes(x)));
  const pool = real.length ? real : withValue;
  const counts = new Map();
  for (const b of pool) counts.set(b[key], (counts.get(b[key]) || 0) + 1);
  const most = Math.max(...counts.values());
  const best = pool.filter((b) => counts.get(b[key]) === most).sort((a, b) => prefRank(a.name) - prefRank(b.name))[0];
  const others = most - 1;
  return { value: toHalf(best[key]), src: others ? `${best.name} and ${others} more` : best.name };
}

// Closing line for a game. Spread is from the home team's view (negative = home favored).
export function consensusLine(lineRow) {
  const books = (pick(lineRow, 'lines') || []).map((b) => ({
    name: String(pick(b, 'provider') || 'Unknown'),
    spread: num(pick(b, 'spread')),
    total: num(pick(b, 'overUnder', 'over_under')),
  }));
  const spread = chooseNumber(books, 'spread');
  const total = chooseNumber(books, 'total');
  return { spread: spread.value, total: total.value, spreadSrc: spread.src, totalSrc: total.src };
}

// Keep only what the site uses from the per-week box score endpoints.
export function trimTeamBox(rows) {
  return rows.map((game) => ({
    id: pick(game, 'id'),
    teams: (pick(game, 'teams') || []).map((s) => {
      const stats = pick(s, 'stats') || [];
      const get = (cat) => num(pick(stats.find((x) => pick(x, 'category') === cat) || {}, 'stat'));
      return { team: pick(s, 'team', 'school'), rush: get('rushingYards'), pass: get('netPassingYards') };
    }),
  }));
}

const CAT = { passing: 'p', rushing: 'r', receiving: 'c' };
const TYPE = { YDS: 'y', TD: 'td', REC: 'r' }; // receiving REC becomes 'cr' (receptions)

export function trimPlayerBox(rows) {
  return rows.map((game) => ({
    id: pick(game, 'id'),
    teams: (pick(game, 'teams') || []).map((side) => {
      const players = {};
      for (const cat of pick(side, 'categories') || []) {
        const c = CAT[String(pick(cat, 'name') || '').toLowerCase()];
        if (!c) continue;
        for (const type of pick(cat, 'types') || []) {
          const t = TYPE[String(pick(type, 'name') || '').toUpperCase()];
          if (!t) continue;
          for (const a of pick(type, 'athletes') || []) {
            const name = String(pick(a, 'name') || '').trim();
            if (!name || name.toLowerCase() === 'team') continue;
            const id = String(pick(a, 'id') ?? name);
            const p = (players[id] ||= { n: name, py: 0, ptd: 0, ry: 0, rtd: 0, cy: 0, ctd: 0, cr: 0 });
            p[c + t] = num(pick(a, 'stat')) ?? 0;
          }
        }
      }
      return { team: pick(side, 'team', 'school'), players };
    }),
  }));
}

const blankTeam = (info) => ({
  ...info,
  su: { w: 0, l: 0 },
  ats: { w: 0, l: 0, p: 0 },
  ou: { o: 0, u: 0, p: 0 },
  pts: { for: 0, against: 0, games: 0 },
  yds: { passOff: 0, rushOff: 0, passDef: 0, rushDef: 0, games: 0 },
  ranks: {},
});

function buildTeams(fbsTeams, games, teamBox) {
  const teams = {};
  for (const t of fbsTeams) {
    const school = pick(t, 'school');
    if (!school) continue;
    teams[school] = blankTeam({
      name: school,
      conference: pick(t, 'conference') || '',
      logo: (pick(t, 'logos') || [])[0] || null,
    });
  }

  for (const g of games) {
    if (!g.completed || g.homePoints === null || g.awayPoints === null) continue;
    const H = teams[g.home], A = teams[g.away];
    const margin = g.homePoints - g.awayPoints;
    if (H) { H.pts.for += g.homePoints; H.pts.against += g.awayPoints; H.pts.games++; margin > 0 ? H.su.w++ : H.su.l++; }
    if (A) { A.pts.for += g.awayPoints; A.pts.against += g.homePoints; A.pts.games++; margin < 0 ? A.su.w++ : A.su.l++; }

    if (g.spread !== null) {
      const cover = margin + g.spread; // > 0 home covers, < 0 away covers
      if (cover === 0) { if (H) H.ats.p++; if (A) A.ats.p++; }
      else {
        if (H) cover > 0 ? H.ats.w++ : H.ats.l++;
        if (A) cover < 0 ? A.ats.w++ : A.ats.l++;
      }
    }
    if (g.total !== null) {
      const sum = g.homePoints + g.awayPoints;
      const key = sum > g.total ? 'o' : sum < g.total ? 'u' : 'p';
      if (H) H.ou[key]++;
      if (A) A.ou[key]++;
    }
  }

  // One team's offense is the other team's defense.
  for (const game of teamBox) {
    const sides = game.teams;
    if (sides.length !== 2 || sides.some((s) => s.rush === null || s.pass === null)) continue;
    for (let i = 0; i < 2; i++) {
      const me = sides[i], opp = sides[1 - i];
      const T = teams[me.team];
      if (!T) continue;
      T.yds.rushOff += me.rush; T.yds.passOff += me.pass;
      T.yds.rushDef += opp.rush; T.yds.passDef += opp.pass;
      T.yds.games++;
    }
  }

  const list = Object.values(teams);
  for (const t of list) {
    const pg = t.pts.games, yg = t.yds.games;
    t.avg = {
      ppg: pg ? t.pts.for / pg : null,
      ppgAllowed: pg ? t.pts.against / pg : null,
      passOff: yg ? t.yds.passOff / yg : null,
      rushOff: yg ? t.yds.rushOff / yg : null,
      passDef: yg ? t.yds.passDef / yg : null,
      rushDef: yg ? t.yds.rushDef / yg : null,
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
  rankBy('ppg', true); rankBy('passOff', true); rankBy('rushOff', true);
  rankBy('ppgAllowed', false); rankBy('passDef', false); rankBy('rushDef', false);

  const out = {};
  for (const t of list) {
    const avg = Object.fromEntries(Object.entries(t.avg).map(([k, v]) => [k, round1(v)]));
    out[t.name] = { name: t.name, conference: t.conference, logo: t.logo, su: t.su, ats: t.ats, ou: t.ou, avg, ranks: t.ranks };
  }
  return out;
}

// Per-player game logs: [week, fcsGame, passYds, passTd, rushYds, rushTd, recYds, recTd, receptions].
// Only players who could make a team's top lists are kept, to keep the page light.
function buildPlayers(fbs, gamesById, playerBox) {
  const byTeam = {};
  for (const game of playerBox) {
    const g = gamesById[game.id];
    if (!g || !g.completed) continue;
    for (const side of game.teams) {
      if (!fbs.has(side.team)) continue;
      const roster = (byTeam[side.team] ||= {});
      for (const [id, p] of Object.entries(side.players)) {
        const entry = (roster[id] ||= { n: p.n, g: [] });
        entry.g.push([g.week, g.fcs ? 1 : 0, p.py, p.ptd, p.ry, p.rtd, p.cy, p.ctd, p.cr ?? 0]);
      }
    }
  }

  const out = {};
  for (const [team, roster] of Object.entries(byTeam)) {
    const all = Object.values(roster).map((p) => {
      p.g.sort((a, b) => a[0] - b[0]);
      const sum = (i) => p.g.reduce((s, x) => s + x[i], 0);
      return { p, td: sum(5) + sum(7), py: sum(2), ry: sum(4), cy: sum(6) };
    });
    const keep = new Set();
    const top = (key, k) => all.filter((x) => x[key] > 0).sort((a, b) => b[key] - a[key]).slice(0, k).forEach((x) => keep.add(x.p));
    top('td', 5); top('py', 2); top('ry', 4); top('cy', 5);
    out[team] = [...keep];
  }
  return out;
}

export function buildSeason({ year, fbsTeams, games, rawLines, weeks }) {
  const fbs = new Set(fbsTeams.map((t) => pick(t, 'school')));
  const linesById = {};
  for (const row of rawLines) linesById[pick(row, 'id')] = consensusLine(row);

  const fullGames = games.map((g) => {
    const line = linesById[g.id] || { spread: null, total: null, spreadSrc: null, totalSrc: null };
    return {
      ...g, spread: line.spread, total: line.total, spreadSrc: line.spreadSrc, totalSrc: line.totalSrc,
      fcs: !(fbs.has(g.home) && fbs.has(g.away)),
    };
  });
  const gamesById = Object.fromEntries(fullGames.map((g) => [g.id, g]));

  const teams = buildTeams(fbsTeams, fullGames, weeks.flatMap((w) => w.teams));
  const players = buildPlayers(fbs, gamesById, weeks.flatMap((w) => w.players));

  const sorted = fullGames.sort((a, b) => a.week - b.week || String(a.start).localeCompare(String(b.start)));
  return { year, teams, games: sorted, players };
}
