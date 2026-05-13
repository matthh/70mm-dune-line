'use client';
// All-time leaderboard below the timeline.
//
// Category panel (Bangers / Cleared / Buried / Dune) is always visible.
// Theme leaderboard rows and the 15-Bangers stat row are clickable —
// they pop up a modal that shows the actual movies with their posters,
// titles, episodes, and ratings.

import { useEffect, useMemo, useState } from 'react';
import type { AllTimeStats, CatalogMovie, HostRanking, ThemeRanking } from '@/lib/data';
import { DUNE_LINE } from '@/lib/data';

const PAGE_SIZE = 25;

interface CategoryRow {
  label: string;
  sublabel?: string;
  count: number;
  color: string;
  /** Optional click handler — when present the row becomes interactive. */
  onClick?: () => void;
  /** If present, the row's bar splits into two segments: an `inner`
   *  highlighted slice drawn first (left), then the remainder of this
   *  row's count in the row's main color. Used to surface 15 Bangers
   *  as the leading slice of Cleared. */
  inner?: {
    count: number;
    color: string;
    label: string;
    onClick?: () => void;
  };
}

interface PopupState {
  title: string;
  subtitle?: string;
  movies: CatalogMovie[];
}

const posterFor = (id: number) => `https://70mmwiki.com/api/artwork/thumbs/${id}.jpg`;

export default function AllTimeStatsSection({ stats }: { stats: AllTimeStats }) {
  const [popup, setPopup] = useState<PopupState | null>(null);

  const openCategory = (title: string, sub: string, movies: CatalogMovie[]) => {
    if (movies.length === 0) return;
    setPopup({ title, subtitle: sub, movies });
  };

  const openTheme = (t: ThemeRanking) => {
    // Re-shape ThemeRanking.movies to CatalogMovie (no year on theme rows;
    // tooltip omits the year for theme popups, that's fine).
    const movies: CatalogMovie[] = t.movies.map(m => ({
      id: m.id,
      title: m.title,
      year: null,
      episode: m.episode,
      sum: m.sum,
      themeName: null,
      wikiUrl: m.wikiUrl,
    }));
    setPopup({ title: t.name, subtitle: `${t.avg.toFixed(2)} avg · ${t.movieCount} movies`, movies });
  };

  const openHost = (h: HostRanking) => {
    const movies: CatalogMovie[] = h.movies.map(m => ({
      id: m.id,
      title: m.title,
      year: null,
      episode: m.episode,
      sum: m.sum,
      themeName: null,
      wikiUrl: m.wikiUrl,
    }));
    setPopup({ title: `${h.name}'s picks`, subtitle: `${h.avg.toFixed(2)} avg · ${h.movieCount} picks`, movies });
  };

  // Order top-to-bottom mirrors the y-axis: above the line → on the line →
  // below the line. The Cleared bar is stacked: 15 Bangers form the
  // leading (white) slice, then the remainder of Cleared continues in
  // olive — visually showing what fraction of "cleared" is perfect.
  const openBangers = () => openCategory(
    '15 Bangers',
    `every perfect 15/15 · ${stats.bangerMovies.length} total`,
    stats.bangerMovies,
  );
  // The Cleared row's olive (non-banger) section opens a popup whose
  // count *excludes* the 15-bangers, since those have their own
  // segment + popup. Total here = cleared - bangers.
  const clearedExBangers = useMemo(
    () => stats.clearedMovies.filter(m => m.sum !== 15),
    [stats.clearedMovies],
  );
  const rows: CategoryRow[] = [
    {
      label: 'Cleared', sublabel: '> 10.5', count: stats.cleared, color: '#7a8a4a',
      onClick: () => openCategory(
        'Cleared the Dune Line',
        `cleared excluding 15-bangers · ${clearedExBangers.length} total · sorted highest first`,
        clearedExBangers,
      ),
      inner: { count: stats.bangers, color: '#f4e9d4', label: '15 Bangers', onClick: openBangers },
    },
    { label: 'Dune Line', sublabel: '= 10.5', count: stats.dune, color: '#c89a4a',
      onClick: () => openCategory('On the Dune Line', `every movie tied with Dune at 10.5 · ${stats.duneMovies.length} total`, stats.duneMovies) },
    { label: 'Buried', sublabel: '< 10.5', count: stats.buried, color: '#a64a2e',
      onClick: () => openCategory('Buried Below the Dune Line', `every movie below 10.5 · ${stats.buriedMovies.length} total · sorted lowest first`, stats.buriedMovies) },
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
                {r.inner ? (
                  <>
                    <div
                      className="at-bar-fill at-bar-inner"
                      style={{ width: `${(r.inner.count / max) * 100}%`, background: r.inner.color }}
                      onClick={r.inner.onClick ? (e) => { e.stopPropagation(); r.inner!.onClick!(); } : undefined}
                      role={r.inner.onClick ? 'button' : undefined}
                      tabIndex={r.inner.onClick ? 0 : undefined}
                      title={`${r.inner.label} · ${r.inner.count}`}
                    >
                      <span className="at-bar-inner-label">{r.inner.label} · {r.inner.count}</span>
                    </div>
                    <div
                      className="at-bar-fill at-bar-rest"
                      style={{ width: `${((r.count - r.inner.count) / max) * 100}%`, background: r.color }}
                    />
                  </>
                ) : (
                  <div className="at-bar-fill" style={{ width: `${(r.count / max) * 100}%`, background: r.color }} />
                )}
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
        <HostRankPanel
          title="Host Picks · Highest → Lowest"
          hosts={stats.hostPicks}
          onOpen={openHost}
        />
      </div>

      {popup && <Modal popup={popup} onClose={() => setPopup(null)} />}
    </section>
  );
}

