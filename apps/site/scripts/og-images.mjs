// Images Open Graph du site vitrine (1200 × 630, une par langue) → public/img/og/{fr,en,nl}.png.
// Tout vient du dépôt : illustration (assets/brand), police Instrument Sans (apps/site/src/fonts),
// couleurs des design tokens (refonte « Duo » : blanc, neutres, encre). Rejouable après un changement de slogan ou de logo :
//   NODE_PATH=<dossier où playwright est installé>/node_modules node apps/site/scripts/og-images.mjs
// (ou depuis un paquet qui a @playwright/test, ex. apps/web : node ../site/scripts/og-images.mjs).
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(join(process.cwd(), 'package.json'));
const { chromium } = (() => {
  for (const name of ['playwright', '@playwright/test']) {
    try {
      return require(name);
    } catch {
      /* essai suivant */
    }
  }
  throw new Error('Playwright introuvable : renseigner NODE_PATH (voir en tête du script).');
})();

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const out = resolve(here, '../public/img/og');
const b64 = (p) => readFileSync(join(repo, p)).toString('base64');
const ILLUSTRATION = `data:image/png;base64,${b64('assets/brand/tandem-icon-transparent.png')}`;
const font = (w) =>
  `data:font/woff2;base64,${b64(`apps/site/src/fonts/instrument-sans-${w}.woff2`)}`;
const FONTS = { 400: font('regular'), 500: font('medium'), 600: font('semibold') };

// Mêmes textes que le site (content.ts : hero.title, hero.badge) et la bannière Play.
const TEXT = {
  fr: {
    title: ['L’équilibre parfait', 'pour votre foyer.'],
    points: [
      'Tâches partagées, chacun son tour',
      'Liste de courses en temps réel',
      'Rappels, hors ligne, widgets',
    ],
    badge: 'Gratuit · sans publicité · web et Android',
  },
  en: {
    title: ['The perfect balance', 'for your household.'],
    points: [
      'Shared chores, taking turns',
      'Real-time shopping list',
      'Reminders, offline, widgets',
    ],
    badge: 'Free · ad-free · web and Android',
  },
  nl: {
    title: ['Het perfecte evenwicht', 'voor je huishouden.'],
    points: [
      'Gedeelde klusjes, om de beurt',
      'Live boodschappenlijst',
      'Herinneringen, offline, widgets',
    ],
    badge: 'Gratis · zonder advertenties · web en Android',
  },
};

const html = (t, lang) => `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><style>
${Object.entries(FONTS)
  .map(
    ([w, url]) =>
      `@font-face{font-family:'Instrument Sans';src:url(${url}) format('woff2');font-weight:${w}}`,
  )
  .join('\n')}
:root{--bg:#FFFFFF;--muted:#F3F4F6;--text:#17181C;--text-muted:#5F636B;--accent:#17181C;--border:#E5E7EB;--accent-fg:#FFFFFF}
*{margin:0;box-sizing:border-box}
html,body{width:1200px;height:630px;overflow:hidden}
body{background:var(--bg);color:var(--text);font-family:'Instrument Sans',sans-serif;position:relative}
.blob{position:absolute;border-radius:50%;background:var(--muted)}
.wrap{position:relative;display:flex;align-items:center;gap:52px;height:100%;padding:0 64px 0 60px}
.art{flex:none;width:420px;height:420px;border-radius:96px;filter:drop-shadow(0 12px 32px rgb(23 24 28/.10))}
.copy{display:flex;flex-direction:column;gap:26px;min-width:0}
.brand{font-size:30px;font-weight:600;color:var(--text);letter-spacing:-.01em}
h1{font-size:54px;line-height:1.08;font-weight:600;letter-spacing:-.03em}
ul{list-style:none;padding:0;display:flex;flex-direction:column;gap:12px;font-size:25px;color:var(--text-muted)}
li{display:flex;align-items:center;gap:14px}
li::before{content:"";width:12px;height:12px;border-radius:50%;background:var(--accent);flex:none}
.foot{display:flex;flex-direction:column;gap:10px;margin-top:4px}
.badge{align-self:flex-start;padding:9px 18px;border-radius:999px;background:var(--accent);color:var(--accent-fg);font-size:20px;font-weight:600}
.url{font-size:20px;color:var(--text-muted);letter-spacing:.01em}
</style></head><body>
<div class="blob" style="width:520px;height:520px;right:-170px;top:-250px"></div>
<div class="blob" style="width:380px;height:380px;left:-170px;bottom:-230px"></div>
<div class="wrap">
  <img class="art" src="${ILLUSTRATION}" alt="">
  <div class="copy">
    <div class="brand">Tandem</div>
    <h1>${t.title[0]}<br>${t.title[1]}</h1>
    <ul>${t.points.map((p) => `<li>${p}</li>`).join('')}</ul>
    <div class="foot"><span class="badge">${t.badge}</span><span class="url">decouvrir.tandem-agenda.app</span></div>
  </div>
</div></body></html>`;

mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
for (const [lang, t] of Object.entries(TEXT)) {
  await page.setContent(html(t, lang), { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(out, `${lang}.png`), type: 'png' });
  console.log(`og/${lang}.png`);
}
await browser.close();
