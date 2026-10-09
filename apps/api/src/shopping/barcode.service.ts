import { spawn } from 'node:child_process';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { BARCODE_SCAN_TYPES, type BarcodeLookupDto } from '@agenda/contracts';
import { isValidBarcode, normalizeBarcode } from '@agenda/domain';
import sharp from 'sharp';
import { AppException } from '../common/app-exception';
import type { HouseholdContext } from '../common/request-context';
import { isImage } from '../expenses/receipt-scanner.service';
import { PrismaService } from '../prisma/prisma.service';
import { OpenFoodFactsClient } from './open-food-facts.client';

/** Au-delà, la photo est réduite : zbar n'y gagne rien. */
const MAX_SIDE = 2000;
const MAX_PIXELS = 50_000_000;
const TIMEOUT_MS = 15_000;
/** Codes produits seulement (pas de QR code : son contenu serait du texte quelconque). */
const SYMBOLS = ['ean13', 'ean8', 'upca', 'upce'];

const empty: BarcodeLookupDto = { barcode: null, name: null, source: null };

/**
 * Code-barres d'un produit, pour l'ajouter aux courses. La photo est lue sur le serveur par zbar
 * (rien n'est envoyé ailleurs, la photo n'est pas conservée) ; le nom vient de la mémoire du
 * foyer, sinon d'Open Food Facts (le code seul est envoyé), et le foyer le retient ensuite.
 */
@Injectable()
export class BarcodeService {
  private readonly logger = new Logger(BarcodeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly off: OpenFoodFactsClient,
  ) {}

  async scan(
    ctx: HouseholdContext,
    image: { contentType: string; data: Buffer },
  ): Promise<BarcodeLookupDto> {
    if (!BARCODE_SCAN_TYPES.includes(image.contentType.toLowerCase())) {
      throw new AppException(
        'VALIDATION_FAILED',
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        'Barcode photo must be JPEG, PNG or WebP',
        { fieldErrors: { file: ['Unsupported type'] } },
      );
    }
    // Comme pour les tickets : seules de vraies images passent (signature vérifiée), et zbar ne
    // reçoit que le PNG produit par sharp.
    if (!isImage(image.data)) return empty;
    let png: Buffer;
    try {
      png = await sharp(image.data, { failOn: 'none', limitInputPixels: MAX_PIXELS })
        .rotate()
        .greyscale()
        .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
        .png()
        .toBuffer();
    } catch {
      return empty;
    }
    const code = (await this.zbar(png)).find(isValidBarcode);
    return code ? this.lookup(ctx, code) : empty;
  }

  /** Nom d'un code (saisi à la main ou lu) : mémoire du foyer, puis Open Food Facts. */
  async lookup(ctx: HouseholdContext, input: string): Promise<BarcodeLookupDto> {
    const code = normalizeBarcode(input);
    if (!isValidBarcode(code)) {
      throw new AppException(
        'VALIDATION_FAILED',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Invalid barcode',
        {
          fieldErrors: { code: ['Invalid barcode'] },
        },
      );
    }
    const known = await this.prisma.shoppingBarcode.findUnique({
      where: { householdId_code: { householdId: ctx.householdId, code } },
    });
    if (known)
      return {
        barcode: code,
        name: known.name,
        source: known.source as 'HOUSEHOLD' | 'OPEN_FOOD_FACTS',
      };
    const member = await this.prisma.householdMember.findUnique({
      where: { id: ctx.memberId },
      select: { user: { select: { locale: true } } },
    });
    const name = await this.off.productName(code, member?.user?.locale ?? 'fr');
    if (!name) return { barcode: code, name: null, source: null };
    // Gardé pour le foyer : la prochaine fois, aucune requête.
    await this.prisma.shoppingBarcode.upsert({
      where: { householdId_code: { householdId: ctx.householdId, code } },
      create: { householdId: ctx.householdId, code, name, source: 'OPEN_FOOD_FACTS' },
      update: {},
    });
    return { barcode: code, name, source: 'OPEN_FOOD_FACTS' };
  }

  /** Nom donné ou corrigé par un membre : il l'emporte sur Open Food Facts. */
  async remember(ctx: HouseholdContext, input: string, name: string): Promise<BarcodeLookupDto> {
    const code = normalizeBarcode(input);
    if (!isValidBarcode(code)) {
      throw new AppException(
        'VALIDATION_FAILED',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Invalid barcode',
        {
          fieldErrors: { code: ['Invalid barcode'] },
        },
      );
    }
    await this.prisma.shoppingBarcode.upsert({
      where: { householdId_code: { householdId: ctx.householdId, code } },
      create: { householdId: ctx.householdId, code, name, source: 'HOUSEHOLD' },
      update: { name, source: 'HOUSEHOLD' },
    });
    return { barcode: code, name, source: 'HOUSEHOLD' };
  }

  /** Codes lus par zbar (un par ligne) ; vide si aucun. */
  private zbar(png: Buffer): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const child = spawn(
        'zbarimg',
        ['--quiet', '--raw', '-Sdisable', ...SYMBOLS.map((s) => `-S${s}.enable`), '-'],
        { stdio: ['pipe', 'pipe', 'pipe'], timeout: TIMEOUT_MS },
      );
      let out = '';
      let err = '';
      child.stdout.on('data', (c: Buffer) => (out += c.toString()));
      child.stderr.on('data', (c: Buffer) => (err += c.toString()));
      child.on('error', (e) => {
        this.logger.error(`zbar unavailable: ${e.message}`);
        reject(unavailable());
      });
      child.on('close', (code, signal) => {
        // 0 : lu ; 4 : aucun code sur l'image.
        if (code === 0 || code === 4) {
          resolve(
            out
              .split('\n')
              .map((l) => l.trim())
              .filter(Boolean),
          );
          return;
        }
        this.logger.warn(`zbar failed (${signal ?? code}): ${err.slice(0, 200)}`);
        reject(unavailable());
      });
      child.stdin.on('error', () => undefined);
      child.stdin.end(png);
    });
  }
}

function unavailable(): AppException {
  return new AppException(
    'BARCODE_SCAN_UNAVAILABLE',
    HttpStatus.SERVICE_UNAVAILABLE,
    'Barcode reading is unavailable',
  );
}
