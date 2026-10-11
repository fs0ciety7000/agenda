import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { base32Decode, hotp, totpStep } from '../src/auth/totp';
import { createTestApp, CSRF, registerUser } from './app';

/** Code de l'application d'authentification pour un pas de 30 s donné. */
const codeAt = (secret: string, step: number) => hotp(base32Decode(secret), step);

describe('Double authentification (TOTP)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  const login = (email: string, mobile = true) => {
    const req = http().post('/v1/auth/login').set(CSRF);
    if (mobile) req.set('x-client', 'mobile');
    return req.send({ email, password: 'correct horse battery' }).expect(200);
  };
  const verify = (challengeId: string, code: string) =>
    http()
      .post('/v1/auth/2fa/verify')
      .set(CSRF)
      .set('x-client', 'mobile')
      .send({ challengeId, code });

  it('activation, connexion en deux temps, codes de secours, essais limités, désactivation', async () => {
    const user = await registerUser(app, 'Emma');
    expect((await http().get('/v1/me/2fa').set(user.auth).expect(200)).body).toEqual({
      enabled: false,
      enabledAt: null,
      recoveryCodesLeft: 0,
      available: true,
    });

    // Secret proposé, puis premier code : faux refusé, juste accepté.
    const setup = await http().post('/v1/me/2fa/setup').set(user.auth).send({}).expect(200);
    const secret: string = setup.body.secret;
    expect(setup.body.otpauthUrl).toContain(`secret=${secret}`);
    // Pas figé ici : le test ne dépend pas du passage d'une tranche de 30 s en cours de route.
    const step = totpStep(Date.now());
    const wrong = codeAt(secret, step) === '000000' ? '111111' : '000000';
    const refused = await http()
      .post('/v1/me/2fa/enable')
      .set(user.auth)
      .send({ code: wrong })
      .expect(401);
    expect(refused.body.error.code).toBe('TWO_FACTOR_INVALID');
    const enabled = await http()
      .post('/v1/me/2fa/enable')
      .set(user.auth)
      .send({ code: codeAt(secret, step) })
      .expect(200);
    const codes: string[] = enabled.body.codes;
    expect(codes).toHaveLength(10);
    expect(codes[0]).toMatch(/^[a-z2-7]{4}-[a-z2-7]{4}$/);
    expect((await http().get('/v1/me').set(user.auth).expect(200)).body.twoFactorEnabled).toBe(
      true,
    );
    await http().post('/v1/me/2fa/setup').set(user.auth).send({}).expect(409);

    // Mot de passe correct : un défi, pas de session (ni jeton, ni cookie sur le site).
    const web = await login(user.email, false);
    expect(web.body).toEqual({ twoFactorRequired: true, challengeId: expect.any(String) });
    expect(web.headers['set-cookie']).toBeUndefined();
    const first = await login(user.email);
    expect(first.body.accessToken).toBeUndefined();

    // Le code de l'activation ne se rejoue pas ; le suivant ouvre la session.
    await verify(first.body.challengeId, codeAt(secret, step)).expect(401);
    const ok = await verify(first.body.challengeId, codeAt(secret, step + 1)).expect(200);
    expect(ok.body).toMatchObject({ accessToken: expect.any(String), user: { email: user.email } });
    // Défi consommé.
    await verify(first.body.challengeId, codes[0]!).expect(401);

    // Code de secours (majuscules, sans tiret) : une seule fois.
    const second = await login(user.email);
    await verify(second.body.challengeId, codes[0]!.replace('-', '').toUpperCase()).expect(200);
    const third = await login(user.email);
    await verify(third.body.challengeId, codes[0]!).expect(401);
    const status = await http().get('/v1/me/2fa').set(user.auth).expect(200);
    expect(status.body.recoveryCodesLeft).toBe(9);

    // Cinq erreurs : le défi est supprimé, même un bon code n'y fait plus rien.
    const brute = await login(user.email);
    for (let i = 0; i < 5; i++) await verify(brute.body.challengeId, '123456').expect(401);
    await verify(brute.body.challengeId, codes[1]!).expect(401);

    // Nouveaux codes : les anciens ne marchent plus.
    const fresh = await http()
      .post('/v1/me/2fa/recovery-codes')
      .set(user.auth)
      .send({ code: codes[1] })
      .expect(200);
    await http().post('/v1/me/2fa/disable').set(user.auth).send({ code: codes[2] }).expect(401);
    await http()
      .post('/v1/me/2fa/disable')
      .set(user.auth)
      .send({ code: fresh.body.codes[0] })
      .expect(204);
    const plain = await login(user.email);
    expect(plain.body.accessToken).toEqual(expect.any(String));
  });

  it('site : mot de passe demandé avant de préparer la double authentification', async () => {
    const user = await registerUser(app, 'Tom');
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/v1/auth/login')
      .set(CSRF)
      .send({ email: user.email, password: 'correct horse battery' })
      .expect(200);
    const locked = await agent.post('/v1/me/2fa/setup').set(CSRF).send({}).expect(403);
    expect(locked.body.error.code).toBe('VAULT_LOCKED');
    await agent.post('/v1/me/2fa/setup').set(CSRF).send({ password: 'faux' }).expect(403);
    const setup = await agent
      .post('/v1/me/2fa/setup')
      .set(CSRF)
      .send({ password: 'correct horse battery' })
      .expect(200);
    expect(setup.body.secret).toMatch(/^[A-Z2-7]{32}$/);
  });
});
