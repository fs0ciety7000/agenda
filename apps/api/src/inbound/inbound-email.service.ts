import { Injectable, Logger } from '@nestjs/common';
import type { InboundEmailSettingsDto, ResendWebhookEvent } from '@agenda/contracts';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AppException, notFound } from '../common/app-exception';
import type { HouseholdContext } from '../common/request-context';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { htmlToText } from './html-to-text';
import { ResendReceivingClient } from './resend-receiving.client';

const NOTES_MAX = 5000;

/** Préfixes de réponse / transfert retirés du sujet (FR, EN, NL, DE…). */
const SUBJECT_PREFIX = /^\s*((re|tr|fw|fwd|wg|aw|antw|réf|ref|rv)\s*(\[\d+\])?\s*:\s*)+/i;

export const inboundAvailable = () =>
  Boolean(env().INBOUND_EMAIL_ADDRESS && env().RESEND_WEBHOOK_SECRET && env().RESEND_API_KEY);

const addressFor = (token: string) => env().INBOUND_EMAIL_ADDRESS!.replace('{token}', token);

/** Jeton de l'adresse personnelle trouvé parmi les destinataires (`…+<jeton>@…`). */
export function extractToken(to: string): string | null {
  const template = env().INBOUND_EMAIL_ADDRESS;
  if (!template) return null;
  const [before, after] = template.split('{token}') as [string, string];
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escape(before)}([a-z0-9]{16,40})${escape(after)}`, 'i').exec(to);
  return match ? match[1]!.toLowerCase() : null;
}

/** Titre de la tâche : sujet sans « Fwd: », sinon première ligne du message. */
export function titleFrom(subject: string, text: string): string {
  const cleaned = subject.replace(SUBJECT_PREFIX, '').replace(/\s+/g, ' ').trim();
  if (cleaned) return cleaned;
  const firstLine = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith('>'));
  return (firstLine ?? '').slice(0, 200);
}

/**
 * Tâches par e-mail (réception par Resend) : chaque membre a une adresse personnelle
 * (`<jeton>@tasks.domaine`) ;
 * un e-mail transféré à cette adresse devient une tâche du foyer, créée en son nom. Le sujet
 * passe par l'ajout rapide (« Payer la facture vendredi » → vendredi) ; le message va en notes.
 */
@Injectable()
export class InboundEmailService {
  private readonly logger = new Logger(InboundEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
    private readonly resend: ResendReceivingClient,
  ) {}

  async settings(ctx: HouseholdContext): Promise<InboundEmailSettingsDto> {
    if (!inboundAvailable()) return { available: false, address: null };
    const m = await this.prisma.householdMember.findUniqueOrThrow({
      where: { id: ctx.memberId },
      select: { inboundToken: true },
    });
    return { available: true, address: m.inboundToken ? addressFor(m.inboundToken) : null };
  }

  /** Crée l'adresse, ou la remplace (l'ancienne cesse de fonctionner). */
  async regenerate(ctx: HouseholdContext): Promise<InboundEmailSettingsDto> {
    if (!inboundAvailable()) throw notFound();
    const token = randomBytes(16).toString('hex');
    await this.prisma.householdMember.update({
      where: { id: ctx.memberId },
      data: { inboundToken: token },
    });
    return { available: true, address: addressFor(token) };
  }

  async disable(ctx: HouseholdContext): Promise<void> {
    await this.prisma.householdMember.update({
      where: { id: ctx.memberId },
      data: { inboundToken: null },
    });
  }

  /**
   * Webhook Resend `email.received`. Renvoie `ignored` pour ce qui ne crée rien (autre
   * événement, adresse inconnue ou désactivée, doublon) : Resend ne doit pas réessayer.
   * Une erreur (API Resend indisponible) fait réessayer Resend plus tard.
   */
  async handleResendEvent(
    event: ResendWebhookEvent,
  ): Promise<{ occurrenceId: string } | { ignored: string }> {
    if (event.type !== 'email.received' || !event.data?.email_id) return { ignored: 'event' };
    const recipients = [...(event.data.to ?? []), ...(event.data.received_for ?? [])].join(', ');
    const token = extractToken(recipients);
    const member = token
      ? await this.prisma.householdMember.findFirst({
          where: { inboundToken: token, leftAt: null, userId: { not: null } },
          select: { id: true, householdId: true, role: true, userId: true },
        })
      : null;
    if (!member) return { ignored: 'address' };

    // Resend peut livrer deux fois le même webhook : une seule tâche par e-mail.
    try {
      await this.prisma.idempotencyKey.create({
        data: {
          key: `resend:${event.data.email_id}`.slice(0, 64),
          userId: member.userId!,
          method: 'POST',
          path: '/v1/inbound/resend',
          statusCode: 201,
          responseBody: {},
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
        return { ignored: 'duplicate' };
      throw e;
    }

    let email;
    try {
      email = await this.resend.get(event.data.email_id);
    } catch (e) {
      // Réservation annulée : le prochain essai de Resend la refera.
      await this.prisma.idempotencyKey.deleteMany({
        where: { key: `resend:${event.data.email_id}`.slice(0, 64) },
      });
      throw e;
    }
    const ctx: HouseholdContext = {
      householdId: member.householdId,
      memberId: member.id,
      role: member.role,
    };
    const text = email.text?.trim() || (email.html ? htmlToText(email.html) : '');
    const from = email.headers?.from ?? email.from ?? event.data.from ?? '';
    const created = await this.createFromEmail(ctx, {
      from,
      subject: email.subject ?? event.data.subject ?? '',
      text: text.slice(0, 20_000),
    });
    return created ? { occurrenceId: created } : { ignored: 'empty' };
  }

  private async createFromEmail(
    ctx: HouseholdContext,
    input: { from: string; subject: string; text: string },
  ): Promise<string | null> {
    const title = titleFrom(input.subject, input.text);
    if (!title) return null;
    const header = [input.from && `✉ ${input.from.trim()}`, input.subject.trim()]
      .filter(Boolean)
      .join(' — ');
    const notes = `${header}\n\n${input.text.trim()}`.trim().slice(0, NOTES_MAX);

    let created;
    try {
      created = await this.tasks.quickAdd(ctx, title, { notes });
    } catch (e) {
      // Sujet réduit à rien par l'analyse (« demain ») : le sujet brut devient le titre.
      if (!(e instanceof AppException) || e.code !== 'TASK_TITLE_REQUIRED') throw e;
      created = await this.tasks.create(ctx, {
        title: title.slice(0, 200),
        notes,
        priority: 'NORMAL',
        visibility: 'SHARED',
        assigneeIds: [],
        syncToCalendar: false,
      });
    }
    this.logger.log({ householdId: ctx.householdId }, 'task created from e-mail');
    return created.id;
  }
}
