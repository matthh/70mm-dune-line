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
// All 34 prior overrides were confirmed REDUNDANT on 2026-09-08 (wiki now
// tags every affected movie natively). The map is kept empty so future
// wiki-lag corrections can be added here as needed.
const MONTH_THEME_OVERRIDES = {
  // (no active overrides — add entries here when the wiki lags a new episode)
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
