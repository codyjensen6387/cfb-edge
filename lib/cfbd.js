// Thin client for the CollegeFootballData.com API.
// Responses are cached by Next.js so the free-tier call limit goes a long way.
const BASE = 'https://api.collegefootballdata.com';

const HOUR = 3600;
export const CACHE = { live: 6 * HOUR, settled: 7 * 24 * HOUR };

async function cfbd(path, params = {}, revalidate = CACHE.live) {
  const key = process.env.CFBD_API_KEY;
  if (!key) throw new Error('CFBD_API_KEY is not set. Add it to .env.local (or your Vercel project settings) and reload.');
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    next: { revalidate },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`CollegeFootballData ${path} returned ${res.status}. ${body.slice(0, 200)}`);
  }
  return res.json();
}

export const getFbsTeams = (year) => cfbd('/teams/fbs', { year }, CACHE.settled);
export const getGames = (year) => cfbd('/games', { year, seasonType: 'regular', classification: 'fbs' });
export const getLines = (year) => cfbd('/lines', { year, seasonType: 'regular' });
export const getTeamBoxScores = (year, week, settled) =>
  cfbd('/games/teams', { year, week, seasonType: 'regular', classification: 'fbs' }, settled ? CACHE.settled : CACHE.live);
