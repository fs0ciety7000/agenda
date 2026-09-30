import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/config';
import { LANGS } from '@/lib/content';

export const dynamic = 'force-static';

export default function sitemap(): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(LANGS.map((l) => [l.locale, `${SITE_URL}${l.href}`]));
  return LANGS.map((l) => ({ url: `${SITE_URL}${l.href}`, alternates: { languages } }));
}
