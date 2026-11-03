import fs from 'node:fs';
import path from 'node:path';
import App from './App';

export const dynamic = 'force-static';

// Uses whichever copy is newest: data/<file> (from the GitHub Action)
// or data/local/<file> (from running `npm run data` yourself).
function load(file) {
  let best = null;
  for (const dir of ['data', 'data/local']) {
    try {
      const d = JSON.parse(fs.readFileSync(path.join(process.cwd(), dir, file), 'utf8'));
      if (!best || String(d.updatedAt) > String(best.updatedAt)) best = d;
    } catch { /* not there yet */ }
  }
  return best;
}

export default function Page() {
  return <App football={load('season.json')} basketball={load('cbb.json')} soccer={load('ucl.json')} />;
}
