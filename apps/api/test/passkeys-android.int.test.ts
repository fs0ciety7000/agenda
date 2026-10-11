import { INestApplication } from '@nestjs/common';
import { isoCBOR } from '@simplewebauthn/server/helpers';
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetEnvCache } from '../src/config/env';
import { createTestApp, CSRF, registerUser } from './app';

// Empreinte d'un certificat de test (pas une clé : une empreinte est publique).
const CERT = 'AB'.repeat(32);
const ANDROID_ORIGIN = `android:apk-key-hash:${Buffer.from(CERT, 'hex').toString('base64url')}`;

const sha256 = (data: Buffer | string) => createHash('sha256').update(data).digest();
const b64url = (data: Buffer) => data.toString('base64url');

/**
 * Authentificateur logiciel minimal (clé P-256, attestation « none ») qui répond comme le
 * Credential Manager d'Android : même JSON que le navigateur, origine `android:apk-key-hash:…`.
 */
function softAuthenticator(rpId: string) {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  const credentialId = randomBytes(16);
  const rpIdHash = sha256(rpId);
  const clientData = (type: string, challenge: string, origin: string) =>
    Buffer.from(JSON.stringify({ type, challenge, origin }));

  return {
    id: b64url(credentialId),
    register(challenge: string, origin = ANDROID_ORIGIN) {
      const cose = new Map<number, number | Uint8Array>([
        [1, 2], // kty : EC2
        [3, -7], // alg : ES256
        [-1, 1], // crv : P-256
        [-2, Buffer.from(jwk.x!, 'base64url')],
        [-3, Buffer.from(jwk.y!, 'base64url')],
      ]);
      const length = Buffer.alloc(2);
      length.writeUInt16BE(credentialId.length);
      const authData = Buffer.concat([
        rpIdHash,
        Buffer.from([0x45]), // présence + vérification de l'utilisateur, données de clé
        Buffer.alloc(4), // compteur
        Buffer.alloc(16), // AAGUID
        length,
        credentialId,
        Buffer.from(isoCBOR.encode(cose)),
      ]);
      const attestationObject = isoCBOR.encode(
        new Map<string, unknown>([
          ['fmt', 'none'],
          ['attStmt', new Map()],
          ['authData', authData],
        ]) as never,
      );
      return {
        id: this.id,
        rawId: this.id,
        type: 'public-key',
        response: {
          clientDataJSON: b64url(clientData('webauthn.create', challenge, origin)),
          attestationObject: b64url(Buffer.from(attestationObject)),
          transports: ['internal'],
        },
        clientExtensionResults: {},
      };
    },
    login(challenge: string, counter: number, origin = ANDROID_ORIGIN) {
      const count = Buffer.alloc(4);
      count.writeUInt32BE(counter);
      const authenticatorData = Buffer.concat([rpIdHash, Buffer.from([0x05]), count]);
      const clientDataJSON = clientData('webauthn.get', challenge, origin);
      const signature = sign(
        'sha256',
        Buffer.concat([authenticatorData, sha256(clientDataJSON)]),
        privateKey,
      );
      return {
        id: this.id,
        rawId: this.id,
        type: 'public-key',
        response: {
          clientDataJSON: b64url(clientDataJSON),
          authenticatorData: b64url(authenticatorData),
          signature: b64url(signature),
        },
        clientExtensionResults: {},
      };
    },
  };
}

describe('Passkeys dans l’app Android', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.ANDROID_CERT_SHA256 = CERT.match(/../g)!.join(':').toLowerCase();
    resetEnvCache();
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
    delete process.env.ANDROID_CERT_SHA256;
    resetEnvCache();
  });

  it('assetlinks.json nomme l’app et l’empreinte de son certificat', async () => {
    const res = await http().get('/v1/app/android/assetlinks.json').expect(200);
    expect(res.body).toEqual([
      {
        relation: ['delegate_permission/common.get_login_creds'],
        target: {
          namespace: 'android_app',
          package_name: 'app.tandem.foyer',
          sha256_cert_fingerprints: [CERT.match(/../g)!.join(':')],
        },
      },
    ]);
  });

  it('créée dans l’app puis utilisée pour se connecter (jetons mobiles) ; autre app refusée', async () => {
    const user = await registerUser(app, 'Emma');
    const key = softAuthenticator('localhost');

    const reg = await http().post('/v1/me/passkeys/options').set(user.auth).expect(200);
    const created = await http()
      .post('/v1/me/passkeys')
      .set(user.auth)
      .send({
        challengeId: reg.body.challengeId,
        response: key.register(reg.body.options.challenge),
      })
      .expect(201);
    expect(created.body).toMatchObject({ id: key.id });

    const options = await http().post('/v1/auth/passkeys/options').set(CSRF).send({}).expect(200);
    const login = await http()
      .post('/v1/auth/passkeys/login')
      .set(CSRF)
      .set('x-client', 'mobile')
      .send({
        challengeId: options.body.challengeId,
        response: key.login(options.body.options.challenge, 1),
      })
      .expect(200);
    expect(login.body).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      user: { email: user.email },
    });

    // Une app signée par un autre certificat (copie, app malveillante) n'est pas acceptée.
    const other = `android:apk-key-hash:${b64url(Buffer.alloc(32, 7))}`;
    const again = await http().post('/v1/auth/passkeys/options').set(CSRF).send({}).expect(200);
    const refused = await http()
      .post('/v1/auth/passkeys/login')
      .set(CSRF)
      .set('x-client', 'mobile')
      .send({
        challengeId: again.body.challengeId,
        response: key.login(again.body.options.challenge, 2, other),
      })
      .expect(400);
    expect(refused.body.error.code).toBe('PASSKEY_FAILED');
  });
});
