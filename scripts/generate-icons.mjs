#!/usr/bin/env node
// Génère les icônes et visuels de marque depuis docs/brand/*.svg (identité « Deux fils »).
//
// Usage : node scripts/generate-icons.mjs [--play]   (--play : seulement la fiche Google Play)
// Produit aussi les images de partage du site (apps/site/public/img/og/{fr,en,nl}.png).
// Rendu par le Chromium de Playwright (require('playwright')), polices du dépôt intégrées :
// le résultat ne dépend ni du réseau ni des polices du système.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const NIGHT = '#0E1030';
const PAPER = '#F3EEE4';
const COBALT = '#2D4BFF';
const LILAC = '#8F96FF';
const APRICOT = '#FF8F5A';
const INK = '#14152B';
const MIST = '#A9ACC9';

const brand = (f) => readFileSync(join(ROOT, 'docs/brand', f), 'utf8');
const [left, right] = [...brand('tandem-symbol.svg').matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
const font = (f) =>
  `data:font/woff2;base64,${readFileSync(join(ROOT, 'apps/site/src/fonts', f)).toString('base64')}`;
const FONTS = `
@font-face{font-family:BrandSerif;src:url(${font('instrument-serif-regular.woff2')})}
@font-face{font-family:BrandSerif;font-style:italic;src:url(${font('instrument-serif-italic.woff2')})}
@font-face{font-family:BrandSans;src:url(${font('instrument-sans-regular.woff2')})}
@font-face{font-family:BrandSans;font-weight:600;src:url(${font('instrument-sans-semibold.woff2')})}`;

/** Le symbole (viewBox 0 0 100 100, encre utile 2–98 × 19–81), à l'échelle `art` px et centré. */
const symbol = (art, a = LILAC, b = APRICOT) =>
  `<svg width="${art}" height="${art}" viewBox="0 0 100 100"><path fill="${a}" d="${left}"/><path fill="${b}" d="${right}"/></svg>`;

/** Tuile : fond plein (`radius` en % du côté, 0 = carré), symbole de `scale` × côté. */
const tile = (size, { bg = NIGHT, radius = 0, scale = 0.62, a, b } = {}) =>
  `<div style="width:${size}px;height:${size}px;border-radius:${radius}%;background:${bg};display:grid;place-items:center">${symbol(Math.round(size * scale), a, b)}</div>`;

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });

async function shot(out, html, w, h, transparent = false) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(
    `<!doctype html><style>${FONTS}html,body{margin:0;background:transparent}</style>${html}`,
  );
  await page.evaluate(() => document.fonts.ready);
  const file = join(ROOT, out);
  mkdirSync(dirname(file), { recursive: true });
  await page.screenshot({
    path: file,
    omitBackground: transparent,
    clip: { x: 0, y: 0, width: w, height: h },
  });
}

/** Bannière Play Store (1024 × 500), par langue de la fiche. */
const FEATURE_TEXT = {
  'fr-FR': [
    'Deux vies,',
    'un seul rythme.',
    'Tâches à tour de rôle · courses en direct · calendrier commun',
  ],
  'en-US': ['Two lives,', 'one rhythm.', 'Chores in turns · live shopping list · shared calendar'],
  'nl-NL': [
    'Twee levens,',
    'één ritme.',
    'Taken om de beurt · live boodschappen · gedeelde agenda',
  ],
};

function featureGraphic([l1, l2, line]) {
  // Deux faisceaux de traits fins (le motif de l'identité), en opposition de phase.
  let threads = '';
  for (let k = 0; k < 2; k++)
    for (let i = 0; i < 16; i++) {
      let d = '';
      for (let x = 0; x <= 1024; x += 16) {
        const a = (x / 512) * Math.PI * 2;
        const y = 440 + Math.sin(a + k * Math.PI) * 44 + (i - 8) * 4 * (0.55 + 0.45 * Math.cos(a));
        d += `${x ? 'L' : 'M'}${x} ${y.toFixed(1)}`;
      }
      threads += `<path d="${d}" fill="none" stroke="${k ? APRICOT : LILAC}" stroke-width="1" opacity="${(0.2 + (i % 6) * 0.09).toFixed(2)}"/>`;
    }
  return `<div style="position:relative;width:1024px;height:500px;background:${NIGHT};overflow:hidden;font-family:BrandSans;color:${PAPER}">
  <svg style="position:absolute;inset:0" width="1024" height="500">${threads}</svg>
  <div style="position:absolute;left:72px;top:64px;display:flex;align-items:center;gap:18px">${symbol(64)}<span style="font-family:BrandSerif;font-size:44px">Tandem</span></div>
  <div style="position:absolute;left:72px;top:150px;font-family:BrandSerif;font-size:92px;line-height:.95;letter-spacing:-2px">${l1}<br><i style="color:${LILAC}">${l2}</i></div>
  <div style="position:absolute;left:74px;top:338px;font-size:22px;color:${MIST}">${line}</div>
</div>`;
}

