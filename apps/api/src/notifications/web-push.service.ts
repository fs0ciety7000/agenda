import { Injectable, Logger } from '@nestjs/common';
import type { WebPushSubscriptionInput } from '@agenda/contracts';
import webpush from 'web-push';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { type Locale, mailLocale } from '../mail/templates';

/** Contenu affiché par le navigateur (chiffré de bout en bout : le service de push ne le lit pas). */
export interface WebPushMessage {
  title: string;
  body: string;
  /** Page ouverte au clic (chemin du site). */
  url: string;
  /** Une notification par tâche : la suivante remplace la précédente. */
  tag?: string;
}

/**
 * Notifications du site (Web Push, VAPID). Sans `WEB_PUSH_PUBLIC_KEY` / `WEB_PUSH_PRIVATE_KEY` :
 * inactif, le site garde sa cloche. Un abonnement expiré (404 / 410) est supprimé.
 */
@Injectable()
export class WebPushService {
  private readonly logger = new Logger(WebPushService.name);
  readonly publicKey: string | null = null;

  constructor(private readonly prisma: PrismaService) {
    const { WEB_PUSH_PUBLIC_KEY: pub, WEB_PUSH_PRIVATE_KEY: priv } = env();
    if (!pub || !priv) return;
    try {
      // Contact exigé par les services de push : https:// ou mailto: (le site en local est en http).
      const origin = env().WEB_ORIGIN;
      const subject =
        env().WEB_PUSH_SUBJECT ??
        (origin.startsWith('https://') ? origin : 'mailto:webpush@localhost');
      webpush.setVapidDetails(subject, pub, priv);
      this.publicKey = pub;
      this.logger.log('Notifications du site actives (Web Push)');
    } catch (e) {
      this.logger.error(`Clés Web Push invalides (${(e as Error).message}) : désactivées`);
    }
  }

  get enabled(): boolean {
    return this.publicKey !== null;
  }

  async subscribe(userId: string, s: WebPushSubscriptionInput): Promise<void> {
    await this.prisma.webPushSubscription.upsert({
      where: { endpoint: s.endpoint },
      create: { userId, endpoint: s.endpoint, p256dh: s.keys.p256dh, auth: s.keys.auth },
      update: { userId, p256dh: s.keys.p256dh, auth: s.keys.auth, lastSeenAt: new Date() },
    });
  }

  async unsubscribe(userId: string, endpoint: string): Promise<void> {
    await this.prisma.webPushSubscription.deleteMany({ where: { userId, endpoint } });
  }

  /** Administration : notification de test sur les navigateurs d'un compte (nombre d'envois réussis). */
  async sendToUser(userId: string, message: WebPushMessage): Promise<number> {
    if (!this.enabled) return 0;
    const subs = await this.prisma.webPushSubscription.findMany({ where: { userId } });
    const results = await Promise.allSettled(
      subs.map((s) =>
        webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(message),
          { TTL: 3600 },
        ),
      ),
    );
    return results.filter((r) => r.status === 'fulfilled').length;
  }

  /** Envoie à tous les navigateurs de ces membres, dans la langue de chacun. N'échoue jamais. */
  async sendToMembers(
    householdId: string,
    memberIds: string[],
    build: (locale: Locale) => WebPushMessage,
  ): Promise<void> {
    if (!this.enabled || !memberIds.length) return;
    try {
      const subs = await this.prisma.webPushSubscription.findMany({
        where: {
          user: { memberships: { some: { id: { in: memberIds }, householdId, leftAt: null } } },
        },
        select: {
          id: true,
          endpoint: true,
          p256dh: true,
          auth: true,
          user: { select: { locale: true } },
        },
      });
      await Promise.all(
        subs.map(async (s) => {
          const message = build(mailLocale(s.user.locale));
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
              JSON.stringify(message),
              { TTL: 86_400 },
            );
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) {
              await this.prisma.webPushSubscription.delete({ where: { id: s.id } }).catch(() => {});
            } else {
              this.logger.warn(`Web push failed (${status ?? (e as Error).message})`);
            }
          }
        }),
      );
    } catch (e) {
      this.logger.warn(`Web push failed: ${(e as Error).message}`);
    }
  }
}
