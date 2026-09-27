import { CanActivate, ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { isAdminEmail } from '../auth/auth.service';
import { AppException } from '../common/app-exception';
import type { AppRequest } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';

/** Réservé aux adresses de ADMIN_EMAILS (relu à chaque requête : retirer une adresse suffit). */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const user = req.user
      ? await this.prisma.user.findFirst({
          where: { id: req.user.userId, deletedAt: null, disabledAt: null },
          select: { email: true },
        })
      : null;
    // 404 plutôt que 403 : la page d'administration n'existe pas pour les autres.
    if (!user || !isAdminEmail(user.email))
      throw new AppException('NOT_FOUND', HttpStatus.NOT_FOUND, 'Not found');
    return true;
  }
}
