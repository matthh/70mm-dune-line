// All-time tally below the timeline. Single horizontal bar per category,
// width proportional to the largest count so the visual ranking is
// immediate. "Bangers" are 15/15 perfects — a subset of cleared, but
// noteworthy enough to call out on their own.

import type { AllTimeStats } from '@/lib/data';

interface Row {
  label: string;
  sublabel?: string;
  count: number;
  color: string;
}

export default function AllTimeStatsSection({ stats }: { stats: AllTimeStats }) {
  const rows: Row[] = [
    { label: '15 Bangers', sublabel: 'perfect 15/15', count: stats.bangers, color: '#f4e9d4' },
    { label: 'Cleared', sublabel: '> 10.5', count: stats.cleared, color: '#7a8a4a' },
    { label: 'Buried', sublabel: '< 10.5', count: stats.buried, color: '#a64a2e' },
    { label: 'Dune', sublabel: '= 10.5', count: stats.dune, color: '#c89a4a' },
  ];
  const max = Math.max(1, ...rows.map(r => r.count));

  return (
    <section className="all-time">
      <h2 className="all-time-h">All Time</h2>
      <div className="all-time-grid">
        {rows.map(r => (
          <div className="at-row" key={r.label}>
            <div className="at-label">
              <span className="at-label-name">{r.label}</span>
              {r.sublabel && <span className="at-label-sub">{r.sublabel}</span>}
            </div>
            <div className="at-bar">
              <div
                className="at-bar-fill"
                style={{ width: `${(r.count / max) * 100}%`, background: r.color }}
              />
            </div>
            <div className="at-count">{r.count}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
