import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

export interface AuthUser {
  userId: string;
  sessionId: string;
  /** `bearer` : app Android (jeton) ; `cookie` : site. */
  via?: 'bearer' | 'cookie';
}

export interface HouseholdContext {
  householdId: string;
  memberId: string;
  role: 'OWNER' | 'MEMBER';
}

export type AppRequest = Request & { user?: AuthUser; household?: HouseholdContext };

export const IS_PUBLIC = 'isPublic';
/** Route accessible sans authentification. */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const user = ctx.switchToHttp().getRequest<AppRequest>().user;
  if (!user) throw new Error('CurrentUser used on a public route');
  return user;
});

/** Contexte injecté par HouseholdMemberGuard. */
export const CurrentHousehold = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): HouseholdContext => {
    const household = ctx.switchToHttp().getRequest<AppRequest>().household;
    if (!household) throw new Error('CurrentHousehold used without HouseholdMemberGuard');
    return household;
  },
);
