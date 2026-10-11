import type { NextConfig } from 'next';

// Site vitrine : pages statiques (next build → out/), servies par nginx (Dockerfile).
const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  transpilePackages: ['@agenda/design-tokens'],
  // Plusieurs layouts racines (un par langue) : la page 404 a son propre <html> (global-not-found.tsx).
  experimental: { globalNotFound: true },
};

export default config;
