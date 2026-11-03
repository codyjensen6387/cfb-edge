// Pulls the Champions League from ESPN's public feed (no key) and writes data/ucl.json.
// Keeps a running state file: the schedule day by day (settled days are skipped on later runs),
// plus one match summary (player stats) per finished match it hasn't saved yet.
//
// In the GitHub Action: writes to data/ (committed). Anywhere else (npm run data): data/local/.

import fs from 'node:fs/promises';
import path from 'node:path';
import { buildUcl, normalizeEvent, trimSummary } from './lib/build-ucl.mjs';
import { pick } from './lib/build.mjs';

const ROOT = process.cwd();
const IN_ACTIONS = process.env.GITHUB_ACTIONS === 'true';
const REPO_DATA = path.join(ROOT, 'data');
const OUT = IN_ACTIONS ? REPO_DATA : path.join(REPO_DATA, 'local');
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer/uefa.champions';
const DAY = 24 * 3600 * 1000;
const MAX_SUMMARY_TRIES = 6;
const STATE_VERSION = 2;

// The 2026-27 competition starts in late summer 2026.
function currentSeason() {
  if (process.env.UCL_SEASON) return Number(process.env.UCL_SEASON);
  const now = new Date();
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

let calls = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function espn(route, params = {}) {
  const url = new URL(BASE + route);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  for (let attempt = 1; attempt <= 3; attempt++) {
    calls++;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (personal betting research site)', Accept: 'application/json' } });
    if (res.ok) return res.json();
    if (attempt === 3) throw new Error(`ESPN ${route} returned ${res.status}`);
    await sleep(1500 * attempt);
  }
}

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; }
}
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');

async function main() {
  const season = currentSeason();
  const stateFile = path.join(OUT, 'ucl', `state-${season}.json`);
  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  const state = (await readJson(stateFile))
    ?? (IN_ACTIONS ? null : await readJson(path.join(REPO_DATA, 'ucl', `state-${season}.json`)))
    ?? { season, events: {}, box: {}, tries: {}, lastRun: null };

  // Version 2 asks ESPN for one day at a time (it ignores date ranges); older state starts over.
  if (state.v !== STATE_VERSION) Object.assign(state, { v: STATE_VERSION, lastRun: null, daysDone: {} });
  state.daysDone ||= {};

  const now = new Date();
  const seasonStart = new Date(Date.UTC(season, 7, 15)); // mid-August
  const to = new Date(now.getTime() + 21 * DAY);

  // Every day from mid-August through three weeks out, skipping days already settled:
  // a day more than two days back whose matches are all final (or that had none) never changes.
  const days = [];
  for (let t = seasonStart.getTime(); t <= to.getTime(); t += DAY) days.push(ymd(new Date(t)));
  const todo = days.filter((d) => !state.daysDone[d]);
  for (let i = 0; i < todo.length; i += 5) {
    const batch = todo.slice(i, i + 5);
    const boards = await Promise.all(batch.map((d) => espn('/scoreboard', { dates: d, limit: 100 }).catch(() => null)));
    batch.forEach((d, k) => {
      if (!boards[k]) return;
      const evs = (pick(boards[k], 'events') || []).map(normalizeEvent).filter((e) => e.id && e.id !== 'undefined');
      for (const e of evs) state.events[e.id] = e;
      const dayStart = Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}T00:00:00Z`);
      if (dayStart < now.getTime() - 2 * DAY && evs.every((e) => e.completed)) state.daysDone[d] = true;
    });
    await sleep(300);
  }

  // Player stats for finished matches we don't have yet.
  const missing = Object.values(state.events).filter((e) => e.completed && !state.box[e.id] && (state.tries[e.id] ?? 0) < MAX_SUMMARY_TRIES);
  for (const e of missing) {
    try {
      const sides = trimSummary(await espn('/summary', { event: e.id }));
      if (sides.length) state.box[e.id] = Object.fromEntries(sides.map((s) => [s.teamId, s.players]));
      else state.tries[e.id] = (state.tries[e.id] ?? 0) + 1;
    } catch {
      state.tries[e.id] = (state.tries[e.id] ?? 0) + 1;
    }
    await sleep(250);
  }

  state.lastRun = now.toISOString();
  await fs.writeFile(stateFile, JSON.stringify(state));
  const out = buildUcl(state);
  out.updatedAt = now.toISOString();
  await fs.writeFile(path.join(OUT, 'ucl.json'), JSON.stringify(out));
  const finished = out.games.filter((g) => g.completed).length;
  const withStats = Object.keys(state.box).length;
  console.log(`Saved Champions League ${season}-${String(season + 1).slice(2)}: ${out.games.length} matches (${finished} finished, ${withStats} with player stats), ${Object.keys(out.teams).length} teams. ESPN calls this run: ${calls}.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
