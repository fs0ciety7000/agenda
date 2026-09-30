import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, CSRF, registerUser } from './app';

describe('Passkeys (WebAuthn)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('défis : enregistrement lié au compte, connexion publique, réponse invalide refusée, usage unique', async () => {
    const user = await registerUser(app, 'Ada');
    expect((await http().get('/v1/me/passkeys').set(user.auth).expect(200)).body).toEqual([]);

    const reg = await http().post('/v1/me/passkeys/options').set(user.auth).expect(200);
    expect(reg.body.options).toMatchObject({
      rp: { name: 'Tandem', id: 'localhost' },
      user: { name: user.email },
      authenticatorSelection: { residentKey: 'required' },
    });
    const bogus = {
      id: 'abc',
      rawId: 'abc',
      type: 'public-key',
      response: {},
      clientExtensionResults: {},
    };
    const rejected = await http()
      .post('/v1/me/passkeys')
      .set(user.auth)
      .send({ challengeId: reg.body.challengeId, response: bogus })
      .expect(400);
    expect(rejected.body.error.code).toBe('PASSKEY_FAILED');
    // Défi consommé : rejouer échoue aussi.
    await http()
      .post('/v1/me/passkeys')
      .set(user.auth)
      .send({ challengeId: reg.body.challengeId, response: bogus })
      .expect(400);

    const login = await http().post('/v1/auth/passkeys/options').set(CSRF).send({}).expect(200);
    expect(login.body.options.challenge).toEqual(expect.any(String));
    await http()
      .post('/v1/auth/passkeys/login')
      .set(CSRF)
      .send({ challengeId: login.body.challengeId, response: bogus })
      .expect(400);

    await http().delete('/v1/me/passkeys/inconnue').set(user.auth).expect(404);
    await http().get('/v1/me/passkeys').set(CSRF).expect(401);
  });
});
