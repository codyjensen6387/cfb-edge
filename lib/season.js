import { getFbsTeams, getGames, getLines, getTeamBoxScores } from './cfbd';
import { normalizeGame, consensusLine, buildTeams, pick } from './compute';

// Aug–Jan is one season; January bowl games belong to the previous year's season.
export function currentSeason() {
  if (process.env.CFB_SEASON) return Number(process.env.CFB_SEASON);
  const now = new Date();
  return now.getUTCMonth() < 6 ? now.getUTCFullYear() - 1 : now.getUTCFullYear();
}

export async function loadSeason() {
  const year = currentSeason();
  const [fbsTeams, rawGames, rawLines] = await Promise.all([getFbsTeams(year), getGames(year), getLines(year)]);

  const fbs = new Set(fbsTeams.map((t) => pick(t, 'school')));
  const games = rawGames.map(normalizeGame).filter((g) => fbs.has(g.home) || fbs.has(g.away));

  const linesById = {};
  for (const row of rawLines) linesById[pick(row, 'id')] = consensusLine(row);

  // Box scores, one call per week that has finished games. Older weeks are cached for a week.
  const playedWeeks = [...new Set(games.filter((g) => g.completed).map((g) => g.week))].sort((a, b) => a - b);
  const latest = playedWeeks[playedWeeks.length - 1];
  const missingWeeks = [];
  const boxByWeek = await Promise.all(
    playedWeeks.map((w) =>
      getTeamBoxScores(year, w, w < latest).catch(() => { missingWeeks.push(w); return []; })
    )
  );

  const teams = buildTeams({ fbsTeams, games, linesById, boxScores: boxByWeek.flat() });

  const schedule = games
    .filter((g) => !g.completed)
    .map((g) => ({ ...g, line: linesById[g.id] || { spread: null, total: null } }))
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));

  return { year, teams, schedule, missingWeeks, updatedAt: new Date().toISOString() };
}
