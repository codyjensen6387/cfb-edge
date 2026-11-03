// Soccer game log tuple: [yyyymmdd, goals, assists, shots, shotsOnTarget, started]
export const S = { date: 0, goals: 1, ast: 2, shots: 3, sot: 4, started: 5 };

// Average rounded down, plus one on each side, never below 1.
export function stepRungs(avg) {
  const base = Math.floor(avg);
  const r = [base - 1, base, base + 1].filter((t) => t >= 1);
  return r.length ? r : [1];
}

const hits = (games, value, t) => games.filter((x) => value(x) >= t).length;

// Top players by shots (goals count double so a clinical finisher isn't left off).
export function soccerProps(players = [], top = 6) {
  const score = (p) => p.g.reduce((s, x) => s + x[S.shots] + 2 * x[S.goals], 0);
  return players
    .filter((p) => p.g.length > 0 && score(p) > 0)
    .sort((a, b) => score(b) - score(a))
    .slice(0, top)
    .map((p) => {
      const n = p.g.length;
      const stat = (value, rungs) => {
        const avg = p.g.reduce((s, x) => s + value(x), 0) / n;
        return { avg, rungs: (rungs || stepRungs(avg)).map((t) => ({ t, hits: hits(p.g, value, t) })) };
      };
      return {
        name: p.n,
        n,
        starts: p.g.filter((x) => x[S.started]).length,
        goals: stat((x) => x[S.goals], [1, 2]),
        shots: stat((x) => x[S.shots]),
        sot: stat((x) => x[S.sot]),
        ga: stat((x) => x[S.goals] + x[S.ast], [1, 2]),
      };
    });
}
