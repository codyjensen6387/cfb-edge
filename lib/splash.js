// Reads text copied from the Splash Sports pick'em page and compares it with current lines.

const STATUS = /^(preview|final|live|in progress|halftime|delayed|postponed|canceled|cancelled)$/i;
const SPREAD = /^([+-]\d+(?:\.\d+)?|pk|pick|pick'?em|even)$/i;
const RECORD = /^\d+-\d+(?:-\d+)?$/;
const TOTAL = /^o\s*(\d+(?:\.\d+)?)$/i;
const SCORE = /^\d{1,3}$/;
const DAY_HEADER = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday),\s+[a-z]{3,9}\.?\s+\d{1,2}$/i;
const KICK = /^(mon|tue|wed|thu|fri|sat|sun)\s+\d{1,2}(:\d{2})?\s*(am|pm)$/i;

const NFL_NICKNAMES = new Set([
  'cardinals', 'falcons', 'ravens', 'bills', 'panthers', 'bears', 'bengals', 'browns', 'cowboys', 'broncos',
  'lions', 'packers', 'texans', 'colts', 'jaguars', 'chiefs', 'raiders', 'chargers', 'rams', 'dolphins',
  'vikings', 'patriots', 'saints', 'giants', 'jets', 'eagles', 'steelers', '49ers', 'seahawks', 'buccaneers',
  'titans', 'commanders',
]);

const spreadValue = (s) => (/^[+-]/.test(s) ? parseFloat(s) : 0);

export function parseSplash(text) {
  const L = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const joined = L.join('\n');
  const nflWeek = Number(joined.match(/NFL Week\s+(\d+)/i)?.[1]) || null;
  const cfbWeek = Number(joined.match(/CFB Week\s+(\d+)/i)?.[1]) || null;
  const lockIdx = L.findIndex((l) => /^picks lock/i.test(l));
  const lock = lockIdx >= 0 ? L[lockIdx + 1] || null : null;

  const games = [];
  let day = null;
  for (let i = 0; i < L.length; i++) {
    if (DAY_HEADER.test(L[i])) { day = L[i]; continue; }
    if (!STATUS.test(L[i])) continue;

    // Before the status: "Team A / score / - / score / Team B" when final, else "Team A / Team B".
    let teamA, teamB, scoreA = null, scoreB = null;
    if (L[i - 3] === '-' && SCORE.test(L[i - 2] || '') && SCORE.test(L[i - 4] || '')) {
      teamB = L[i - 1]; scoreB = Number(L[i - 2]); scoreA = Number(L[i - 4]); teamA = L[i - 5];
    } else {
      teamB = L[i - 1]; teamA = L[i - 2];
    }
    if (!teamA || !teamB) continue;

    // After it: kickoff time, then each team's abbreviation, record and spread, then O and U.
    let time = null;
    const abbrs = [], spreads = [];
    let total = null;
    for (let j = i + 1; j < L.length && !STATUS.test(L[j]); j++) {
      if (!time && KICK.test(L[j])) time = L[j];
      else if (RECORD.test(L[j]) && abbrs.length < 2) abbrs.push(L[j - 1]);
      else if (SPREAD.test(L[j]) && spreads.length < 2) spreads.push(spreadValue(L[j]));
      else if (total === null && TOTAL.test(L[j])) total = parseFloat(L[j].match(TOTAL)[1]);
      if (spreads.length === 2 && total !== null) break;
    }
    if (!spreads.length && total === null) continue;

    const league = NFL_NICKNAMES.has(canon(teamA)) && NFL_NICKNAMES.has(canon(teamB)) ? 'nfl' : 'cfb';
    games.push({
      key: `${league}:${teamA}:${teamB}`,
      league, teamA, teamB,
      abbrA: abbrs[0] || null, abbrB: abbrs[1] || null,
      spreadA: spreads.length ? spreads[0] : null,
      total,
      status: L[i].toLowerCase(),
      scoreA, scoreB, day, time,
    });
  }
  return { nflWeek, cfbWeek, lock, games };
}

// ---------- Team names ----------

