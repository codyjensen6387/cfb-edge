'use client';

import { useEffect, useState } from 'react';
import Board from './Board';
import Hoops from './Hoops';
import Soccer from './Soccer';

const SPORT_KEY = 'edge.sport';

function NoData({ name }) {
  return (
    <main className="wrap">
      <h1 className="title">{{ football: 'CFB Edge', basketball: 'CBB Edge', soccer: 'UCL Edge' }[name]}</h1>
      <p className="notice">
        No {name} data yet. On GitHub, open the Actions tab, choose Update data, and tap Run workflow.
        The site rebuilds with data a couple of minutes after it finishes.
      </p>
    </main>
  );
}

export default function App({ football, basketball, soccer }) {
  const [sport, setSport] = useState('cfb');
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SPORT_KEY);
      if (['cfb', 'cbb', 'ucl'].includes(saved)) setSport(saved);
    } catch { /* default to football */ }
  }, []);
  const choose = (s) => {
    setSport(s);
    try { localStorage.setItem(SPORT_KEY, s); } catch { /* ignore */ }
    if (window.location.hash) window.location.hash = '';
    window.scrollTo(0, 0);
  };

  return (
    <>
      <nav className="sportbar" aria-label="Sport">
        <div className="sportwrap viewtabs" role="tablist">
          <button type="button" role="tab" aria-selected={sport === 'cfb'} className={sport === 'cfb' ? 'on' : ''} onClick={() => choose('cfb')}>Football</button>
          <button type="button" role="tab" aria-selected={sport === 'cbb'} className={sport === 'cbb' ? 'on' : ''} onClick={() => choose('cbb')}>Basketball</button>
          <button type="button" role="tab" aria-selected={sport === 'ucl'} className={sport === 'ucl' ? 'on' : ''} onClick={() => choose('ucl')}>Soccer</button>
        </div>
      </nav>
      {sport === 'cfb' ? (football ? <Board data={football} /> : <NoData name="football" />) : null}
      {sport === 'cbb' ? (basketball ? <Hoops data={basketball} /> : <NoData name="basketball" />) : null}
      {sport === 'ucl' ? (soccer ? <Soccer data={soccer} /> : <NoData name="soccer" />) : null}
    </>
  );
}
