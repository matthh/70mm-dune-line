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
  spotify_link?: string | null;
  /** Spotify CDN thumbnail URL captured by the scraper from oEmbed.
   *  Temporary stand-in until 70mmwiki posts proper artwork. */
  spotifyThumb?: string | null;
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
  /** Episode number when assigned by the wiki. A handful of regular
   *  episodes (Okja, Megalopolis, Willy Wonka, ...) are missing one. */
  episode: number | null;
  /** ISO date the episode was published — used as a within-band sort
   *  fallback when episode # is missing. */
  publishedAt: string | null;
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
  /** Hot-linked 1400x1400 poster from 70mmwiki. The wiki serves these
   *  publicly; mirroring 319 of them would bloat the deploy by ~100MB. */
  posterUrl: string;
  /** Canonical episode page on the wiki. */
  wikiUrl: string;
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

/** Normalize a date string the wiki might hand us in one of three shapes:
 *  - plain ISO date: "2026-05-04"
 *  - full ISO timestamp: "2026-02-01T06:00:00.000Z"
 *  - JSON-stringified (older theme rows): '"2020-10-01T05:00:00.000Z"' (the
 *    leading and trailing quotes are part of the value)
 *  Strips wrapping quotes / whitespace so Date.parse can take it. */
function cleanDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const trimmed = s.trim().replace(/^"|"$/g, '');
  return trimmed || null;
}

