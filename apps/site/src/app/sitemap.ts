import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/config';
import { LANGS } from '@/lib/content';
import { ogImage } from '@/lib/metadata';

export const dynamic = 'force-static';

/** Plan du site : les trois accueils, liés entre eux (hreflang) comme dans le <head>. */
export default function sitemap(): MetadataRoute.Sitemap {
  const languages = {
    ...Object.fromEntries(LANGS.map((l) => [l.locale, `${SITE_URL}${l.href}`])),
    'x-default': `${SITE_URL}/`,
  };
  return LANGS.map((l) => ({
    url: `${SITE_URL}${l.href}`,
    alternates: { languages },
    images: [`${SITE_URL}${ogImage(l.locale)}`],
  }));
}
