import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type RevealNoteInput,
  TWO_FACTOR_RECOVERY_CODES,
  type TwoFactorRecoveryCodesDto,
  type TwoFactorSetupDto,
  type TwoFactorStatusDto,
} from '@agenda/contracts';
import type { User } from '@prisma/client';
import { AppException } from '../common/app-exception';
import { SecretBox, sha256Hex } from '../common/crypto';
import type { AuthUser } from '../common/request-context';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, type IssuedTokens } from './auth.service';
import {
  newRecoveryCode,
  newTotpSecret,
  normalizeRecoveryCode,
  otpauthUrl,
  verifyTotp,
} from './totp';
import { VaultService } from './vault.service';

const CHALLENGE_TTL_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;

const invalid = () =>
  new AppException('TWO_FACTOR_INVALID', HttpStatus.UNAUTHORIZED, 'Invalid two-factor code');

/**
 * Double authentification (TOTP) : après le mot de passe, un code à 6 chiffres de l'application
 * d'authentification (ou un code de secours, à usage unique). Le secret est chiffré en base. Les
 * passkeys (déjà à deux facteurs) et Google (sa propre double authentification) n'en demandent pas.
 */
@Injectable()
export class TwoFactorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly vault: VaultService,
  ) {}

  private box(): SecretBox | null {
    const key = env().TOKEN_ENCRYPTION_KEY;
    return key ? new SecretBox(key) : null;
  }

  async status(userId: string): Promise<TwoFactorStatusDto> {
    const user = await this.user(userId);
    const left = await this.prisma.twoFactorRecoveryCode.count({
      where: { userId, usedAt: null },
    });
    return {
      enabled: user.totpEnabledAt !== null,
      enabledAt: user.totpEnabledAt?.toISOString() ?? null,
      recoveryCodesLeft: user.totpEnabledAt ? left : 0,
      available: this.box() !== null,
    };
  }

  /** Nouveau secret à enregistrer dans l'application ; mot de passe (ou confirmation) d'abord. */
  async setup(current: AuthUser, input: RevealNoteInput): Promise<TwoFactorSetupDto> {
    const box = this.box();
    if (!box) throw unavailable();
    const user = await this.user(current.userId);
    if (user.totpEnabledAt) {
      throw new AppException('VALIDATION_FAILED', HttpStatus.CONFLICT, 'Already enabled');
    }
    await this.vault.unlock(current, input);
    const secret = newTotpSecret();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { totpPendingSecret: box.encrypt(secret) },
    });
    return { secret, otpauthUrl: otpauthUrl(secret, user.email) };
  }

  /** Premier code correct : activée, codes de secours remis (une seule fois). */
  async enable(userId: string, code: string): Promise<TwoFactorRecoveryCodesDto> {
    const box = this.box();
    if (!box) throw unavailable();
    const user = await this.user(userId);
    if (user.totpEnabledAt || !user.totpPendingSecret) throw invalid();
    const pending = box.decrypt(user.totpPendingSecret);
    const step = verifyTotp(pending, code, Date.now(), null);
    if (step === null) throw invalid();
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        totpSecret: user.totpPendingSecret,
        totpPendingSecret: null,
        totpEnabledAt: new Date(),
        totpLastStep: step,
      },
    });
    return this.newRecoveryCodes(userId);
  }

  /** Désactiver : un code valide (application ou secours) est exigé. */
  async disable(userId: string, code: string): Promise<void> {
    const user = await this.user(userId);
    if (!user.totpEnabledAt || !(await this.check(user, code))) throw invalid();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          totpSecret: null,
          totpPendingSecret: null,
          totpEnabledAt: null,
          totpLastStep: null,
        },
      }),
      this.prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.twoFactorChallenge.deleteMany({ where: { userId } }),
    ]);
  }

  /** Nouveaux codes de secours (les anciens ne marchent plus). */
  async regenerate(userId: string, code: string): Promise<TwoFactorRecoveryCodesDto> {
    const user = await this.user(userId);
    if (!user.totpEnabledAt || !(await this.check(user, code))) throw invalid();
    return this.newRecoveryCodes(userId);
  }

  /** Mot de passe vérifié : défi de 5 minutes, à compléter par un code. */
  async challenge(userId: string): Promise<string> {
    await this.prisma.twoFactorChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    const row = await this.prisma.twoFactorChallenge.create({
      data: { userId, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) },
    });
    return row.id;
  }

  /** Code correct : session ouverte. Cinq erreurs : défi supprimé, tout est à recommencer. */
  async completeLogin(
    challengeId: string,
    code: string,
    userAgent?: string,
  ): Promise<IssuedTokens> {
    const challenge = await this.prisma.twoFactorChallenge.findUnique({
      where: { id: challengeId },
      include: { user: true },
    });
    if (!challenge || challenge.expiresAt < new Date() || challenge.user.deletedAt) {
      throw invalid();
    }
    if (!(await this.check(challenge.user, code))) {
      const attempts = challenge.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await this.prisma.twoFactorChallenge.deleteMany({ where: { id: challenge.id } });
      } else {
        await this.prisma.twoFactorChallenge.update({
          where: { id: challenge.id },
          data: { attempts },
        });
      }
      throw invalid();
    }
    await this.prisma.twoFactorChallenge.deleteMany({ where: { id: challenge.id } });
    return this.auth.startSession(challenge.user, userAgent);
  }

  /** Code de l'application (pas encore utilisé) ou code de secours (consommé). */
  private async check(user: User, code: string): Promise<boolean> {
    if (/^\d{6}$/.test(code)) {
      const box = this.box();
      if (!box || !user.totpSecret) return false;
      const step = verifyTotp(box.decrypt(user.totpSecret), code, Date.now(), user.totpLastStep);
      if (step === null) return false;
      // Mise à jour conditionnelle : deux requêtes simultanées avec le même code, une seule passe.
      const used = await this.prisma.user.updateMany({
        where: { id: user.id, OR: [{ totpLastStep: null }, { totpLastStep: { lt: step } }] },
        data: { totpLastStep: step },
      });
      return used.count === 1;
    }
    const consumed = await this.prisma.twoFactorRecoveryCode.updateMany({
      where: { userId: user.id, codeHash: sha256Hex(normalizeRecoveryCode(code)), usedAt: null },
      data: { usedAt: new Date() },
    });
    return consumed.count === 1;
  }

  private async newRecoveryCodes(userId: string): Promise<TwoFactorRecoveryCodesDto> {
    const codes = Array.from({ length: TWO_FACTOR_RECOVERY_CODES }, newRecoveryCode);
    await this.prisma.$transaction([
      this.prisma.twoFactorRecoveryCode.deleteMany({ where: { userId } }),
      this.prisma.twoFactorRecoveryCode.createMany({
        data: codes.map((c) => ({ userId, codeHash: sha256Hex(normalizeRecoveryCode(c)) })),
      }),
    ]);
    return { codes };
  }

  private async user(userId: string): Promise<User> {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new AppException('UNAUTHENTICATED', HttpStatus.UNAUTHORIZED, 'Unknown user');
    return user;
  }
}

const unavailable = () =>
  new AppException(
    'TWO_FACTOR_UNAVAILABLE',
    HttpStatus.SERVICE_UNAVAILABLE,
    'Two-factor authentication needs TOKEN_ENCRYPTION_KEY',
  );
