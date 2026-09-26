import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@agenda/contracts'],
  // L'API est servie sous la même origine (/v1/*) : cookies first-party, pas de CORS côté web.
  async rewrites() {
    return [{ source: '/v1/:path*', destination: `${API_URL}/v1/:path*` }];
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default createNextIntlPlugin('./src/i18n/request.ts')(config);
