// Live lines for the Line Movement page. Runs on Vercel when you tap Refresh, so the API key
// stays on the server. College lines come from CollegeFootballData (one call); if that fails,
// ESPN's college scoreboard is used instead. NFL lines come from ESPN's scoreboard (free).

import { consensusLine } from '@/scripts/lib/build.mjs';

export const dynamic = 'force-dynamic';

const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/football';
const UA = { 'User-Agent': 'Mozilla/5.0 (personal betting research site)', Accept: 'application/json' };

function footballSeason() {
  const now = new Date();
  return now.getUTCMonth() < 6 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
}
const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
};

// One ESPN event: home-team spread from the "KC -9.5" text when possible.
function espnGame(ev, league) {
  const comp = (ev.competitions || [])[0] || {};
  const cs = comp.competitors || [];
  const H = cs.find((c) => c.homeAway === 'home') || {};
  const A = cs.find((c) => c.homeAway === 'away') || {};
  const ht = H.team || {}, at = A.team || {};
  const o = (comp.odds || [])[0] || {};
  const details = String(o.details || '').trim();
  let spread = null;
  if (/^(even|pk|pick)/i.test(details)) spread = 0;
  else {
    const m = details.match(/^(.+?)\s+([+-]?\d+(?:\.\d+)?)$/);
    if (m) {
      const fav = m[1].trim(), v = -Math.abs(parseFloat(m[2]));
      if (fav === ht.abbreviation) spread = v;
      else if (fav === at.abbreviation) spread = -v;
    }
  }
  if (spread === null) spread = num(o.spread);
  const side = (t) => ({ names: [t.location, t.displayName, t.shortDisplayName, t.name].filter(Boolean), abbr: t.abbreviation || null });
  return {
    league, id: ev.id, start: ev.date,
    homeSide: side(ht), awaySide: side(at),
    spread, total: num(o.overUnder),
    src: o.provider?.name ? `${o.provider.name} via ESPN` : 'ESPN',
  };
}

async function espnBoard(path, params, league) {
  const url = new URL(`${ESPN}/${path}/scoreboard`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: UA, cache: 'no-store' });
  if (!res.ok) throw new Error(`ESPN returned ${res.status}`);
  const data = await res.json();
  return (data.events || []).map((ev) => espnGame(ev, league));
}

async function collegeLines(year, week) {
  const key = process.env.CFBD_API_KEY;
  if (key) {
    try {
      const url = new URL('https://api.collegefootballdata.com/lines');
      url.searchParams.set('year', year);
      url.searchParams.set('week', week);
      url.searchParams.set('seasonType', 'regular');
      const res = await fetch(url, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' }, cache: 'no-store' });
      if (!res.ok) throw new Error(`CollegeFootballData returned ${res.status}`);
      const rows = await res.json();
      return rows.map((r) => {
        const line = consensusLine(r);
        return {
          league: 'cfb', id: r.id, start: r.startDate || null,
          homeSide: { names: [r.homeTeam], abbr: null }, awaySide: { names: [r.awayTeam], abbr: null },
          spread: line.spread, total: line.total, src: line.spreadSrc || line.totalSrc || 'CollegeFootballData',
        };
      });
    } catch { /* fall back to ESPN */ }
  }
  return espnBoard('college-football', { week, seasontype: 2, groups: 80, limit: 400, dates: year }, 'cfb');
}

export async function GET(request) {
  const q = new URL(request.url).searchParams;
  const year = footballSeason();
  const cfbWeek = Number(q.get('cfbWeek')) || null;
  const nflWeek = Number(q.get('nflWeek')) || null;
  const out = { fetchedAt: new Date().toISOString(), cfb: null, nfl: null, errors: [] };

  await Promise.all([
    q.get('cfb') === '1' && cfbWeek
      ? collegeLines(year, cfbWeek).then((r) => { out.cfb = r; }).catch((e) => out.errors.push(`College: ${e.message}`))
      : null,
    nflWeek
      ? espnBoard('nfl', { week: nflWeek, seasontype: 2, dates: year }, 'nfl').then((r) => { out.nfl = r; }).catch((e) => out.errors.push(`NFL: ${e.message}`))
      : null,
  ]);
  return Response.json(out, { headers: { 'Cache-Control': 'no-store' } });
}
