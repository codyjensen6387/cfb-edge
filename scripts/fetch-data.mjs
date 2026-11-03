// Pulls the season from CollegeFootballData.com and writes data/season.json.
// Finished weeks are saved once and reused, so each run only costs a few API calls.
//
// In the GitHub Action: writes to data/ (committed, and Vercel rebuilds the site).
// Anywhere else (npm run data): writes to data/local/, which is never committed.

import fs from 'node:fs/promises';
import path from 'node:path';
import { buildSeason, normalizeGame, trimTeamBox, trimPlayerBox, pick } from './lib/build.mjs';

const ROOT = process.cwd();
const IN_ACTIONS = process.env.GITHUB_ACTIONS === 'true';
const REPO_DATA = path.join(ROOT, 'data');
const OUT = IN_ACTIONS ? REPO_DATA : path.join(REPO_DATA, 'local');
const MAX_RETRIES_FOR_MISSING = 6;
// Bump when the saved week format changes; older saved weeks get re-pulled once.
const WEEK_FORMAT = 2; // 2 = adds receptions

async function loadEnvLocal() {
  try {
    const text = await fs.readFile(path.join(ROOT, '.env.local'), 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch { /* no .env.local; fine in the Action */ }
}

function currentSeason() {
  if (process.env.CFB_SEASON) return Number(process.env.CFB_SEASON);
  const now = new Date();
  return now.getUTCMonth() < 6 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
}

let calls = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(route, params) {
  const url = new URL('https://api.collegefootballdata.com' + route);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  for (let attempt = 1; attempt <= 3; attempt++) {
    calls++;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${process.env.CFBD_API_KEY}`, Accept: 'application/json' } });
    if (res.ok) return res.json();
    if (res.status === 401 || res.status === 403) throw new Error(`The API key was rejected (${res.status}). Check CFBD_API_KEY.`);
    if (attempt === 3) throw new Error(`${route} returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
    await sleep(2000 * attempt);
  }
}

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; }
}

async function main() {
  await loadEnvLocal();
  if (!process.env.CFBD_API_KEY) {
    console.error('CFBD_API_KEY is not set. Add it to .env.local, or as a GitHub Actions secret.');
    process.exit(1);
  }

  const year = currentSeason();
  const base = { year, seasonType: 'regular' };
  const [fbsTeams, rawGames, rawLines] = await Promise.all([
    api('/teams/fbs', { year }),
    api('/games', { ...base, classification: 'fbs' }),
    api('/lines', base),
  ]);

  const fbs = new Set(fbsTeams.map((t) => pick(t, 'school')));
  const games = rawGames.map(normalizeGame).filter((g) => fbs.has(g.home) || fbs.has(g.away));

  const weeksDir = path.join(OUT, 'weeks', String(year));
  const repoWeeksDir = path.join(REPO_DATA, 'weeks', String(year));
  await fs.mkdir(weeksDir, { recursive: true });

  const playedWeeks = [...new Set(games.filter((g) => g.completed).map((g) => g.week))].sort((a, b) => a - b);
  const weeks = [];
  for (const week of playedWeeks) {
    const file = path.join(weeksDir, `week-${week}.json`);
    // Locally, reuse what the Action already saved before spending API calls.
    let saved = (await readJson(file)) ?? (IN_ACTIONS ? null : await readJson(path.join(repoWeeksDir, `week-${week}.json`)));

    const completed = games.filter((g) => g.week === week && g.completed).map((g) => g.id);
    const missing = (wk) => {
      const have = new Set((wk?.players || []).map((x) => x.id));
      return completed.filter((id) => !have.has(id));
    };

    const outdated = saved && saved.v !== WEEK_FORMAT;
    if (!saved || outdated || (missing(saved).length && (saved.tries ?? 0) < MAX_RETRIES_FOR_MISSING)) {
      const params = { ...base, week, classification: 'fbs' };
      const [teamBox, playerBox] = await Promise.all([api('/games/teams', params), api('/games/players', params)]);
      const prevTries = outdated ? 0 : saved?.tries ?? 0;
      saved = { v: WEEK_FORMAT, week, fetchedAt: new Date().toISOString(), teams: trimTeamBox(teamBox), players: trimPlayerBox(playerBox) };
      saved.tries = missing(saved).length ? prevTries + 1 : 0;
      await fs.writeFile(file, JSON.stringify(saved));
      console.log(`Week ${week}: saved box scores for ${saved.players.length} games`);
    }
    weeks.push(saved);
  }

  const season = buildSeason({ year, fbsTeams, games, rawLines, weeks });
  season.updatedAt = new Date().toISOString();
  await fs.writeFile(path.join(OUT, 'season.json'), JSON.stringify(season));

  const upcoming = season.games.filter((g) => !g.completed).length;
  console.log(`Saved ${year} season: ${season.games.length} games (${upcoming} upcoming). API calls this run: ${calls}.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
