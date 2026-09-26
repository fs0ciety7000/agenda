import {
  CallHandler,
  ExecutionContext,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';
import { from, lastValueFrom, type Observable } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from './app-exception';
import type { AppRequest } from './request-context';

const KEY_FORMAT = /^[A-Za-z0-9_-]{8,64}$/;
const TTL_MS = 24 * 60 * 60_000;
/** Réponse pas encore connue : la requête d'origine est en cours. */
const IN_PROGRESS = 0;

/**
 * En-tête `Idempotency-Key` (Android hors ligne, cf. docs/architecture.md ADR-007) : rejouer une
 * création déjà traitée renvoie la réponse d'origine au lieu de créer un doublon.
 * La clé est réservée AVANT le traitement : deux rejeux simultanés ne créent jamais deux tâches
 * (le second reçoit 409 IDEMPOTENCY_IN_PROGRESS, à retenter). Sans en-tête : aucun effet.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<AppRequest>();
    const key = req.header('idempotency-key');
    if (!key || !req.user) return next.handle();
    return from(this.handle(key, req, context.switchToHttp().getResponse<Response>(), next));
  }

  private async handle(
    key: string,
    req: AppRequest,
    res: Response,
    next: CallHandler,
  ): Promise<unknown> {
    if (!KEY_FORMAT.test(key)) {
      throw new AppException(
        'IDEMPOTENCY_KEY_INVALID',
        HttpStatus.BAD_REQUEST,
        'Idempotency-Key must be 8-64 characters [A-Za-z0-9_-]',
      );
    }
    const userId = req.user!.userId;
    const path = req.path.slice(0, 255);
    await this.prisma.idempotencyKey.deleteMany({
      where: { key, createdAt: { lt: new Date(Date.now() - TTL_MS) } },
    });

    try {
      await this.prisma.idempotencyKey.create({
        data: { key, userId, method: req.method, path, statusCode: IN_PROGRESS, responseBody: {} },
      });
    } catch (e) {
      if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      const existing = await this.prisma.idempotencyKey.findUnique({ where: { key } });
      if (!existing || existing.userId !== userId || existing.path !== path) {
        throw new AppException(
          'IDEMPOTENCY_KEY_REUSED',
          HttpStatus.UNPROCESSABLE_ENTITY,
          'Idempotency-Key already used for another request',
        );
      }
      if (existing.statusCode === IN_PROGRESS) {
        throw new AppException(
          'IDEMPOTENCY_IN_PROGRESS',
          HttpStatus.CONFLICT,
          'Original request still in progress',
        );
      }
      res.status(existing.statusCode);
      res.setHeader('Idempotent-Replayed', 'true');
      return existing.responseBody;
    }

    try {
      const body = await lastValueFrom(next.handle());
      await this.prisma.idempotencyKey.update({
        where: { key },
        data: { statusCode: res.statusCode, responseBody: (body ?? {}) as Prisma.InputJsonValue },
      });
      // Purge opportuniste (quelques lignes par jour pour un foyer) : pas de job dédié.
      void this.prisma.idempotencyKey
        .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - TTL_MS) } } })
        .catch(() => undefined);
      return body;
    } catch (e) {
      // Échec (validation, 404…) : la clé est libérée, un rejeu corrigé reste possible.
      await this.prisma.idempotencyKey.delete({ where: { key } }).catch(() => undefined);
      throw e;
    }
  }
}
