import { Controller, type MessageEvent, Sse, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { interval, map, merge, Observable } from 'rxjs';
import type { RealtimeTopic } from '@agenda/contracts';
import { DomainEvents } from '../common/domain-events';
import { CurrentHousehold, HouseholdContext } from '../common/request-context';
import { HouseholdMemberGuard } from '../households/household-member.guard';

/** Signal envoyé régulièrement : garde la connexion ouverte à travers Cloudflare et les proxys. */
export const HEARTBEAT_MS = 25_000;

/**
 * Temps réel (Server-Sent Events) : `data: {"topic":"tasks"|"shopping"|"notifications"}` dès
 * qu'un membre du foyer change quelque chose. Aucune donnée dans l'événement : le client recharge
 * le sujet par l'API habituelle (mêmes droits, mêmes filtres). `ping` toutes les 25 s.
 */
@ApiTags('realtime')
@SkipThrottle()
@UseGuards(HouseholdMemberGuard)
@Controller({ path: 'households/:householdId', version: '1' })
export class RealtimeController {
  constructor(private readonly events: DomainEvents) {}

  @Sse('events')
  stream(@CurrentHousehold() ctx: HouseholdContext): Observable<MessageEvent> {
    const changes = new Observable<RealtimeTopic>((subscriber) =>
      this.events.onRealtime((householdId, topic) => {
        if (householdId === ctx.householdId) subscriber.next(topic);
      }),
    );
    return merge(
      changes.pipe(map((topic) => ({ type: 'change', data: { topic } }))),
      interval(HEARTBEAT_MS).pipe(map(() => ({ type: 'ping', data: {} }))),
    );
  }
}
