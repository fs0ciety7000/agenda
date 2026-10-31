import clsx from 'clsx';
import type { ReactNode } from 'react';
import { WHEEL_LEFT, WHEEL_RIGHT } from '@/lib/brand';

/**
 * Apparition au défilement, sans JavaScript : `animation-timeline: view()` là où le navigateur le
 * permet (globals.css, `.reveal`), sinon l'élément est simplement visible.
 */
export function Reveal({
  as = 'div',
  className,
  children,
}: {
  as?: 'div' | 'li';
  className?: string;
  children: ReactNode;
}) {
  const Tag = as;
  return <Tag className={clsx('reveal', className)}>{children}</Tag>;
}

/** Le symbole Tandem ; `tone="night"` pour un fond sombre (cobalt → lilas). */
export function Mark({
  className,
  tone = 'paper',
}: {
  className?: string;
  tone?: 'paper' | 'night';
}) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={className}>
      <path
        fill={tone === 'night' ? 'var(--gn-brand-lilac)' : 'var(--gn-brand-cobalt)'}
        d={WHEEL_LEFT}
      />
      <path fill="var(--gn-brand-apricot)" d={WHEEL_RIGHT} />
    </svg>
  );
}

/** Logo : symbole + nom en Instrument Serif. */
export function Logo({
  tone = 'paper',
  className,
}: {
  tone?: 'paper' | 'night';
  className?: string;
}) {
  return (
    <span className={clsx('flex items-center gap-2.5', className)}>
      <Mark tone={tone} className="h-[1.6em] w-[1.6em]" />
      <span className="font-display leading-none">Tandem</span>
    </span>
  );
}

export function ButtonLink({
  href,
  variant = 'primary',
  children,
  className,
}: {
  href: string;
  variant?: 'primary' | 'secondary' | 'apricot';
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      className={clsx(
        'lift inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-[0.9375rem] font-semibold',
        variant === 'primary' && 'bg-accent text-accent-fg',
        variant === 'secondary' && 'border border-current/25 text-current hover:bg-current/5',
        variant === 'apricot' && 'bg-brand-apricot text-brand-night',
        className,
      )}
    >
      {children}
    </a>
  );
}

/** Cadre de téléphone (écran arrondi) pour les captures. */
export function PhoneFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        'relative overflow-hidden rounded-[2.75rem] border-[10px] border-[#05060F] bg-bg shadow-[0_40px_80px_-30px_rgb(5_6_15/0.6)]',
        className,
      )}
    >
      {children}
    </div>
  );
}
