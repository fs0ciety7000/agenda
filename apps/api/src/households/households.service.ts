import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  type AcceptInvitationInput,
  type CreateHouseholdInput,
  type CreateInvitationInput,
  DEFAULT_CATEGORIES,
  type HouseholdDto,
  MemberColor,
} from '@agenda/contracts';
import { todayIn } from '@agenda/domain';
import { AppException, notFound } from '../common/app-exception';
import { fromDbDate } from '../common/dates';
import { randomToken, sha256Hex } from '../common/crypto';
import { HouseholdContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

const INVITATION_TTL_MS = 7 * 86_400_000;
const DEFAULT_COLOR: MemberColor = 'sage';

/** Absences qui ne sont pas encore terminées (marge d'un jour pour les fuseaux). */
const householdInclude = () =>
  ({
    members: { where: { leftAt: null }, orderBy: { joinedAt: 'asc' } },
    absences: {
      where: { endDate: { gte: new Date(Date.now() - 86_400_000) } },
      select: { memberId: true, startDate: true, endDate: true },
    },
  }) as const satisfies Prisma.HouseholdInclude;

type HouseholdWithMembers = Prisma.HouseholdGetPayload<{
  include: ReturnType<typeof householdInclude>;
}>;

@Injectable()
export class HouseholdsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, input: CreateHouseholdInput): Promise<HouseholdDto> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const lang = user.locale === 'en' ? 'en' : 'fr';

    const household = await this.prisma.household.create({
      data: {
        name: input.name,
        timezone: input.timezone,
        members: {
          create: {
            userId,
            role: 'OWNER',
            displayName: input.memberDisplayName ?? user.displayName,
            color: DEFAULT_COLOR,
          },
        },
        categories: {
          create: DEFAULT_CATEGORIES.map((c, position) => ({
            key: c.key,
            name: c[lang],
            emoji: c.emoji,
            position,
          })),
        },
      },
      include: householdInclude(),
    });
    return toDto(household);
  }

  async listForUser(userId: string): Promise<HouseholdDto[]> {
    const households = await this.prisma.household.findMany({
      where: { deletedAt: null, members: { some: { userId, leftAt: null } } },
      include: householdInclude(),
      orderBy: { createdAt: 'asc' },
    });
    return households.map(toDto);
  }

  async get(ctx: HouseholdContext): Promise<HouseholdDto> {
    const household = await this.prisma.household.findFirst({
      where: { id: ctx.householdId, deletedAt: null },
      include: householdInclude(),
    });
    if (!household) throw notFound('HOUSEHOLD_NOT_FOUND');
    return toDto(household);
  }

  /** Le jeton brut n'est renvoyé qu'une fois ; seul son hash est stocké. */
  async createInvitation(
    ctx: HouseholdContext,
    input: CreateInvitationInput,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = randomToken();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_MS);
    await this.prisma.householdInvitation.create({
      data: {
        householdId: ctx.householdId,
        invitedById: ctx.memberId,
        email: input.email,
        tokenHash: sha256Hex(token),
        expiresAt,
      },
    });
    return { token, expiresAt };
  }

  async acceptInvitation(userId: string, input: AcceptInvitationInput): Promise<HouseholdDto> {
    const invalid = () =>
      new AppException('INVITATION_INVALID', HttpStatus.BAD_REQUEST, 'Invalid invitation');

    return this.prisma.$transaction(async (tx) => {
      const invitation = await tx.householdInvitation.findUnique({
        where: { tokenHash: sha256Hex(input.token) },
        include: { household: { include: householdInclude() } },
      });
      if (
        !invitation ||
        invitation.acceptedAt ||
        invitation.revokedAt ||
        invitation.expiresAt <= new Date() ||
        invitation.household.deletedAt
      ) {
        throw invalid();
      }

      const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
      if (invitation.email && invitation.email.toLowerCase() !== user.email.toLowerCase())
        throw invalid();

      const existing = await tx.householdMember.findUnique({
        where: { householdId_userId: { householdId: invitation.householdId, userId } },
      });
      if (existing && !existing.leftAt) {
        throw new AppException('ALREADY_MEMBER', HttpStatus.CONFLICT, 'Already a member');
      }

      // Usage unique, même sous accès concurrent.
      const { count } = await tx.householdInvitation.updateMany({
        where: { id: invitation.id, acceptedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (count !== 1) throw invalid();

      const used = new Set(invitation.household.members.map((m) => m.color));
      const color = MemberColor.options.find((c) => !used.has(c)) ?? DEFAULT_COLOR;
      const displayName = input.memberDisplayName ?? user.displayName;

      if (existing) {
        await tx.householdMember.update({
          where: { id: existing.id },
          data: { leftAt: null, role: 'MEMBER', displayName, color, joinedAt: new Date() },
        });
      } else {
        await tx.householdMember.create({
          data: { householdId: invitation.householdId, userId, role: 'MEMBER', displayName, color },
        });
      }

      const household = await tx.household.findUniqueOrThrow({
        where: { id: invitation.householdId },
        include: householdInclude(),
      });
      return toDto(household);
    });
  }
}

function toDto(h: HouseholdWithMembers): HouseholdDto {
  const today = todayIn(h.timezone);
  const absentUntil = (memberId: string) =>
    h.absences
      .filter(
        (a) =>
          a.memberId === memberId &&
          fromDbDate(a.startDate)! <= today &&
          fromDbDate(a.endDate)! >= today,
      )
      .map((a) => fromDbDate(a.endDate)!)
      .sort()
      .at(-1) ?? null;
  return {
    id: h.id,
    name: h.name,
    timezone: h.timezone,
    members: h.members.map((m) => ({
      id: m.id,
      userId: m.userId,
      displayName: m.displayName,
      role: m.role,
      color: MemberColor.catch('slate').parse(m.color),
      absentUntil: absentUntil(m.id),
    })),
  };
}
