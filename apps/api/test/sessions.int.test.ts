import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseUserAgent } from '../src/auth/user-agent';
import { CSRF, createTestApp, registerUser } from './app';

const CHROME_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
const ANDROID_APP = 'Tandem-Android/1.4.0 (Android 14)';

type Device = {
  id: string;
  kind: string;
  browser: string | null;
  os: string | null;
  current: boolean;
};

describe('Appareils connectés', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  const login = async (email: string, ua: string) => {
    const res = await http()
      .post('/v1/auth/login')
      .set(CSRF)
      .set('x-client', 'mobile')
      .set('user-agent', ua)
      .send({ email, password: 'correct horse battery' })
      .expect(200);
    return {
      refreshToken: res.body.refreshToken as string,
      auth: { authorization: `Bearer ${res.body.accessToken}`, ...CSRF },
    };
  };

  it('liste les connexions, marque la mienne, déconnecte un appareil à distance', async () => {
    const u = await registerUser(app, 'Grace');
    const pc = await login(u.email, CHROME_WIN);
    const phone = await login(u.email, ANDROID_APP);

    // Un rafraîchissement ne crée pas d'appareil de plus.
    const refreshed = await http()
      .post('/v1/auth/refresh')
      .set(CSRF)
      .set('x-client', 'mobile')
      .set('user-agent', ANDROID_APP)
      .send({ refreshToken: phone.refreshToken })
      .expect(200);
    const phoneAuth = { authorization: `Bearer ${refreshed.body.accessToken}`, ...CSRF };

    const list = (await http().get('/v1/me/sessions').set(pc.auth).expect(200)).body as Device[];
    expect(list).toHaveLength(3); // inscription, ordinateur, téléphone
    expect(list.filter((d) => d.current)).toEqual([
      expect.objectContaining({ kind: 'BROWSER', browser: 'Chrome', os: 'Windows' }),
    ]);
    const phoneRow = list.find((d) => d.kind === 'ANDROID_APP')!;
    expect(phoneRow).toMatchObject({ os: 'Android 14', current: false });

    await http().delete(`/v1/me/sessions/${phoneRow.id}`).set(pc.auth).expect(204);
    // Le téléphone est déconnecté : jeton refusé, rafraîchissement refusé.
    await http().get('/v1/me/sessions').set(phoneAuth).expect(401);
    await http()
      .post('/v1/auth/refresh')
      .set(CSRF)
      .set('x-client', 'mobile')
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(401);
    const after = (await http().get('/v1/me/sessions').set(pc.auth).expect(200)).body as Device[];
    expect(after.map((d) => d.kind)).not.toContain('ANDROID_APP');
  });

  it('déconnecte tous les autres appareils d’un coup, garde le mien', async () => {
    const u = await registerUser(app, 'Grace');
    const other = await registerUser(app, 'Voisin');
    const pc = await login(u.email, CHROME_WIN);
    const phone = await login(u.email, ANDROID_APP);

    await http().delete('/v1/me/sessions').set(pc.auth).expect(204);
    const left = (await http().get('/v1/me/sessions').set(pc.auth).expect(200)).body as Device[];
    expect(left).toEqual([expect.objectContaining({ current: true, browser: 'Chrome' })]);
    // Inscription et téléphone déconnectés, rafraîchissement refusé.
    await http().get('/v1/me/sessions').set(u.auth).expect(401);
    await http().get('/v1/me/sessions').set(phone.auth).expect(401);
    await http()
      .post('/v1/auth/refresh')
      .set(CSRF)
      .set('x-client', 'mobile')
      .send({ refreshToken: phone.refreshToken })
      .expect(401);
    // Les autres comptes ne sont pas touchés.
    await http().get('/v1/me/sessions').set(other.auth).expect(200);
  });

  it('impossible de déconnecter l’appareil d’un autre compte', async () => {
    const a = await registerUser(app, 'Grace');
    const b = await registerUser(app, 'Intrus');
    const mine = (await http().get('/v1/me/sessions').set(a.auth).expect(200)).body as Device[];
    await http().delete(`/v1/me/sessions/${mine[0]!.id}`).set(b.auth).expect(404);
    await http().get('/v1/me/sessions').set(a.auth).expect(200);
    await http().get('/v1/me/sessions').expect(401);
  });

  it('lecture de l’en-tête User-Agent', () => {
    expect(parseUserAgent(ANDROID_APP)).toEqual({
      kind: 'ANDROID_APP',
      browser: null,
      os: 'Android 14',
      appVersion: '1.4.0',
    });
    expect(parseUserAgent(CHROME_WIN)).toMatchObject({ browser: 'Chrome', os: 'Windows' });
    expect(
      parseUserAgent(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      ),
    ).toMatchObject({ browser: 'Safari', os: 'iOS' });
    expect(
      parseUserAgent('Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0'),
    ).toMatchObject({ browser: 'Firefox', os: 'Linux' });
    expect(parseUserAgent('okhttp/4.12.0')).toEqual({
      kind: 'OTHER',
      browser: null,
      os: null,
      appVersion: null,
    });
    expect(parseUserAgent(null).kind).toBe('OTHER');
  });
});
