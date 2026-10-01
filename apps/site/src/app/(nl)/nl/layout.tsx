import type { ReactNode } from 'react';
import { RootLayout } from '@/components/root-layout';
import { pageMetadata } from '@/lib/metadata';

export { viewport } from '@/lib/metadata';
export const metadata = pageMetadata('nl');

export default function Layout({ children }: { children: ReactNode }) {
  return <RootLayout locale="nl">{children}</RootLayout>;
}
