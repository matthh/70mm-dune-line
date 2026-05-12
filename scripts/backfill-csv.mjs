#!/usr/bin/env node
// Emit a CSV of regular 70mm episodes that need backfilling — either
// no rating yet, no theme assignment, or missing an episode number.
// Run: node scripts/backfill-csv.mjs > backfill.csv

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, '..', 'data', 'movies.json'), 'utf8'));

const today = new Date();
const regular = data.movies.filter(m => !m.bonus && !m.vault && !m.pilot && !m.book && !m.watchalong);

function csvField(v) {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function placeholderTheme(t) {
  if (!t || !t.theme_name) return true;
  const n = t.theme_name.trim();
  return n === '' || /^\?+$/.test(n);
}

const rows = [];
for (const m of regular) {
  const aired = m.date_published && new Date(m.date_published) <= today;
  const needsRating = aired && m.sum == null;
  const needsTheme = !m.month_theme_id || placeholderTheme(m.monthTheme);
  const needsEpisodeNum = m.episode == null;
  if (!needsRating && !needsTheme && !needsEpisodeNum) continue;

  const missing = [];
  if (needsEpisodeNum) missing.push('episode_number');
  if (needsRating) missing.push('rating');
  if (needsTheme) missing.push('theme');

  rows.push({
    id: m.id,
    episode: m.episode ?? '',
    aired: m.date_published ?? '',
    movie: m.movie ?? '',
    year: m.year_released ?? '',
    missing: missing.join('+'),
    current_theme: m.monthTheme?.theme_name ?? '',
    slim: m.slim ?? '',
    danny: m.danny ?? '',
    proto: m.proto ?? '',
    sum: m.sum ?? '',
    wiki_url: `https://70mmwiki.com/movies/${m.id}`,
  });
}

// Sort newest-first by air date; rows without air date go to the end.
rows.sort((a, b) => (b.aired || '').localeCompare(a.aired || ''));

const headers = ['id','episode','aired','movie','year','missing','current_theme','slim','danny','proto','sum','wiki_url'];
console.log(headers.join(','));
for (const r of rows) console.log(headers.map(h => csvField(r[h])).join(','));
