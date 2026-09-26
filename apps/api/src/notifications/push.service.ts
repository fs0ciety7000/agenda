import { createSign } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';

/** Compte de service Firebase (JSON téléchargé dans la console, collé tel quel ou en base64). */
export interface FcmServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

export function parseServiceAccount(raw: string | undefined): FcmServiceAccount | null {
  if (!raw?.trim()) return null;
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  const json = JSON.parse(text) as Partial<FcmServiceAccount>;
  if (!json.project_id || !json.client_email || !json.private_key) {
    throw new Error('FCM_SERVICE_ACCOUNT must contain project_id, client_email and private_key');
  }
  return json as FcmServiceAccount;
}

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const b64url = (v: string | Buffer) => Buffer.from(v).toString('base64url');

/**
 * Notifications instantanées Android (Firebase Cloud Messaging, API HTTP v1).
 * Le message ne contient AUCUNE donnée personnelle : seulement « il y a du nouveau dans le
 * foyer X ». L'app, réveillée, relit ses notifications par l'API (mêmes règles, mêmes
 * préférences que le reste). Sans `FCM_SERVICE_ACCOUNT` : inactif (l'app vérifie périodiquement).
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly account: FcmServiceAccount | null;
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private readonly prisma: PrismaService) {
    this.account = parseServiceAccount(env().FCM_SERVICE_ACCOUNT);
  }

  get enabled(): boolean {
    return this.account !== null;
  }

  async register(userId: string, token: string, platform = 'android'): Promise<void> {
    // Un téléphone passé d'un compte à l'autre : le jeton suit le compte connecté.
    await this.prisma.pushToken.upsert({
      where: { token },
      create: { userId, token, platform },
      update: { userId, platform, lastSeenAt: new Date() },
    });
  }

  async unregister(userId: string, token: string): Promise<void> {
    await this.prisma.pushToken.deleteMany({ where: { userId, token } });
  }

  /** Réveille les téléphones de ces membres. N'échoue jamais (journalise seulement). */
  async wakeMembers(householdId: string, memberIds: string[]): Promise<void> {
    if (!this.account || !memberIds.length) return;
    try {
      const tokens = await this.prisma.pushToken.findMany({
        where: {
          user: { memberships: { some: { id: { in: memberIds }, householdId, leftAt: null } } },
        },
        select: { token: true },
      });
      await Promise.all(tokens.map((t) => this.send(t.token, { kind: 'activity', householdId })));
    } catch (e) {
      this.logger.warn(`Push failed: ${(e as Error).message}`);
    }
  }

  private async send(token: string, data: Record<string, string>): Promise<void> {
    const account = this.account!;
    const res = await fetch(
      `${env().FCM_API_URL}/v1/projects/${account.project_id}/messages:send`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${await this.accessToken()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token,
            data,
            // Priorité haute : délivré tout de suite même en veille (message sans contenu visible).
            android: { priority: 'HIGH', ttl: '3600s', collapse_key: 'activity' },
          },
        }),
      },
    );
    if (res.ok) return;
    const body = await res.text();
    // Application désinstallée ou jeton périmé : on l'oublie.
    if (res.status === 404 || /UNREGISTERED|registration token/i.test(body)) {
      await this.prisma.pushToken.deleteMany({ where: { token } });
      return;
    }
    if (res.status === 401) this.token = null;
    this.logger.warn(`FCM ${res.status}: ${body.slice(0, 300)}`);
  }

  /** Jeton OAuth2 du compte de service (JWT signé RS256), mis en cache ~55 minutes. */
  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const account = this.account!;
    const tokenUri = account.token_uri ?? 'https://oauth2.googleapis.com/token';
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64url(
      JSON.stringify({
        iss: account.client_email,
        scope: SCOPE,
        aud: tokenUri,
        iat: now,
        exp: now + 3600,
      }),
    )}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(account.private_key);
    const res = await fetch(tokenUri, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: `${unsigned}.${b64url(signature)}`,
      }),
    });
    if (!res.ok) throw new Error(`FCM auth ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return json.access_token;
  }
}
