import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { InboundEmailInput, type InboundEmailSettingsDto } from '@agenda/contracts';
import { AppException, notFound } from '../common/app-exception';
import { safeEqual } from '../common/crypto';
import { CurrentHousehold, HouseholdContext, Public } from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { env } from '../config/env';
import { HouseholdMemberGuard } from '../households/household-member.guard';
import { InboundEmailService, inboundAvailable } from './inbound-email.service';

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

/** Réception (Worker Cloudflare Email Routing → API), authentifiée par secret partagé. */
@ApiTags('inbound-email')
@Public()
@Controller({ path: 'inbound/email', version: '1' })
export class InboundEmailController {
  constructor(private readonly inbound: InboundEmailService) {}

  @Post()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  receive(
    @Headers('authorization') authorization: string | undefined,
    @Body(new ZodPipe(InboundEmailInput)) body: InboundEmailInput,
  ): Promise<{ occurrenceId: string }> {
    if (!inboundAvailable()) throw notFound();
    const expected = `Bearer ${env().INBOUND_EMAIL_SECRET}`;
    if (!authorization || !safeEqual(authorization, expected)) {
      throw new AppException('UNAUTHENTICATED', HttpStatus.UNAUTHORIZED, 'Invalid inbound secret');
    }
    return this.inbound.receive(body);
  }
}
