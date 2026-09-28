import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/config';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${SITE_URL}/`, alternates: { languages: { en: `${SITE_URL}/en/` } } },
    { url: `${SITE_URL}/en/`, alternates: { languages: { fr: `${SITE_URL}/` } } },
  ];
}
