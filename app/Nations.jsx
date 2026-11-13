'use client';

import { useEffect, useState } from 'react';
import Soccer from './Soccer';

// The national-team competitions, each with its own data file and kickoff windows.
const COMPS = [
  { key: 'unl', label: 'UEFA Nations League' },
  { key: 'cnl', label: 'CONCACAF Nations League' },
  { key: 'afcon', label: 'Africa Cup of Nations' },
];
const PICK_KEY = 'cst.nationsComp';

export default function Nations({ data }) {
  const [comp, setComp] = useState('unl');
  useEffect(() => {
    try { const saved = localStorage.getItem(PICK_KEY); if (COMPS.some((c) => c.key === saved)) setComp(saved); } catch { /* default */ }
  }, []);
  const choose = (k) => {
    setComp(k);
    try { localStorage.setItem(PICK_KEY, k); } catch { /* ignore */ }
    if (window.location.hash) window.location.hash = '';
  };
  const current = COMPS.find((c) => c.key === comp);
  const d = data[comp];
  const title = comp === 'afcon' ? 'Africa Cup of Nations and qualifiers' : current.label;

  return (
    <>
      <div className="wrap comp-pick-wrap">
        <div className="viewtabs comp-pick" role="tablist" aria-label="Competition">
          {COMPS.map((c) => (
            <button key={c.key} type="button" role="tab" aria-selected={comp === c.key} className={comp === c.key ? 'on' : ''} onClick={() => choose(c.key)}>
              {c.label}
            </button>
          ))}
        </div>
      </div>
      {d ? (
        <Soccer key={comp} data={d} title={title} slotMode="day" storageKey={`nations.${comp}`} />
      ) : (
        <main className="wrap">
          <h1 className="title">{current.label}</h1>
          <p className="notice">
            No {current.label} data yet. On GitHub, open the Actions tab, choose Update data, and tap Run workflow.
          </p>
        </main>
      )}
    </>
  );
}
