import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { notFound } from '../common/app-exception';
import { isUuid } from '../common/uuid';
import { AppRequest } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Isolation multi-tenant. Toute route `/households/:householdId/...` exige que l'utilisateur
 * soit membre actif du foyer. Sinon 404 (pas 403) : on ne révèle pas l'existence du foyer.
 * Les services filtrent ensuite systématiquement par `householdId`.
 */
@Injectable()
export class HouseholdMemberGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const householdId = req.params.householdId;
    if (!req.user || !isUuid(householdId)) throw notFound('HOUSEHOLD_NOT_FOUND');

    const member = await this.prisma.householdMember.findFirst({
      where: { householdId, userId: req.user.userId, leftAt: null, household: { deletedAt: null } },
      select: { id: true, role: true },
    });
    if (!member) throw notFound('HOUSEHOLD_NOT_FOUND');

    req.household = { householdId, memberId: member.id, role: member.role };
    return true;
  }
}
