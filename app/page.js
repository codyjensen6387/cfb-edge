import { loadSeason } from '@/lib/season';
import Board from './Board';

// Rebuild the page from fresh data at most every 6 hours.
export const revalidate = 21600;

export default async function Page() {
  let data;
  try {
    data = await loadSeason();
  } catch (err) {
    return (
      <main className="wrap">
        <h1 className="title">CFB Edge</h1>
        <p className="notice">Couldn’t load game data: {String(err.message)}</p>
      </main>
    );
  }
  return <Board data={data} />;
}
