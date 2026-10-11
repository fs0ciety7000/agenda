import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ButtonLink } from '@/components/ui';
import { DOCS_URL } from '@/lib/config';
import { content, LANGS } from '@/lib/content';
import { viewport } from '@/lib/metadata';
import './globals.css';

export { viewport };

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = {
  title: 'Tandem — 404',
  robots: { index: false, follow: false },
  icons: { icon: '/img/icon-192.png' },
};

/*
 * L'export statique produit une seule page `out/404.html`, servie par nginx pour toute adresse
 * inconnue, quelle que soit la langue. Les trois versions sont dans la page ; ce script, exécuté
 * avant l'affichage, choisit la langue : préfixe de l'adresse (/en/, /nl/), puis le cookie
 * « lang » du sélecteur de langue, puis les langues du navigateur. Repli (et sans JavaScript) :
 * l'anglais.
 */
const pickLang = `(function(){try{var d=document.documentElement,s=['fr','en','nl'],l='en',
m=location.pathname.match(/^\\/(en|nl)(\\/|$)/),c=document.cookie.match(/(?:^|; )lang=(fr|en|nl)/);
if(m)l=m[1];else if(c)l=c[1];else{var n=navigator.languages||[navigator.language||''];
for(var i=0;i<n.length;i++){var x=String(n[i]).slice(0,2).toLowerCase();if(s.indexOf(x)>=0){l=x;break}}}
d.lang=l;d.setAttribute('data-lang',l)}catch(e){}})();`;

/** Page « introuvable » du site vitrine (aucun layout racine commun : une par langue). */
export default function GlobalNotFound() {
  return (
    <html lang="en" data-lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: pickLang }} />
        <style>
          {LANGS.map(
            ({ locale }) => `html[data-lang='${locale}'] [data-nf]:not([data-nf='${locale}'])`,
          ).join(',') + '{display:none}'}
        </style>
      </head>
      <body>
        <main className="relative isolate flex min-h-svh items-center overflow-hidden px-5 py-16">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute -top-32 left-[-20%] size-[28rem] rounded-full bg-accent/15 blur-3xl sm:size-[36rem]" />
            <div className="absolute right-[-20%] bottom-[-15%] size-[24rem] rounded-full bg-member-ocean/12 blur-3xl sm:size-[32rem]" />
          </div>
          {LANGS.map(({ locale, href }) => {
            const t = content[locale].notFound;
            return (
              <section
                key={locale}
                data-nf={locale}
                lang={locale}
                className="mx-auto flex w-full max-w-xl flex-col items-center gap-6 text-center"
              >
                <a href={href} className="flex items-center gap-2.5 font-semibold tracking-tight">
                  {/* eslint-disable-next-line @next/next/no-img-element -- export statique */}
                  <img
                    src="/img/icon-192.png"
                    alt=""
                    width={40}
                    height={40}
                    className="size-10 rounded-[11px]"
                  />
                  <span className="text-xl">Tandem</span>
                </a>
                <p className="text-sm font-semibold tracking-wide text-accent uppercase">
                  {t.code}
                </p>
                <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                  {t.title}
                </h1>
                <p className="text-pretty text-lg leading-relaxed text-text-muted">{t.text}</p>
                <div className="flex w-full flex-col justify-center gap-3 sm:w-auto sm:flex-row">
                  <ButtonLink href={href}>{t.home}</ButtonLink>
                  <ButtonLink href={DOCS_URL} variant="secondary">
                    {t.docs}
                  </ButtonLink>
                </div>
              </section>
            );
          })}
        </main>
      </body>
    </html>
  );
}
