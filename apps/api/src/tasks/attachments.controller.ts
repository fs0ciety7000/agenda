import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { ATTACHMENT_MAX_BYTES, type OccurrenceDto } from '@agenda/contracts';
import type { Response } from 'express';
import { AppException } from '../common/app-exception';
import { CurrentHousehold, HouseholdContext } from '../common/request-context';
import { assertUuid } from '../common/uuid';
import { HouseholdMemberGuard } from '../households/household-member.guard';
import { AttachmentsService } from './attachments.service';
import { TasksService } from './tasks.service';

interface UploadedMulterFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@ApiTags('attachments')
@UseGuards(HouseholdMemberGuard)
@Controller({ path: 'households/:householdId', version: '1' })
export class AttachmentsController {
  constructor(
    private readonly attachments: AttachmentsService,
    private readonly tasks: TasksService,
  ) {}

  /** Joindre un fichier (multipart, champ `file`, 10 Mo au plus). */
  @Post('occurrences/:occurrenceId/attachments')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: ATTACHMENT_MAX_BYTES + 1, files: 1 } }),
  )
  async upload(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('occurrenceId') occurrenceId: string,
    @UploadedFile() file: UploadedMulterFile | undefined,
  ): Promise<OccurrenceDto> {
    const taskId = await this.attachments.taskOfOccurrence(ctx, assertUuid(occurrenceId));
    if (!file) {
      throw new AppException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, 'Missing file', {
        fieldErrors: { file: ['Required'] },
      });
    }
    // Nom envoyé en latin-1 par multer : le navigateur l'a encodé en UTF-8.
    const filename = Buffer.from(file.originalname, 'latin1').toString('utf8');
    await this.attachments.add(ctx, taskId, [
      { filename, contentType: file.mimetype, data: file.buffer },
    ]);
    return this.tasks.get(ctx, occurrenceId);
  }

  /** Télécharger une pièce jointe. */
  @Get('attachments/:id')
  async download(
    @CurrentHousehold() ctx: HouseholdContext,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.attachments.get(ctx, assertUuid(id));
    const disposition = file.inline ? 'inline' : 'attachment';
    res.setHeader('content-type', file.inline ? file.contentType : 'application/octet-stream');
    res.setHeader(
      'content-disposition',
      `${disposition}; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    );
    res.setHeader('content-length', String(file.data.length));
    res.setHeader('x-content-type-options', 'nosniff');
    // Un fichier ouvert dans le navigateur ne peut rien exécuter sur l'origine de l'app.
    res.setHeader(
      'content-security-policy',
      "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    );
    res.setHeader('cache-control', 'private, max-age=3600');
    res.end(file.data);
  }

  /** Supprimer une pièce jointe. */
  @Delete('attachments/:id')
  @HttpCode(204)
  remove(@CurrentHousehold() ctx: HouseholdContext, @Param('id') id: string): Promise<void> {
    return this.attachments.remove(ctx, assertUuid(id));
  }
}
