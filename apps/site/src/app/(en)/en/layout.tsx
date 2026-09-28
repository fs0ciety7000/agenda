import type { ReactNode } from 'react';
import { RootLayout } from '@/components/root-layout';
import { pageMetadata } from '@/lib/metadata';

export { viewport } from '@/lib/metadata';
export const metadata = pageMetadata('en');

export default function Layout({ children }: { children: ReactNode }) {
  return <RootLayout locale="en">{children}</RootLayout>;
}
