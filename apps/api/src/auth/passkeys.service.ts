import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type {
  PasskeyDto,
  PasskeyLoginInput,
  PasskeyOptionsDto,
  PasskeyRegisterInput,
} from '@agenda/contracts';
import type { Passkey } from '@prisma/client';
import {
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { AppException, notFound } from '../common/app-exception';
import { env } from '../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, type IssuedTokens } from './auth.service';

const CHALLENGE_TTL_MS = 5 * 60_000;
const MAX_PASSKEYS = 10;

const failed = () =>
  new AppException('PASSKEY_FAILED', HttpStatus.BAD_REQUEST, 'Passkey verification failed');

const toDto = (p: Passkey): PasskeyDto => ({
  id: p.id,
  name: p.name,
  createdAt: p.createdAt.toISOString(),
  lastUsedAt: p.lastUsedAt?.toISOString() ?? null,
  synced: p.backedUp,
});

/** Domaine des clés et origines acceptées (site, et ancien domaine pendant une migration). */
export function relyingParty() {
  const origin = env().WEB_ORIGIN;
  return {
    id: env().WEBAUTHN_RP_ID || new URL(origin).hostname,
    origins: env().WEBAUTHN_ORIGINS.length ? env().WEBAUTHN_ORIGINS : [origin],
  };
}

/**
 * Passkeys (WebAuthn) : ajoutées depuis les Réglages (compte connecté), puis utilisées pour se
 * connecter sans e-mail ni mot de passe (clé « découvrable »). Défis à usage unique, 5 minutes.
 */
@Injectable()
export class PasskeysService {
  private readonly logger = new Logger(PasskeysService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  async list(userId: string): Promise<PasskeyDto[]> {
    const rows = await this.prisma.passkey.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toDto);
  }

  async registrationOptions(userId: string): Promise<PasskeyOptionsDto> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      include: { passkeys: { select: { id: true, transports: true } } },
    });
    if (!user) throw notFound();
    if (user.passkeys.length >= MAX_PASSKEYS) {
      throw new AppException(
        'VALIDATION_FAILED',
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Too many passkeys',
      );
    }
    const options = await generateRegistrationOptions({
      rpName: 'Tandem',
      rpID: relyingParty().id,
      userName: user.email,
      userDisplayName: user.displayName,
      userID: new Uint8Array(Buffer.from(user.id)),
      attestationType: 'none',
      excludeCredentials: user.passkeys.map((p) => ({
        id: p.id,
        transports: p.transports as AuthenticatorTransport[],
      })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    });
    const challengeId = await this.saveChallenge(options.challenge, userId);
    return { challengeId, options: options as unknown as Record<string, unknown> };
  }

  async register(userId: string, input: PasskeyRegisterInput): Promise<PasskeyDto> {
    const expectedChallenge = await this.takeChallenge(input.challengeId, userId);
    const rp = relyingParty();
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: input.response as unknown as RegistrationResponseJSON,
        expectedChallenge,
        expectedOrigin: rp.origins,
        expectedRPID: rp.id,
        requireUserVerification: false,
      });
    } catch (e) {
      this.logger.warn(`Passkey registration rejected: ${(e as Error).message}`);
      throw failed();
    }
    if (!verification.verified || !verification.registrationInfo) throw failed();
    const { credential, credentialBackedUp } = verification.registrationInfo;
    const count = await this.prisma.passkey.count({ where: { userId } });
    const passkey = await this.prisma.passkey.create({
      data: {
        id: credential.id,
        userId,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ?? [],
        backedUp: credentialBackedUp,
        name: input.name ?? `Passkey ${count + 1}`,
      },
    });
    return toDto(passkey);
  }

  async rename(userId: string, id: string, name: string): Promise<PasskeyDto> {
    const updated = await this.prisma.passkey.updateMany({ where: { id, userId }, data: { name } });
    if (!updated.count) throw notFound();
    return toDto(await this.prisma.passkey.findUniqueOrThrow({ where: { id } }));
  }

  async remove(userId: string, id: string): Promise<void> {
    const removed = await this.prisma.passkey.deleteMany({ where: { id, userId } });
    if (!removed.count) throw notFound();
  }

  async loginOptions(): Promise<PasskeyOptionsDto> {
    const options = await generateAuthenticationOptions({
      rpID: relyingParty().id,
      userVerification: 'preferred',
      allowCredentials: [],
    });
    const challengeId = await this.saveChallenge(options.challenge, null);
    return { challengeId, options: options as unknown as Record<string, unknown> };
  }

  async login(input: PasskeyLoginInput, userAgent?: string): Promise<IssuedTokens> {
    const expectedChallenge = await this.takeChallenge(input.challengeId, null);
    const response = input.response as unknown as AuthenticationResponseJSON;
    const passkey = await this.prisma.passkey.findUnique({
      where: { id: String(response.id ?? '') },
      include: { user: true },
    });
    if (!passkey || passkey.user.deletedAt) throw failed();
    const rp = relyingParty();
    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: rp.origins,
        expectedRPID: rp.id,
        requireUserVerification: false,
        credential: {
          id: passkey.id,
          publicKey: new Uint8Array(passkey.publicKey) as Uint8Array<ArrayBuffer>,
          counter: passkey.counter,
          transports: passkey.transports as AuthenticatorTransport[],
        },
      });
    } catch (e) {
      this.logger.warn(`Passkey login rejected: ${(e as Error).message}`);
      throw failed();
    }
    if (!verification.verified) throw failed();
    await this.prisma.passkey.update({
      where: { id: passkey.id },
      data: { counter: verification.authenticationInfo.newCounter, lastUsedAt: new Date() },
    });
    return this.auth.startSession(passkey.user, userAgent);
  }

  private async saveChallenge(challenge: string, userId: string | null): Promise<string> {
    // Ménage opportuniste des défis expirés.
    await this.prisma.webAuthnChallenge.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    const row = await this.prisma.webAuthnChallenge.create({
      data: { challenge, userId, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS) },
    });
    return row.id;
  }

  /** Défi à usage unique : supprimé dès sa lecture ; lié à l'utilisateur pour l'enregistrement. */
  private async takeChallenge(id: string, userId: string | null): Promise<string> {
    const row = await this.prisma.webAuthnChallenge.findUnique({ where: { id } });
    if (row) await this.prisma.webAuthnChallenge.deleteMany({ where: { id } });
    if (!row || row.expiresAt < new Date() || row.userId !== userId) throw failed();
    return row.challenge;
  }
}
