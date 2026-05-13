'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { DUNE_LINE, MAX_SUM, type Category, type DisplayMovie, type ThemeBand } from '@/lib/data';

const COLORS: Record<Category, string | null> = {
  cleared: '#7a8a4a',
  buried: '#a64a2e',
  dune: '#c89a4a',
  unrated: null,
};

type SortMode = 'chronological' | 'desc' | 'asc';

const DEFAULT_ACTIVE: Category[] = ['cleared', 'buried', 'dune'];

function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
function formatDateLong(iso: string | null | undefined): string {
  if (!iso) return 'unknown';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
}

interface Props {
  bands: ThemeBand[];
  totals: Record<Category, number>;
}

export default function Timeline({ bands, totals }: Props) {
  // Filter chips. 'unrated' isn't a filter — they ride along with the
  // all-chips-active state and drop out the moment any chip is unchecked.
  const [active, setActive] = useState<Set<Category>>(new Set(DEFAULT_ACTIVE));
  const [sortMode, setSortMode] = useState<SortMode>('chronological');
  const [hover, setHover] = useState<{ m: DisplayMovie; x: number; y: number } | null>(null);

  function toggle(c: Category) {
    setActive(prev => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c); else next.add(c);
      return next;
    });
  }

  function resetAll() {
    setActive(new Set(DEFAULT_ACTIVE));
    setSortMode('chronological');
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

  // Unrated bars ride along with the "everything" view. The moment the
  // user narrows by any chip, unrated drops out — they have no rating
  // to be cleared/buried/on so they don't belong in any single category
  // view. When all three chips are re-enabled they reappear. In the
  // rating-sorted modes they're always hidden since they can't be
  // placed on a "by rating" axis.
  const allChipsActive = active.has('cleared') && active.has('buried') && active.has('dune');
  function isVisible(cat: Category): boolean {
    if (cat === 'unrated') return sortMode === 'chronological' && allChipsActive;
    return active.has(cat);
  }

  // When the user picks a rating-sorted mode we collapse all bands into
  // one synthetic band of every visible bar sorted by sum. Theme bands
  // disappear because they don't carry meaning in a rating-sorted view.
  const displayBands = useMemo<ThemeBand[]>(() => {
    if (sortMode === 'chronological') return bands;
    const flat: DisplayMovie[] = [];
    for (const b of bands) for (const m of b.movies) flat.push(m);
    const visible = flat.filter(m => m.sum != null && isVisible(m.category));
    // Primary: rating sum (desc or asc per mode). Tiebreaker: episode #
    // descending so the most recent shows up first among equal-rated
    // entries. Null episode #s fall to the end of their tie group, with
    // publishedAt as a final fallback.
    visible.sort((a, b) => {
      const sumDiff = sortMode === 'desc' ? (b.sum! - a.sum!) : (a.sum! - b.sum!);
      if (sumDiff !== 0) return sumDiff;
      const ae = a.episode, be = b.episode;
      if (ae != null && be != null) return be - ae;
      if (ae != null) return -1;
      if (be != null) return 1;
      const ad = a.publishedAt ? Date.parse(a.publishedAt) : 0;
      const bd = b.publishedAt ? Date.parse(b.publishedAt) : 0;
      return bd - ad;
    });
    if (visible.length === 0) return [];
    return [{
      key: `sorted-${sortMode}`,
      name: sortMode === 'desc' ? 'BY RATING · HIGHEST → LOWEST' : 'BY RATING · LOWEST → HIGHEST',
      startDate: null,
      dateLabel: `${visible.length} rated episodes`,
      movies: visible,
      confirmed: true,
      isDuneMonth: false,
    }];
  }, [bands, sortMode, active]); // eslint-disable-line react-hooks/exhaustive-deps

  // Has the user changed anything from the default state? The Reset
  // button stays visually muted until there's something to undo.
  const dirty = sortMode !== 'chronological' || active.size !== DEFAULT_ACTIVE.length
    || !DEFAULT_ACTIVE.every(c => active.has(c));

  const dirArrow = sortMode === 'chronological'
    ? '← newer  ·  older →'
    : sortMode === 'desc'
      ? '← higher  ·  lower →'
      : '← lower  ·  higher →';

  return (
    <>
      <div className="filter-row">
        <span className="filter-label">Sort</span>
        <SortChip label="Chronological" active={sortMode === 'chronological'} onClick={() => setSortMode('chronological')} />
        <SortChip label="Highest → Lowest" active={sortMode === 'desc'} onClick={() => setSortMode('desc')} />
        <SortChip label="Lowest → Highest" active={sortMode === 'asc'} onClick={() => setSortMode('asc')} />
        <button
          className={`chip reset${dirty ? ' dirty' : ''}`}
          onClick={resetAll}
          disabled={!dirty}
          title="Reset filters and sort"
        >
          ↺ Reset
        </button>
      </div>
      <p className="dir-arrow">{dirArrow}</p>

      <div className="timeline-wrap" ref={wrapRef}>
        <div className="y-axis" ref={yAxisRef} />
        <div className="dune-line-glow" ref={glowRef} />
        <div className="dune-line-overlay" ref={lineRef} />
        <div className="dune-tag" ref={tagRef}>DUNE LINE · 10.5</div>
        <div className="timeline-scroll">
          <div className="timeline-inner">
            {displayBands.map(band => {
              // Filter to currently-visible bars so the chart compresses
              // horizontally when a category is unchecked instead of just
              // dimming. Unrated rows are always visible (no chip for
              // them). A band with zero visible bars after filtering is
              // dropped entirely so we don't get empty headers.
              const visibleMovies = band.movies.filter(m => isVisible(m.category));
              if (visibleMovies.length === 0) return null;
              // Default rhythm: every band holds at least 5-movie width so
              // the chart doesn't visibly stretch and shrink as you scroll
              // through months. Bands with 6-7 movies expand. The .theme-bars
              // flex container uses space-around, so 1-4 movie bands just
              // distribute their bars across the same width.
              const widthPx = Math.max(visibleMovies.length, 5) * 76 + 40;
              return (
                <div
                  key={band.key}
                  className={`theme-band ${band.confirmed ? 'confirmed' : 'unconfirmed'}${band.isDuneMonth ? ' dune-month' : ''}`}
                  // Hard width (not minWidth) so a long theme name in
                  // the header can't push the band wider than its
                  // visible-bar content dictates. The header's
                  // theme-name has overflow:hidden + ellipsis to clip
                  // anything that still overflows after shortening.
                  style={{ width: `${widthPx}px`, minWidth: `${widthPx}px` }}
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
                          onClick={() => window.open(m.wikiUrl, '_blank', 'noopener,noreferrer')}
                        >
                          <div
                            className={`bar${rated ? '' : ' placeholder'}`}
                            style={{
                              height: `${pct}%`,
                              ...(rated && color ? { backgroundColor: color } : {}),
                              backgroundImage: `url(${m.posterUrl})`,
                            }}
                          >
                            <div className="ep-label">
                              <div className="ep-num">{m.episode != null ? `#${m.episode}` : '—'}</div>
                              <div className="ep-date">{formatDateShort(m.publishedAt)}</div>
                            </div>
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

function SortChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={`chip sort${active ? ' active' : ''}`} onClick={onClick}>
      {label}
    </button>
  );
}

function Tooltip({ movie, x, y }: { movie: DisplayMovie; x: number; y: number }) {
  const off = 18;
  const TT_WIDTH = 280;
  const TT_HEIGHT = 460;
  // Clamp inside the viewport — flip to the cursor's left or above if
  // we'd otherwise crash into an edge, so the poster always renders fully.
  const vw = typeof window !== 'undefined' ? window.innerWidth : 9999;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 9999;
  const left = x + off + TT_WIDTH > vw ? Math.max(8, x - off - TT_WIDTH) : x + off;
  const top = y + off + TT_HEIGHT > vh ? Math.max(8, vh - TT_HEIGHT - 8) : y + off;
  const style: React.CSSProperties = { left: `${left}px`, top: `${top}px` };
  const distClass = movie.distance == null ? '' : movie.distance > 0 ? 'above' : movie.distance < 0 ? 'below' : 'on';
  const distLabel = movie.distance == null
    ? 'unrated'
    : movie.distance === 0
      ? 'on the line'
      : `${movie.distance > 0 ? '+' : ''}${movie.distance} from the line`;
  const epText = movie.episode != null ? `Ep #${movie.episode}` : 'no episode #';
  return (
    <div className="tooltip show" style={style}>
      <img className="t-poster" src={movie.posterUrl} alt="" />
      <div className="t-title">{movie.title}{movie.year ? ` (${movie.year})` : ''}</div>
      <div className="t-meta">{epText}{movie.hostPick ? ` · ${movie.hostPick}'s pick` : ''}</div>
      <div className="t-meta">Published {formatDateLong(movie.publishedAt)}</div>
      {movie.sum != null && (
        <>
          <div className="t-sum">{movie.sum}/15</div>
          <div className={`t-dist ${distClass}`}>{distLabel}</div>
          <div className="t-hosts">
            S {movie.slim ?? '—'} · D {movie.danny ?? '—'} · P {movie.proto ?? '—'}
          </div>
        </>
      )}
      <div className="t-link">click → 70mmwiki.com/movies/{movie.id} ↗</div>
    </div>
  );
}
