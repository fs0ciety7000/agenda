import sharp from 'sharp';

/** Au-delà, la photo est réduite (Tesseract n'y gagne rien et la lecture ralentit). */
const MAX_SIDE = 2400;
/** En deçà, elle est agrandie : un texte trop petit se lit mal. */
const MIN_WIDTH = 1000;
/** Image d'analyse pour trouver le papier (rapide, assez précise pour recadrer). */
const PROBE_WIDTH = 400;
/** 50 Mpx au plus : une photo de téléphone en fait 12 à 50 ; au-delà, refus net. */
const MAX_PIXELS = 50_000_000;

/**
 * Prépare une photo de ticket avant la lecture : orientation EXIF appliquée, ticket redressé
 * (s'il penche de moins de 10°), recadré sur le papier clair (table, main, fond sombre retirés),
 * niveaux de gris, contraste étiré, taille ramenée entre 1 000 et 2 400 px. Rend un PNG ; un quart
 * de tour se corrige ensuite, d'après l'orientation détectée par Tesseract.
 */
export async function prepareReceipt(data: Buffer): Promise<Buffer> {
  const grey = await sharp(data, { failOn: 'none', limitInputPixels: MAX_PIXELS })
    .rotate()
    .greyscale()
    .toBuffer({ resolveWithObject: true });
  let { data: pixels, info } = grey;
  const angle = await skew(pixels, info.width);
  if (angle !== 0) {
    // Le coin découvert par la rotation prend la teinte du fond (sombre), pas celle du papier :
    // le recadrage le retire ensuite.
    const rotated = await sharp(pixels, { limitInputPixels: MAX_PIXELS })
      .rotate(angle, { background: { r: 0, g: 0, b: 0 } })
      .greyscale()
      .toBuffer({ resolveWithObject: true });
    pixels = rotated.data;
    info = rotated.info;
  }
  const { width, height } = info;
  const crop = await paperBox(pixels, width, height);
  let image = sharp(pixels, { limitInputPixels: MAX_PIXELS });
  if (crop) image = image.extract(crop);
  const w = crop?.width ?? width;
  const h = crop?.height ?? height;
  const scale = Math.min(MAX_SIDE / Math.max(w, h), Math.max(1, MIN_WIDTH / w));
  if (scale !== 1) {
    image = image.resize({
      width: Math.round(w * scale),
      height: Math.round(h * scale),
      kernel: 'lanczos3',
    });
  }
  return image.normalise().sharpen().png().toBuffer();
}

/**
 * Angle (degrés, sens horaire) qui redresse le texte : celui où les lignes d'encre sont les plus
 * nettes (variance des sommes par ligne la plus forte), cherché de −10° à +10° sur une petite copie.
 * 0 si aucun angle ne fait nettement mieux que l'image telle quelle (ticket droit, ou tourné d'un
 * quart de tour : c'est alors l'orientation qui s'en charge).
 */
async function skew(data: Buffer, width: number): Promise<number> {
  const probe = await sharp(data)
    .resize({ width: Math.min(PROBE_WIDTH, width) })
    .png()
    .toBuffer();
  const threshold = otsu((await sharp(probe).raw().toBuffer()) as Buffer);
  const score = async (angle: number) => {
    const { data: px, info } = await sharp(probe)
      .rotate(angle, { background: { r: 255, g: 255, b: 255 } })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const rows: number[] = [];
    for (let y = 0; y < info.height; y++) {
      let ink = 0;
      for (let x = 0; x < info.width; x++) if (px[y * info.width + x]! < threshold) ink++;
      rows.push(ink);
    }
    const mean = rows.reduce((a, b) => a + b, 0) / rows.length;
    return rows.reduce((a, b) => a + (b - mean) ** 2, 0) / rows.length;
  };
  const straight = await score(0);
  let best = { angle: 0, score: straight };
  for (let angle = -10; angle <= 10; angle += 1) {
    if (angle === 0) continue;
    const s = await score(angle);
    if (s > best.score) best = { angle, score: s };
  }
  return best.score > straight * 1.15 ? best.angle : 0;
}

/** Tourne l'image (multiple de 90°, sens horaire). */
export function rotate(png: Buffer, degrees: number): Promise<Buffer> {
  return sharp(png).rotate(degrees).png().toBuffer();
}

/**
 * Rectangle du papier : les lignes et colonnes où dominent les pixels clairs (seuil d'Otsu sur
 * une petite copie). null quand rien ne se détache (ticket scanné, photo déjà cadrée).
 */
async function paperBox(
  data: Buffer,
  width: number,
  height: number,
): Promise<{ left: number; top: number; width: number; height: number } | null> {
  const probe = await sharp(data)
    .resize({ width: Math.min(PROBE_WIDTH, width) })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: pw, height: ph } = probe.info;
  const px = probe.data;
  const threshold = otsu(px);
  const bright = (x: number, y: number) => px[y * pw + x]! > threshold;
  // Une ligne (colonne) appartient au papier si plus du tiers de ses pixels sont clairs.
  const rows = Array.from({ length: ph }, (_, y) => {
    let n = 0;
    for (let x = 0; x < pw; x++) if (bright(x, y)) n++;
    return n / pw > 1 / 3;
  });
  const cols = Array.from({ length: pw }, (_, x) => {
    let n = 0;
    for (let y = 0; y < ph; y++) if (bright(x, y)) n++;
    return n / ph > 1 / 3;
  });
  const span = (on: boolean[]) => [on.indexOf(true), on.lastIndexOf(true)] as const;
  const [top, bottom] = span(rows);
  const [left, right] = span(cols);
  if (top < 0 || left < 0) return null;
  const area = ((bottom - top + 1) * (right - left + 1)) / (pw * ph);
  // Presque tout l'image : déjà cadrée ; presque rien : sans doute pas le papier.
  if (area > 0.92 || area < 0.08) return null;
  const k = width / pw;
  const margin = Math.round(4 * k);
  const x0 = Math.max(0, Math.floor(left * k) - margin);
  const y0 = Math.max(0, Math.floor(top * k) - margin);
  const x1 = Math.min(width, Math.ceil((right + 1) * k) + margin);
  const y1 = Math.min(height, Math.ceil((bottom + 1) * k) + margin);
  return { left: x0, top: y0, width: x1 - x0, height: y1 - y0 };
}

/** Seuil d'Otsu : sépare au mieux les pixels clairs (papier) des sombres (fond, encre). */
function otsu(px: Buffer): number {
  const hist = new Array<number>(256).fill(0);
  for (const v of px) hist[v]!++;
  const total = px.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i]!;
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!;
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t]!;
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
}
