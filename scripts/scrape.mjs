#!/usr/bin/env node
// Pull the entire 70mmwiki.com movies index into data/movies.json.
//
// Pagination: /api/movies returns { data: Movie[], pagination: { total, pageSize, page, totalPages } }.
// We follow page=1..totalPages with a 1-second sleep between requests to be
// polite (the wiki is small and fan-maintained). Identify ourselves in the
// User-Agent so the maintainers can find us if anything goes sideways.

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(__dirname, '..', 'data', 'movies.json');
const API_BASE = 'https://70mmwiki.com/api/movies';
const UA = '70mm-dune-line/0.1 (https://github.com/matthh/70mm-dune-line) - fan visualization, contact: matthh@gmail.com';
const SLEEP_MS = 1000;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Local overrides for movies the wiki hasn't tagged yet. Keyed by movie id;
// values are the month_theme_id the movie belongs to. The monthTheme object
// is filled in from another movie already tagged with that theme. When the
// wiki catches up, the scrape logs an "override REDUNDANT" warning so the
// entry can be deleted from this map.
const MONTH_THEME_OVERRIDES = {
  204: 2,  // 2020-12-25 The Star Wars Holiday Special -> CULT MONTH
  226: 11, // 2021-10-21 Halloween -> Halloweenies
  91:  12, // 2021-11-01 Dune -> Fall Vibes
  111: 16, // 2022-03-28 The Godfather -> Leading Ladies Vol. 2
  428: 16, // 2022-03-28 Attack of the Clones -> Leading Ladies Vol. 2
  153: 20, // 2022-07-07 Stranger Things S4 -> 90s Action
  429: 21, // 2022-08-13 Hard Target -> Animaugust
  161: 24, // 2022-11-29 Andor S1 -> Movies about movies
  224: 29, // 2023-04-07 Left Behind: The Movie -> Holy/Religion/Spiritual Month
  431: 30, // 2023-05-03 Thunderball -> May the 4th
  235: 30, // 2023-05-25 Return of the Jedi -> May the 4th
  257: 34, // 2023-09-15 Ahsoka -> Women Lovers / Femtember
  432: 35, // 2023-09-30 BASEketball -> TORMENTOBER
  262: 35, // 2023-10-13 Friday the 13th -> TORMENTOBER
  297: 41, // 2024-04-22 Batman -> 60s Month
  301: 42, // 2024-05-06 Planet of the Apes -> Planet of the Maypes
  302: 42, // 2024-05-12 Planet of the Apes -> Planet of the Maypes
  303: 42, // 2024-05-13 The Simpsons: "A Fish Called Selma" -> Planet of the Maypes
  312: 44, // 2024-07-01 Pearl -> LEADING LADIES V4
  317: 44, // 2024-07-12 Willy Wonka and the Chocolate Factory -> LEADING LADIES V4
  322: 45, // 2024-08-07 Left Behind -> ??
  434: 46, // 2024-09-19 Rogue One -> Scream Queens
  329: 46, // 2024-09-24 Megalopolis -> Scream Queens
  352: 49, // 2025-02-01 Friday the 13th Part III -> Fembruary
  365: 51, // 2025-04-09 Okja -> Tape Deck
  435: 52, // 2025-05-08 Raiders of the Lost Ark -> Mayssion Impossible
  372: 53, // 2025-06-04 Andor: Season 2 -> Mount Goatmore
  381: 53, // 2025-06-30 Basic Instinct -> Mount Goatmore
  393: 56, // 2025-09-29 Fatal Attraction -> Lo-fi Sci-fi Part 2
  407: 58, // 2025-11-24 Wicked -> Winvember
  408: 58, // 2025-11-24 Wicked: For Good -> Winvember
  433: 60, // 2026-01-21 Jackass: The Movie -> 70mm goes International
  425: 62, // 2026-03-30 Falling Down -> 70mm Goes Back to Jakku
  438: 63, // 2026-04-20 12 Angry Men -> Shame Month pt. 2
};

// Local overrides for movie-level rating sums the wiki hasn't published
// yet. Keyed by movie id; the value is the sum to assign. Individual
// host ratings (slim/danny/proto) are left null — the tooltip will show
// "—" for each. When the wiki publishes any sum value (regardless of
// match), the scrape logs an "override REDUNDANT" warning so the entry
// can be deleted from this map.
const RATING_OVERRIDES = {
  // (no active overrides — add entries here when the wiki lags a new episode)
};

