// Pure functions for the Champions League: ESPN scoreboard and match summaries in, ucl.json out.
// ESPN's feed is unofficial, so every field is read defensively.

import { pick } from './build.mjs';
import { dayKey } from './build-cbb.mjs';

const num = (v) => {
  if (v && typeof v === 'object') v = v.value ?? v.displayValue;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const round2 = (n) => (n === null ? null : Math.round(n * 100) / 100);

function teamOf(competitor) {
  const t = pick(competitor, 'team') || {};
  const logos = pick(t, 'logos') || [];
  return {
    id: String(pick(t, 'id') ?? ''),
    name: pick(t, 'displayName', 'shortDisplayName', 'name') || null,
    logo: pick(t, 'logo') || pick(logos[0] || {}, 'href') || null,
  };
}

export function normalizeEvent(ev) {
  const comp = (pick(ev, 'competitions') || [])[0] || {};
  const cs = pick(comp, 'competitors') || [];
  const side = (ha) => cs.find((c) => pick(c, 'homeAway') === ha) || {};
  const H = side('home'), A = side('away');
  const type = pick(pick(ev, 'status') || pick(comp, 'status') || {}, 'type') || {};
  const completed = pick(type, 'completed') === true;
  return {
    id: String(pick(ev, 'id')),
    start: pick(ev, 'date') || pick(comp, 'date') || null,
    completed,
    state: pick(type, 'state') || null,
    neutral: Boolean(pick(comp, 'neutralSite')),
    home: teamOf(H),
    away: teamOf(A),
    homeScore: completed ? num(pick(H, 'score')) : null,
    awayScore: completed ? num(pick(A, 'score')) : null,
  };
}

// Stats arrive as [{ name, value }] or as a plain object; return a name -> number map.
function statMap(stats) {
  const out = {};
  if (Array.isArray(stats)) {
    for (const s of stats) {
      const k = pick(s, 'name', 'abbreviation');
      if (k) out[k] = num(pick(s, 'value', 'displayValue'));
    }
  } else if (stats && typeof stats === 'object') {
    for (const [k, v] of Object.entries(stats)) out[k] = num(v);
  }
  return out;
}
const cameOn = (p) => {
  const s = pick(p, 'subbedIn');
  return s === true || (s && typeof s === 'object' && pick(s, 'didSub') === true);
};

// Players who appeared: [athleteId, name, goals, assists, shots, shotsOnTarget, started].
export function trimSummary(summary) {
  return (pick(summary, 'rosters') || []).map((r) => {
    const teamId = String(pick(pick(r, 'team') || {}, 'id') ?? '');
    const players = (pick(r, 'roster') || [])
      .map((p) => {
        const a = pick(p, 'athlete') || {};
        const s = statMap(pick(p, 'stats'));
        const started = pick(p, 'starter') === true;
        const played = started || cameOn(p) || (s.appearances ?? 0) > 0 || (s.totalShots ?? 0) > 0 || (s.totalGoals ?? 0) > 0;
        const name = pick(a, 'displayName', 'fullName', 'shortName');
        if (!played || !name) return null;
        return [String(pick(a, 'id') ?? name), name, s.totalGoals ?? 0, s.goalAssists ?? 0, s.totalShots ?? 0, s.shotsOnTarget ?? 0, started ? 1 : 0];
      })
      .filter(Boolean);
    return { teamId, players };
  }).filter((r) => r.teamId && r.players.length);
}

export function buildUcl(state) {
  const events = Object.values(state.events)
    .filter((e) => e.home.name && e.away.name && e.start)
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));

  const T = {};
  const team = (t) => (T[t.id] ||= {
    id: t.id, name: t.name, logo: t.logo, w: 0, d: 0, l: 0,
    all: { g: 0, gf: 0, ga: 0 }, home: { g: 0, gf: 0, ga: 0 }, away: { g: 0, gf: 0, ga: 0 },
  });
  for (const e of events) {
    const H = team(e.home), A = team(e.away);
    H.logo ||= e.home.logo; A.logo ||= e.away.logo;
    if (!e.completed || e.homeScore === null || e.awayScore === null) continue;
    // A neutral-site final counts toward overall only, not the home or away split.
    const add = (t, split, gf, ga) => {
      for (const k of e.neutral ? ['all'] : ['all', split]) { t[k].g++; t[k].gf += gf; t[k].ga += ga; }
      gf > ga ? t.w++ : gf < ga ? t.l++ : t.d++;
    };
    add(H, 'home', e.homeScore, e.awayScore);
    add(A, 'away', e.awayScore, e.homeScore);
  }

  const list = Object.values(T);
  const per = (s, k) => (s.g ? s[k] / s.g : null);
  for (const t of list) {
    t.avg = {
      gf: per(t.all, 'gf'), ga: per(t.all, 'ga'),
      homeGf: per(t.home, 'gf'), homeGa: per(t.home, 'ga'),
      awayGf: per(t.away, 'gf'), awayGa: per(t.away, 'ga'),
    };
    t.ranks = {};
  }
  const rankBy = (key, higherIsBetter) => {
    const rated = list.filter((t) => t.avg[key] !== null)
      .sort((a, b) => (higherIsBetter ? b.avg[key] - a.avg[key] : a.avg[key] - b.avg[key]));
    rated.forEach((t, i) => {
      const prev = rated[i - 1];
      t.ranks[key] = prev && prev.avg[key] === t.avg[key] ? prev.ranks[key] : i + 1;
    });
  };
  rankBy('gf', true); rankBy('homeGf', true); rankBy('awayGf', true);
  rankBy('ga', false); rankBy('homeGa', false); rankBy('awayGa', false);

  const teams = {};
  for (const t of list) {
    teams[t.name] = {
      name: t.name, logo: t.logo, w: t.w, d: t.d, l: t.l,
      games: { all: t.all.g, home: t.home.g, away: t.away.g },
      avg: Object.fromEntries(Object.entries(t.avg).map(([k, v]) => [k, round2(v)])),
      ranks: t.ranks,
    };
  }

  const games = events.map((e) => ({
    id: e.id, start: e.start, date: dayKey(e.start, false), completed: e.completed, neutral: e.neutral,
    home: e.home.name, away: e.away.name, homeScore: e.homeScore, awayScore: e.awayScore,
  }));

  // Player logs: [yyyymmdd, goals, assists, shots, shotsOnTarget, started].
  const nameById = Object.fromEntries(list.map((t) => [t.id, t.name]));
  const byTeam = {};
  for (const e of events) {
    if (!e.completed) continue;
    const sides = state.box[e.id];
    if (!sides) continue;
    const date = Number(dayKey(e.start, false).replace(/-/g, ''));
    for (const [teamId, players] of Object.entries(sides)) {
      const teamName = nameById[teamId];
      if (!teamName) continue;
      const roster = (byTeam[teamName] ||= {});
      for (const [id, name, goals, ast, shots, sot, started] of players) {
        (roster[id] ||= { n: name, g: [] }).g.push([date, goals, ast, shots, sot, started]);
      }
    }
  }
  const players = {};
  for (const [teamName, roster] of Object.entries(byTeam)) {
    const score = (p) => p.g.reduce((s, x) => s + x[3] + 2 * x[1], 0);
    players[teamName] = Object.values(roster).sort((a, b) => score(b) - score(a)).slice(0, 10);
  }

  return { season: state.season, teams, games, players };
}
