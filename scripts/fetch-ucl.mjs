// Pulls the Champions League from ESPN's public feed (no key) and writes data/ucl.json.
// Keeps a running state file: schedule for the last few days through the next three weeks,
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

// Dates with matches, from the scoreboard's calendar (strings or objects, depending on the feed).
function calendarDates(board) {
  const cal = pick((pick(board, 'leagues') || [])[0] || {}, 'calendar') || [];
  const out = [];
  const add = (v) => { const t = Date.parse(typeof v === 'string' ? v : pick(v || {}, 'startDate', 'date')); if (Number.isFinite(t)) out.push(new Date(t)); };
  for (const c of cal) {
    if (c && typeof c === 'object' && Array.isArray(c.entries)) c.entries.forEach(add);
    else add(c);
  }
  return out;
}

async function main() {
  const season = currentSeason();
  const stateFile = path.join(OUT, 'ucl', `state-${season}.json`);
  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  const state = (await readJson(stateFile))
    ?? (IN_ACTIONS ? null : await readJson(path.join(REPO_DATA, 'ucl', `state-${season}.json`)))
    ?? { season, events: {}, box: {}, tries: {}, lastRun: null };

  const now = new Date();
  const seasonStart = new Date(Date.UTC(season, 7, 15)); // mid-August
  const from = state.lastRun ? new Date(Math.max(seasonStart, Date.parse(state.lastRun) - 3 * DAY)) : seasonStart;
  const to = new Date(now.getTime() + 21 * DAY);

  // Try one date-range call; if the feed returns nothing for ranges, go day by day from its calendar.
  let events = [];
  try {
    const board = await espn('/scoreboard', { dates: `${ymd(from)}-${ymd(to)}`, limit: 500 });
    events = pick(board, 'events') || [];
  } catch { /* fall through to day by day */ }
  if (!events.length) {
    const board = await espn('/scoreboard');
    events = pick(board, 'events') || [];
    const days = [...new Set(calendarDates(board).filter((d) => d >= from && d <= to).map(ymd))];
    for (const day of days) {
      const b = await espn('/scoreboard', { dates: day });
      events.push(...(pick(b, 'events') || []));
      await sleep(200);
    }
  }
  for (const ev of events) {
    const e = normalizeEvent(ev);
    if (e.id && e.id !== 'undefined') state.events[e.id] = e;
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
  console.log(`Saved Champions League ${season}-${String(season + 1).slice(2)}: ${out.games.length} matches, ${Object.keys(out.teams).length} teams. ESPN calls this run: ${calls}.`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
