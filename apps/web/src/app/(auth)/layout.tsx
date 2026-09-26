import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
