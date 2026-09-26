import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import type { ReactNode } from 'react';

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('app');
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Image
          src="/icons/icon-192.png"
          alt="Agenda G & N"
          width={72}
          height={72}
          priority
          className="mb-6"
        />
        {children}
        <p className="mt-10 text-center text-[0.8125rem] text-text-muted">
          <Link href="/privacy" className="underline-offset-4 hover:underline">
            {t('privacy')}
          </Link>
        </p>
      </div>
    </main>
  );
}
