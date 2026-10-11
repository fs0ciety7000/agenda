import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { MailService } from '../src/mail/mail.service';
import { createTestApp, CSRF, registerUser } from './app';

const CHROME_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:142.0) Gecko/20100101 Firefox/142.0';

describe('E-mail « Nouvel appareil connecté »', () => {
  let app: INestApplication;
  let mail: MailService;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
    mail = app.get(MailService);
  });
  afterAll(() => app.close());

  const login = (email: string, ua: string) =>
    http()
      .post('/v1/auth/login')
      .set(CSRF)
      .set('x-client', 'mobile')
      .set('user-agent', ua)
      .send({ email, password: 'correct horse battery' })
      .expect(200);
  const alertsFor = (to: string) =>
    mail.outbox.filter((m) => m.to === to && m.subject.includes('Nouvelle connexion'));

  it('un e-mail pour un appareil jamais vu, rien pour un appareil connu', async () => {
    const user = await registerUser(app, 'Emma');
    await login(user.email, CHROME_WINDOWS);
    await vi.waitFor(() => expect(alertsFor(user.email)).toHaveLength(1));
    const alert = alertsFor(user.email)[0]!;
    expect(alert.text).toContain('Chrome sur Windows');
    expect(alert.text).toContain('/settings#s-account');

    // Même navigateur, même système : pas de nouvel e-mail.
    await login(user.email, CHROME_WINDOWS.replace('Chrome/141.0', 'Chrome/142.0'));
    await login(user.email, FIREFOX_LINUX);
    await vi.waitFor(() => expect(alertsFor(user.email)).toHaveLength(2));
    expect(alertsFor(user.email)[1]!.text).toContain('Firefox sur Linux');
    // Renouveler la session n'est pas une connexion.
    const refreshed = await login(user.email, FIREFOX_LINUX);
    await http()
      .post('/v1/auth/refresh')
      .set(CSRF)
      .set('x-client', 'mobile')
      .set('user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1')
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(200);
    // Envoi sans attente côté serveur : on laisse passer un éventuel e-mail en retard.
    await new Promise((r) => setTimeout(r, 200));
    expect(alertsFor(user.email)).toHaveLength(2);
  });
});
