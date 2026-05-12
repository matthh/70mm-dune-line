import type { NextConfig } from 'next';

// Pure static export — page reads movies.json at build time and outputs
// HTML+CSS+JS. No server runtime needed. Vercel serves the bundle as a
// CDN-cached static site; redeploys when GitHub Action commits a fresh
// data/movies.json.
const nextConfig: NextConfig = {
  output: 'export',
};

export default nextConfig;
