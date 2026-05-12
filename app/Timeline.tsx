'use client';

import { useEffect, useRef, useState } from 'react';
import { DUNE_LINE, MAX_SUM, type Category, type DisplayMovie, type ThemeBand } from '@/lib/data';

const COLORS: Record<Category, string | null> = {
  cleared: '#7a8a4a',
  buried: '#a64a2e',
  dune: '#c89a4a',
  unrated: null,
};

interface Props {
  bands: ThemeBand[];
  totals: Record<Category, number>;
}

export default function Timeline({ bands, totals }: Props) {
  // Filter chips. 'unrated' isn't a filter — those bars are always shown
  // as placeholders (striped fill), the user can't toggle them off.
  const [active, setActive] = useState<Set<Category>>(new Set(['cleared', 'buried', 'dune']));
  const [hover, setHover] = useState<{ m: DisplayMovie; x: number; y: number } | null>(null);

  function toggle(c: Category) {
    setActive(prev => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  }

  const wrapRef = useRef<HTMLDivElement>(null);
  const yAxisRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);

  // The Dune Line is a single continuous horizontal that has to align
  // perfectly with bar tops. Bars live inside .theme-bars and span its
  // full vertical extent (height % set inline relative to bar-col which
  // is height: 100% of .theme-bars with zero padding). So the line at
  // value V sits at headerH + barsH * (1 - V/MAX) from the wrap's top —
  // no fudge factor.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const headerEl = wrap.querySelector('.theme-header');
    const headerH = headerEl ? (headerEl as HTMLElement).offsetHeight : 32;
    const wrapH = wrap.offsetHeight;
    const barsH = wrapH - headerH;
    const yFor = (v: number) => headerH + barsH * (1 - v / MAX_SUM);
    const linePx = yFor(DUNE_LINE);
    if (lineRef.current) lineRef.current.style.top = `${linePx - 3}px`;
    if (glowRef.current) glowRef.current.style.top = `${linePx - 8}px`;
    if (tagRef.current) tagRef.current.style.top = `${linePx - 12}px`;

    const y = yAxisRef.current;
    if (y) {
      y.innerHTML = '';
      [15, 12.5, 10, 7.5, 5, 2.5, 0].forEach(v => {
        const t = document.createElement('div');
        t.className = 'y-tick';
        t.textContent = String(v);
        t.style.top = `${yFor(v)}px`;
        y.appendChild(t);
      });
    }
  }, [bands]);

  function isVisible(cat: Category): boolean {
    if (cat === 'unrated') return true;
    return active.has(cat);
  }

  return (
    <>
      <div className="filter-row">
        <span className="filter-label">Show</span>
        <Chip cat="cleared" label="Cleared" color="#7a8a4a" count={totals.cleared} active={active.has('cleared')} onClick={() => toggle('cleared')} />
        <Chip cat="buried" label="Buried" color="#a64a2e" count={totals.buried} active={active.has('buried')} onClick={() => toggle('buried')} />
        <Chip cat="dune" label="Dune" color="#c89a4a" count={totals.dune} active={active.has('dune')} onClick={() => toggle('dune')} />
      </div>

      <p className="dir-arrow">← newer&nbsp;&nbsp;·&nbsp;&nbsp;older →</p>

      <div className="timeline-wrap" ref={wrapRef}>
        <div className="y-axis" ref={yAxisRef} />
        <div className="dune-line-glow" ref={glowRef} />
        <div className="dune-line-overlay" ref={lineRef} />
        <div className="dune-tag" ref={tagRef}>DUNE LINE · 10.5</div>
        <div className="timeline-scroll">
          <div className="timeline-inner">
            {bands.map(band => {
              // Filter to currently-visible bars so the chart compresses
              // horizontally when a category is unchecked instead of just
              // dimming. Unrated rows are always visible (no chip for
              // them). A band with zero visible bars after filtering is
              // dropped entirely so we don't get empty headers.
              const visibleMovies = band.movies.filter(m => isVisible(m.category));
              if (visibleMovies.length === 0) return null;
              // Wider per-movie slot and a higher floor so ~3 bands fit
              // in the stage at default width. 72px per movie + padding;
              // floor of 340px so small bands still take real estate.
              const widthPx = Math.max(340, visibleMovies.length * 76 + 40);
              return (
                <div
                  key={band.key}
                  className={`theme-band ${band.confirmed ? 'confirmed' : 'unconfirmed'}${band.isDuneMonth ? ' dune-month' : ''}`}
                  style={{ minWidth: `${widthPx}px` }}
                >
                  <div className="theme-header">
                    <p className={`theme-name${band.confirmed ? '' : ' unconfirmed'}`}>
                      {band.confirmed ? band.name : '? unknown ?'}
                    </p>
                    <p className="theme-date">{band.dateLabel}</p>
                  </div>
                  <div className="theme-bars">
                    {visibleMovies.map(m => {
                      const color = COLORS[m.category];
                      const rated = m.sum != null;
                      // Bar height % of chart area. Bar is the only child of
                      // bar-col so this matches the Dune Line overlay's
                      // y-frame exactly. Unrated rows get a 40% ghost bar so
                      // they're plainly visible-but-not-misleading (no
                      // implied rating). The poster shows on top either way;
                      // if the wiki 404s for unaired posters, the striped
                      // pattern falls through.
                      const pct = rated ? (m.sum! / MAX_SUM) * 100 : 40;
                      return (
                        <div
                          key={m.id}
                          className="bar-col"
                          onMouseEnter={(e) => setHover({ m, x: e.clientX, y: e.clientY })}
                          onMouseMove={(e) => setHover({ m, x: e.clientX, y: e.clientY })}
                          onMouseLeave={() => setHover(null)}
                          onClick={() => { if (m.lbLink) window.open(m.lbLink, '_blank', 'noopener,noreferrer'); }}
                        >
                          <div
                            className={`bar${rated ? '' : ' placeholder'}`}
                            style={{
                              height: `${pct}%`,
                              ...(rated && color ? { backgroundColor: color } : {}),
                              backgroundImage: `url(${m.posterUrl})`,
                            }}
                          >
                            <div className="ep-num">{m.episode != null ? `#${m.episode}` : '—'}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {hover && <Tooltip movie={hover.m} x={hover.x} y={hover.y} />}
    </>
  );
}

function Chip({ cat, label, color, count, active, onClick }: { cat: Category; label: string; color: string; count: number; active: boolean; onClick: () => void }) {
  return (
    <button className={`chip ${cat}${active ? ' active' : ''}`} onClick={onClick}>
      <span className="chip-dot" style={{ background: color }} />
      {label} <span className="chip-count">{count}</span>
    </button>
  );
}

function Tooltip({ movie, x, y }: { movie: DisplayMovie; x: number; y: number }) {
  const off = 18;
  // Lazy positioning — clamp inside viewport so it doesn't clip near edges.
  const style: React.CSSProperties = {
    left: `${Math.min(x + off, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 280)}px`,
    top: `${y + off}px`,
  };
  const distClass = movie.distance == null ? '' : movie.distance > 0 ? 'above' : movie.distance < 0 ? 'below' : 'on';
  const distLabel = movie.distance == null
    ? 'unrated'
    : movie.distance === 0
      ? 'on the line'
      : `${movie.distance > 0 ? '+' : ''}${movie.distance} from the line`;
  return (
    <div className="tooltip show" style={style}>
      <div className="t-title">{movie.title}{movie.year ? ` (${movie.year})` : ''}</div>
      <div className="t-meta">Ep #{movie.episode}{movie.hostPick ? ` · ${movie.hostPick}'s pick` : ''}</div>
      {movie.sum != null && (
        <>
          <div className="t-sum">{movie.sum}/15</div>
          <div className={`t-dist ${distClass}`}>{distLabel}</div>
          <div className="t-hosts">
            S {movie.slim ?? '—'} · D {movie.danny ?? '—'} · P {movie.proto ?? '—'}
          </div>
        </>
      )}
      {movie.lbLink && <div className="t-meta" style={{ marginTop: 6 }}>click → letterboxd ↗</div>}
    </div>
  );
}
