// Game log tuple: [week, fcsGame, passYds, passTd, rushYds, rushTd, recYds, recTd]
export const I = { week: 0, fcs: 1, py: 2, ptd: 3, ry: 4, rtd: 5, cy: 6, ctd: 7 };

// Thresholds around a player's own average, so a 100-yard player never shows a 25+ line.
// Base is the average rounded down to the step; show one step below, the base, one above.
export function yardRungs(avg, step) {
  const base = Math.floor(avg / step) * step;
  return [base - step, base, base + step].filter((t) => t > 0);
}
// Passing TDs: the average rounded down, and one more.
export function tdRungs(avg) {
  const base = Math.floor(avg);
  return [base, base + 1].filter((t) => t > 0);
}

const hitCount = (games, idx, t) => games.filter((g) => g[idx] >= t).length;

export function teamProps(players = [], includeFcs = true) {
  const rows = players
    .map((p) => {
      const g = includeFcs ? p.g : p.g.filter((x) => !x[I.fcs]);
      const sum = (i) => g.reduce((s, x) => s + x[i], 0);
      return {
        name: p.n,
        games: g,
        n: g.length,
        py: sum(I.py), ptd: sum(I.ptd), ry: sum(I.ry), cy: sum(I.cy),
        td: sum(I.rtd) + sum(I.ctd),
        tdGames: g.filter((x) => x[I.rtd] + x[I.ctd] > 0).length,
      };
    })
    .filter((r) => r.n > 0);

  const top = (key, k, tiebreak) =>
    rows.filter((r) => r[key] > 0).sort((a, b) => b[key] - a[key] || (tiebreak ? b[tiebreak] - a[tiebreak] : 0)).slice(0, k);

  const yards = (r, idx, total, step) => {
    const avg = total / r.n;
    return { name: r.name, n: r.n, avg, rungs: yardRungs(avg, step).map((t) => ({ t, hits: hitCount(r.games, idx, t) })) };
  };

  return {
    touchdowns: top('td', 3, 'tdGames').map((r) => ({ name: r.name, n: r.n, td: r.td, tdGames: r.tdGames })),
    passer: top('py', 1).map((r) => {
      const y = yards(r, I.py, r.py, 50);
      const tdAvg = r.ptd / r.n;
      return { ...y, tdAvg, tdRungs: tdRungs(tdAvg).map((t) => ({ t, hits: hitCount(r.games, I.ptd, t) })) };
    }),
    rushers: top('ry', 2).map((r) => yards(r, I.ry, r.ry, 25)),
    receivers: top('cy', 3).map((r) => yards(r, I.cy, r.cy, 25)),
  };
}
