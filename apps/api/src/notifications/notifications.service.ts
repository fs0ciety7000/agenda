import { DomainEvents } from '../common/domain-events';
import { Injectable } from '@nestjs/common';
import type {
  ExpenseCategory,
  NotificationDto,
  NotificationKind,
  NotificationListDto,
  NotificationPreferenceDto,
  NotificationQuery,
} from '@agenda/contracts';
import { Prisma } from '@prisma/client';
import type { HouseholdContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { PushService } from './push.service';
import { type WebPushMessage, WebPushService } from './web-push.service';
import { type Locale } from '../mail/templates';
import { categoryLabel } from '../expenses/expenses-csv';

export const NOTIFICATION_KINDS: NotificationKind[] = [
  'TASK_ASSIGNED',
  'CALENDAR_SYNC_FAILED',
  'TASK_COMMENT',
  'TASK_THANKS',
  'EXPENSE_BUDGET',
  'TASK_SWAP_REQUEST',
  'TASK_SWAP_ANSWER',
  'IMPORTANT_DATE',
];
const DEFAULT_PREF = { inApp: true, push: true };

type TaskNotification =
  'TASK_ASSIGNED' | 'TASK_COMMENT' | 'TASK_THANKS' | 'TASK_SWAP_REQUEST' | 'TASK_SWAP_ANSWER';
const TASK_NOTIFICATIONS: string[] = [
  'TASK_ASSIGNED',
  'TASK_COMMENT',
  'TASK_THANKS',
  'TASK_SWAP_REQUEST',
  'TASK_SWAP_ANSWER',
];
const isTaskNotification = (type: string): type is TaskNotification =>
  TASK_NOTIFICATIONS.includes(type);

interface AssignedPayload {
  occurrenceId: string;
  byMemberId: string;
  recurring: boolean;
}

/** Budget commun du mois : seuil atteint (80 ou 100 %), dépensé et budget à ce moment-là. */
export interface BudgetPayload {
  /** Budget d'une catégorie ; null ou absent = budget global du mois. */
  category?: ExpenseCategory | null;
  month: string;
  level: 80 | 100;
  amountCents: number;
  budgetCents: number;
}

/** Date importante qui approche : la date (identifiant), l'occurrence et les jours restants. */
export interface ImportantDatePayload {
  dateId: string;
  date: string;
  daysLeft: number;
}

/**
 * Notifications du foyer. La charge utile ne contient que des identifiants : titre, date et nom
 * sont relus à l'affichage (une tâche renommée ou supprimée n'affiche jamais d'information périmée).
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly push: PushService,
    private readonly webPush: WebPushService,
    private readonly events: DomainEvents,
  ) {}

  /** « Nicolas vous a attribué une tâche » : jamais pour ses propres actions. */
  async notifyAssigned(
    ctx: HouseholdContext,
    occurrenceId: string,
    memberIds: string[],
    recurring: boolean,
  ): Promise<void> {
    await this.notifyTask(ctx, 'TASK_ASSIGNED', occurrenceId, memberIds, recurring);
  }

  /** « Grace a commenté « Vidange » » (jamais le texte du commentaire dans la notification). */
  async notifyComment(
    ctx: HouseholdContext,
    occurrenceId: string,
    memberIds: string[],
    recurring: boolean,
  ): Promise<void> {
    await this.notifyTask(ctx, 'TASK_COMMENT', occurrenceId, memberIds, recurring);
  }

  /** « Grace te dit merci pour « Sortir les poubelles » ». */
  async notifyThanks(
    ctx: HouseholdContext,
    occurrenceId: string,
    memberId: string,
    recurring: boolean,
  ): Promise<void> {
    await this.notifyTask(ctx, 'TASK_THANKS', occurrenceId, [memberId], recurring);
  }

  /** « Nicolas te demande de prendre « Vaisselle » » (échange de tour). */
  async notifySwapRequest(
    ctx: HouseholdContext,
    occurrenceId: string,
    memberId: string,
    recurring: boolean,
  ): Promise<void> {
    await this.notifyTask(ctx, 'TASK_SWAP_REQUEST', occurrenceId, [memberId], recurring);
  }

  /** « Grace a accepté / ne peut pas prendre « Vaisselle » ». */
  async notifySwapAnswer(
    ctx: HouseholdContext,
    occurrenceId: string,
    memberId: string,
    recurring: boolean,
    accepted: boolean,
  ): Promise<void> {
    await this.notifyTask(ctx, 'TASK_SWAP_ANSWER', occurrenceId, [memberId], recurring, {
      code: accepted ? 'ACCEPTED' : 'DECLINED',
    });
  }

  private async notifyTask(
    ctx: HouseholdContext,
    type: TaskNotification,
    occurrenceId: string,
    memberIds: string[],
    recurring: boolean,
    extra: { code?: string } = {},
  ): Promise<void> {
    const targets = [...new Set(memberIds)].filter((id) => id !== ctx.memberId);
    if (!targets.length) return;
    const members = await this.prisma.householdMember.findMany({
      where: {
        id: { in: targets },
        householdId: ctx.householdId,
        leftAt: null,
        userId: { not: null },
      },
      select: { id: true, preferences: { where: { type } } },
    });
    const payload: AssignedPayload & { code?: string } = {
      occurrenceId,
      byMemberId: ctx.memberId,
      recurring,
      ...extra,
    };
    const data = members
      .map((m) => ({ member: m, pref: m.preferences[0] ?? DEFAULT_PREF }))
      .filter(({ pref }) => pref.inApp || pref.push)
      .map(({ member, pref }) => ({
        memberId: member.id,
        type,
        payload: { ...payload, push: pref.push } as unknown as Prisma.InputJsonValue,
      }));
    if (!data.length) return;
    await this.prisma.notification.createMany({ data });
    this.events.publish(ctx.householdId, 'notifications');
    // Téléphones réveillés tout de suite (sans contenu) pour ceux qui veulent la notification.
    const pushIds = members.filter((m) => (m.preferences[0] ?? DEFAULT_PREF).push).map((m) => m.id);
    void this.push.wakeMembers(ctx.householdId, pushIds);
    // Navigateurs abonnés : message chiffré, dans la langue de chacun.
    if (this.webPush.enabled && pushIds.length) {
      const [occ, by] = await Promise.all([
        this.prisma.taskOccurrence.findUnique({
          where: { id: occurrenceId },
          select: { titleOverride: true, task: { select: { title: true } } },
        }),
        this.prisma.householdMember.findUnique({
          where: { id: ctx.memberId },
          select: { displayName: true },
        }),
      ]);
      const title = occ?.titleOverride ?? occ?.task.title ?? '';
      void this.webPush.sendToMembers(ctx.householdId, pushIds, (locale) =>
        webPushText(
          locale,
          type,
          by?.displayName ?? '?',
          title,
          recurring,
          occurrenceId,
          extra.code,
        ),
      );
    }
  }

  /**
   * « 80 % du budget commun d'octobre » : une seule fois par mois, seuil et budget (un budget
   * modifié peut donc prévenir à nouveau). Pas pour la personne qui vient d'enregistrer la dépense.
   */
  /** « Anniversaire de mamie dans 7 jours » : à tout le foyer (personne n'a fait d'action). */
  async notifyImportantDate(
    householdId: string,
    title: string,
    payload: ImportantDatePayload,
  ): Promise<void> {
    const members = await this.prisma.householdMember.findMany({
      where: { householdId, leftAt: null, userId: { not: null } },
      select: { id: true, preferences: { where: { type: 'IMPORTANT_DATE' } } },
    });
    const targets = members
      .map((m) => ({ id: m.id, pref: m.preferences[0] ?? DEFAULT_PREF }))
      .filter(({ pref }) => pref.inApp || pref.push);
    if (!targets.length) return;
    await this.prisma.notification.createMany({
      data: targets.map(({ id, pref }) => ({
        memberId: id,
        type: 'IMPORTANT_DATE' as const,
        payload: { ...payload, push: pref.push } as unknown as Prisma.InputJsonValue,
      })),
    });
    this.events.publish(householdId, 'notifications');
    const pushIds = targets.filter(({ pref }) => pref.push).map(({ id }) => id);
    void this.push.wakeMembers(householdId, pushIds);
    if (this.webPush.enabled && pushIds.length) {
      void this.webPush.sendToMembers(householdId, pushIds, (locale) =>
        importantDatePushText(locale, title, payload),
      );
    }
  }

  async notifyBudget(
    householdId: string,
    actorMemberId: string | null,
    budget: BudgetPayload,
  ): Promise<void> {
    const sent = await this.prisma.notification.findMany({
      where: {
        type: 'EXPENSE_BUDGET',
        member: { householdId },
        AND: [
          { payload: { path: ['month'], equals: budget.month } },
          { payload: { path: ['level'], equals: budget.level } },
          { payload: { path: ['budgetCents'], equals: budget.budgetCents } },
        ],
      },
      select: { payload: true },
    });
    // Même seuil déjà signalé pour ce budget (global : sans catégorie).
    const category = budget.category ?? null;
    if (
      sent.some((n) => ((n.payload as { category?: string | null }).category ?? null) === category)
    )
      return;
    const members = await this.prisma.householdMember.findMany({
      where: {
        householdId,
        leftAt: null,
        userId: { not: null },
        ...(actorMemberId ? { id: { not: actorMemberId } } : {}),
      },
      select: { id: true, preferences: { where: { type: 'EXPENSE_BUDGET' } } },
    });
    const targets = members
      .map((m) => ({ id: m.id, pref: m.preferences[0] ?? DEFAULT_PREF }))
      .filter(({ pref }) => pref.inApp || pref.push);
    if (!targets.length) return;
    await this.prisma.notification.createMany({
      data: targets.map(({ id, pref }) => ({
        memberId: id,
        type: 'EXPENSE_BUDGET' as const,
        payload: { ...budget, push: pref.push } as unknown as Prisma.InputJsonValue,
      })),
    });
    this.events.publish(householdId, 'notifications');
    const pushIds = targets.filter(({ pref }) => pref.push).map(({ id }) => id);
    void this.push.wakeMembers(householdId, pushIds);
    if (this.webPush.enabled && pushIds.length) {
      void this.webPush.sendToMembers(householdId, pushIds, (locale) =>
        budgetPushText(locale, budget),
      );
    }
  }

  async list(ctx: HouseholdContext, query: NotificationQuery): Promise<NotificationListDto> {
    const prefs = await this.preferencesMap(ctx);
    const visibleTypes = NOTIFICATION_KINDS.filter((k) => prefs[k].inApp || prefs[k].push);
    const where: Prisma.NotificationWhereInput = {
      memberId: ctx.memberId,
      type: { in: visibleTypes },
      ...(query.since ? { createdAt: { gt: new Date(query.since) } } : {}),
    };
    const [rows, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: query.limit,
      }),
      this.prisma.notification.count({
        where: {
          memberId: ctx.memberId,
          readAt: null,
          type: { in: NOTIFICATION_KINDS.filter((k) => prefs[k].inApp) },
        },
      }),
    ]);

    const assigned = rows
      .filter((r) => isTaskNotification(r.type))
      .map((r) => r.payload as unknown as AssignedPayload);
    const [occurrences, members] = await Promise.all([
      this.prisma.taskOccurrence.findMany({
        where: {
          id: { in: assigned.map((p) => p.occurrenceId) },
          householdId: ctx.householdId,
          task: { deletedAt: null },
          status: { notIn: ['CANCELLED'] },
        },
        select: { id: true, date: true, titleOverride: true, task: { select: { title: true } } },
      }),
      this.prisma.householdMember.findMany({
        where: { householdId: ctx.householdId },
        select: { id: true, displayName: true },
      }),
    ]);
    const dateIds = rows
      .filter((r) => r.type === 'IMPORTANT_DATE')
      .map((r) => (r.payload as unknown as ImportantDatePayload).dateId);
    const dateTitles = new Map(
      dateIds.length
        ? (
            await this.prisma.importantDate.findMany({
              where: { id: { in: dateIds }, householdId: ctx.householdId },
              select: { id: true, title: true },
            })
          ).map((d) => [d.id, d.title])
        : [],
    );
    const occById = new Map(occurrences.map((o) => [o.id, o]));
    const nameById = new Map(members.map((m) => [m.id, m.displayName]));

    const items: NotificationDto[] = rows.map((r) => {
      const payload = r.payload as Record<string, unknown>;
      const occ = isTaskNotification(r.type)
        ? occById.get(payload.occurrenceId as string)
        : undefined;
      return {
        id: r.id,
        type: r.type as NotificationKind,
        createdAt: r.createdAt.toISOString(),
        readAt: r.readAt?.toISOString() ?? null,
        // Préférence « push » au moment de la création, et toujours voulue aujourd'hui.
        push: payload.push !== false && prefs[r.type as NotificationKind].push,
        occurrenceId: occ?.id ?? null,
        title: occ
          ? (occ.titleOverride ?? occ.task.title)
          : r.type === 'IMPORTANT_DATE'
            ? (dateTitles.get(payload.dateId as string) ?? null)
            : null,
        date: occ?.date
          ? occ.date.toISOString().slice(0, 10)
          : r.type === 'IMPORTANT_DATE'
            ? String(payload.date)
            : null,
        recurring: payload.recurring === true,
        byName:
          typeof payload.byMemberId === 'string'
            ? (nameById.get(payload.byMemberId) ?? null)
            : null,
        code: typeof payload.code === 'string' ? payload.code : null,
        month: r.type === 'EXPENSE_BUDGET' ? String(payload.month) : null,
        level: r.type === 'EXPENSE_BUDGET' ? Number(payload.level) : null,
        amountCents: r.type === 'EXPENSE_BUDGET' ? Number(payload.amountCents) : null,
        budgetCents: r.type === 'EXPENSE_BUDGET' ? Number(payload.budgetCents) : null,
        category:
          r.type === 'EXPENSE_BUDGET' && typeof payload.category === 'string'
            ? payload.category
            : null,
        daysLeft: r.type === 'IMPORTANT_DATE' ? Number(payload.daysLeft) : null,
      };
    });
    return { unread, items };
  }

  async markRead(ctx: HouseholdContext, ids?: string[]): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { memberId: ctx.memberId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
      data: { readAt: new Date() },
    });
  }

  async preferences(ctx: HouseholdContext): Promise<NotificationPreferenceDto[]> {
    const map = await this.preferencesMap(ctx);
    return NOTIFICATION_KINDS.map((type) => ({ type, ...map[type] }));
  }

  async updatePreferences(
    ctx: HouseholdContext,
    prefs: NotificationPreferenceDto[],
  ): Promise<NotificationPreferenceDto[]> {
    await this.prisma.$transaction(
      prefs.map((p) =>
        this.prisma.notificationPreference.upsert({
          where: { memberId_type: { memberId: ctx.memberId, type: p.type } },
          create: { memberId: ctx.memberId, type: p.type, inApp: p.inApp, push: p.push },
          update: { inApp: p.inApp, push: p.push },
        }),
      ),
    );
    return this.preferences(ctx);
  }

  private async preferencesMap(ctx: HouseholdContext) {
    const rows = await this.prisma.notificationPreference.findMany({
      where: { memberId: ctx.memberId },
    });
    const map = Object.fromEntries(
      NOTIFICATION_KINDS.map((k) => [k, { ...DEFAULT_PREF }]),
    ) as Record<NotificationKind, { inApp: boolean; push: boolean }>;
    for (const r of rows) {
      if ((NOTIFICATION_KINDS as string[]).includes(r.type))
        map[r.type as NotificationKind] = { inApp: r.inApp, push: r.push };
    }
    return map;
  }
}

