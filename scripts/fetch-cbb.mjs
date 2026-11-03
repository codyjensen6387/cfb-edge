// Pulls the college basketball season from CollegeBasketballData.com and writes data/cbb.json.
// It keeps a running state file so each run only asks for the last few days and the week ahead,
// plus box scores for games that finished since the last run (about 4 to 6 API calls a run).
//
// In the GitHub Action: writes to data/ (committed). Anywhere else (npm run data): data/local/.

import fs from 'node:fs/promises';
import path from 'node:path';
import { buildCbb, normalizeCbbGame, trimTeamBox, trimPlayerBox, powerConf, espnLogo, consensusLine } from './lib/build-cbb.mjs';
import { pick } from './lib/build.mjs';

const ROOT = process.cwd();
const IN_ACTIONS = process.env.GITHUB_ACTIONS === 'true';
const REPO_DATA = path.join(ROOT, 'data');
const OUT = IN_ACTIONS ? REPO_DATA : path.join(REPO_DATA, 'local');
const DAY = 24 * 3600 * 1000;
const MAX_BOX_TRIES = 6;

async function loadEnvLocal() {
  try {
    const text = await fs.readFile(path.join(ROOT, '.env.local'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* fine in the Action */ }
}

// The 2026-27 season is season 2027 on CollegeBasketballData.
function currentSeason() {
  if (process.env.CBB_SEASON) return Number(process.env.CBB_SEASON);
  const now = new Date();
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
}

let calls = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(route, params) {
  const url = new URL('https://api.collegebasketballdata.com' + route);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  for (let attempt = 1; attempt <= 3; attempt++) {
    calls++;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.CFBD_API_KEY}`, Accept: 'application/json' } });
    if (res.ok) return res.json();
    if (res.status === 401 || res.status === 403) throw new Error(`The basketball API rejected the key (${res.status}). Check CFBD_API_KEY.`);
    if (attempt === 3) throw new Error(`${route} returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
    await sleep(2000 * attempt);
  }
}

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; }
}

// Split [from, to] into windows so no single call hits the API's row limits.
function windows(from, to, days) {
  const out = [];
  for (let a = from.getTime(); a < to.getTime(); a += days * DAY) {
    out.push([new Date(a).toISOString(), new Date(Math.min(a + days * DAY, to.getTime())).toISOString()]);
  }
  return out;
}

async function main() {
  await loadEnvLocal();
  if (!process.env.CFBD_API_KEY) {
    console.error('CFBD_API_KEY is not set. Add it to .env.local, or as a GitHub Actions secret.');
    process.exit(1);
  }

  const season = currentSeason();
  const stateFile = path.join(OUT, 'cbb', `state-${season}.json`);
  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  const state = (await readJson(stateFile))
    ?? (IN_ACTIONS ? null : await readJson(path.join(REPO_DATA, 'cbb', `state-${season}.json`)))
    ?? { season, games: {}, lines: {}, box: {}, players: {}, boxTries: {}, teams: {}, teamsAt: null, lastRun: null };

  const now = new Date();
  const seasonStart = new Date(Date.UTC(season - 1, 9, 25)); // late October

  // Power-conference teams and logos, refreshed weekly.
  if (!state.teamsAt || now - Date.parse(state.teamsAt) > 7 * DAY) {
    const rows = await api('/teams', { season });
    const teams = {};
    for (const t of rows) {
      const conf = powerConf(pick(t, 'conference'));
      const school = pick(t, 'school');
      if (conf && school) teams[school] = { conference: conf, logo: espnLogo(pick(t, 'sourceId')) };
    }
    if (Object.keys(teams).length) { state.teams = teams; state.teamsAt = now.toISOString(); }
  }

  // Schedule and lines: from a couple of days before the last run through the next 8 days.
  const from = state.lastRun ? new Date(Math.max(seasonStart, Math.min(Date.parse(state.lastRun), now) - 2 * DAY)) : seasonStart;
  const to = new Date(now.getTime() + 8 * DAY);
  const isPowerName = (n) => Boolean(state.teams[n]);
  for (const [a, b] of windows(from, to, 10)) {
    const [rows, lines] = await Promise.all([
      api('/games', { season, startDateRange: a, endDateRange: b }),
      api('/lines', { season, startDateRange: a, endDateRange: b }),
    ]);
    for (const row of rows) {
      const g = normalizeCbbGame(row);
      if (g.id === undefined) continue;
      if (g.homeConf || g.awayConf || isPowerName(g.home) || isPowerName(g.away)) state.games[g.id] = g;
    }
    for (const row of lines) {
      const id = pick(row, 'gameId', 'id');
      if (!state.games[id]) continue;
      const line = consensusLine(row);
      if (line.spread !== null || line.total !== null) state.lines[id] = line;
    }
  }

  // Box scores for finished games we don't have yet.
  const missing = Object.values(state.games).filter(
    (g) => g.completed && !state.players[g.id] && (state.boxTries[g.id] ?? 0) < MAX_BOX_TRIES
  );
  if (missing.length) {
    const earliest = new Date(Math.min(...missing.map((g) => Date.parse(g.start))) - DAY / 2);
    for (const [a, b] of windows(earliest, now, 5)) {
      const [teamRows, playerRows] = await Promise.all([
        api('/games/teams', { season, startDateRange: a, endDateRange: b }),
        api('/games/players', { season, startDateRange: a, endDateRange: b }),
      ]);
      for (const row of teamRows) {
        const { id, team, box } = trimTeamBox(row);
        if (!state.games[id] || !isPowerName(team)) continue;
        (state.box[id] ||= {})[team] = box;
      }
      for (const row of playerRows) {
        const { id, team, players } = trimPlayerBox(row);
        if (!state.games[id] || !isPowerName(team) || !players.length) continue;
        (state.players[id] ||= {})[team] = players;
      }
    }
    for (const g of missing) if (!state.players[g.id]) state.boxTries[g.id] = (state.boxTries[g.id] ?? 0) + 1;
  }

  state.lastRun = now.toISOString();
  await fs.writeFile(stateFile, JSON.stringify(state));

  const out = buildCbb(state);
  out.updatedAt = now.toISOString();
  await fs.writeFile(path.join(OUT, 'cbb.json'), JSON.stringify(out));
  console.log(`Saved basketball ${season}: ${out.games.length} games, ${Object.keys(out.teams).length} power teams. API calls this run: ${calls}.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
