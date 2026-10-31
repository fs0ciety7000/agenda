// Captures de l'app pour le site vitrine → public/shots/{fr,en,nl}/*.webp (720 × 1440).
// 1. API et web démarrés (CLAUDE.md), puis dans apps/web, pour chaque langue :
//      VISUAL=1 VISUAL_PUBLIC=1 [VISUAL_LOCALE=en|nl] VISUAL_OUT=<dossier>/<langue> \
//        pnpm exec playwright test visual-review --project=mobile
// 2. node apps/site/scripts/shots.mjs <dossier>  (sharp, déjà installé par Next)
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
// sharp vient avec Next (dépendance du site) : résolu depuis lui.
const req = createRequire(join(here, '../package.json'));
const sharp = req(req.resolve('sharp', { paths: [req.resolve('next')] }));
const src = process.argv[2];
if (!src) throw new Error('Usage : node apps/site/scripts/shots.mjs <dossier des captures>');

// Capture de la revue visuelle → fichier du site (2_shopping : fonctions ; 1, 3 : données structurées).
const MAP = {
  '1_today': 'mobile-light-today',
  '2_shopping': 'mobile-light-shopping',
  '3_calendar': 'mobile-light-cal-day',
  '4_tasks': 'mobile-light-tasks',
  '5_dark': 'mobile-dark-today',
};
for (const lang of ['fr', 'en', 'nl']) {
  const out = resolve(here, '../public/shots', lang);
  mkdirSync(out, { recursive: true });
  for (const [file, shot] of Object.entries(MAP)) {
    const input = sharp(join(src, lang, `${shot}.png`));
    const { width } = await input.metadata();
    // Haut de l'écran au format 1:2 (cadre de téléphone du site), puis 720 × 1440.
    await input
      .extract({ left: 0, top: 0, width, height: width * 2 })
      .resize(720, 1440)
      .webp({ quality: 82 })
      .toFile(join(out, `${file}.webp`));
    console.log(`shots/${lang}/${file}.webp`);
  }
}