function monthLabel(raw: string | null | undefined): string {
  const iso = cleanDate(raw);
  if (!iso) return '— older —';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** Some theme rows have placeholder names like "?", "??", or empty
 *  strings. Treat those as themeless so the band header doesn't render
 *  a junk title — the dateLabel still anchors the band in time. */
function isMeaningfulThemeName(name: string | null | undefined): boolean {
  if (!name) return false;
  const t = name.trim();
  if (!t) return false;
  if (/^\?+$/.test(t)) return false;
  return true;
}

/** Some theme names are too long to read at column width. Map the known
 *  awkward ones to clean short versions, and fall back to a generic
 *  ellipsis-at-word-boundary for anything else that overflows. */
const SHORT_NAMES: Record<string, string> = {
  'Holy/Regligion/Spiritual Month': 'Holy Month',
  'Launch $10/tier + Phantom Menace': 'Phantom Menace',
  'Summer Blockbusters 21st Century': 'Summer Blockbusters',
  'Latin American Movie Month': 'Latin American',
  '70mm Goes Back to Jakku': 'Back to Jakku',
  '70mm goes International': 'International',
  'Women Lovers / Femtember': 'Femtember',
  'Road to JW/Junassic World': 'Road to JW',
  'The Thing 40th June 25th': 'The Thing 40th',
  'LB 1M Watched Club': 'LB 1M Club',
  'LEADING LADIES V4': 'Leading Ladies V4',
  'Leading Ladies Vol. 2': 'Leading Ladies V2',
  'Leading Ladies 80s': 'Leading L80s',
  'BUCKET LIST/SHAME': 'Bucket / Shame',
  'VHS Village Top 100': 'VHS Top 100',
  '90ish Mins or Less': '90ish Mins',
  'Movies about movies': 'Movies about Movies',
};

const MAX_DISPLAY_LEN = 18;

export function shortenThemeName(name: string): string {
  const trimmed = name.trim();
  if (SHORT_NAMES[trimmed]) return SHORT_NAMES[trimmed];
  if (trimmed.length <= MAX_DISPLAY_LEN) return trimmed;
  // Word-boundary truncation — back up to the last space within the
  // budget so we don't lop off a word mid-letter, then add an ellipsis.
  const cut = trimmed.slice(0, MAX_DISPLAY_LEN);
  const lastSpace = cut.lastIndexOf(' ');
  const head = lastSpace > 8 ? cut.slice(0, lastSpace) : cut;
  return `${head}…`;
}

/** Returns true when the movie is a "main show" / regular episode. */
function isRegular(m: RawMovie): boolean {
  return !m.bonus && !m.vault && !m.pilot && !m.book && !m.watchalong;
}

export interface AllTimeStats {
  /** Movies with a 15/15 sum — the "bangers" — a subset of cleared. */
  bangers: number;
  /** Movies strictly above 10.5. */
  cleared: number;
  /** Movies strictly below 10.5. */
  buried: number;
  /** Movies tied with Dune at exactly 10.5. */
  dune: number;
  /** Subset listings each category exposes in its leaderboard popup. */
  bangerMovies: CatalogMovie[];
  clearedMovies: CatalogMovie[];
  buriedMovies: CatalogMovie[];
  duneMovies: CatalogMovie[];
  /** Themes with the highest average rating sum, top first. */
  topThemes: ThemeRanking[];
  /** Themes with the lowest average rating sum, bottom first. */
  lowThemes: ThemeRanking[];
  /** Per-host avg rating across movies that host picked. Sorted highest first. */
  hostPicks: HostRanking[];
}

export interface CatalogMovie {
  id: number;
  title: string;
  year: number | null;
  episode: number | null;
  sum: number;
  themeName: string | null;
  wikiUrl: string;
}

export interface ThemeRanking {
  themeId: number;
  name: string;
  shortName: string;
  avg: number;
  movieCount: number;
  /** Per-movie detail surfaced in the deep-dive sections. */
  movies: { id: number; title: string; episode: number | null; sum: number; wikiUrl: string }[];
}

export interface HostRanking {
  host: string;
  /** Display label, capitalized. */
  name: string;
  avg: number;
  movieCount: number;
  movies: { id: number; title: string; episode: number | null; sum: number; wikiUrl: string }[];
}

const MIN_MOVIES_FOR_THEME_RANKING = 3;
const THEME_RANKING_TAKE = 5;
/** Hosts whose picks we count on the leaderboard. The wiki uses lowercase
 *  short names; "dany" is a known typo of "danny". */
const HOSTS: { key: string; name: string; aliases: string[] }[] = [
  { key: 'slim',  name: 'Slim',  aliases: ['slim'] },
  { key: 'danny', name: 'Danny', aliases: ['danny', 'dany'] },
  { key: 'proto', name: 'Proto', aliases: ['proto'] },
];

/** Build the band-grouped, reverse-chronological timeline the page renders. */
export function buildTimeline(): {
  bands: ThemeBand[];
  totals: Record<Category, number>;
  allTime: AllTimeStats;
  scrapedAt: string;
} {
  const data = raw as RawData;
  // Keep every "regular" episode — including the handful the wiki hasn't
  // assigned an episode number to. They still belong on the timeline.
  const regular = data.movies.filter(isRegular);

  // Map theme_id (or synthetic key for themeless) -> ThemeBand.
  const bands = new Map<string, ThemeBand>();
  for (const m of regular) {
    const isDune = m.id === 91; // Dune (2021), episode 91
    const display: DisplayMovie = {
      id: m.id,
      title: m.movie,
      year: m.year_released,
      episode: m.episode,
      publishedAt: m.date_published,
      sum: m.sum,
      slim: m.slim,
      danny: m.danny,
      proto: m.proto,
      hostPick: m.host_pick,
      lbLink: m.lb_link ?? null,
      category: categoryFor(m.sum, isDune),
      distance: m.sum == null ? null : Number((m.sum - DUNE_LINE).toFixed(2)),
      isDune,
      posterUrl: m.spotifyThumb || `https://70mmwiki.com/api/artwork/thumbs/${m.id}.jpg`,
      wikiUrl: `https://70mmwiki.com/movies/${m.id}`,
    };

    if (m.month_theme_id && isMeaningfulThemeName(m.monthTheme?.theme_name)) {
      const key = `theme-${m.month_theme_id}`;
      const existing = bands.get(key);
      if (existing) {
        existing.movies.push(display);
        if (isDune) existing.isDuneMonth = true;
      } else {
        const rawStart = cleanDate(m.monthTheme!.start_date) ?? m.date_published ?? null;
        bands.set(key, {
          key,
          name: shortenThemeName(m.monthTheme!.theme_name!),
          startDate: rawStart,
          dateLabel: monthLabel(rawStart),
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

  // Sort movies inside each band: episode DESC (highest = leftmost). For
  // null-episode rows, fall back to publishedAt DESC so they slot into the
  // band by date rather than disappearing or clustering at zero.
  for (const band of bands.values()) {
    band.movies.sort((a, b) => {
      const ae = a.episode, be = b.episode;
      if (ae != null && be != null) return be - ae;
      if (ae != null) return -1;
      if (be != null) return 1;
      const ad = a.publishedAt ? Date.parse(a.publishedAt) : 0;
      const bd = b.publishedAt ? Date.parse(b.publishedAt) : 0;
      return bd - ad;
    });
  }

  // Sort bands by startDate DESC; missing dates go to the end.
  const sortedBands = Array.from(bands.values()).sort((a, b) => {
    const ad = a.startDate ? Date.parse(a.startDate) : -Infinity;
    const bd = b.startDate ? Date.parse(b.startDate) : -Infinity;
    return bd - ad;
  });

  const totals: Record<Category, number> = { cleared: 0, buried: 0, dune: 0, unrated: 0 };
  let bangers = 0;
  for (const b of sortedBands) {
    for (const m of b.movies) {
      totals[m.category]++;
      if (m.sum === 15) bangers++;
    }
  }

  // Compute per-theme rankings. Only count themes whose name is
  // meaningful (no "?" placeholders) AND have at least
  // MIN_MOVIES_FOR_THEME_RANKING rated movies, so single-banger themes
  // don't dominate the leaderboard. Average is the mean of sum values
  // across rated movies in the theme.
  const themeAggs = new Map<number, { name: string; movies: { id: number; title: string; episode: number | null; sum: number; wikiUrl: string }[] }>();
  for (const m of regular) {
    if (m.sum == null) continue;
    if (!m.month_theme_id || !isMeaningfulThemeName(m.monthTheme?.theme_name)) continue;
    const existing = themeAggs.get(m.month_theme_id);
    const movieEntry = {
      id: m.id,
      title: m.movie,
      episode: m.episode,
      sum: m.sum,
      wikiUrl: `https://70mmwiki.com/movies/${m.id}`,
    };
    if (existing) {
      existing.movies.push(movieEntry);
    } else {
      themeAggs.set(m.month_theme_id, {
        name: m.monthTheme!.theme_name!.trim(),
        movies: [movieEntry],
      });
    }
  }

  const eligibleThemes: ThemeRanking[] = [];
  for (const [themeId, agg] of themeAggs) {
    if (agg.movies.length < MIN_MOVIES_FOR_THEME_RANKING) continue;
    const sumTotal = agg.movies.reduce((a, x) => a + x.sum, 0);
    eligibleThemes.push({
      themeId,
      name: agg.name,
      shortName: shortenThemeName(agg.name),
      avg: Number((sumTotal / agg.movies.length).toFixed(2)),
      movieCount: agg.movies.length,
      movies: agg.movies.slice().sort((a, b) => b.sum - a.sum),
    });
  }
  // Highest avg → top. Lowest avg → bottom.
  const sortedByAvgDesc = eligibleThemes.slice().sort((a, b) => b.avg - a.avg);
  const topThemes = sortedByAvgDesc.slice(0, THEME_RANKING_TAKE);
  const lowThemes = sortedByAvgDesc.slice(-THEME_RANKING_TAKE).reverse();

  // Per-category movie listings. Sort orders chosen so the most
  // interesting end of each bucket sits at the top of its popup:
  //   bangers / cleared:  highest sum first (then newest)
  //   buried:             lowest sum first (then newest)
  //   dune:               newest first (every entry has sum === 10.5)
  const toCatalogMovie = (m: RawMovie): CatalogMovie => ({
    id: m.id,
    title: m.movie,
    year: m.year_released,
    episode: m.episode,
    sum: m.sum!,
    themeName: isMeaningfulThemeName(m.monthTheme?.theme_name)
      ? shortenThemeName(m.monthTheme!.theme_name!)
      : null,
    wikiUrl: `https://70mmwiki.com/movies/${m.id}`,
  });
  const byEpisodeDesc = (a: CatalogMovie, b: CatalogMovie) => (b.episode ?? 0) - (a.episode ?? 0);
  const bySumDescThenEp = (a: CatalogMovie, b: CatalogMovie) => (b.sum - a.sum) || byEpisodeDesc(a, b);
  const bySumAscThenEp = (a: CatalogMovie, b: CatalogMovie) => (a.sum - b.sum) || byEpisodeDesc(a, b);

  const rated = regular.filter(m => m.sum != null);
  const bangerMovies = rated.filter(m => m.sum === 15).map(toCatalogMovie).sort(byEpisodeDesc);
  const clearedMovies = rated.filter(m => m.sum! > DUNE_LINE).map(toCatalogMovie).sort(bySumDescThenEp);
  const buriedMovies = rated.filter(m => m.sum! < DUNE_LINE).map(toCatalogMovie).sort(bySumAscThenEp);
  const duneMovies = rated.filter(m => m.sum === DUNE_LINE).map(toCatalogMovie).sort(byEpisodeDesc);

  // Per-host picks. Group by host_pick (with alias normalization), then
  // average the sum across that host's rated picks. Co-picks (e.g.
  // "slim/dany") and guest picks aren't credited to any single host.
  const hostPicks: HostRanking[] = HOSTS.map(h => {
    const aliasSet = new Set(h.aliases);
    const picked = rated.filter(m => m.host_pick != null && aliasSet.has(m.host_pick.toLowerCase().trim()));
    const movies = picked.map(m => ({
      id: m.id,
      title: m.movie,
      episode: m.episode,
      sum: m.sum!,
      wikiUrl: `https://70mmwiki.com/movies/${m.id}`,
    })).sort((a, b) => b.sum - a.sum);
    const avg = movies.length === 0 ? 0 : Number((movies.reduce((a, x) => a + x.sum, 0) / movies.length).toFixed(2));
    return { host: h.key, name: h.name, avg, movieCount: movies.length, movies };
  }).sort((a, b) => b.avg - a.avg);

  const allTime: AllTimeStats = {
    bangers,
    cleared: totals.cleared,
    buried: totals.buried,
    dune: totals.dune,
    bangerMovies,
    clearedMovies,
    buriedMovies,
    duneMovies,
    topThemes,
    lowThemes,
    hostPicks,
  };

  return { bands: sortedBands, totals, allTime, scrapedAt: data.scrapedAt };
}
