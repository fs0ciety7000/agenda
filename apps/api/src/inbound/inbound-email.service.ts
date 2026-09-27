import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { InboundEmailInput, InboundEmailSettingsDto } from '@agenda/contracts';
import { randomBytes } from 'node:crypto';
import { AppException, notFound } from '../common/app-exception';
import type { HouseholdContext } from '../common/request-context';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';

const NOTES_MAX = 5000;

/** Préfixes de réponse / transfert retirés du sujet (FR, EN, NL, DE…). */
const SUBJECT_PREFIX = /^\s*((re|tr|fw|fwd|wg|aw|antw|réf|ref|rv)\s*(\[\d+\])?\s*:\s*)+/i;

export const inboundAvailable = () =>
  Boolean(env().INBOUND_EMAIL_ADDRESS && env().INBOUND_EMAIL_SECRET);

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
 * Tâches par e-mail : chaque membre a une adresse personnelle (`agenda+<jeton>@domaine`) ;
 * un e-mail transféré à cette adresse devient une tâche du foyer, créée en son nom. Le sujet
 * passe par l'ajout rapide (« Payer la facture vendredi » → vendredi) ; le message va en notes.
 */
@Injectable()
export class InboundEmailService {
  private readonly logger = new Logger(InboundEmailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tasks: TasksService,
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

  async receive(input: InboundEmailInput): Promise<{ occurrenceId: string }> {
    const token = extractToken(input.to);
    const member = token
      ? await this.prisma.householdMember.findFirst({
          where: { inboundToken: token, leftAt: null, userId: { not: null } },
          select: { id: true, householdId: true, role: true },
        })
      : null;
    if (!member) throw notFound();
    const ctx: HouseholdContext = {
      householdId: member.householdId,
      memberId: member.id,
      role: member.role,
    };

    const title = titleFrom(input.subject, input.text);
    if (!title) {
      throw new AppException('TASK_TITLE_REQUIRED', HttpStatus.BAD_REQUEST, 'Empty e-mail');
    }
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
    return { occurrenceId: created.id };
  }
}
