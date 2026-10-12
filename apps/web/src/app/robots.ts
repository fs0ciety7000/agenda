import type { MetadataRoute } from 'next';

/** Site vitrine (docs/deployment.md §15), figé au build comme dans le middleware. */
const SITE_URL = (process.env.SITE_URL ?? '').replace(/\/+$/, '');

/**
 * robots.txt de l'app (tandem-agenda.app). Les pages restent explorables pour que les robots
 * lisent leur `noindex` (racine) ; seules l'API et ses fichiers sont exclus. Le plan du site
 * est celui du site vitrine, qui porte les pages à indexer.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/v1/'] },
    ...(SITE_URL ? { sitemap: `${SITE_URL}/sitemap.xml` } : {}),
  };
}
