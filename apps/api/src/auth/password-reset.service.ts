import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppException } from '../common/app-exception';
import { randomToken, sha256Hex } from '../common/crypto';
import { env } from '../config/env';
import { MailService } from '../mail/mail.service';
import { mailLocale, passwordResetEmail, welcomeEmail } from '../mail/templates';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';

const TOKEN_TTL_MS = 30 * 60_000;
const WELCOME_TTL_MS = 7 * 86_400_000;

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly passwords: PasswordService,
    private readonly auth: AuthService,
  ) {}

  /**
   * Toujours la même réponse, immédiate, que l'email existe ou non : tout le traitement (recherche
   * du compte, jeton, envoi SMTP) se fait en arrière-plan. Ni le délai ni une panne d'envoi ne
   * révèlent l'existence d'un compte.
   */
  requestInBackground(email: string): void {
    void this.request(email).catch((e: unknown) =>
      this.logger.error(`Password reset failed: ${e instanceof Error ? e.message : String(e)}`),
    );
  }

  /** Un nouveau lien invalide les précédents. `welcome` : compte créé par un administrateur. */
  async request(email: string, opts: { welcome?: boolean } = {}): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.deletedAt) return;
    const ttl = opts.welcome ? WELCOME_TTL_MS : TOKEN_TTL_MS;
    const token = randomToken();
    await this.prisma.$transaction([
      this.prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: sha256Hex(token),
          expiresAt: new Date(Date.now() + ttl),
        },
      }),
    ]);
    const url = `${env().WEB_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`;
    await this.mail.send({
      to: user.email,
      ...(opts.welcome ? welcomeEmail : passwordResetEmail)(
        mailLocale(user.locale),
        user.displayName,
        url,
      ),
    });
  }

  /** Nouveau mot de passe ; toutes les sessions existantes sont révoquées. */
  async reset(token: string, password: string): Promise<void> {
    const invalid = () =>
      new AppException('RESET_TOKEN_INVALID', HttpStatus.BAD_REQUEST, 'Invalid reset token');
    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: sha256Hex(token) },
      include: { user: true },
    });
    if (!record || record.usedAt || record.expiresAt <= new Date() || record.user.deletedAt)
      throw invalid();
    const passwordHash = await this.passwords.hash(password);
    const { count } = await this.prisma.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (count !== 1) throw invalid();
    await this.prisma.user.update({ where: { id: record.userId }, data: { passwordHash } });
    await this.auth.logoutAll(record.userId);
  }
}
