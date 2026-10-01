import { Controller, Delete, Get, Header, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { IcalFeedDto } from '@agenda/contracts';
import { notFound } from '../common/app-exception';
import { CurrentHousehold, HouseholdContext, Public } from '../common/request-context';
import { HouseholdMemberGuard } from '../households/household-member.guard';
import { IcalFeedService } from './ical-feed.service';

/** Réglage de l'abonnement iCal personnel. */
@ApiTags('calendar')
@UseGuards(HouseholdMemberGuard)
@Controller({ path: 'households/:householdId/ical', version: '1' })
export class IcalFeedSettingsController {
  constructor(private readonly ical: IcalFeedService) {}

  /** Adresse de l'abonnement iCal (null si non créée). */
  @Get()
  get(@CurrentHousehold() ctx: HouseholdContext): Promise<IcalFeedDto> {
    return this.ical.settings(ctx);
  }

  /** Créer ou remplacer l'adresse de l'abonnement. */
  @Post()
  @HttpCode(200)
  regenerate(@CurrentHousehold() ctx: HouseholdContext): Promise<IcalFeedDto> {
    return this.ical.regenerate(ctx);
  }

  /** Désactiver l'abonnement (l'adresse cesse de fonctionner). */
  @Delete()
  @HttpCode(204)
  disable(@CurrentHousehold() ctx: HouseholdContext): Promise<void> {
    return this.ical.disable(ctx);
  }
}

/** Flux iCal lu par les agendas (sans session : le jeton secret fait foi). */
@ApiTags('calendar')
@Public()
@Controller({ path: 'ical', version: '1' })
export class IcalFeedController {
  constructor(private readonly ical: IcalFeedService) {}

  /** Fichier .ics de l'abonnement (lecture seule). */
  @Get(':file')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @Header('Cache-Control', 'private, max-age=300')
  @Header('X-Robots-Tag', 'noindex')
  feed(@Param('file') file: string): Promise<string> {
    if (!file.endsWith('.ics')) throw notFound();
    return this.ical.feed(file.slice(0, -4).toLowerCase());
  }
}
