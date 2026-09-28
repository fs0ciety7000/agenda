import { Injectable } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../config/env';

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  givenName?: string;
  locale?: string;
}

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

/**
 * Client OpenID Connect Google (authentification uniquement : scopes `openid email profile`).
 * L'intégration Google Calendar (Phase 4) a son propre flux et ses propres scopes.
 * Remplacé par un faux en test.
 */
@Injectable()
export class GoogleOidcClient {
  get configured(): boolean {
    return Boolean(env().GOOGLE_CLIENT_ID && env().GOOGLE_CLIENT_SECRET);
  }

  authorizationUrl(p: {
    redirectUri: string;
    state: string;
    nonce: string;
    codeChallenge: string;
  }): string {
    const url = new URL(AUTH_URL);
    url.search = new URLSearchParams({
      client_id: env().GOOGLE_CLIENT_ID!,
      redirect_uri: p.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state: p.state,
      nonce: p.nonce,
      code_challenge: p.codeChallenge,
      code_challenge_method: 'S256',
      prompt: 'select_account',
    }).toString();
    return url.toString();
  }

  /** Échange le code et vérifie l'id_token (signature, émetteur, audience, nonce). */
  async exchange(p: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
    nonce: string;
  }): Promise<GoogleProfile> {
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: p.code,
        client_id: env().GOOGLE_CLIENT_ID!,
        client_secret: env().GOOGLE_CLIENT_SECRET!,
        redirect_uri: p.redirectUri,
        grant_type: 'authorization_code',
        code_verifier: p.codeVerifier,
      }),
    });
    if (!res.ok) {
      // Motif renvoyé par Google (`invalid_client` = secret incorrect, `invalid_grant` = code
      // expiré ou adresse de retour différente) : aucun secret dans la réponse.
      const reason = await res
        .json()
        .then((b) => {
          const error = (b as { error?: unknown } | null)?.error;
          return typeof error === 'string' ? `: ${error}` : '';
        })
        .catch(() => '');
      throw new Error(`Google token endpoint returned ${res.status}${reason}`);
    }
    const { id_token: idToken } = (await res.json()) as { id_token?: string };
    if (!idToken) throw new Error('No id_token');
    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: env().GOOGLE_CLIENT_ID!,
    });
    if (payload.nonce !== p.nonce) throw new Error('Nonce mismatch');
    return {
      sub: String(payload.sub),
      email: String(payload.email ?? '').toLowerCase(),
      emailVerified: payload.email_verified === true,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      givenName: typeof payload.given_name === 'string' ? payload.given_name : undefined,
      locale: typeof payload.locale === 'string' ? payload.locale : undefined,
    };
  }
}
