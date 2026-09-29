'use client';

import clsx from 'clsx';
import { Menu, X } from 'lucide-react';
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from 'motion/react';
import { useState } from 'react';
import { APP_URL } from '@/lib/config';
import type { Content } from '@/lib/content';
import { ButtonLink, EASE } from './ui';

/** Mémorise le choix de langue (lu par nginx sur « / », cf. nginx.conf). */
export function rememberLang(href: string) {
  document.cookie = `lang=${href === '/' ? 'fr' : 'en'}; path=/; max-age=31536000; samesite=lax`;
}

export function Nav({ t }: { t: Content }) {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useMotionValueEvent(scrollY, 'change', (y) => setScrolled(y > 12));

  const links = [
    { href: '#features', label: t.nav.features },
    { href: '#how', label: t.nav.how },
    { href: '#privacy', label: t.nav.privacy },
    { href: '#faq', label: t.nav.faq },
  ];

  return (
    <motion.header
      initial={{ y: -24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: EASE }}
      className={clsx(
        'fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,border-color] duration-300',
        open
          ? 'border-b border-border bg-bg shadow-[0_8px_30px_-20px_rgb(36_24_29/0.35)]'
          : scrolled
            ? 'border-b border-border bg-bg/80 shadow-[0_8px_30px_-20px_rgb(36_24_29/0.35)] backdrop-blur-xl'
            : 'border-b border-transparent',
      )}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <a href="#top" className="flex items-center gap-2.5 font-semibold tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element -- export statique */}
          <img
            src="/img/icon-192.png"
            alt=""
            width={32}
            height={32}
            className="size-8 rounded-[9px]"
          />
          <span className="text-lg">Tandem</span>
        </a>
        <ul className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="rounded-full px-3.5 py-2 text-[0.9375rem] text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="hidden items-center gap-2 md:flex">
          <a
            href={t.lang.href}
            onClick={() => rememberLang(t.lang.href)}
            hrefLang={t.lang.href === '/' ? 'fr' : 'en'}
            aria-label={`${t.lang.label} : ${t.lang.other}`}
            className="rounded-full px-3 py-2 text-sm text-text-muted hover:text-text"
          >
            {t.lang.other}
          </a>
          <a
            href={`${APP_URL}/login`}
            className="rounded-full px-3.5 py-2 text-[0.9375rem] font-medium text-text hover:bg-surface-muted"
          >
            {t.nav.login}
          </a>
          <ButtonLink href={`${APP_URL}/register`} className="h-10 px-5 text-sm">
            {t.nav.start}
          </ButtonLink>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={t.nav.menu}
          className="flex size-10 items-center justify-center rounded-full hover:bg-surface-muted md:hidden"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>
      <AnimatePresence>
        {open ? (
          <motion.div
            id="mobile-menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="overflow-hidden md:hidden"
          >
            <ul className="flex flex-col gap-1 px-5 pb-5">
              {links.map((l) => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="block rounded-lg px-3 py-3 text-base hover:bg-surface-muted"
                  >
                    {l.label}
                  </a>
                </li>
              ))}
              <li className="mt-2 flex items-center justify-between gap-3">
                <a
                  href={t.lang.href}
                  onClick={() => rememberLang(t.lang.href)}
                  className="px-3 py-3 text-sm text-text-muted"
                >
                  {t.lang.other}
                </a>
                <span className="flex items-center gap-2">
                  <a href={`${APP_URL}/login`} className="px-3 py-3 text-sm font-medium">
                    {t.nav.login}
                  </a>
                  <ButtonLink href={`${APP_URL}/register`} className="h-11 px-5 text-sm">
                    {t.nav.start}
                  </ButtonLink>
                </span>
              </li>
            </ul>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </motion.header>
  );
}
