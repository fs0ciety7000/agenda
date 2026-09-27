import type { NextConfig } from 'next';
import path from 'node:path';
import createNextIntlPlugin from 'next-intl/plugin';

// Lu au BUILD (les rewrites sont figés dans le build) : en Docker, l'URL interne `http://api:4000`.
const API_URL = process.env.API_URL ?? 'http://localhost:4000';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const config: NextConfig = {
  reactStrictMode: true,
  // Identifiant du build : invalide le cache hors ligne du navigateur à chaque version.
  env: { NEXT_PUBLIC_BUILD_ID: process.env.NEXT_PUBLIC_BUILD_ID ?? String(Date.now()) },
  poweredByHeader: false,
  // Image Docker minimale (server.js autonome) ; racine = monorepo pour tracer les paquets workspace.
  output: 'standalone',
  outputFileTracingRoot: path.join(import.meta.dirname, '../..'),
  transpilePackages: ['@agenda/contracts', '@agenda/domain'],
  // L'API est servie sous la même origine (/v1/*) : cookies first-party, pas de CORS côté web.
  async rewrites() {
    return [
      { source: '/v1/:path*', destination: `${API_URL}/v1/:path*` },
      // Sonde publique de disponibilité (web + API + base) pour la surveillance externe.
      { source: '/healthz', destination: `${API_URL}/health/ready` },
    ];
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default createNextIntlPlugin('./src/i18n/request.ts')(config);
