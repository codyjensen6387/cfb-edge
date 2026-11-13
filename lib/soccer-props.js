// Soccer game log tuple: [yyyymmdd, goals, assists, shots, shotsOnTarget, started, yellows, reds]
export const S = { date: 0, goals: 1, ast: 2, shots: 3, sot: 4, started: 5, yellows: 6, reds: 7 };

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

// The players most often booked: cards accumulated and how often they're carded.
export function cardProps(players = [], top = 3) {
  const y = (x) => x[S.yellows] || 0;
  const r = (x) => x[S.reds] || 0;
  return players
    .map((p) => {
      const n = p.g.length;
      const yellows = p.g.reduce((s, x) => s + y(x), 0);
      const reds = p.g.reduce((s, x) => s + r(x), 0);
      const booked = p.g.filter((x) => y(x) + r(x) > 0).length;
      return { name: p.n, n, yellows, reds, booked, avg: n ? (yellows + reds) / n : 0, rungs: [{ t: 1, hits: booked }] };
    })
    .filter((p) => p.n > 0 && p.yellows + p.reds > 0)
    .sort((a, b) => b.booked / b.n - a.booked / a.n || b.yellows + b.reds - (a.yellows + a.reds) || b.n - a.n)
    .slice(0, top);
}
