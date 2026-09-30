import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma, type User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import type {
  ChangePasswordInput,
  LoginInput,
  MeResponse,
  RegisterInput,
  UpdateMeInput,
} from '@agenda/contracts';
import { AppException } from '../common/app-exception';
import type { AuthUser } from '../common/request-context';
import { randomToken, sha256Hex } from '../common/crypto';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { mailLocale } from '../mail/templates';

export interface IssuedTokens {
  user: MeResponse;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresIn: number;
}

/** Un refresh token tout juste remplacé reste accepté ce délai (onglets concurrents). */
const REUSE_GRACE_MS = 30_000;

const sessionExpired = () =>
  new AppException('SESSION_EXPIRED', HttpStatus.UNAUTHORIZED, 'Session expired');

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  async register(input: RegisterInput, userAgent?: string): Promise<IssuedTokens> {
    if (!env().REGISTRATION_ENABLED) {
      throw new AppException('REGISTRATION_CLOSED', HttpStatus.FORBIDDEN, 'Registration is closed');
    }
    const passwordHash = await this.passwords.hash(input.password);
    let user: User;
    try {
      user = await this.prisma.user.create({
        data: {
          email: input.email,
          passwordHash,
          displayName: input.displayName,
          locale: input.locale,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new AppException('EMAIL_ALREADY_USED', HttpStatus.CONFLICT, 'Email already used');
      }
      throw e;
    }
    return this.issue(user, randomUUID(), userAgent);
  }

  async login(input: LoginInput, userAgent?: string): Promise<IssuedTokens> {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (!user || user.deletedAt || !user.passwordHash) {
      await this.passwords.burn(input.password);
      throw new AppException('INVALID_CREDENTIALS', HttpStatus.UNAUTHORIZED, 'Invalid credentials');
    }
    if (!(await this.passwords.verify(user.passwordHash, input.password))) {
      throw new AppException('INVALID_CREDENTIALS', HttpStatus.UNAUTHORIZED, 'Invalid credentials');
    }
    return this.issue(user, randomUUID(), userAgent);
  }

  /**
   * Rotation du refresh token. Un token remplacé depuis plus de 30 s et rejoué indique un vol probable :
   * toute la famille (l'appareil) est révoquée.
   */
  async refresh(refreshToken: string, userAgent?: string): Promise<IssuedTokens> {
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: sha256Hex(refreshToken) },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.user.deletedAt) throw sessionExpired();

    if (session.expiresAt <= new Date()) throw sessionExpired();

    if (session.replacedAt) {
      // Deux onglets / requêtes qui rafraîchissent en même temps : rejeu légitime et rapproché.
      if (Date.now() - session.replacedAt.getTime() <= REUSE_GRACE_MS) {
        return this.issue(session.user, session.familyId, userAgent);
      }
      this.logger.warn(
        `Refresh token reuse detected (family ${session.familyId}); revoking family`,
      );
      await this.revokeFamily(session.familyId);
      throw sessionExpired();
    }

    // `replacedAt: null` en condition : si un refresh concurrent vient de marquer la session,
    // on est par construction dans la fenêtre de grâce et l'émission reste légitime.
    await this.prisma.session.updateMany({
      where: { id: session.id, replacedAt: null },
      data: { replacedAt: new Date() },
    });
    return this.issue(session.user, session.familyId, userAgent);
  }

  /** Déconnexion de l'appareil courant (toute la famille de la session). */
  async logout(sessionId: string): Promise<void> {
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (session) await this.revokeFamily(session.familyId);
  }

  async logoutByRefreshToken(refreshToken: string): Promise<void> {
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: sha256Hex(refreshToken) },
    });
    if (session) await this.revokeFamily(session.familyId);
  }

  /** « Se déconnecter de tous les appareils ». */
  async logoutAll(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /** Utilisé par le guard : la session doit exister et ne pas être révoquée. */
  async isSessionActive(sessionId: string, userId: string): Promise<boolean> {
    const session = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { userId: true, revokedAt: true },
    });
    return !!session && session.userId === userId && !session.revokedAt;
  }

  /**
   * Changement de mot de passe depuis les Réglages. Les autres appareils sont déconnectés ;
   * la session en cours reste ouverte.
   */
  async changePassword(user: AuthUser, input: ChangePasswordInput): Promise<void> {
    const current = await this.prisma.user.findFirst({
      where: { id: user.userId, deletedAt: null },
    });
    if (!current)
      throw new AppException('UNAUTHENTICATED', HttpStatus.UNAUTHORIZED, 'Unknown user');
    if (current.passwordHash) {
      const ok =
        input.currentPassword !== undefined &&
        (await this.passwords.verify(current.passwordHash, input.currentPassword));
      if (!ok) {
        throw new AppException(
          'CURRENT_PASSWORD_INVALID',
          HttpStatus.BAD_REQUEST,
          'Current password is incorrect',
        );
      }
    }
    const passwordHash = await this.passwords.hash(input.newPassword);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: current.id }, data: { passwordHash } }),
      this.prisma.session.updateMany({
        where: { userId: current.id, revokedAt: null, id: { not: user.sessionId } },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  /** Délier « Continuer avec Google » (ex. mauvais compte). Impossible sans mot de passe. */
  async unlinkGoogle(userId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new AppException('UNAUTHENTICATED', HttpStatus.UNAUTHORIZED, 'Unknown user');
    if (!user.passwordHash) {
      throw new AppException(
        'PASSWORD_REQUIRED',
        HttpStatus.CONFLICT,
        'Set a password before unlinking Google',
      );
    }
    await this.prisma.authIdentity.deleteMany({ where: { userId, provider: 'GOOGLE' } });
  }

  /** Nouvelle session pour un utilisateur déjà authentifié (Google Sign-In). */
  startSession(user: User, userAgent?: string): Promise<IssuedTokens> {
    return this.issue(user, randomUUID(), userAgent);
  }

  async me(userId: string): Promise<MeResponse> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { identities: { where: { provider: 'GOOGLE' }, select: { id: true } } },
    });
    if (!user) throw new AppException('UNAUTHENTICATED', HttpStatus.UNAUTHORIZED, 'Unknown user');
    return toMe(user, user.identities.length > 0);
  }

  /** Changer la langue du compte (interface, e-mails). */
  async updateMe(userId: string, input: UpdateMeInput): Promise<MeResponse> {
    await this.prisma.user.update({ where: { id: userId }, data: { locale: input.locale } });
    return this.me(userId);
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issue(user: User, familyId: string, userAgent?: string): Promise<IssuedTokens> {
    // Point de passage de toute connexion (mot de passe, Google, rafraîchissement).
    if (user.disabledAt) {
      throw new AppException('ACCOUNT_DISABLED', HttpStatus.FORBIDDEN, 'Account disabled');
    }
    const refreshToken = randomToken();
    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        familyId,
        refreshTokenHash: sha256Hex(refreshToken),
        userAgent: userAgent?.slice(0, 255),
        expiresAt: new Date(Date.now() + env().REFRESH_TOKEN_TTL_DAYS * 86_400_000),
      },
    });
    const accessToken = await this.tokens.signAccess({ userId: user.id, sessionId: session.id });
    return {
      user: toMe(user),
      accessToken,
      refreshToken,
      accessTokenExpiresIn: this.tokens.accessTtlSeconds,
    };
  }
}

function toMe(user: User, googleLinked = false): MeResponse {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    locale: mailLocale(user.locale),
    hasPassword: user.passwordHash !== null,
    googleLinked,
    isAdmin: isAdminEmail(user.email),
  };
}

/** Administrateur de l'instance (variable ADMIN_EMAILS). */
export const isAdminEmail = (email: string) => env().ADMIN_EMAILS.includes(email.toLowerCase());