async function fetchPage(page) {
  const url = `${API_BASE}?page=${page}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function main() {
  console.log(`[scrape] starting; out=${OUT_PATH}`);
  const first = await fetchPage(1);
  const totalPages = Number(first.pagination?.totalPages ?? 1);
  const total = Number(first.pagination?.total ?? first.data.length);
  console.log(`[scrape] page 1/${totalPages} (total=${total})`);

  const all = [...first.data];
  for (let p = 2; p <= totalPages; p++) {
    await sleep(SLEEP_MS);
    const body = await fetchPage(p);
    all.push(...body.data);
    console.log(`[scrape] page ${p}/${totalPages} (cumulative=${all.length})`);
  }

  if (all.length !== total) {
    console.warn(`[scrape] WARNING: collected ${all.length} records but pagination said ${total}`);
  }

  const themesById = new Map();
  for (const m of all) {
    if (m.monthTheme && m.month_theme_id != null) themesById.set(m.month_theme_id, m.monthTheme);
  }
  for (const [movieId, themeId] of Object.entries(MONTH_THEME_OVERRIDES)) {
    const movie = all.find(m => m.id === Number(movieId));
    if (!movie) { console.warn(`[scrape] override: movie id ${movieId} not in response`); continue; }
    const theme = themesById.get(themeId);
    if (!theme) { console.warn(`[scrape] override: theme id ${themeId} not in response`); continue; }
    if (movie.month_theme_id === themeId) {
      console.warn(`[scrape] override REDUNDANT: wiki now tags "${movie.movie}" with theme id ${themeId}. Remove movie id ${movieId} from MONTH_THEME_OVERRIDES.`);
      continue;
    }
    movie.month_theme_id = themeId;
    movie.monthTheme = theme;
    console.log(`[scrape] override: tagged "${movie.movie}" (id ${movie.id}) with theme "${theme.theme_name}" (id ${themeId})`);
  }

  for (const [movieId, sum] of Object.entries(RATING_OVERRIDES)) {
    const movie = all.find(m => m.id === Number(movieId));
    if (!movie) { console.warn(`[scrape] rating override: movie id ${movieId} not in response`); continue; }
    if (movie.sum != null) {
      console.warn(`[scrape] rating override REDUNDANT: wiki now publishes sum=${movie.sum} for "${movie.movie}". Remove movie id ${movieId} from RATING_OVERRIDES.`);
      continue;
    }
    movie.sum = sum;
    console.log(`[scrape] rating override: set sum=${sum} for "${movie.movie}" (id ${movie.id})`);
  }

  // Wiki-first artwork with Spotify fallback. The wiki is the canonical
  // source; we only attach a spotifyThumb when 70mmwiki returns 404 for
  // an episode AND the episode has a spotify_link. Once the wiki ships
  // proper artwork the next scrape clears the spotify fallback.
  //
  // Cost control: persist a wikiArtConfirmed flag per movie. Confirmed
  // ids skip the wiki HTTP entirely on subsequent runs, so the daily
  // scrape only re-checks new or still-missing ids — typically a few
  // recent episodes — instead of all 300+ every time.
  const prevCache = new Map();
  if (existsSync(OUT_PATH)) {
    try {
      const prev = JSON.parse(readFileSync(OUT_PATH, 'utf8'));
      for (const m of prev.movies ?? []) {
        prevCache.set(m.id, { spotifyThumb: m.spotifyThumb, wikiArtConfirmed: m.wikiArtConfirmed });
      }
    } catch (err) {
      console.warn(`[scrape] couldn't read prev movies.json:`, err.message);
    }
  }
  let wikiChecked = 0, wikiMissing = 0, spotifyFetched = 0, spotifyReused = 0, wikiAdded = 0;
  for (const movie of all) {
    const prev = prevCache.get(movie.id) || {};
    if (prev.wikiArtConfirmed) {
      movie.wikiArtConfirmed = true;
      continue;
    }
    wikiChecked++;
    const wikiUrl = `https://70mmwiki.com/api/artwork/thumbs/${movie.id}.jpg`;
    let wikiHas = false;
    try {
      const res = await fetch(wikiUrl);
      if (res.ok) wikiHas = true;
    } catch (err) {
      console.warn(`[scrape] wiki art check error for id ${movie.id}:`, err.message);
    }
    if (wikiHas) {
      movie.wikiArtConfirmed = true;
      if (prev.spotifyThumb) {
        wikiAdded++;
        console.log(`[scrape] wiki added art for "${movie.movie}" (id ${movie.id}); dropping spotifyThumb fallback`);
      }
      await sleep(SLEEP_MS);
      continue;
    }
    wikiMissing++;
    if (prev.spotifyThumb) {
      movie.spotifyThumb = prev.spotifyThumb;
      spotifyReused++;
      await sleep(SLEEP_MS);
      continue;
    }
    if (!movie.spotify_link) { await sleep(SLEEP_MS); continue; }
    try {
      const url = `https://open.spotify.com/oembed?url=${encodeURIComponent(movie.spotify_link)}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (res.ok) {
        const body = await res.json();
        if (body.thumbnail_url) {
          movie.spotifyThumb = body.thumbnail_url;
          spotifyFetched++;
        }
      } else {
        console.warn(`[scrape] spotify oembed HTTP ${res.status} for "${movie.movie}" (id ${movie.id})`);
      }
    } catch (err) {
      console.warn(`[scrape] spotify oembed error for "${movie.movie}" (id ${movie.id}):`, err.message);
    }
    await sleep(SLEEP_MS);
  }
  console.log(`[scrape] artwork: ${wikiChecked} wiki checks, ${wikiMissing} missing, ${spotifyFetched} spotify newly fetched, ${spotifyReused} reused, ${wikiAdded} wiki-restored`);

  const out = {
    scrapedAt: new Date().toISOString(),
    source: 'https://70mmwiki.com/api/movies',
    total: all.length,
    movies: all,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(out, null, 2));
  console.log(`[scrape] wrote ${all.length} movies to ${OUT_PATH}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
