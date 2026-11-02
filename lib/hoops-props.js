// Basketball game log tuple: [yyyymmdd, opponentIsPower, minutes, points, rebounds, assists, threesMade]
export const H = { date: 0, power: 1, min: 2, pts: 3, reb: 4, ast: 5, tpm: 6 };

// Points use the steps books usually post; the rest go one at a time.
const POINT_LADDER = [5, 8, 10, 12, 15, 18, 20, 22, 25, 28, 30, 35, 40, 45, 50];

// The ladder step at or below his average, plus one step on each side.
export function pointRungs(avg) {
  let i = -1;
  POINT_LADDER.forEach((v, k) => { if (v <= avg) i = k; });
  if (i < 0) return [POINT_LADDER[0]];
  return POINT_LADDER.slice(Math.max(0, i - 1), i + 2);
}
// Average rounded down, plus one on each side, never below the stat's floor.
export function stepRungs(avg, floor) {
  const base = Math.floor(avg);
  const r = [base - 1, base, base + 1].filter((t) => t >= floor);
  return r.length ? r : [floor];
}

const hitCount = (games, idx, t) => games.filter((x) => (x[idx] ?? 0) >= t).length;

// Top players by minutes, each with points, rebounds, assists and threes benchmarks.
export function hoopsProps(players = [], top = 5) {
  return players
    .map((p) => ({ p, n: p.g.length, minutes: p.g.reduce((s, x) => s + (x[H.min] ?? 0), 0) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, top)
    .map(({ p, n, minutes }) => {
      const stat = (idx, rungFn) => {
        const avg = p.g.reduce((s, x) => s + (x[idx] ?? 0), 0) / n;
        return { avg, rungs: rungFn(avg).map((t) => ({ t, hits: hitCount(p.g, idx, t) })) };
      };
      return {
        name: p.n,
        n,
        min: minutes / n,
        pts: stat(H.pts, pointRungs),
        reb: stat(H.reb, (a) => stepRungs(a, 4)),
        ast: stat(H.ast, (a) => stepRungs(a, 1)),
        tpm: stat(H.tpm, (a) => stepRungs(a, 1)),
      };
    });
}
