'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DUNE_LINE, MAX_SUM, type Category, type DisplayMovie, type ThemeBand } from '@/lib/data';

const HOST_LB_HANDLES = { slim: 'slim', danny: 'danny', proto: 'protolexus' } as const;

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
  const [jumpQuery, setJumpQuery] = useState('');
  const [jumpOpen, setJumpOpen] = useState(false);
  // The id of a bar that should briefly highlight after a Jump selection,
  // and the count of "jumps" so the effect re-fires even when the user
  // jumps to the same movie twice.
  const [flashId, setFlashId] = useState<number | null>(null);
  const flashTick = useRef(0);
  const jumpRowRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // Small dismiss delay lets the cursor travel from a bar onto the
  // tooltip without dropping the hover state — needed because the
  // tooltip now contains clickable host-rating links.
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelHide = () => { if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; } };
  const scheduleHide = () => { cancelHide(); hideTimer.current = setTimeout(() => setHover(null), 120); };

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
    setJumpQuery('');
    setJumpOpen(false);
    setFlashId(null);
    // Snap the timeline back to its leftmost (newest) position so
    // there's no lingering "I jumped somewhere" state.
    requestAnimationFrame(() => {
      scrollContainerRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
    });
  }

  const wrapRef = useRef<HTMLDivElement>(null);
  const yAxisRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLDivElement>(null);

  // The Dune Line is a single continuous horizontal that has to align
  // perfectly with bar tops. Bars live inside .theme-bars (with a top
  // gutter for the stacked ep# + date labels) and grow upward from the
  // bottom. So the line at value V sits at:
  //   headerH + LABEL_GUTTER + chartH * (1 - V/MAX)
  // where chartH = barsH - LABEL_GUTTER. Keep in sync with .theme-bars
  // padding-top in globals.css.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const headerEl = wrap.querySelector('.theme-header');
    const headerH = headerEl ? (headerEl as HTMLElement).offsetHeight : 32;
    const wrapH = wrap.offsetHeight;
    const LABEL_GUTTER = 30;
    const barsH = wrapH - headerH;
    const chartH = barsH - LABEL_GUTTER;
    const yFor = (v: number) => headerH + LABEL_GUTTER + chartH * (1 - v / MAX_SUM);
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

  // Jump autocomplete: flatten every movie across bands once so each
  // keystroke is a cheap substring filter. Match against the movie title.
  // Dedupe by id (the same movie could conceivably appear in multiple
  // bands if the data ever changes shape — defensive).
  const allMovies = useMemo<DisplayMovie[]>(() => {
    const seen = new Set<number>();
    const out: DisplayMovie[] = [];
    for (const b of bands) {
      for (const m of b.movies) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        out.push(m);
      }
    }
    return out;
  }, [bands]);

  const jumpMatches = useMemo<DisplayMovie[]>(() => {
    const q = jumpQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return allMovies
      .filter(m => m.title.toLowerCase().includes(q))
      .sort((a, b) => {
        // Prefix matches first, then by episode # desc so newer wins
        // within the same prefix bucket.
        const aP = a.title.toLowerCase().startsWith(q) ? 0 : 1;
        const bP = b.title.toLowerCase().startsWith(q) ? 0 : 1;
        if (aP !== bP) return aP - bP;
        return (b.episode ?? 0) - (a.episode ?? 0);
      })
      .slice(0, 8);
  }, [jumpQuery, allMovies]);

  const handleJumpSelect = useCallback((m: DisplayMovie) => {
    setJumpQuery('');
    setJumpOpen(false);
    // Sort-by-rating modes hide unrated bars. Switch to chronological
    // so the target is always rendered before we try to scroll to it.
    if (sortMode !== 'chronological') setSortMode('chronological');
    // Scroll after the next paint so the band reflows (the bar may not
    // be in the DOM yet if we just changed sort mode).
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.querySelector(`[data-movie-id="${m.id}"]`) as HTMLElement | null;
        const container = scrollContainerRef.current;
        if (!el || !container) return;
        const cRect = container.getBoundingClientRect();
        const eRect = el.getBoundingClientRect();
        const delta = (eRect.left + eRect.width / 2) - (cRect.left + cRect.width / 2);
        container.scrollBy({ left: delta, behavior: 'smooth' });
        flashTick.current += 1;
        setFlashId(m.id);
        const tick = flashTick.current;
        setTimeout(() => { if (flashTick.current === tick) setFlashId(null); }, 1500);
      });
    });
  }, [sortMode]);

  // Close the dropdown on outside click.
  useEffect(() => {
    if (!jumpOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!jumpRowRef.current?.contains(e.target as Node)) setJumpOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [jumpOpen]);

  const dirArrow = sortMode === 'chronological'
    ? '← newer  ·  older →'
    : sortMode === 'desc'
      ? '← higher  ·  lower →'
      : '← lower  ·  higher →';

  return (
    <>
      <div className="filter-row has-jump" ref={jumpRowRef}>
        <span className="filter-label">Jump</span>
        <div className="jump-wrap">
          <input
            className="jump-input"
            type="text"
            value={jumpQuery}
            onChange={(e) => { setJumpQuery(e.target.value); setJumpOpen(true); }}
            onFocus={() => setJumpOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && jumpMatches.length > 0) handleJumpSelect(jumpMatches[0]);
              else if (e.key === 'Escape') { setJumpOpen(false); setJumpQuery(''); }
            }}
            placeholder="Type a movie title…"
            spellCheck={false}
          />
          {jumpOpen && jumpMatches.length > 0 && (
            <ul className="jump-results">
              {jumpMatches.map(m => (
                <li
                  key={m.id}
                  className="jump-result"
                  onMouseDown={(e) => { e.preventDefault(); handleJumpSelect(m); }}
                >
                  <span className="jump-result-title">{m.title}</span>
                  <span className="jump-result-meta">
                    {m.episode != null ? `#${m.episode}` : '—'}
                    {m.year ? ` · ${m.year}` : ''}
                    {m.sum != null ? ` · ${m.sum}/15` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <span className="filter-label" style={{ marginLeft: '12px' }}>Sort</span>
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
        <div className="timeline-scroll" ref={scrollContainerRef}>
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
                          className={`bar-col${flashId === m.id ? ' flash' : ''}`}
                          data-movie-id={m.id}
                          onMouseEnter={(e) => { cancelHide(); setHover({ m, x: e.clientX, y: e.clientY }); }}
                          onMouseMove={(e) => { cancelHide(); setHover({ m, x: e.clientX, y: e.clientY }); }}
                          onMouseLeave={scheduleHide}
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

      {hover && <Tooltip movie={hover.m} x={hover.x} y={hover.y} onEnter={cancelHide} onLeave={scheduleHide} />}
    </>
  );
}

function SortChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button className={`chip sort${active ? ' active' : ''}`} onClick={onClick}>
      {label}
    </button>
  );
}

function Tooltip({ movie, x, y, onEnter, onLeave }: { movie: DisplayMovie; x: number; y: number; onEnter: () => void; onLeave: () => void }) {
  const off = 18;
  const TT_WIDTH = 280;
  const TT_HEIGHT = 460;
  // Clamp inside the viewport — flip to the cursor's left or above if
  // we'd otherwise crash into an edge, so the poster always renders fully.
  const vw = window.innerWidth;
  const vh = window.innerHeight;
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
  // Per-host rating cell. When we have both a rating and the movie's
  // Letterboxd slug, the cell links to that host's review on Letterboxd.
  // Otherwise it falls back to plain text (or "—" for null ratings).
  const hostCell = (label: string, host: keyof typeof HOST_LB_HANDLES, rating: number | null) => {
    if (rating == null) return <span>{label} —</span>;
    if (!movie.lbSlug) return <span>{label} {rating}</span>;
    const url = `https://letterboxd.com/${HOST_LB_HANDLES[host]}/film/${movie.lbSlug}/`;
    return (
      <a className="t-host-link" href={url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}>
        {label} {rating}
      </a>
    );
  };
  return (
    <div className="tooltip show" style={style} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <img className="t-poster" src={movie.posterUrl} alt="" />
      <div className="t-title">{movie.title}{movie.year ? ` (${movie.year})` : ''}</div>
      <div className="t-meta">{epText}{movie.hostPick ? ` · ${movie.hostPick}'s pick` : ''}</div>
      <div className="t-meta">Published {formatDateLong(movie.publishedAt)}</div>
      {movie.sum != null && (
        <>
          <div className="t-sum">{movie.sum}/15</div>
          <div className={`t-dist ${distClass}`}>{distLabel}</div>
          <div className="t-hosts">
            {hostCell('S', 'slim', movie.slim)} · {hostCell('D', 'danny', movie.danny)} · {hostCell('P', 'proto', movie.proto)}
          </div>
        </>
      )}
      <div className="t-link">click → 70mmwiki.com/movies/{movie.id} ↗</div>
    </div>
  );
}