function HostRankPanel({ title, hosts, onOpen }: { title: string; hosts: HostRanking[]; onOpen: (h: HostRanking) => void }) {
  // Color the bar for each host: top = olive (best), bottom = coral (worst),
  // middle = sand. Length is mapped against the highest avg so the leader
  // anchors the panel and the others read as a relative gap.
  const max = Math.max(1, ...hosts.map(h => h.avg));
  const COLORS = ['#7a8a4a', '#c89a4a', '#a64a2e'];
  return (
    <div className="rank-panel">
      <h3 className="rank-h">{title}</h3>
      {hosts.length === 0 && <p className="rank-empty">— not enough data —</p>}
      {hosts.map((h, i) => (
        <button
          className="rank-row"
          key={h.host}
          onClick={() => onOpen(h)}
          type="button"
        >
          <span className="rank-num">{i + 1}</span>
          <span className="rank-name">
            {h.name}
            <span className="rank-count"> · {h.movieCount}</span>
          </span>
          <span className="rank-bar"><span className="rank-bar-fill" style={{ width: `${(h.avg / max) * 100}%`, background: COLORS[i] ?? '#5a4e38' }} /></span>
          <span className="rank-avg">{h.avg.toFixed(1)}</span>
        </button>
      ))}
    </div>
  );
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
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(popup.movies.length / PAGE_SIZE));
  // Reset to first page whenever the popup's content changes.
  useEffect(() => { setPage(0); }, [popup]);

  const visible = useMemo(
    () => popup.movies.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE),
    [popup.movies, page]
  );

  // Close on Escape; restore body scroll-lock on unmount. Also bind
  // arrow keys to pagination when the popup has multiple pages.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' && page < totalPages - 1) setPage(page + 1);
      else if (e.key === 'ArrowLeft' && page > 0) setPage(page - 1);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose, page, totalPages]);

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
            {visible.map(m => {
              const dist = m.sum - DUNE_LINE;
              const distClass = dist > 0 ? 'above' : dist < 0 ? 'below' : 'on';
              return (
                <a key={m.id} className="movie-card" href={m.wikiUrl} target="_blank" rel="noopener noreferrer">
                  <img className="movie-card-poster" src={posterFor(m.id)} alt="" loading="lazy" />
                  <div className="movie-card-meta">
                    <div className="movie-card-title">{m.title}</div>
                    <div className="movie-card-sub">
                      <span>{m.episode != null ? `#${m.episode}` : '—'}</span>
                      {m.year && <span>{m.year}</span>}
                      <span className={`movie-card-sum movie-card-sum-${distClass}`}>{m.sum}</span>
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
        {totalPages > 1 && (
          <div className="modal-pager">
            <button
              className="pager-btn"
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
            >← Prev</button>
            <span className="pager-status">
              Page {page + 1} of {totalPages}
              <span className="pager-range"> · showing {page * PAGE_SIZE + 1}–{Math.min(popup.movies.length, (page + 1) * PAGE_SIZE)} of {popup.movies.length}</span>
            </span>
            <button
              className="pager-btn"
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
            >Next →</button>
          </div>
        )}
      </div>
    </div>
  );
}
