// Pulls soccer competitions from ESPN's public feed (no key): the Champions League, the UEFA
// and CONCACAF Nations Leagues, and AFCON with its qualifiers. Each competition keeps a running
// state file: the schedule day by day (settled days are skipped on later runs), plus one match
// report (player stats and cards) per finished match it hasn't saved yet.
//
// In the GitHub Action: writes to data/ (committed). Anywhere else (npm run data): data/local/.

import fs from 'node:fs/promises';
import path from 'node:path';
import { buildSoccer, normalizeEvent, trimSummary } from './lib/build-soccer.mjs';
import { pick } from './lib/build.mjs';

const ROOT = process.cwd();
const IN_ACTIONS = process.env.GITHUB_ACTIONS === 'true';
const REPO_DATA = path.join(ROOT, 'data');
const OUT = IN_ACTIONS ? REPO_DATA : path.join(REPO_DATA, 'local');
const BASE = 'https://site.api.espn.com/apis/site/v2/sports/soccer';
const DAY = 24 * 3600 * 1000;
const MAX_SUMMARY_TRIES = 6;
const STATE_VERSION = 3; // 3 = cards in player stats, several leagues per competition

// startMonth/startDay: where each season's window begins (month is 0-based).
// AFCON starts in February so the qualifiers are included without last edition's tournament.
const COMPETITIONS = [
  { key: 'ucl', name: 'Champions League', leagues: ['uefa.champions'], startMonth: 7, startDay: 15 },
  { key: 'unl', name: 'UEFA Nations League', leagues: ['uefa.nations'], startMonth: 7, startDay: 15 },
  { key: 'cnl', name: 'CONCACAF Nations League', leagues: ['concacaf.nations.league'], startMonth: 7, startDay: 15 },
  { key: 'afcon', name: 'Africa Cup of Nations', leagues: ['caf.nations', 'caf.nations_qual'], startMonth: 1, startDay: 1 },
];

// The 2026-27 competitions start in 2026.
function currentSeason() {
  if (process.env.SOCCER_SEASON) return Number(process.env.SOCCER_SEASON);
  const now = new Date();
  return now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
}

let calls = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function espn(league, route, params = {}) {
  const url = new URL(`${BASE}/${league}${route}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  for (let attempt = 1; attempt <= 3; attempt++) {
    calls++;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (personal betting research site)', Accept: 'application/json' } });
    if (res.ok) return res.json();
    if (attempt === 3) throw new Error(`ESPN ${league}${route} returned ${res.status}`);
    await sleep(1500 * attempt);
  }
}

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; }
}
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');

async function runCompetition(comp, season) {
  const stateFile = path.join(OUT, comp.key, `state-${season}.json`);
  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  const state = (await readJson(stateFile))
    ?? (IN_ACTIONS ? null : await readJson(path.join(REPO_DATA, comp.key, `state-${season}.json`)))
    ?? { season, events: {}, box: {}, tries: {}, daysDone: {}, lastRun: null };

  // Older Champions League state: keep the schedule, re-read match reports to pick up cards.
  if (state.v !== STATE_VERSION) {
    const lg = comp.leagues[0];
    const days = {};
    for (const [k, v] of Object.entries(state.daysDone || {})) days[k.includes(':') ? k : `${lg}:${k}`] = v;
    for (const e of Object.values(state.events || {})) e.league ||= lg;
    Object.assign(state, { v: STATE_VERSION, daysDone: days, box: {}, tries: {} });
  }
  state.key = comp.key;
  state.daysDone ||= {};

  const now = new Date();
  const start = new Date(Date.UTC(season, comp.startMonth, comp.startDay));
  const to = new Date(now.getTime() + 21 * DAY);
  const days = [];
  for (let t = start.getTime(); t <= to.getTime(); t += DAY) days.push(ymd(new Date(t)));

  // Every day in the window for each league, skipping settled days: more than two days back
  // with every match final (or no matches) means it never changes.
  const todo = comp.leagues.flatMap((lg) => days.filter((d) => !state.daysDone[`${lg}:${d}`]).map((d) => [lg, d]));
  for (let i = 0; i < todo.length; i += 6) {
    const batch = todo.slice(i, i + 6);
    const boards = await Promise.all(batch.map(([lg, d]) => espn(lg, '/scoreboard', { dates: d, limit: 100 }).catch(() => null)));
    batch.forEach(([lg, d], k) => {
      if (!boards[k]) return;
      const evs = (pick(boards[k], 'events') || []).map(normalizeEvent).filter((e) => e.id && e.id !== 'undefined');
      for (const e of evs) state.events[e.id] = { ...e, league: lg };
      const dayStart = Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}T00:00:00Z`);
      if (dayStart < now.getTime() - 2 * DAY && evs.every((e) => e.completed)) state.daysDone[`${lg}:${d}`] = true;
    });
    await sleep(250);
  }

  // Match reports for finished matches we don't have yet.
  const missing = Object.values(state.events).filter((e) => e.completed && !state.box[e.id] && (state.tries[e.id] ?? 0) < MAX_SUMMARY_TRIES);
  for (const e of missing) {
    try {
      const sides = trimSummary(await espn(e.league || comp.leagues[0], '/summary', { event: e.id }));
      if (sides.length) state.box[e.id] = Object.fromEntries(sides.map((s) => [s.teamId, s.players]));
      else state.tries[e.id] = (state.tries[e.id] ?? 0) + 1;
    } catch {
      state.tries[e.id] = (state.tries[e.id] ?? 0) + 1;
    }
    await sleep(200);
  }

  state.lastRun = now.toISOString();
  await fs.writeFile(stateFile, JSON.stringify(state));
  const out = buildSoccer(state);
  out.name = comp.name;
  out.updatedAt = now.toISOString();
  await fs.writeFile(path.join(OUT, `${comp.key}.json`), JSON.stringify(out));
  const finished = out.games.filter((g) => g.completed).length;
  console.log(`${comp.name} ${season}-${String(season + 1).slice(2)}: ${out.games.length} matches (${finished} finished, ${Object.keys(state.box).length} with player stats), ${Object.keys(out.teams).length} teams.`);
}

async function main() {
  const season = currentSeason();
  const only = process.argv[2]; // optional: run one competition, e.g. `node scripts/fetch-soccer.mjs unl`
  let failed = 0;
  for (const comp of COMPETITIONS) {
    if (only && comp.key !== only) continue;
    try { await runCompetition(comp, season); }
    catch (err) { failed++; console.error(`${comp.name}: ${err.message || err}`); }
  }
  console.log(`ESPN calls this run: ${calls}.`);
  if (failed) process.exit(1);
}

main();
