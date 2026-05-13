#!/usr/bin/env node
// Pull the entire 70mmwiki.com movies index into data/movies.json.
//
// Pagination: /api/movies returns { data: Movie[], pagination: { total, pageSize, page, totalPages } }.
// We follow page=1..totalPages with a 1-second sleep between requests to be
// polite (the wiki is small and fan-maintained). Identify ourselves in the
// User-Agent so the maintainers can find us if anything goes sideways.

import { writeFileSync, mkdirSync } from 'node:fs';
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
// is filled in from another movie already tagged with that theme.
const MONTH_THEME_OVERRIDES = {
  438: 63, // 12 Angry Men -> Shame Month pt. 2
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
