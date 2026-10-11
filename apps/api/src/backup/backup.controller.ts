import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { BACKUP_MAX_BYTES, BackupDownloadInput, type RestoreResultDto } from '@agenda/contracts';
import type { Response } from 'express';
import { diskStorage } from 'multer';
import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { VaultService } from '../auth/vault.service';
import { AppException } from '../common/app-exception';
import {
  AuthUser,
  CurrentHousehold,
  CurrentUser,
  HouseholdContext,
} from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { env } from '../config/env';
import { HouseholdMemberGuard } from '../households/household-member.guard';
import { BackupExportService } from './backup-export.service';
import { BackupPassphraseError, decryptFile, encrypting, isEncrypted } from './backup-crypto';
import { BackupRestoreService } from './backup-restore.service';

/** Sauvegarde du foyer (archive .zip), à garder ou à restaurer sur une autre instance. */
@ApiTags('households')
@UseGuards(HouseholdMemberGuard)
@Controller({ path: 'households/:householdId/backup', version: '1' })
export class BackupExportController {
  constructor(
    private readonly exporter: BackupExportService,
    private readonly vault: VaultService,
  ) {}

  /**
   * Télécharger la sauvegarde du foyer : archive .zip avec les données et les fichiers joints.
   * Elle contient le texte des notes sensibles : vérification comme pour les afficher (mot de
   * passe ou confirmation sur le site, sur l'appareil pour Android). Avec `passphrase`, l'archive
   * est chiffrée (fichier `.tandem`).
   */
  @Post()
  @HttpCode(200)
  // Comme la connexion : vérifie un mot de passe (10 par minute par défaut).
  @Throttle({ default: { limit: () => env().AUTH_RATE_LIMIT, ttl: 60_000 } })
  async download(
    @CurrentHousehold() ctx: HouseholdContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(BackupDownloadInput)) body: BackupDownloadInput,
    @Res() res: Response,
  ): Promise<void> {
    await this.vault.unlock(user, body);
    const day = new Date().toISOString().slice(0, 10);
    res.setHeader('Cache-Control', 'no-store');
    if (!body.passphrase) {
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="tandem-foyer-${day}.zip"`);
      await this.exporter.write(ctx, res);
      return;
    }
    const { header, cipher } = await encrypting(body.passphrase);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="tandem-foyer-${day}.tandem"`);
    res.write(header);
    cipher.on('data', (chunk: Buffer) => res.write(chunk));
    const done = new Promise<void>((resolve, reject) => {
      cipher.on('end', () => {
        res.end(cipher.getAuthTag());
        resolve();
      });
      cipher.on('error', reject);
    });
    await this.exporter.write(ctx, cipher);
    await done;
  }
}

@ApiTags('households')
@Controller({ path: 'households/restore', version: '1' })
export class BackupRestoreController {
  constructor(private readonly restorer: BackupRestoreService) {}

  /**
   * Restaurer une sauvegarde : crée un nouveau foyer sur cette instance (multipart, champ `file`,
   * archive .zip de Tandem, ou `.tandem` chiffrée avec le champ `passphrase`). Depuis un compte
   * encore sans foyer ; les autres membres reçoivent une invitation à leur adresse.
   */
  @Post()
  @HttpCode(201)
  // Opération rare et lourde : 10 par heure par défaut.
  @Throttle({ default: { limit: () => env().AUTH_RATE_LIMIT, ttl: 3_600_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      // Sur le disque, pas en mémoire : l'archive peut peser quelques centaines de Mo.
      storage: diskStorage({
        destination: tmpdir(),
        filename: (_req, _file, cb) => cb(null, `tandem-restore-${randomUUID()}.zip`),
      }),
      limits: { fileSize: BACKUP_MAX_BYTES, files: 1 },
    }),
  )
  async restore(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: { path: string; size: number } | undefined,
    @Body('passphrase') passphrase: unknown,
  ): Promise<RestoreResultDto> {
    if (!file) {
      throw new AppException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, 'Missing file', {
        fieldErrors: { file: ['Required'] },
      });
    }
    const plain = `${file.path}.zip`;
    try {
      if (!(await isEncrypted(file.path))) {
        return await this.restorer.restore(user.userId, file.path);
      }
      if (typeof passphrase !== 'string' || !passphrase || passphrase.length > 200) {
        throw new AppException(
          'BACKUP_PASSPHRASE_REQUIRED',
          HttpStatus.BAD_REQUEST,
          'This backup is encrypted: passphrase required',
        );
      }
      try {
        await decryptFile(file.path, plain, passphrase);
      } catch (e) {
        if (!(e instanceof BackupPassphraseError)) throw e;
        throw new AppException(
          'BACKUP_PASSPHRASE_INVALID',
          HttpStatus.BAD_REQUEST,
          'Wrong passphrase or damaged file',
        );
      }
      return await this.restorer.restore(user.userId, plain);
    } finally {
      await rm(file.path, { force: true });
      await rm(plain, { force: true });
    }
  }
}
