import {
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  type RawBodyRequest,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { type InboundEmailSettingsDto, ResendWebhookEvent } from '@agenda/contracts';
import { AppException, notFound } from '../common/app-exception';
import { SkipCsrf } from '../auth/csrf.guard';
import { CurrentHousehold, HouseholdContext, Public } from '../common/request-context';
import { env } from '../config/env';
import { HouseholdMemberGuard } from '../households/household-member.guard';
import { InboundEmailService, inboundAvailable } from './inbound-email.service';
import { ResendUnavailableError } from './resend-receiving.client';
import { verifySvix } from './svix';

/** Réglage de l'adresse personnelle « créer une tâche par e-mail ». */
@ApiTags('inbound-email')
@UseGuards(HouseholdMemberGuard)
@Controller({ path: 'households/:householdId/inbound-email', version: '1' })
export class InboundEmailSettingsController {
  constructor(private readonly inbound: InboundEmailService) {}

  @Get()
  get(@CurrentHousehold() ctx: HouseholdContext): Promise<InboundEmailSettingsDto> {
    return this.inbound.settings(ctx);
  }

  @Post()
  @HttpCode(200)
  regenerate(@CurrentHousehold() ctx: HouseholdContext): Promise<InboundEmailSettingsDto> {
    return this.inbound.regenerate(ctx);
  }

  @Delete()
  @HttpCode(204)
  disable(@CurrentHousehold() ctx: HouseholdContext): Promise<void> {
    return this.inbound.disable(ctx);
  }
}

/** Réception : webhook Resend `email.received`, authentifié par signature Svix. */
@ApiTags('inbound-email')
@Public()
@SkipCsrf()
@Controller({ path: 'inbound/resend', version: '1' })
export class ResendWebhookController {
  constructor(private readonly inbound: InboundEmailService) {}

  @Post()
  @HttpCode(200)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async receive(
    @Req() req: RawBodyRequest<Request>,
    @Headers('svix-id') id: string | undefined,
    @Headers('svix-timestamp') timestamp: string | undefined,
    @Headers('svix-signature') signature: string | undefined,
  ): Promise<{ occurrenceId: string } | { ignored: string }> {
    if (!inboundAvailable()) throw notFound();
    const raw = req.rawBody?.toString('utf8') ?? '';
    if (!verifySvix(env().RESEND_WEBHOOK_SECRET!, { id, timestamp, signature }, raw)) {
      throw new AppException('UNAUTHENTICATED', HttpStatus.UNAUTHORIZED, 'Invalid signature');
    }
    const parsed = ResendWebhookEvent.safeParse(req.body);
    if (!parsed.success) return { ignored: 'payload' };
    try {
      return await this.inbound.handleResendEvent(parsed.data);
    } catch (e) {
      if (e instanceof ResendUnavailableError) {
        throw new AppException('INTERNAL', HttpStatus.BAD_GATEWAY, 'Resend API unavailable');
      }
      throw e;
    }
  }
}
