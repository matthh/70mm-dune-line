# 70mm — The Dune Line

A chronological investigation of the [70mm podcast](https://70mmpodcast.com/)'s host ratings against **The Dune Line** — the 10.5/15 sum the hosts gave Dune (2021), now an established benchmark on the show.

Reverse-chronological horizontal timeline. Olive for movies that cleared the line, coral for movies buried below it, sand for the line itself and Dune. Vault episodes excluded.

## Data

Pulled from [70mmwiki.com](https://70mmwiki.com)'s public `/api/movies` endpoint and cached in `data/movies.json`. Refreshed weekly via a GitHub Action that runs the scraper, commits the updated JSON, and lets Vercel auto-redeploy.

Not affiliated with the show or the wiki.

## Develop

```bash
npm install
npm run scrape   # re-pull data/movies.json from 70mmwiki
npm run dev      # next dev on localhost:3000
npm run build    # static export -> out/
```

## Deploy

Vercel deploys on every push to `main`. Output is fully static (`next.config.ts: output: 'export'`).
