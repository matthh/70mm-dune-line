# Architecture — 70mm Dune Line

Last reviewed: 2026-07-14

## Purpose

A fully-static fan visualization of the [70mm podcast](https://70mmpodcast.com/)'s per-episode host ratings plotted against "The Dune Line" — the 10.5/15 sum the three hosts gave *Dune* (2021). The site shows a reverse-chronological horizontal timeline grouped by monthly themes, plus an all-time leaderboard. Main-show episodes only; vault, bonus, pilot, book, and watchalong episodes are excluded.

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), fully static export (`output: 'export'`) |
| Language | TypeScript 5, strict mode |
| React | 19 (client components only for interactivity) |
| Styling | Global CSS (`app/globals.css`), no CSS-in-JS or utility library |
| Fonts | Google Fonts — Oswald via `<link>` in layout |
| Data | `data/movies.json` — committed JSON, built at compile time |
| Deploy | Vercel static hosting; auto-deploys on push to `main` |
| Data refresh | GitHub Actions cron (daily at 13:00 UTC) runs scraper, commits JSON if changed |

No server runtime. No database. No API routes. No authentication.

## Data Ownership

This app **reads, never writes** any external data.

- `data/movies.json` is the only data artifact. It is committed to the repo and rebuilt by the scraper.
- The scraper (`scripts/scrape.mjs`) pulls from `https://70mmwiki.com/api/movies` — a public, fan-maintained wiki API.
- Poster images are **hot-linked** from `https://70mmwiki.com/api/artwork/thumbs/{id}.jpg`. The wiki serves these publicly; mirroring 300+ posters would bloat the deploy significantly.
- Spotify oEmbed thumbnail URLs (`spotifyThumb`) are used as fallback when the wiki 404s for a poster. These are stored in `movies.json` and served from Spotify's CDN.
- No user data is collected or stored anywhere.

## Data Flow

```
70mmwiki.com/api/movies
        │
        ▼
scripts/scrape.mjs   (run by GitHub Actions or manually)
        │  - paginated fetch
        │  - applies MONTH_THEME_OVERRIDES (manual wiki-lag corrections)
        │  - applies RATING_OVERRIDES (pre-publication ratings)
        │  - checks wiki artwork; falls back to Spotify oEmbed thumbnail
        ▼
data/movies.json     (committed to repo)
        │
        ▼  (Next.js build — static import)
lib/data.ts
  buildTimeline()
        │  - filters to regular episodes
        │  - groups into ThemeBand[] by month_theme_id / calendar month
        │  - sorts bands reverse-chronologically
        │  - computes AllTimeStats (bangers/cleared/buried/dune counts,
        │    theme rankings, host-pick rankings)
        ▼
app/page.tsx         (Server Component — runs at build time)
        │
        ├─► app/Timeline.tsx   ('use client' — handles filter chips,
        │                        sort modes, jump autocomplete, hover tooltip,
        │                        scroll-to + flash animation)
        │
        └─► app/AllTimeStats.tsx  ('use client' — leaderboard bars,
                                   modal popup with pagination)
```

## Key Files

| File | Role |
|---|---|
| `lib/data.ts` | All data transformation: types (`RawMovie`, `DisplayMovie`, `ThemeBand`, `AllTimeStats`), `buildTimeline()`, `shortenThemeName()`, `categoryFor()` |
| `app/page.tsx` | Root server component; calls `buildTimeline()` at build time; passes props to `Timeline` and `AllTimeStats` |
| `app/Timeline.tsx` | Client component; renders horizontal scrolling chart, filter chips, sort modes, jump autocomplete, Dune Line overlay, hover tooltip |
| `app/AllTimeStats.tsx` | Client component; renders leaderboard bar chart, theme/host rank panels, movie-grid modal |
| `app/layout.tsx` | Root layout; metadata, Google Fonts link |
| `app/globals.css` | All CSS; dark sand/olive/coral palette |
| `scripts/scrape.mjs` | Data scraper; pagination, overrides, artwork caching |
| `scripts/backfill-csv.mjs` | Dev utility; emits CSV of episodes needing data backfills |
| `data/movies.json` | Committed data artifact; ~450 movies as of 2026-06 |
| `.github/workflows/refresh.yml` | Daily cron: runs scraper, commits changed JSON, triggers Vercel redeploy |
| `next.config.ts` | `output: 'export'` — pure static, no server runtime |

## Endpoint Reference

There are no API endpoints. The site is a pure static export. All data access is:

