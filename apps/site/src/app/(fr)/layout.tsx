import type { ReactNode } from 'react';
import { RootLayout } from '@/components/root-layout';
import { pageMetadata } from '@/lib/metadata';

export { viewport } from '@/lib/metadata';
export const metadata = pageMetadata('fr');

export default function Layout({ children }: { children: ReactNode }) {
  return <RootLayout locale="fr">{children}</RootLayout>;
}
