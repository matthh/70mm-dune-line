// All-time tally below the timeline.
//
// Three layers:
//   1. Four-row category panel (Bangers / Cleared / Buried / Dune)
//   2. Theme leaderboard — top 5 & bottom 5 ranked by avg rating sum
//      across at least three rated movies in the theme
//   3. Trophy-case lists: every 15/15 banger, every movie inside the
//      top theme, every movie inside the lowest theme

import type { AllTimeStats, ThemeRanking } from '@/lib/data';
import { DUNE_LINE, MAX_SUM } from '@/lib/data';

interface CategoryRow {
  label: string;
  sublabel?: string;
  count: number;
  color: string;
}

export default function AllTimeStatsSection({ stats }: { stats: AllTimeStats }) {
  const rows: CategoryRow[] = [
    { label: '15 Bangers', sublabel: 'perfect 15/15', count: stats.bangers, color: '#f4e9d4' },
    { label: 'Cleared', sublabel: '> 10.5', count: stats.cleared, color: '#7a8a4a' },
    { label: 'Buried', sublabel: '< 10.5', count: stats.buried, color: '#a64a2e' },
    { label: 'Dune', sublabel: '= 10.5', count: stats.dune, color: '#c89a4a' },
  ];
  const max = Math.max(1, ...rows.map(r => r.count));

  const topTheme = stats.topThemes[0];
  const lowTheme = stats.lowThemes[0];

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
              <div className="at-bar-fill" style={{ width: `${(r.count / max) * 100}%`, background: r.color }} />
            </div>
            <div className="at-count">{r.count}</div>
          </div>
        ))}
      </div>

      <div className="theme-leaderboard">
        <ThemeRankPanel
          title="Top Rated Themes"
          themes={stats.topThemes}
          color="#7a8a4a"
        />
        <ThemeRankPanel
          title="Lowest Rated Themes"
          themes={stats.lowThemes}
          color="#a64a2e"
        />
      </div>

      <div className="trophy trophy-bangers">
        <h3 className="trophy-h">
          15 Bangers <span className="trophy-h-count">{stats.bangerMovies.length}</span>
        </h3>
        <ul className="trophy-list">
          {stats.bangerMovies.map(m => (
            <li key={m.id}>
              <a href={m.wikiUrl} target="_blank" rel="noopener noreferrer">
                <span className="trophy-ep">{m.episode != null ? `#${m.episode}` : '—'}</span>
                <span className="trophy-title">{m.title}</span>
                {m.year && <span className="trophy-year"> ({m.year})</span>}
              </a>
            </li>
          ))}
        </ul>
      </div>

      {(topTheme || lowTheme) && (
        <div className="theme-deep-grid">
          {topTheme && <ThemeDeepDive label="Top Theme" theme={topTheme} barColor="#7a8a4a" />}
          {lowTheme && <ThemeDeepDive label="Lowest Theme" theme={lowTheme} barColor="#a64a2e" />}
        </div>
      )}
    </section>
  );
}

function ThemeRankPanel({ title, themes, color }: { title: string; themes: ThemeRanking[]; color: string }) {
  const max = Math.max(1, ...themes.map(t => t.avg));
  return (
    <div className="rank-panel">
      <h3 className="rank-h">{title}</h3>
      {themes.length === 0 && <p className="rank-empty">— not enough data —</p>}
      {themes.map((t, i) => (
        <div className="rank-row" key={t.themeId}>
          <span className="rank-num">{i + 1}</span>
          <span className="rank-name" title={t.name !== t.shortName ? t.name : undefined}>
            {t.shortName}
            <span className="rank-count"> · {t.movieCount}</span>
          </span>
          <div className="rank-bar"><div className="rank-bar-fill" style={{ width: `${(t.avg / max) * 100}%`, background: color }} /></div>
          <span className="rank-avg">{t.avg.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

function ThemeDeepDive({ label, theme, barColor }: { label: string; theme: ThemeRanking; barColor: string }) {
  return (
    <div className="theme-deep">
      <p className="theme-deep-label">{label}</p>
      <p className="theme-deep-name" title={theme.name !== theme.shortName ? theme.name : undefined}>
        {theme.shortName}
      </p>
      <p className="theme-deep-meta">{theme.avg.toFixed(2)} avg · {theme.movieCount} movies</p>
      <ul className="theme-deep-list">
        {theme.movies.map(m => {
          const dist = m.sum - DUNE_LINE;
          const distClass = dist > 0 ? 'above' : dist < 0 ? 'below' : 'on';
          return (
            <li key={m.id}>
              <a href={m.wikiUrl} target="_blank" rel="noopener noreferrer">
                <span className="td-ep">{m.episode != null ? `#${m.episode}` : '—'}</span>
                <span className="td-title">{m.title}</span>
                <span className="td-bar">
                  <span className="td-bar-fill" style={{ width: `${(m.sum / MAX_SUM) * 100}%`, background: barColor }} />
                </span>
                <span className={`td-sum td-sum-${distClass}`}>{m.sum}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
