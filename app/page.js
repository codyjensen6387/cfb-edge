import fs from 'node:fs';
import path from 'node:path';
import Board from './Board';

export const dynamic = 'force-static';

// Uses whichever season file is newest: data/season.json (from the GitHub Action)
// or data/local/season.json (from running `npm run data` yourself).
function loadData() {
  const files = ['data/season.json', 'data/local/season.json'];
  let best = null;
  for (const f of files) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(process.cwd(), f), 'utf8'));
      if (!best || String(d.updatedAt) > String(best.updatedAt)) best = d;
    } catch { /* file not there yet */ }
  }
  return best;
}

export default function Page() {
  const data = loadData();
  if (!data) {
    return (
      <main className="wrap">
        <h1 className="title">CFB Edge</h1>
        <p className="notice">
          No game data yet. On GitHub, open the Actions tab, choose Update data, and tap Run workflow.
          The site rebuilds with data a couple of minutes after it finishes.
        </p>
      </main>
    );
  }
  return <Board data={data} />;
}
