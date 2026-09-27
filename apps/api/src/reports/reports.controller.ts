import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { CreateReportInput, REPORT_SCREENSHOT_MAX_BYTES, type ReportDto } from '@agenda/contracts';
import type { Response } from 'express';
import { AppException } from '../common/app-exception';
import { AuthUser, CurrentUser } from '../common/request-context';
import { assertUuid } from '../common/uuid';
import { ZodPipe } from '../common/zod.pipe';
import { ReportsService } from './reports.service';

/** Envoie une capture d'écran : jamais interprétée par le navigateur autrement qu'en image. */
export function sendScreenshot(res: Response, file: { data: Buffer; type: string }): void {
  res.setHeader('content-type', file.type);
  res.setHeader('content-length', String(file.data.length));
  res.setHeader('content-disposition', 'inline; filename="capture"');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('cache-control', 'private, no-store');
  res.end(file.data);
}

@ApiTags('reports')
@Controller({ path: 'reports', version: '1' })
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** Envoyer un signalement (bug, idée, question). */
  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(CreateReportInput)) body: CreateReportInput,
  ): Promise<ReportDto> {
    return this.reports.create(user.userId, body);
  }

  /** Joindre une capture d'écran (multipart, champ `file`, image de 5 Mo au plus). */
  @Post(':id/screenshot')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: REPORT_SCREENSHOT_MAX_BYTES + 1, files: 1 } }),
  )
  screenshot(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: { mimetype: string; size: number; buffer: Buffer } | undefined,
  ): Promise<ReportDto> {
    if (!file) {
      throw new AppException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, 'Missing file', {
        fieldErrors: { file: ['Required'] },
      });
    }
    return this.reports.attachScreenshot(user.userId, assertUuid(id), file);
  }

  /** Mes signalements, avec leur état et la réponse éventuelle. */
  @Get()
  mine(@CurrentUser() user: AuthUser): Promise<ReportDto[]> {
    return this.reports.mine(user.userId);
  }

  /** Voir la capture d'écran jointe à un de mes signalements. */
  @Get(':id/screenshot')
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Res() res: Response,
  ): Promise<void> {
    sendScreenshot(
      res,
      await this.reports.screenshot(assertUuid(id), { userId: user.userId, admin: false }),
    );
  }

  /** Retirer un de mes signalements (effacé tout de suite). */
  @Delete(':id')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    return this.reports.remove(user.userId, assertUuid(id));
  }
}
