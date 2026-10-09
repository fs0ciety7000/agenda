import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  type GuestShoppingDto,
  type GuestShoppingLinkDto,
  GuestShoppingLinkInput,
} from '@agenda/contracts';
import { ZodPipe } from '../common/zod.pipe';
import { CurrentHousehold, HouseholdContext, Public } from '../common/request-context';
import { HouseholdMemberGuard } from '../households/household-member.guard';
import { GuestShoppingService } from './guest-shopping.service';

/** Réglage du lien invité vers la liste de courses. */
@ApiTags('shopping')
@UseGuards(HouseholdMemberGuard)
@Controller({ path: 'households/:householdId/shopping-guest', version: '1' })
export class GuestShoppingSettingsController {
  constructor(private readonly guest: GuestShoppingService) {}

  /** Lien invité vers la liste de courses (null si aucun). */
  @Get()
  get(@CurrentHousehold() ctx: HouseholdContext): Promise<GuestShoppingLinkDto> {
    return this.guest.link(ctx);
  }

  /** Créer ou remplacer le lien invité (l'ancien cesse de fonctionner) ; il expire seul. */
  @Post()
  @HttpCode(200)
  regenerate(
    @CurrentHousehold() ctx: HouseholdContext,
    @Body(new ZodPipe(GuestShoppingLinkInput)) body: GuestShoppingLinkInput,
  ): Promise<GuestShoppingLinkDto> {
    return this.guest.regenerate(ctx, body);
  }

  /** Couper le lien invité. */
  @Delete()
  @HttpCode(204)
  revoke(@CurrentHousehold() ctx: HouseholdContext): Promise<void> {
    return this.guest.revoke(ctx);
  }
}

/** Liste de courses vue par un invité (sans session : le jeton secret fait foi). */
@ApiTags('shopping')
@Public()
@Controller({ path: 'guest/shopping', version: '1' })
export class GuestShoppingController {
  constructor(private readonly guest: GuestShoppingService) {}

  /** Liste de courses en lecture seule, pour l'invité qui a le lien. */
  @Get(':token')
  // Rechargée toutes les 30 s par la page : 30 par minute laissent de la marge à plusieurs onglets.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex')
  view(@Param('token') token: string): Promise<GuestShoppingDto> {
    return this.guest.view(token.toLowerCase());
  }
}
