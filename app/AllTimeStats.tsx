'use client';
// All-time leaderboard below the timeline.
//
// Category panel (Bangers / Cleared / Buried / Dune) is always visible.
// Theme leaderboard rows and the 15-Bangers stat row are clickable —
// they pop up a modal that shows the actual movies with their posters,
// titles, episodes, and ratings.

import { useEffect, useState } from 'react';
import type { AllTimeStats, BangerMovie, ThemeRanking } from '@/lib/data';
import { DUNE_LINE } from '@/lib/data';

interface CategoryRow {
  label: string;
  sublabel?: string;
  count: number;
  color: string;
  /** Optional click handler — when present the row becomes interactive. */
  onClick?: () => void;
}

interface PopupMovie {
  id: number;
  title: string;
  year: number | null;
  episode: number | null;
  sum: number | null;
  wikiUrl: string;
  themeName?: string | null;
}

interface PopupState {
  title: string;
  subtitle?: string;
  movies: PopupMovie[];
}

const posterFor = (id: number) => `https://70mmwiki.com/api/artwork/thumbs/${id}.jpg`;

export default function AllTimeStatsSection({ stats }: { stats: AllTimeStats }) {
  const [popup, setPopup] = useState<PopupState | null>(null);

  const openBangers = () => setPopup({
    title: '15 Bangers',
    subtitle: `every movie that scored a perfect 15/15 · ${stats.bangerMovies.length} total`,
    movies: stats.bangerMovies.map(bangerToPopup),
  });

  const openTheme = (t: ThemeRanking) => setPopup({
    title: t.name,
    subtitle: `${t.avg.toFixed(2)} avg · ${t.movieCount} movies`,
    movies: t.movies.map(m => ({
      id: m.id,
      title: m.title,
      year: null,
      episode: m.episode,
      sum: m.sum,
      wikiUrl: m.wikiUrl,
    })),
  });

  const rows: CategoryRow[] = [
    { label: '15 Bangers', sublabel: 'perfect 15/15', count: stats.bangers, color: '#f4e9d4', onClick: stats.bangerMovies.length > 0 ? openBangers : undefined },
    { label: 'Cleared', sublabel: '> 10.5', count: stats.cleared, color: '#7a8a4a' },
    { label: 'Buried', sublabel: '< 10.5', count: stats.buried, color: '#a64a2e' },
    { label: 'Dune', sublabel: '= 10.5', count: stats.dune, color: '#c89a4a' },
  ];
  const max = Math.max(1, ...rows.map(r => r.count));

  return (
    <section className="all-time">
      <h2 className="all-time-h">All Time Leaderboard</h2>
      <div className="all-time-grid">
        {rows.map(r => {
          const clickable = !!r.onClick;
          return (
            <div
              className={`at-row${clickable ? ' clickable' : ''}`}
              key={r.label}
              onClick={r.onClick}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); r.onClick!(); } } : undefined}
            >
              <div className="at-label">
                <span className="at-label-name">{r.label}{clickable && <span className="at-arrow"> →</span>}</span>
                {r.sublabel && <span className="at-label-sub">{r.sublabel}</span>}
              </div>
              <div className="at-bar">
                <div className="at-bar-fill" style={{ width: `${(r.count / max) * 100}%`, background: r.color }} />
              </div>
              <div className="at-count">{r.count}</div>
            </div>
          );
        })}
      </div>

      <div className="theme-leaderboard">
        <ThemeRankPanel
          title="Top Rated Themes"
          themes={stats.topThemes}
          color="#7a8a4a"
          onOpen={openTheme}
        />
        <ThemeRankPanel
          title="Lowest Rated Themes"
          themes={stats.lowThemes}
          color="#a64a2e"
          onOpen={openTheme}
        />
      </div>

      {popup && <Modal popup={popup} onClose={() => setPopup(null)} />}
    </section>
  );
}

function bangerToPopup(b: BangerMovie): PopupMovie {
  return {
    id: b.id,
    title: b.title,
    year: b.year,
    episode: b.episode,
    sum: 15,
    wikiUrl: b.wikiUrl,
    themeName: b.themeName,
  };
}

function ThemeRankPanel({ title, themes, color, onOpen }: { title: string; themes: ThemeRanking[]; color: string; onOpen: (t: ThemeRanking) => void }) {
  const max = Math.max(1, ...themes.map(t => t.avg));
  return (
    <div className="rank-panel">
      <h3 className="rank-h">{title}</h3>
      {themes.length === 0 && <p className="rank-empty">— not enough data —</p>}
      {themes.map((t, i) => (
        <button
          className="rank-row"
          key={t.themeId}
          onClick={() => onOpen(t)}
          type="button"
        >
          <span className="rank-num">{i + 1}</span>
          <span className="rank-name" title={t.name !== t.shortName ? t.name : undefined}>
            {t.shortName}
            <span className="rank-count"> · {t.movieCount}</span>
          </span>
          <span className="rank-bar"><span className="rank-bar-fill" style={{ width: `${(t.avg / max) * 100}%`, background: color }} /></span>
          <span className="rank-avg">{t.avg.toFixed(1)}</span>
        </button>
      ))}
    </div>
  );
}

function Modal({ popup, onClose }: { popup: PopupState; onClose: () => void }) {
  // Close on Escape; restore body scroll-lock on unmount.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 className="modal-title">{popup.title}</h3>
            {popup.subtitle && <p className="modal-sub">{popup.subtitle}</p>}
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          <div className="movie-grid">
            {popup.movies.map(m => {
              const dist = m.sum != null ? m.sum - DUNE_LINE : null;
              const distClass = dist == null ? '' : dist > 0 ? 'above' : dist < 0 ? 'below' : 'on';
              return (
                <a key={m.id} className="movie-card" href={m.wikiUrl} target="_blank" rel="noopener noreferrer">
                  <img className="movie-card-poster" src={posterFor(m.id)} alt="" loading="lazy" />
                  <div className="movie-card-meta">
                    <div className="movie-card-title">{m.title}</div>
                    <div className="movie-card-sub">
                      <span>{m.episode != null ? `#${m.episode}` : '—'}</span>
                      {m.year && <span>{m.year}</span>}
                      {m.sum != null && <span className={`movie-card-sum movie-card-sum-${distClass}`}>{m.sum}</span>}
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