/** Texte des notifications du site (mêmes formulations que la cloche). */
export function webPushText(
  locale: Locale,
  type: TaskNotification,
  by: string,
  title: string,
  recurring: boolean,
  occurrenceId: string,
  code?: string,
): WebPushMessage {
  const kind =
    type === 'TASK_SWAP_REQUEST'
      ? 'swapRequest'
      : type === 'TASK_SWAP_ANSWER'
        ? code === 'ACCEPTED'
          ? 'swapAccepted'
          : 'swapDeclined'
        : type === 'TASK_THANKS'
          ? 'thanks'
          : type === 'TASK_COMMENT'
            ? 'comment'
            : recurring
              ? 'recurring'
              : 'assigned';
  const body = {
    fr: {
      thanks: `${by} vous dit merci pour « ${title} »`,
      comment: `${by} a commenté « ${title} »`,
      recurring: `${by} vous a inclus dans « ${title} » (récurrente)`,
      assigned: `${by} vous a confié « ${title} »`,
      swapRequest: `${by} vous demande de prendre « ${title} »`,
      swapAccepted: `${by} prend « ${title} » à votre place`,
      swapDeclined: `${by} ne peut pas prendre « ${title} »`,
    },
    en: {
      thanks: `${by} says thanks for “${title}”`,
      comment: `${by} commented on “${title}”`,
      recurring: `${by} included you in “${title}” (recurring)`,
      assigned: `${by} assigned you “${title}”`,
      swapRequest: `${by} asks you to take “${title}”`,
      swapAccepted: `${by} is taking “${title}” for you`,
      swapDeclined: `${by} can't take “${title}”`,
    },
    nl: {
      thanks: `${by} bedankt je voor “${title}”`,
      comment: `${by} heeft gereageerd op “${title}”`,
      recurring: `${by} heeft je toegevoegd aan “${title}” (terugkerend)`,
      assigned: `${by} heeft je “${title}” gegeven`,
      swapRequest: `${by} vraagt of je “${title}” wilt overnemen`,
      swapAccepted: `${by} neemt “${title}” van je over`,
      swapDeclined: `${by} kan “${title}” niet overnemen`,
    },
  }[locale][kind];
  return {
    title: 'Tandem',
    body,
    url: `/?open=${occurrenceId}`,
    tag: `occurrence-${occurrenceId}`,
  };
}

