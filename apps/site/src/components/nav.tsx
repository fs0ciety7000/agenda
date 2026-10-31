'use client';

import clsx from 'clsx';
import { Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { APP_URL } from '@/lib/config';
import { type Content, LANGS } from '@/lib/content';
import { ButtonLink, Logo } from './ui';

/** Mémorise le choix de langue (lu par nginx sur « / », cf. nginx.conf). */
export function rememberLang(locale: string) {
  document.cookie = `lang=${locale}; path=/; max-age=31536000; samesite=lax`;
}

/** Liens vers les autres langues du site. */
export function OtherLangs({ t, className }: { t: Content; className?: string }) {
  return LANGS.filter((l) => l.locale !== t.lang.current).map((l) => (
    <a
      key={l.locale}
      href={l.href}
      lang={l.locale}
      hrefLang={l.locale}
      onClick={() => rememberLang(l.locale)}
      aria-label={`${t.lang.label} : ${l.name}`}
      className={className}
    >
      {l.name}
    </a>
  ));
}

export function Nav({ t }: { t: Content }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = [
    { href: '#week', label: t.nav.week },
    { href: '#features', label: t.nav.features },
    { href: '#privacy', label: t.nav.privacy },
    { href: '#faq', label: t.nav.faq },
  ];

  return (
    <header
      className={clsx(
        'fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color] duration-300',
        open || scrolled ? 'border-border bg-bg/90 backdrop-blur-xl' : 'border-transparent',
      )}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <a href="#top" className="text-[1.625rem]">
          <Logo />
        </a>
        <ul className="hidden items-center gap-1 lg:flex">
          {links.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className="whitespace-nowrap rounded-full px-3.5 py-2 text-[0.9375rem] text-text-muted transition-colors hover:text-text"
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="hidden items-center gap-2 lg:flex">
          <OtherLangs
            t={t}
            className="whitespace-nowrap rounded-full px-2 py-2 text-sm text-text-muted hover:text-text"
          />
          <a
            href={`${APP_URL}/login`}
            className="whitespace-nowrap rounded-full px-3.5 py-2 text-[0.9375rem] font-medium text-text hover:bg-surface-muted"
          >
            {t.nav.login}
          </a>
          <ButtonLink
            href={`${APP_URL}/register`}
            className="min-h-10 whitespace-nowrap px-5 text-sm"
          >
            {t.nav.start}
          </ButtonLink>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={t.nav.menu}
          className="flex size-11 items-center justify-center rounded-full hover:bg-surface-muted lg:hidden"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </nav>
      {open ? (
        <div id="mobile-menu" className="menu-in lg:hidden">
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
            <li className="mt-2 flex flex-wrap items-center justify-between gap-3">
              <span className="flex items-center">
                <OtherLangs t={t} className="px-2 py-3 text-sm text-text-muted" />
              </span>
              <span className="flex items-center gap-2">
                <a href={`${APP_URL}/login`} className="px-3 py-3 text-sm font-medium">
                  {t.nav.login}
                </a>
                <ButtonLink href={`${APP_URL}/register`} className="min-h-11 px-5 text-sm">
                  {t.nav.start}
                </ButtonLink>
              </span>
            </li>
          </ul>
        </div>
      ) : null}
    </header>
  );
}
