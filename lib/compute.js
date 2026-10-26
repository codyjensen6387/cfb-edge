// Pure functions: raw API rows in, per-team summaries out.

// The API has used both snake_case and camelCase over time; accept either.
export const pick = (o, ...keys) => {
  for (const k of keys) if (o && o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
};
const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

export function normalizeGame(g) {
  return {
    id: pick(g, 'id'),
    week: pick(g, 'week'),
    start: pick(g, 'startDate', 'start_date'),
    completed: Boolean(pick(g, 'completed')),
    neutral: Boolean(pick(g, 'neutralSite', 'neutral_site')),
    home: pick(g, 'homeTeam', 'home_team'),
    away: pick(g, 'awayTeam', 'away_team'),
    homePoints: num(pick(g, 'homePoints', 'home_points')),
    awayPoints: num(pick(g, 'awayPoints', 'away_points')),
  };
}

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  if (!s.length) return null;
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Closing consensus line. Spread is from the home team's view (negative = home favored).
// Uses the "consensus" provider when present, otherwise the median of the books listed.
export function consensusLine(lineRow) {
  const books = pick(lineRow, 'lines') || [];
  const consensus = books.find((b) => String(pick(b, 'provider') || '').toLowerCase().includes('consensus'));
  const spreads = books.map((b) => num(pick(b, 'spread'))).filter((v) => v !== null);
  const totals = books.map((b) => num(pick(b, 'overUnder', 'over_under'))).filter((v) => v !== null);
  const spread = (consensus && num(pick(consensus, 'spread'))) ?? median(spreads);
  const total = (consensus && num(pick(consensus, 'overUnder', 'over_under'))) ?? median(totals);
  return { spread, total };
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

export function buildTeams({ fbsTeams, games, linesById, boxScores }) {
  const teams = {};
  for (const t of fbsTeams) {
    const school = pick(t, 'school');
    if (!school) continue;
    teams[school] = blankTeam({
      name: school,
      conference: pick(t, 'conference') || '',
      color: pick(t, 'color') || null,
      logo: (pick(t, 'logos') || [])[0] || null,
    });
  }

  for (const g of games) {
    if (!g.completed || g.homePoints === null || g.awayPoints === null) continue;
    const H = teams[g.home];
    const A = teams[g.away];
    const margin = g.homePoints - g.awayPoints;

    if (H) { H.pts.for += g.homePoints; H.pts.against += g.awayPoints; H.pts.games++; margin > 0 ? H.su.w++ : H.su.l++; }
    if (A) { A.pts.for += g.awayPoints; A.pts.against += g.homePoints; A.pts.games++; margin < 0 ? A.su.w++ : A.su.l++; }

    const line = linesById[g.id];
    if (!line) continue;
    if (line.spread !== null) {
      const cover = margin + line.spread; // > 0 home covers, < 0 away covers
      if (cover === 0) { if (H) H.ats.p++; if (A) A.ats.p++; }
      else {
        if (H) cover > 0 ? H.ats.w++ : H.ats.l++;
        if (A) cover < 0 ? A.ats.w++ : A.ats.l++;
      }
    }
    if (line.total !== null) {
      const sum = g.homePoints + g.awayPoints;
      const key = sum > line.total ? 'o' : sum < line.total ? 'u' : 'p';
      if (H) H.ou[key]++;
      if (A) A.ou[key]++;
    }
  }

  // Box scores: each game lists both teams; one team's offense is the other's defense.
  for (const game of boxScores) {
    const sides = pick(game, 'teams') || [];
    if (sides.length !== 2) continue;
    const parsed = sides.map((s) => {
      const stats = pick(s, 'stats') || [];
      const get = (cat) => num(pick(stats.find((x) => pick(x, 'category') === cat) || {}, 'stat'));
      return { team: pick(s, 'team', 'school'), rush: get('rushingYards'), pass: get('netPassingYards') };
    });
    if (parsed.some((p) => p.rush === null || p.pass === null)) continue;
    for (let i = 0; i < 2; i++) {
      const me = parsed[i], opp = parsed[1 - i];
      const T = teams[me.team];
      if (!T) continue;
      T.yds.rushOff += me.rush; T.yds.passOff += me.pass;
      T.yds.rushDef += opp.rush; T.yds.passDef += opp.pass;
      T.yds.games++;
    }
  }

  // Per-game averages and FBS rankings (1 = best).
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

  // Only what the page needs goes to the browser.
  const out = {};
  for (const t of list) out[t.name] = { name: t.name, conference: t.conference, color: t.color, logo: t.logo, su: t.su, ats: t.ats, ou: t.ou, avg: t.avg, ranks: t.ranks };
  return out;
}
