import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { GuestShoppingView } from './guest-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('guest');
  // Lien secret : jamais indexé, et l'adresse n'est pas transmise aux sites liés.
  return { title: t('title'), robots: { index: false, follow: false }, referrer: 'no-referrer' };
}

/** Liste de courses d'un foyer, ouverte par un invité avec le lien secret (sans compte). */
export default function GuestShoppingPage() {
  return <GuestShoppingView />;
}
