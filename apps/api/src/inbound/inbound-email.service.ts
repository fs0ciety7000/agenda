import { Injectable, Logger } from '@nestjs/common';
import {
  ATTACHMENT_MAX_BYTES,
  type InboundEmailSettingsDto,
  type InboundEmailSettingsInput,
  type OccurrenceDto,
  type ResendWebhookEvent,
} from '@agenda/contracts';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AppException, notFound } from '../common/app-exception';
import type { HouseholdContext } from '../common/request-context';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { htmlToText } from './html-to-text';
import { MailService } from '../mail/mail.service';
import { inboundTaskCreatedEmail, inboundTaskEmptyEmail } from '../mail/templates';
import { AttachmentsService } from '../tasks/attachments.service';
import { type ReceivedEmail, ResendReceivingClient } from './resend-receiving.client';

const NOTES_MAX = 5000;
const MAX_EMAIL_ATTACHMENTS = 10;

/** « mercredi 30 septembre à 11:30 » (date locale du foyer, telle que stockée). */
export function formatWhen(
  locale: 'fr' | 'en',
  date: string | null,
  startMinute: number | null,
): string | null {
  if (!date) return null;
  const day = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'fr-BE', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${date}T12:00:00Z`));
  if (startMinute == null) return day;
  const hm = `${String(Math.floor(startMinute / 60)).padStart(2, '0')}:${String(startMinute % 60).padStart(2, '0')}`;
  return locale === 'en' ? `${day} at ${hm}` : `${day} à ${hm}`;
}

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
    private readonly attachments: AttachmentsService,
    private readonly mail: MailService,
  ) {}

  async settings(ctx: HouseholdContext): Promise<InboundEmailSettingsDto> {
    const m = await this.prisma.householdMember.findUniqueOrThrow({
      where: { id: ctx.memberId },
      select: { inboundToken: true, inboundAck: true },
    });
    if (!inboundAvailable()) return { available: false, address: null, acknowledge: m.inboundAck };
    return {
      available: true,
      address: m.inboundToken ? addressFor(m.inboundToken) : null,
      acknowledge: m.inboundAck,
    };
  }

  /** Crée l'adresse, ou la remplace (l'ancienne cesse de fonctionner). */
  async regenerate(ctx: HouseholdContext): Promise<InboundEmailSettingsDto> {
    if (!inboundAvailable()) throw notFound();
    await this.prisma.householdMember.update({
      where: { id: ctx.memberId },
      data: { inboundToken: randomBytes(16).toString('hex') },
    });
    return this.settings(ctx);
  }

  async update(
    ctx: HouseholdContext,
    input: InboundEmailSettingsInput,
  ): Promise<InboundEmailSettingsDto> {
    await this.prisma.householdMember.update({
      where: { id: ctx.memberId },
      data: { inboundAck: input.acknowledge },
    });
    return this.settings(ctx);
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
    if (!created) {
      await this.acknowledge(member.id, null, []);
      return { ignored: 'empty' };
    }
    const files = await this.saveAttachments(ctx, created.taskId, event.data.email_id, email);
    await this.acknowledge(member.id, created, files);
    return { occurrenceId: created.id };
  }

  /**
   * Pièces jointes de l'e-mail → tâche (images intégrées au message ignorées). Une pièce jointe
   * trop grosse ou illisible est sautée : la tâche est déjà créée.
   */
  private async saveAttachments(
    ctx: HouseholdContext,
    taskId: string,
    emailId: string,
    email: ReceivedEmail,
  ): Promise<string[]> {
    const saved: string[] = [];
    const candidates = (email.attachments ?? [])
      .filter((a) => a.content_disposition !== 'inline')
      .slice(0, MAX_EMAIL_ATTACHMENTS);
    for (const a of candidates) {
      if (a.size !== undefined && a.size > ATTACHMENT_MAX_BYTES) continue;
      try {
        const data = await this.resend.attachment(emailId, a.id, ATTACHMENT_MAX_BYTES);
        await this.attachments.add(ctx, taskId, [
          { filename: a.filename, contentType: a.content_type, data },
        ]);
        saved.push(a.filename);
      } catch (e) {
        this.logger.warn({ err: e }, 'e-mail attachment skipped');
      }
    }
    return saved;
  }

  /** Accusé de réception, à l'adresse du compte (jamais à l'expéditeur, falsifiable). */
  private async acknowledge(memberId: string, created: OccurrenceDto | null, files: string[]) {
    const m = await this.prisma.householdMember.findUniqueOrThrow({
      where: { id: memberId },
      select: {
        inboundAck: true,
        user: { select: { email: true, locale: true } },
        household: {
          select: { members: { where: { leftAt: null }, select: { id: true, displayName: true } } },
        },
      },
    });
    if (!m.user || !m.inboundAck) return;
    const locale = m.user.locale === 'en' ? 'en' : 'fr';
    const mail = created
      ? inboundTaskCreatedEmail(locale, {
          title: created.title,
          when: formatWhen(locale, created.date, created.startMinute),
          assignees:
            created.assigneeIds
              .map((id) => m.household.members.find((x) => x.id === id)?.displayName)
              .filter(Boolean)
              .join(locale === 'en' ? ' and ' : ' et ') || null,
          files,
          url: `${env().WEB_ORIGIN}/?open=${created.id}`,
        })
      : inboundTaskEmptyEmail(locale);
    await this.mail
      .send({ to: m.user.email, ...mail })
      .catch((e: unknown) => this.logger.warn({ err: e }, 'acknowledgement not sent'));
  }

  private async createFromEmail(
    ctx: HouseholdContext,
    input: { from: string; subject: string; text: string },
  ): Promise<OccurrenceDto | null> {
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
    return created;
  }
}