/** Images de partage du site vitrine (1200 × 630), mêmes textes que l'ouverture (content.ts). */
const OG_TEXT = {
  fr: ['Chacun son tour,', 'c’est mieux à deux.', 'Gratuit · sans publicité · web et Android'],
  en: ['Taking turns', 'is better together.', 'Free · ad-free · web and Android'],
  nl: ['Om de beurt,', 'samen gaat het beter.', 'Gratis · zonder advertenties · web en Android'],
};

function ogImage([l1, l2, badge]) {
  return featureGraphic([l1, l2, badge])
    .replace('width:1024px;height:500px', 'width:1200px;height:630px')
    .replace(
      '<svg style="position:absolute;inset:0" width="1024" height="500">',
      '<svg style="position:absolute;left:0;top:-50px" width="1200" height="630" viewBox="0 0 1024 500" preserveAspectRatio="none">',
    )
    .replace(
      'top:150px;font-family:BrandSerif;font-size:92px',
      'top:170px;font-family:BrandSerif;font-size:104px',
    )
    .replace('left:74px;top:338px;font-size:22px', 'left:74px;top:420px;font-size:26px');
}

async function play() {
  await shot('docs/brand/play-store-icon-512.png', tile(512), 512, 512);
  for (const [locale, text] of Object.entries(FEATURE_TEXT)) {
    const images = `apps/android/fastlane/metadata/android/${locale}/images`;
    await shot(`${images}/icon.png`, tile(512), 512, 512);
    await shot(`${images}/featureGraphic.png`, featureGraphic(text), 1024, 500);
  }
}

await play();
if (!process.argv.includes('--play')) {
  for (const [lang, text] of Object.entries(OG_TEXT)) {
    await shot(`apps/site/public/img/og/${lang}.png`, ogImage(text), 1200, 630);
  }
  const res = 'apps/android/app/src/main/res';
  // Android : icône adaptative (108 dp ; 64 dp de dessin, dans le cercle des masques ronds).
  for (const [density, scale] of Object.entries({
    mdpi: 1,
    hdpi: 1.5,
    xhdpi: 2,
    xxhdpi: 3,
    xxxhdpi: 4,
  })) {
    const size = Math.round(108 * scale);
    await shot(
      `${res}/mipmap-${density}/ic_launcher_foreground.png`,
      `<div style="width:${size}px;height:${size}px;display:grid;place-items:center">${symbol(Math.round(64 * scale))}</div>`,
      size,
      size,
      true,
    );
  }
  writeFileSync(
    join(ROOT, res, 'values/ic_launcher_background.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<!-- Généré par scripts/generate-icons.mjs -->\n<resources>\n    <color name="ic_launcher_background">${NIGHT}</color>\n</resources>\n`,
  );
  // Écran de connexion Android (72 dp × 3) : tuile arrondie.
  await shot(`${res}/drawable-nodpi/logo.png`, tile(216, { radius: 22 }), 216, 216, true);

  // Web (conventions Next app/icon.png, app/apple-icon.png) + PWA.
  for (const app of [
    'apps/web/src/app',
    'apps/site/src/app/(fr)',
    'apps/site/src/app/(en)',
    'apps/site/src/app/(nl)',
  ]) {
    await shot(`${app}/icon.png`, tile(256, { radius: 22 }), 256, 256, true);
    await shot(`${app}/apple-icon.png`, tile(180), 180, 180);
  }
  for (const size of [192, 512]) {
    // « maskable » : dessin dans les 80 % centraux, fond prolongé.
    await shot(
      `apps/web/public/icons/maskable-${size}.png`,
      tile(size, { scale: 0.5 }),
      size,
      size,
    );
    await shot(
      `apps/web/public/icons/icon-${size}.png`,
      tile(size, { radius: 22 }),
      size,
      size,
      true,
    );
    await shot(
      `apps/site/public/img/icon-${size}.png`,
      tile(size, { radius: 22 }),
      size,
      size,
      true,
    );
  }
  // Documentation : logo de la barre de navigation et favicon.
  await shot('apps/docs/static/img/logo.png', tile(192, { radius: 22 }), 192, 192, true);
  await shot('apps/docs/static/img/favicon.png', tile(256, { radius: 22 }), 256, 256, true);
  // Symbole seul, sans fond (réseaux, présentations), et logo avec le nom sur papier.
  await shot(
    'docs/brand/tandem-icon-transparent.png',
    symbol(1024, COBALT, APRICOT),
    1024,
    1024,
    true,
  );
  const lockup = (svg, w) => svg.replace('<svg ', `<svg width="${w}" `);
  for (const out of [
    'apps/web/public/brand/tandem-wordmark.png',
    'apps/docs/static/img/tandem-wordmark.png',
    'docs/brand/tandem-wordmark-transparent.png',
  ]) {
    await shot(
      out,
      `<div style="width:640px;height:254px">${lockup(brand('tandem-logo.svg'), 640)}</div>`,
      640,
      254,
      true,
    );
  }
  await shot('apps/site/public/img/logo.png', tile(512, { radius: 22 }), 512, 512, true);
}
await browser.close();
console.warn('ok');
