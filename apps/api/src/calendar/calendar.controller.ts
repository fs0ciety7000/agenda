import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Logger,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  type AvailableCalendarDto,
  type CalendarStatusDto,
  LinkCalendarInput,
  UnlinkCalendarQuery,
} from '@agenda/contracts';
import type { CookieOptions, Request, Response } from 'express';
import { jwtVerify, SignJWT } from 'jose';
import { createHash } from 'node:crypto';
import { randomToken } from '../common/crypto';
import {
  AuthUser,
  CurrentHousehold,
  CurrentUser,
  HouseholdContext,
  Public,
} from '../common/request-context';
import { ZodPipe } from '../common/zod.pipe';
import { env } from '../config/env';
import { HouseholdMemberGuard } from '../households/household-member.guard';
import { CalendarConnectionService, CalendarScopesMissing } from './calendar-connection.service';
import { CalendarQueueService } from './calendar-queue.service';
import { GoogleApiError, GoogleCalendarClient } from './google-calendar.client';

const FLOW_COOKIE = 'gn_cal_oauth';
const FLOW_PATH = '/v1/calendar/google';
const safeNext = (next?: string) =>
  next && next.startsWith('/') && !next.startsWith('//') ? next : '/settings';
const withParam = (path: string, param: string) =>
  `${path}${path.includes('?') ? '&' : '?'}${param}`;

@ApiTags('calendar')
@Controller({ version: '1' })
export class CalendarController {
  private readonly logger = new Logger(CalendarController.name);
  private readonly secret = new TextEncoder().encode(env().JWT_SECRET);

  constructor(
    private readonly calendar: CalendarConnectionService,
    private readonly queue: CalendarQueueService,
    private readonly google: GoogleCalendarClient,
  ) {}

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: env().COOKIE_SECURE,
      sameSite: 'lax',
      path: FLOW_PATH,
      maxAge: 10 * 60_000,
    };
  }

  /** Démarre l'autorisation Google Calendar (navigation du navigateur, session requise). */
  @Get('calendar/google/connect')
  async connect(
    @CurrentUser() user: AuthUser,
    @Query('next') next: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    if (!this.calendar.configured)
      return res.redirect(withParam(safeNext(next), 'calendarError=CALENDAR_NOT_CONFIGURED'));
    const state = randomToken(16);
    const verifier = randomToken(32);
    const flow = await new SignJWT({ state, verifier, userId: user.userId, next: safeNext(next) })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('10m')
      .setAudience('google-calendar')
      .sign(this.secret);
    res.cookie(FLOW_COOKIE, flow, this.cookieOptions());
    res.redirect(
      this.google.authorizationUrl({
        redirectUri: this.calendar.redirectUri,
        state,
        codeChallenge: createHash('sha256').update(verifier).digest('base64url'),
      }),
    );
  }

  @Public()
  @Get('calendar/google/callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    res.clearCookie(FLOW_COOKIE, { ...this.cookieOptions(), maxAge: undefined });
    let flow: { state: string; verifier: string; userId: string; next: string };
    const raw = (req.cookies as Record<string, string>)[FLOW_COOKIE];
    try {
      flow = (await jwtVerify(raw ?? '', this.secret, { audience: 'google-calendar' }))
        .payload as typeof flow;
    } catch (e) {
      // Cookie absent (autre navigateur, cookies bloqués) ou expiré (> 10 min sur l'écran Google).
      this.logger.warn(
        `Calendar connection failed: flow cookie ${raw ? `invalid (${e instanceof Error ? e.message : String(e)})` : 'missing'}`,
      );
      return res.redirect('/settings?calendarError=GOOGLE_FLOW_EXPIRED');
    }
    if (error) {
      this.logger.warn(`Calendar connection failed: Google returned error=${error}`);
      return res.redirect(
        withParam(
          flow.next,
          `calendarError=${error === 'access_denied' ? 'GOOGLE_DENIED' : 'GOOGLE_FAILED'}`,
        ),
      );
    }
    if (!code || state !== flow.state) {
      this.logger.warn('Calendar connection failed: missing code or state mismatch');
      return res.redirect(withParam(flow.next, 'calendarError=GOOGLE_FLOW_EXPIRED'));
    }
    try {
      await this.calendar.saveConnection(flow.userId, code, flow.verifier);
    } catch (e) {
      const scopes = e instanceof CalendarScopesMissing;
      this.logger.warn(
        `Calendar connection failed: ${e instanceof GoogleApiError || scopes ? e.message : String(e)}`,
      );
      return res.redirect(
        withParam(flow.next, `calendarError=${scopes ? 'GOOGLE_SCOPES_MISSING' : 'GOOGLE_FAILED'}`),
      );
    }
    res.redirect(withParam(flow.next, 'calendar=connected'));
  }

  @Get('households/:householdId/calendar')
  @UseGuards(HouseholdMemberGuard)
  status(
    @CurrentHousehold() ctx: HouseholdContext,
    @CurrentUser() user: AuthUser,
  ): Promise<CalendarStatusDto> {
    return this.calendar.status(ctx, user.userId);
  }

  @Get('households/:householdId/calendar/available')
  @UseGuards(HouseholdMemberGuard)
  available(@CurrentUser() user: AuthUser): Promise<AvailableCalendarDto[]> {
    return this.calendar.available(user.userId);
  }

  @Put('households/:householdId/calendar/link')
  @UseGuards(HouseholdMemberGuard)
  link(
    @CurrentHousehold() ctx: HouseholdContext,
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(LinkCalendarInput)) body: LinkCalendarInput,
  ): Promise<CalendarStatusDto> {
    return this.calendar.link(ctx, user.userId, body.calendarId);
  }

  @Delete('households/:householdId/calendar/link')
  @UseGuards(HouseholdMemberGuard)
  @HttpCode(204)
  unlink(
    @CurrentHousehold() ctx: HouseholdContext,
    @Query(new ZodPipe(UnlinkCalendarQuery)) q: UnlinkCalendarQuery,
  ): Promise<void> {
    return this.calendar.unlink(ctx, q.removeEvents);
  }

  /** « Synchroniser maintenant » : réconciliation + balayage en arrière-plan. */
  @Post('households/:householdId/calendar/sync')
  @UseGuards(HouseholdMemberGuard)
  @HttpCode(202)
  async syncNow(@CurrentHousehold() ctx: HouseholdContext): Promise<void> {
    await this.queue.scheduleFull(ctx.householdId);
  }

  @Delete('me/google-calendar')
  @HttpCode(204)
  disconnect(@CurrentUser() user: AuthUser): Promise<void> {
    return this.calendar.disconnect(user.userId);
  }
}
