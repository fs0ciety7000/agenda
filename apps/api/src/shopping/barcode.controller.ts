import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  ATTACHMENT_MAX_BYTES,
  type BarcodeLookupDto,
  RememberBarcodeInput,
} from '@agenda/contracts';
import { AppException } from '../common/app-exception';
import { CurrentHousehold, HouseholdContext } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { HouseholdMemberGuard } from '../households/household-member.guard';
import { BarcodeService } from './barcode.service';

interface UploadedMulterFile {
  mimetype: string;
  size: number;
  buffer: Buffer;
}

/** Codes-barres des produits du foyer (ajout aux courses). */
@ApiTags('shopping')
@UseGuards(HouseholdMemberGuard)
@Controller({ path: 'households/:householdId/shopping-barcodes', version: '1' })
export class BarcodeController {
  constructor(private readonly barcodes: BarcodeService) {}

  /**
   * Lire le code-barres d'une photo et trouver le produit (JPEG, PNG ou WebP, multipart, champ
   * `file`, 10 Mo au plus). Lue sur le serveur, la photo n'est pas conservée.
   */
  @Post('scan')
  @HttpCode(200)
  // Chaque lecture peut interroger Open Food Facts : 30 par minute suffisent à un foyer.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: ATTACHMENT_MAX_BYTES + 1, files: 1 } }),
  )
  scan(
    @CurrentHousehold() ctx: HouseholdContext,
    @UploadedFile() file: UploadedMulterFile | undefined,
  ): Promise<BarcodeLookupDto> {
    if (!file) {
      throw new AppException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, 'Missing file', {
        fieldErrors: { file: ['Required'] },
      });
    }
    if (file.size > ATTACHMENT_MAX_BYTES) {
      throw new AppException(
        'ATTACHMENT_TOO_LARGE',
        HttpStatus.PAYLOAD_TOO_LARGE,
        'File too large',
      );
    }
    return this.barcodes.scan(ctx, { contentType: file.mimetype, data: file.buffer });
  }

  /** Produit d'un code-barres saisi à la main (mémoire du foyer, puis Open Food Facts). */
  @Get(':code')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  lookup(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('code') code: string,
  ): Promise<BarcodeLookupDto> {
    return this.barcodes.lookup(ctx, code);
  }

  /** Retenir le nom d'un produit pour le foyer (il l'emporte sur Open Food Facts). */
  @Put(':code')
  remember(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('code') code: string,
    @Body(new ZodPipe(RememberBarcodeInput)) body: RememberBarcodeInput,
  ): Promise<BarcodeLookupDto> {
    return this.barcodes.remember(ctx, code, body.name);
  }
}