- **Build time:** `import raw from '../data/movies.json'` in `lib/data.ts`
- **Runtime (client):** poster images and wiki links hot-linked to `70mmwiki.com`; Letterboxd review links built from `lb_link_val` slug + known host handles

External domains accessed by the browser at runtime:
- `https://70mmwiki.com` — posters and wiki deep-links
- `https://letterboxd.com` — per-host review links in the tooltip
- `https://fonts.googleapis.com` / `https://fonts.gstatic.com` — Oswald font

## Special Data Logic

### The Dune Line constant
`DUNE_LINE = 10.5` (defined in `lib/data.ts`). Dune (2021) is identified by its wiki id `91`. Movies tied at exactly 10.5 are categorized as `'dune'` (sand-colored), not `'cleared'`.

### Manual override maps in `scripts/scrape.mjs`
- **`MONTH_THEME_OVERRIDES`**: ~35 entries correcting wiki theme-tagging lag. Keyed by movie id; value is the target `month_theme_id`. Logged as `REDUNDANT` once the wiki catches up so entries can be pruned.
- **`RATING_OVERRIDES`**: small map for pre-publication sum values. Same REDUNDANT-log mechanism.

### Artwork caching
The scraper persists a `wikiArtConfirmed: true` flag per movie in `movies.json`. On subsequent runs, confirmed IDs skip the HTTP artwork check entirely, so the daily scrape only rechecks new/missing episodes rather than all 400+.

### Theme band grouping
Movies with a meaningful `month_theme_id` and non-placeholder `theme_name` go into a `theme-{id}` band. Movies with no theme (or placeholder `"?"` names) are bucketed into a synthetic `themeless-YYYY-MM` band by their publication month.

## Deprecated Paths

None. This is a small, single-purpose app with no deprecated endpoints or removed features. The `backfill-csv.mjs` script is a dev utility (not part of any CI flow) and could be removed without functional impact.

## Tech Debt

- **Hardcoded Dune id `91`** in `lib/data.ts` (`isDune = m.id === 91`). If the wiki ever re-keys that movie the line constant silently breaks. Low risk since the wiki id is stable.
- **Growing `MONTH_THEME_OVERRIDES` map** (~35 entries and counting). There is no automated pruning; stale entries accumulate until someone reads the REDUNDANT warnings and manually cleans up. Could become a maintenance burden at scale.
- **Hot-linked poster images** create a runtime dependency on 70mmwiki.com availability. If the wiki goes offline, all posters 404 — the striped placeholder CSS class covers this gracefully, but it's worth noting.
- **`isVisible` defined inside the component** (`Timeline.tsx`) then used inside a `useMemo` with a suppressed exhaustive-deps warning (`eslint-disable-line`). The suppression is intentional (the function is always stable relative to the `active` set), but it's fragile if the function signature changes.
- **No tests**. The data transformation in `lib/data.ts` is pure and well-suited to unit tests; none exist.
- **`backfill.csv` `.gitignore`d** since the 2026-06-09 audit. The generated artifact is no longer tracked, but `scripts/backfill-csv.mjs` remains as a dev utility.
- **PostCSS 8.4.31 (installed via next@16.2.6)** has a moderate XSS vulnerability (GHSA-qx2v-qp2m-jg93) in its CSS stringify output. This affects the build toolchain only — not the deployed static bundle, since PostCSS is a dev/build-time tool. Fix: update `next` to 16.2.9+ or wait for Next.js to pull in postcss ≥ 8.5.10. Open since 2026-06-16 audit.
- **`at-row.clickable` hover/cursor styles invisible** — `.at-row` uses `display: contents`, so `background`, `cursor`, and box-model properties on it have no effect. The "clickable" visual affordance does not render. Open since 2026-06-09 audit.

## Gotchas

- **Episode number `null` is common**: a handful of regular episodes (Okja, Megalopolis, Willy Wonka, etc.) have no episode number assigned by the wiki. These are handled throughout with `m.episode ?? '—'` fallbacks. Sort tiebreakers fall back to `publishedAt`.
- **`movies.json` is 453-entry** as of 2026-07-13. The Next.js static import bundles it into the build; at current size (~200 KB) this is fine but worth monitoring if the wiki grows substantially.
- **Dev port is 3000** (`npm run dev`). README correctly states 3000. No custom port is pinned in `next.config.ts`.
- **Vercel static export**: `output: 'export'` means no ISR, no server actions, no middleware. Everything must work at build time or in the client bundle.
- **GitHub Actions `contents: write`**: The refresh workflow has broad write permission on the repo so it can commit updated JSON. This is intentional but means a compromised Actions token could push arbitrary commits.
