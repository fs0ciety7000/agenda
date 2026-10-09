import { spawn } from 'node:child_process';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { RECEIPT_SCAN_TYPES, type ReceiptScanDto } from '@agenda/contracts';
import { readReceipt, todayIn } from '@agenda/domain';
import { AppException } from '../common/app-exception';

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

  /** Texte reconnu ; `--psm 4` : une colonne de lignes de tailles variables, comme un ticket. */
  private ocr(data: Buffer): Promise<string> {
    return new Promise((resolve, reject) => {
      const child = spawn('tesseract', ['stdin', 'stdout', '-l', LANGS, '--psm', '4'], {
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
      child.on('close', (code, signal) => {
        if (code === 0) return resolve(Buffer.concat(out).toString('utf8'));
        // Image abîmée (en-tête correct, contenu illisible) : rien de lu, l'utilisateur saisit.
        if (signal === null && /read|image|pix/i.test(err)) return resolve('');
        this.logger.warn(`Tesseract failed (${signal ?? code}): ${err.slice(0, 200)}`);
        reject(unavailable());
      });
      // Une photo abîmée peut fermer l'entrée avant la fin : l'erreur arrive par « close ».
      child.stdin.on('error', () => undefined);
      child.stdin.end(data);
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

function unavailable(): AppException {
  return new AppException(
    'RECEIPT_SCAN_UNAVAILABLE',
    HttpStatus.SERVICE_UNAVAILABLE,
    'Receipt reading is unavailable',
  );
}
