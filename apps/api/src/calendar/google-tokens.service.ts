import { Injectable, Logger } from '@nestjs/common';
import { SecretBox } from '../common/crypto';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { GoogleApiError, GoogleCalendarClient } from './google-calendar.client';

/** Marge avant expiration : on renouvelle une minute avant. */
const EXPIRY_MARGIN_MS = 60_000;

/**
 * Jetons OAuth Calendar : stockés chiffrés (AES-256-GCM), jamais renvoyés au client.
 * Le renouvellement est sérialisé par connexion (verrou consultatif PostgreSQL).
 */
@Injectable()
export class GoogleTokensService {
  private readonly logger = new Logger(GoogleTokensService.name);
  private box?: SecretBox;

  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleCalendarClient,
  ) {}

  /** Chiffrement disponible (clé configurée). */
  get available(): boolean {
    return Boolean(env().TOKEN_ENCRYPTION_KEY);
  }

  secretBox(): SecretBox {
    this.box ??= new SecretBox(env().TOKEN_ENCRYPTION_KEY!);
    return this.box;
  }

  /** Jeton d'accès valide pour une connexion (renouvelé si nécessaire). */
  async accessToken(connectionId: string, force = false): Promise<string> {
    const conn = await this.prisma.googleConnection.findUniqueOrThrow({
      where: { id: connectionId },
    });
    if (conn.status === 'REVOKED')
      throw new GoogleApiError('invalid_grant', 400, 'connection revoked');
    if (
      !force &&
      conn.accessTokenEnc &&
      conn.accessTokenExpiresAt &&
      conn.accessTokenExpiresAt.getTime() - EXPIRY_MARGIN_MS > Date.now()
    ) {
      return this.secretBox().decrypt(conn.accessTokenEnc);
    }
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${connectionId}))`;
        // Un autre processus a peut-être déjà renouvelé pendant l'attente du verrou.
        const fresh = await tx.googleConnection.findUniqueOrThrow({ where: { id: connectionId } });
        if (
          !force &&
          fresh.accessTokenEnc &&
          fresh.accessTokenExpiresAt &&
          fresh.accessTokenExpiresAt.getTime() - EXPIRY_MARGIN_MS > Date.now()
        ) {
          return this.secretBox().decrypt(fresh.accessTokenEnc);
        }
        try {
          const tokens = await this.google.refresh(this.secretBox().decrypt(fresh.refreshTokenEnc));
          await tx.googleConnection.update({
            where: { id: connectionId },
            data: {
              accessTokenEnc: this.secretBox().encrypt(tokens.accessToken),
              accessTokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
              ...(tokens.refreshToken
                ? { refreshTokenEnc: this.secretBox().encrypt(tokens.refreshToken) }
                : {}),
              status: 'ACTIVE',
              lastErrorCode: null,
            },
          });
          return tokens.accessToken;
        } catch (e) {
          if (e instanceof GoogleApiError && e.kind === 'invalid_grant') {
            this.logger.warn(`Google authorization revoked for connection ${connectionId}`);
            await tx.googleConnection.update({
              where: { id: connectionId },
              data: {
                status: 'REVOKED',
                lastErrorCode: 'GOOGLE_REVOKED',
                accessTokenEnc: null,
                accessTokenExpiresAt: null,
              },
            });
          }
          throw e;
        }
      },
      { timeout: 20_000 },
    );
  }

  /** Exécute un appel Google ; sur 401 (jeton expiré côté Google), renouvelle et réessaie une fois. */
  async withToken<T>(connectionId: string, fn: (token: string) => Promise<T>): Promise<T> {
    try {
      return await fn(await this.accessToken(connectionId));
    } catch (e) {
      if (e instanceof GoogleApiError && e.kind === 'unauthorized')
        return fn(await this.accessToken(connectionId, true));
      throw e;
    }
  }
}