const INTL_LOCALE: Record<Locale, string> = { fr: 'fr-FR', en: 'en-GB', nl: 'nl-BE' };

/** « Budget commun · octobre : 80 % atteint (640,00 € sur 800,00 €) » (comme dans la cloche). */
export function budgetPushText(locale: Locale, b: BudgetPayload): WebPushMessage {
  const tag = INTL_LOCALE[locale];
  const money = (cents: number) =>
    new Intl.NumberFormat(tag, { style: 'currency', currency: 'EUR' }).format(cents / 100);
  const month = new Intl.DateTimeFormat(tag, { month: 'long', timeZone: 'UTC' }).format(
    new Date(`${b.month}-15T12:00:00Z`),
  );
  const spent = money(b.amountCents);
  const budget = money(b.budgetCents);
  const name = b.category
    ? categoryLabel(locale, b.category)
    : { fr: 'Budget commun', en: 'Shared budget', nl: 'Gezamenlijk budget' }[locale];
  const body = {
    fr: `${name} · ${month} : ${b.level} % atteint (${spent} sur ${budget})`,
    en: `${name} · ${month}: ${b.level}% reached (${spent} of ${budget})`,
    nl: `${name} · ${month}: ${b.level}% bereikt (${spent} van ${budget})`,
  }[locale];
  return {
    title: 'Tandem',
    body,
    url: '/expenses',
    tag: `budget-${b.month}${b.category ? `-${b.category}` : ''}`,
  };
}

/** Texte du rappel : « Anniversaire de mamie : dans 7 jours (mercredi 14 octobre) ». */
export function importantDatePushText(
  locale: Locale,
  title: string,
  p: ImportantDatePayload,
): WebPushMessage {
  const when = new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${p.date}T12:00:00Z`));
  const n = p.daysLeft;
  const body = {
    fr:
      n === 0
        ? `${title} : c'est aujourd'hui`
        : `${title} : ${n === 1 ? 'demain' : `dans ${n} jours`} (${when})`,
    en:
      n === 0 ? `${title}: today` : `${title}: ${n === 1 ? 'tomorrow' : `in ${n} days`} (${when})`,
    nl:
      n === 0
        ? `${title}: vandaag`
        : `${title}: ${n === 1 ? 'morgen' : `over ${n} dagen`} (${when})`,
  }[locale];
  return { title: 'Tandem', body, url: '/dates', tag: `date-${p.dateId}-${p.date}` };
}
