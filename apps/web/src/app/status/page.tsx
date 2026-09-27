import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { StatusView } from './status-view';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('status');
  return { title: t('metaTitle'), description: t('intro'), robots: { index: true, follow: true } };
}

/** Page publique d'état du service (sans connexion). */
export default function StatusPage() {
  return <StatusView />;
}
