'use client';

import clsx from 'clsx';
import { motion } from 'motion/react';
import type { ReactNode } from 'react';

/** Courbe « douce » des design tokens (--gn-motion-easing). */
export const EASE = [0.2, 0.8, 0.2, 1] as const;

/** Apparition au défilement (une seule fois), décalable pour les grilles. `as="li"` dans une liste. */
export function Reveal({
  delay = 0,
  y = 24,
  as = 'div',
  className,
  children,
}: {
  delay?: number;
  y?: number;
  as?: 'div' | 'li';
  className?: string;
  children: ReactNode;
}) {
  const Tag = as === 'li' ? motion.li : motion.div;
  return (
    <Tag
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.7, ease: EASE, delay }}
      className={className}
    >
      {children}
    </Tag>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  text,
  center = false,
}: {
  eyebrow: string;
  title: string;
  text?: string;
  center?: boolean;
}) {
  return (
    <Reveal
      className={clsx(
        'flex max-w-2xl flex-col gap-4',
        center && 'mx-auto items-center text-center',
      )}
    >
      <span className="text-sm font-semibold tracking-wide text-accent uppercase">{eyebrow}</span>
      <h2 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h2>
      {text ? <p className="text-lg leading-relaxed text-text-muted">{text}</p> : null}
    </Reveal>
  );
}

export function ButtonLink({
  href,
  variant = 'primary',
  children,
  className,
}: {
  href: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.a
      href={href}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className={clsx(
        'inline-flex h-12 items-center justify-center gap-2 rounded-full px-6 text-[0.9375rem] font-semibold transition-colors',
        variant === 'primary' &&
          'bg-accent text-accent-fg shadow-[0_8px_24px_-8px_color-mix(in_srgb,var(--color-accent)_60%,transparent)] hover:opacity-95',
        variant === 'secondary' &&
          'border border-border bg-surface text-text hover:bg-surface-muted',
        variant === 'ghost' && 'text-text hover:bg-surface-muted',
        className,
      )}
    >
      {children}
    </motion.a>
  );
}

/** Cadre de téléphone (écran arrondi, encoche) pour les captures et la maquette animée. */
export function PhoneFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={clsx(
        'relative overflow-hidden rounded-[2.6rem] border-[10px] border-[#1d171a] bg-bg shadow-[0_40px_80px_-30px_rgb(36_24_29/0.45)] dark:border-[#0b0809]',
        className,
      )}
    >
      <div
        aria-hidden
        className="absolute top-2 left-1/2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-[#1d171a]"
      />
      {children}
    </div>
  );
}
