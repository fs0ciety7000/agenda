import Image from 'next/image';
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
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
      </div>
    </main>
  );
}
