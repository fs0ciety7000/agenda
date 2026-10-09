import { HttpStatus, Injectable } from '@nestjs/common';
import { type RevealNoteInput, VAULT_UNLOCK_MINUTES } from '@agenda/contracts';
import { AppException } from '../common/app-exception';
import type { AuthUser } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { PasswordService } from './password.service';

/**
 * Vérification avant d'afficher ou d'exporter un contenu protégé (notes sensibles, sauvegarde du
 * foyer). Android (jeton) vérifie l'empreinte ou le code sur l'appareil ; le site demande le mot
 * de passe du compte (ou une confirmation pour un compte sans mot de passe), puis garde le coffre
 * ouvert quelques minutes pour la session.
 */
@Injectable()
export class VaultService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  /** Lève VAULT_LOCKED (avec la méthode attendue) ou CURRENT_PASSWORD_INVALID. */
  async unlock(user: AuthUser, input: RevealNoteInput): Promise<void> {
    if (user.via === 'bearer') return;
    const now = new Date();
    const session = await this.prisma.session.findUniqueOrThrow({
      where: { id: user.sessionId },
      select: { vaultUnlockedUntil: true, user: { select: { passwordHash: true } } },
    });
    if (session.vaultUnlockedUntil && session.vaultUnlockedUntil > now) return;
    const hash = session.user.passwordHash;
    if (hash ? !input.password : !input.confirm) {
      // Le site demande alors le mot de passe (ou la confirmation) puis réessaie.
      throw new AppException('VAULT_LOCKED', HttpStatus.FORBIDDEN, 'Vault is locked', {
        method: hash ? 'password' : 'confirm',
      });
    }
    if (hash && !(await this.passwords.verify(hash, input.password!))) {
      throw new AppException('CURRENT_PASSWORD_INVALID', HttpStatus.FORBIDDEN, 'Invalid password');
    }
    await this.prisma.session.update({
      where: { id: user.sessionId },
      data: { vaultUnlockedUntil: new Date(now.getTime() + VAULT_UNLOCK_MINUTES * 60_000) },
    });
  }
}