export function norm(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’ʻ`]/g, '')
    .replace(/&/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Names that differ between Splash, CollegeFootballData and ESPN map to one spelling.
const ALIAS = {
  'miami fl': 'miami', 'miami florida': 'miami', 'umass': 'massachusetts',
  'louisiana monroe': 'ul monroe', 'ulm': 'ul monroe', 'app state': 'appalachian state',
  'southern miss': 'southern mississippi', 'uconn': 'connecticut', 'ole miss': 'mississippi',
  'fiu': 'florida international', 'fau': 'florida atlantic', 'sam houston state': 'sam houston',
  'north carolina state': 'nc state', 'ut san antonio': 'utsa', 'central florida': 'ucf',
  'louisiana lafayette': 'louisiana', 'ul lafayette': 'louisiana', 'middle tennessee state': 'middle tennessee',
  'pitt': 'pittsburgh', 'southern california': 'usc', 'texas el paso': 'utep', 'hawaii rainbow warriors': 'hawaii',
};
export const canon = (s) => { const n = norm(s); return ALIAS[n] ?? n; };

// 3 = same name, 2 = one name starts the other ("sam houston" / "sam houston bearkats"), or same abbreviation.
function nameScore(splashName, splashAbbr, side) {
  const a = canon(splashName);
  let best = 0;
  for (const n of side.names) {
    const b = canon(n);
    if (!b) continue;
    if (a === b) return 3;
    if (b.startsWith(a + ' ') || a.startsWith(b + ' ') || b.endsWith(' ' + a)) best = Math.max(best, 2);
  }
  if (splashAbbr && side.abbr && norm(splashAbbr) === norm(side.abbr)) best = Math.max(best, 2);
  return best;
}

// Find the current game with both teams; returns it with which side is Splash's Team A.
export function matchGame(g, current) {
  let best = null;
  for (const c of current) {
    if (c.league !== g.league) continue;
    for (const aIsHome of [true, false]) {
      const sideA = aIsHome ? c.homeSide : c.awaySide;
      const sideB = aIsHome ? c.awaySide : c.homeSide;
      const sa = nameScore(g.teamA, g.abbrA, sideA);
      const sb = nameScore(g.teamB, g.abbrB, sideB);
      if (sa < 2 || sb < 2) continue;
      const score = sa + sb;
      if (!best || score > best.score) best = { game: c, aIsHome, score };
    }
  }
  return best;
}

// ---------- Movement ----------

// Key margins (3, 7, 10) the line moved across, landed on, or moved off of.
const KEYS = [-10, -7, -3, 3, 7, 10];
function crossedKeys(from, to) {
  if (from === null || to === null || from === to) return [];
  const lo = Math.min(from, to), hi = Math.max(from, to);
  return [...new Set(KEYS.filter((k) => (lo < k && k < hi) || k === lo || k === hi).map(Math.abs))];
}

// Positive `spreadMove` means the market moved toward Team B; negative, toward Team A.
export function compare(g, match) {
  const c = match.game;
  const curA = c.spread === null ? null : match.aIsHome ? c.spread : -c.spread;
  const spreadMove = g.spreadA === null || curA === null ? null : Math.round((curA - g.spreadA) * 10) / 10;
  const totalMove = g.total === null || c.total === null ? null : Math.round((c.total - g.total) * 10) / 10;

  let spreadValue = null;
  if (spreadMove) {
    const aSide = spreadMove < 0;
    spreadValue = { team: aSide ? g.teamA : g.teamB, line: aSide ? g.spreadA : -g.spreadA, market: aSide ? curA : -curA };
  }
  const flipped = spreadMove !== null && g.spreadA !== 0 && curA !== 0 && Math.sign(g.spreadA) !== Math.sign(curA);
  return {
    curA, curTotal: c.total, spreadMove, totalMove, spreadValue,
    totalValue: totalMove ? (totalMove > 0 ? 'Over' : 'Under') : null,
    keys: spreadMove ? crossedKeys(g.spreadA, curA) : [],
    flipped,
    src: c.src, start: c.start,
  };
}
