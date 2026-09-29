// Rendu image par image de index.html (Playwright + Chromium).
//   node render.mjs sheet                → planche contact (une image par temps fort) dans ../out/
//   node render.mjs frames v|s|h         → ../out/frames-<f>/0000.png … (30 i/s, 20 s)
// Lancer depuis un dossier où @playwright/test est installé (ex. apps/web) :
//   node ../../assets/motion/render.mjs sheet
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(join(process.cwd(), 'package.json'));
const { chromium } = require('@playwright/test');

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..'); // assets/
const out = join(root, 'out');
const TL = JSON.parse(readFileSync(join(here, 'timeline.json'), 'utf8'));
const SIZES = { v: [1080, 1920], s: [1080, 1080], h: [1920, 1080] };
const TYPES = { '.html': 'text/html', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json', '.mjs': 'text/javascript' };

const server = createServer((req, res) => {
  const p = join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  try {
    statSync(p);
    res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' });
    res.end(readFileSync(p));
  } catch {
    res.writeHead(404).end();
  }
}).listen(0);
const port = server.address().port;

async function open(browser, f) {
  const [width, height] = SIZES[f];
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:${port}/motion/index.html?f=${f}`);
  await page.evaluate(() => window.ready);
  return page;
}

const [mode = 'sheet', fmt = 'v'] = process.argv.slice(2);
const browser = await chromium.launch();
mkdirSync(out, { recursive: true });

if (mode === 'sheet') {
  // Une image représentative par temps fort, pour chaque format.
  const TIMES = [
    ['1 · Accroche', 2.7],
    ['2 · Assemblage', 3.72],
    ['2 · Produit', 5.2],
    ['3a · Cocher', 8.2],
    ['3b · Répéter', 11.12],
    ['3c · Glisser', 14.1],
    ['4 · Le chiffre', 16.9],
    ['5 · Logo + CTA', 19.1],
  ];
  for (const f of ['v', 's', 'h']) {
    const page = await open(browser, f);
    for (const [i, [, t]] of TIMES.entries()) {
      await page.evaluate((x) => window.renderAt(x), t);
      await page.screenshot({ path: join(out, `sheet-${f}-${i}.png`) });
    }
    await page.close();
  }
  console.log(JSON.stringify(TIMES));
} else {
  const dir = join(out, `frames-${fmt}`);
  mkdirSync(dir, { recursive: true });
  const page = await open(browser, fmt);
  const n = TL.duration * TL.fps;
  for (let i = 0; i < n; i++) {
    const file = join(dir, `${String(i).padStart(4, '0')}.png`);
    if (existsSync(file) && process.env.RESUME) continue;
    await page.evaluate((x) => window.renderAt(x), i / TL.fps);
    await page.screenshot({ path: file });
    if (i % 60 === 0) console.log(fmt, i, '/', n);
  }
}
await browser.close();
server.close();
