// Transform the raw 70mmwiki API shape into what the timeline page renders.
//
// Brief constraints (locked):
// - Main-show episodes only. Filter out vault, bonus, pilot, book, watchalong.
//   `regular` here means "the show's numbered episodes" — what listeners
//   consider the canonical chronology.
// - Group by month_theme_id. Episodes that lack a theme go into a synthetic
//   "?" band keyed by their date_published month.
// - Within each band, descend by episode number (highest first / leftmost).
// - Bands are reverse-chronological: newest theme month on the left.
//
// "The Dune Line" is the constant 10.5 — Dune (2021)'s rating sum across
// the three hosts. Computed below per movie so the renderer doesn't need
// to know about the rating math.

import raw from '../data/movies.json';

export const DUNE_LINE = 10.5;
export const MAX_SUM = 15;

export interface RawMovie {
  id: number;
  movie: string;
  year_released: number | null;
  date_published: string | null;
  episode: number | null;
  bonus: number | null;
  vault: number | null;
  pilot: number | null;
  book: number | null;
  watchalong: number | null;
  slim: number | null;
  danny: number | null;
  proto: number | null;
  sum: number | null;
  host_pick: string | null;
  villager_count?: number;
  lb_link?: string | null;
  monthTheme?: {
    id: number;
    theme_name: string | null;
    start_date: string | null;
    end_date: string | null;
  } | null;
  month_theme_id?: number | null;
}

export interface RawData {
  scrapedAt: string;
  source: string;
  total: number;
  movies: RawMovie[];
}

export type Category = 'cleared' | 'buried' | 'dune' | 'unrated';

export interface DisplayMovie {
  id: number;
  title: string;
  year: number | null;
  episode: number;
  sum: number | null;
  slim: number | null;
  danny: number | null;
  proto: number | null;
  hostPick: string | null;
  lbLink: string | null;
  category: Category;
  /** Distance from the Dune Line (sum - 10.5); null if unrated. */
  distance: number | null;
  /** Whether this is Dune (2021) itself — gets the canonical sand color. */
  isDune: boolean;
}

export interface ThemeBand {
  /** Stable key for React. */
  key: string;
  /** Theme name if confirmed, else null (renders as "?"). */
  name: string | null;
  /** Theme start_date if available, else fallback to first episode's date. */
  startDate: string | null;
  /** Pre-formatted month/year label, e.g. "Nov 2025". */
  dateLabel: string;
  movies: DisplayMovie[];
  confirmed: boolean;
  /** True if this band is the "Dune month" — i.e., contains Dune (2021). */
  isDuneMonth: boolean;
}

function categoryFor(sum: number | null, isDune: boolean): Category {
  if (isDune) return 'dune';
  if (sum == null) return 'unrated';
  if (sum > DUNE_LINE) return 'cleared';
  if (sum < DUNE_LINE) return 'buried';
  // sum === 10.5 — tied with Dune. Treat as 'dune' so it stays sand-colored
  // and shows up in the Dune chip count.
  return 'dune';
}

function monthLabel(iso: string | null): string {
  if (!iso) return '— older —';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Returns true when the movie is a "main show" / regular episode. */
function isRegular(m: RawMovie): boolean {
  return !m.bonus && !m.vault && !m.pilot && !m.book && !m.watchalong;
}

/** Build the band-grouped, reverse-chronological timeline the page renders. */
export function buildTimeline(): { bands: ThemeBand[]; totals: Record<Category, number>; scrapedAt: string } {
  const data = raw as RawData;
  const regular = data.movies.filter(isRegular).filter(m => m.episode != null);

  // Map theme_id (or synthetic key for themeless) -> ThemeBand.
  const bands = new Map<string, ThemeBand>();
  for (const m of regular) {
    const isDune = m.id === 91; // Dune (2021), episode 91
    const display: DisplayMovie = {
      id: m.id,
      title: m.movie,
      year: m.year_released,
      episode: m.episode!,
      sum: m.sum,
      slim: m.slim,
      danny: m.danny,
      proto: m.proto,
      hostPick: m.host_pick,
      lbLink: m.lb_link ?? null,
      category: categoryFor(m.sum, isDune),
      distance: m.sum == null ? null : Number((m.sum - DUNE_LINE).toFixed(2)),
      isDune,
    };

    if (m.month_theme_id && m.monthTheme?.theme_name) {
      const key = `theme-${m.month_theme_id}`;
      const existing = bands.get(key);
      if (existing) {
        existing.movies.push(display);
        if (isDune) existing.isDuneMonth = true;
      } else {
        bands.set(key, {
          key,
          name: m.monthTheme.theme_name,
          startDate: m.monthTheme.start_date ?? m.date_published ?? null,
          dateLabel: monthLabel(m.monthTheme.start_date ?? m.date_published),
          movies: [display],
          confirmed: true,
          isDuneMonth: isDune,
        });
      }
    } else {
      // Themeless: synthesize a band per calendar month of publication.
      const dateKey = (m.date_published ?? '').slice(0, 7); // YYYY-MM
      const key = `themeless-${dateKey || 'unknown'}`;
      const existing = bands.get(key);
      if (existing) {
        existing.movies.push(display);
        if (isDune) existing.isDuneMonth = true;
      } else {
        bands.set(key, {
          key,
          name: null,
          startDate: m.date_published ?? null,
          dateLabel: monthLabel(m.date_published),
          movies: [display],
          confirmed: false,
          isDuneMonth: isDune,
        });
      }
    }
  }

  // Sort movies inside each band: episode DESC (highest = leftmost in band).
  for (const band of bands.values()) {
    band.movies.sort((a, b) => b.episode - a.episode);
  }

  // Sort bands by startDate DESC; missing dates go to the end.
  const sortedBands = Array.from(bands.values()).sort((a, b) => {
    const ad = a.startDate ? Date.parse(a.startDate) : -Infinity;
    const bd = b.startDate ? Date.parse(b.startDate) : -Infinity;
    return bd - ad;
  });

  const totals: Record<Category, number> = { cleared: 0, buried: 0, dune: 0, unrated: 0 };
  for (const b of sortedBands) {
    for (const m of b.movies) totals[m.category]++;
  }

  return { bands: sortedBands, totals, scrapedAt: data.scrapedAt };
}
