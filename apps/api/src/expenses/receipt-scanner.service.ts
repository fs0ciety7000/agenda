import { spawn } from 'node:child_process';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { RECEIPT_SCAN_TYPES, type ReceiptScanDto } from '@agenda/contracts';
import { readReceipt, todayIn } from '@agenda/domain';
import { AppException } from '../common/app-exception';
import { prepareReceipt, rotate } from './receipt-image';

/** Une lecture prend une à quelques secondes de processeur : deux à la fois au plus. */
const MAX_PARALLEL = 2;
/** Au-delà, la photo est sans doute illisible : on rend la main. */
const TIMEOUT_MS = 30_000;
/** Langues des tickets attendus (paquets `tesseract-ocr-data-*` de l'image Docker). */
const LANGS = 'fra+nld+eng';

/**
 * Lit une photo de ticket avec Tesseract, installé sur le serveur : la photo ne quitte pas
 * l'instance et n'est pas enregistrée (traitée en mémoire, passée par l'entrée standard).
 */
@Injectable()
export class ReceiptScannerService {
  private readonly logger = new Logger(ReceiptScannerService.name);
  private running = 0;
  private readonly waiting: (() => void)[] = [];

  async scan(
    image: { contentType: string; data: Buffer },
    timeZone: string,
  ): Promise<ReceiptScanDto> {
    if (!RECEIPT_SCAN_TYPES.includes(image.contentType.toLowerCase())) {
      throw new AppException(
        'VALIDATION_FAILED',
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        'Receipt photo must be JPEG, PNG or WebP',
        { fieldErrors: { file: ['Unsupported type'] } },
      );
    }
    // Sécurité : Tesseract lit une entrée qui n'est pas une image comme une liste de chemins de
    // fichiers. On ne lui passe que de vraies images (signature vérifiée, pas le type annoncé).
    if (!isImage(image.data)) return { amountCents: null, date: null, merchant: null };
    const text = await this.limited(() => this.ocr(image.data));
    return readReceipt(text, todayIn(timeZone));
  }

  private async limited<T>(run: () => Promise<T>): Promise<T> {
    if (this.running >= MAX_PARALLEL) await new Promise<void>((r) => this.waiting.push(r));
    this.running++;
    try {
      return await run();
    } finally {
      this.running--;
      this.waiting.shift()?.();
    }
  }

  /**
   * Texte reconnu. La photo est d'abord préparée (orientation EXIF, recadrage sur le papier,
   * contraste, taille), puis redressée si Tesseract la voit tournée d'un quart de tour.
   */
  private async ocr(data: Buffer): Promise<string> {
    let png: Buffer;
    try {
      png = await prepareReceipt(data);
    } catch {
      // Image abîmée (en-tête correct, contenu illisible) : rien de lu, l'utilisateur saisit.
      return '';
    }
    const text = await this.read(png);
    // Rien de reconnaissable : la photo est peut-être tournée d'un quart de tour. La détection
    // d'orientation se trompe parfois sur un ticket droit : on ne l'écoute qu'en second recours.
    if (readReceipt(text, todayIn('UTC')).amountCents !== null) return text;
    const turn = await this.orientation(png);
    if (!turn) return text;
    const turned = await this.read(await rotate(png, turn));
    return score(turned) > score(text) ? turned : text;
  }

  /** `--psm 4` : une colonne de lignes de tailles variables, comme un ticket. */
  private async read(png: Buffer): Promise<string> {
    const { code, out, err, signal } = await this.tesseract(['-l', LANGS, '--psm', '4'], png);
    if (code === 0) return out;
    if (signal === null && /read|image|pix/i.test(err)) return '';
    this.logger.warn(`Tesseract failed (${signal ?? code}): ${err.slice(0, 200)}`);
    throw unavailable();
  }

  /**
   * Quart de tour à appliquer (0, 90, 180, 270), d'après la détection d'orientation de
   * Tesseract (`--psm 0`). 0 quand elle n'est pas sûre : trop peu de texte, ou ticket droit.
   */
  private async orientation(png: Buffer): Promise<number> {
    const { code, out } = await this.tesseract(['--psm', '0'], png);
    if (code !== 0) return 0;
    const angle = Number(/Rotate:\s*(\d+)/.exec(out)?.[1] ?? 0);
    const confidence = Number(/Orientation confidence:\s*([\d.]+)/.exec(out)?.[1] ?? 0);
    return [90, 180, 270].includes(angle) && confidence >= 1 ? angle : 0;
  }

  private tesseract(
    args: string[],
    input: Buffer,
  ): Promise<{ code: number | null; signal: NodeJS.Signals | null; out: string; err: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn('tesseract', ['stdin', 'stdout', ...args], {
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: TIMEOUT_MS,
        // Un seul fil par lecture : les fils OpenMP se gênent dès que le processeur est partagé
        // (deux lectures, le reste de l'API) et une lecture d'une seconde en prend trente.
        env: { ...process.env, OMP_THREAD_LIMIT: '1' },
      });
      const out: Buffer[] = [];
      let err = '';
      child.stdout.on('data', (c: Buffer) => out.push(c));
      child.stderr.on('data', (c: Buffer) => (err += c.toString()));
      child.on('error', (e) => {
        this.logger.error(`Tesseract unavailable: ${e.message}`);
        reject(unavailable());
      });
      child.on('close', (code, signal) =>
        resolve({ code, signal, out: Buffer.concat(out).toString('utf8'), err }),
      );
      // Une entrée fermée trop tôt : l'erreur arrive par « close ».
      child.stdin.on('error', () => undefined);
      child.stdin.end(input);
    });
  }
}

/** JPEG, PNG ou WebP d'après les premiers octets. */
export function isImage(data: Buffer): boolean {
  const jpeg = data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  const png = data
    .subarray(0, 8)
    .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp =
    data.subarray(0, 4).toString('latin1') === 'RIFF' &&
    data.subarray(8, 12).toString('latin1') === 'WEBP';
  return jpeg || png || webp;
}

/** Champs trouvés dans un texte : sert à garder la meilleure de deux lectures. */
function score(text: string): number {
  const r = readReceipt(text, todayIn('UTC'));
  return Number(r.amountCents !== null) * 2 + Number(r.date !== null) + Number(r.merchant !== null);
}

function unavailable(): AppException {
  return new AppException(
    'RECEIPT_SCAN_UNAVAILABLE',
    HttpStatus.SERVICE_UNAVAILABLE,
    'Receipt reading is unavailable',
  );
}
