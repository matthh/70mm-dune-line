# 70mm Dune Line — Claude Instructions

Read `docs/ARCHITECTURE.md` first. It is the living overview: purpose, stack, data flow, key files, data ownership, gotchas, and tech debt. Keep it updated (bump "Last reviewed" date) when changing the scraper, data shape, or build config.

## Fast facts

- **Fully static export.** `next.config.ts: output: 'export'`. No server runtime, no API routes, no auth.
- **Data lives in `data/movies.json`**, committed to the repo and rebuilt by `scripts/scrape.mjs` (run daily by GitHub Actions).
- **No writes, no user data.** The app reads the JSON at build time; posters and wiki links hot-link to `70mmwiki.com` at runtime.
- **Dev port:** `npm run dev` defaults to **3000**.
- **Deploy:** push to `main` auto-deploys via Vercel.

## Key invariants

- `DUNE_LINE = 10.5` (Dune 2021, wiki id `91`) — never change without coordinating with the data.
- `isRegular()` filter in `lib/data.ts` excludes vault/bonus/pilot/book/watchalong episodes. Main-show only.
- `MONTH_THEME_OVERRIDES` and `RATING_OVERRIDES` in `scripts/scrape.mjs` are manual corrections for wiki-lag; prune entries when the wiki catches up (scraper logs `REDUNDANT` warnings).
