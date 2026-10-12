// Images Open Graph du site vitrine (1200 × 630, une par langue) → public/img/og/{fr,en,nl}.png.
// Tout vient du dépôt : illustration (assets/brand), police Inter (assets/fonts), couleurs des
// design tokens. Rejouable après un changement de slogan ou de logo :
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
const INTER = `data:font/woff2;base64,${b64('assets/fonts/Inter-latin-var.woff2')}`;
const INTER_EXT = `data:font/woff2;base64,${b64('assets/fonts/Inter-latin-ext-var.woff2')}`;

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
@font-face{font-family:Inter;src:url(${INTER}) format('woff2');font-weight:100 900;unicode-range:U+0000-00FF,U+2000-206F,U+20AC}
@font-face{font-family:Inter;src:url(${INTER_EXT}) format('woff2');font-weight:100 900;unicode-range:U+0100-024F,U+1E00-1EFF}
:root{--bg:#FAF6F2;--muted:#F2EAE4;--text:#24181D;--text-muted:#6F5F66;--accent:#7D4460;--border:#E6DAD2;--accent-fg:#FFFFFF}
*{margin:0;box-sizing:border-box}
html,body{width:1200px;height:630px;overflow:hidden}
body{background:var(--bg);color:var(--text);font-family:Inter,sans-serif;font-feature-settings:"cv11","ss01";position:relative}
.blob{position:absolute;border-radius:50%;background:var(--muted)}
.wrap{position:relative;display:flex;align-items:center;gap:52px;height:100%;padding:0 64px 0 60px}
.art{flex:none;width:420px;height:420px;border-radius:96px;filter:drop-shadow(0 12px 32px rgb(0 0 0/.10))}
.copy{display:flex;flex-direction:column;gap:26px;min-width:0}
.brand{font-size:30px;font-weight:600;color:var(--accent);letter-spacing:-.01em}
h1{font-size:52px;line-height:1.08;font-weight:650;letter-spacing:-.025em}
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
