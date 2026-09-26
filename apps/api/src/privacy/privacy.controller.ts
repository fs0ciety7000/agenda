import { Body, Controller, Delete, Get, HttpCode, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { DeleteAccountInput } from '@agenda/contracts';
import type { Response } from 'express';
import { clearAuthCookies } from '../auth/cookies';
import { AuthUser, CurrentUser } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { PrivacyService } from './privacy.service';

@ApiTags('privacy')
@Controller({ path: 'me', version: '1' })
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  /** Portabilité : toutes les données de l'utilisateur, en JSON lisible. */
  @Get('export')
  async export(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    const data = await this.privacy.export(user.userId);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="agenda-export-${data.exportedAt.slice(0, 10)}.json"`,
    );
    res.setHeader('Cache-Control', 'no-store');
    return data;
  }

  /** Droit à l'effacement : suppression définitive et immédiate du compte. */
  @Delete()
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(DeleteAccountInput)) body: DeleteAccountInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.privacy.deleteAccount(user.userId, body);
    clearAuthCookies(res);
  }
}
