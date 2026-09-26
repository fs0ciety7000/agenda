import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleOidcClient, type GoogleProfile } from '../src/auth/google-oidc.client';
import { MailService } from '../src/mail/mail.service';
import { coupleHousehold, createTestApp, CSRF, registerUser } from './app';

/** Faux client Google : le « code » encode le profil renvoyé (`sub|email|verified`). */
const fakeGoogle = {
  configured: true,
  authorizationUrl: (p: { state: string; nonce: string; redirectUri: string }) =>
    `https://accounts.google.test/auth?state=${p.state}&redirect_uri=${encodeURIComponent(p.redirectUri)}`,
  exchange: async ({ code }: { code: string }): Promise<GoogleProfile> => {
    if (code === 'bad') throw new Error('invalid_grant');
    const [sub, email, verified] = code.split('|');
    return {
      sub: sub!,
      email: email!,
      emailVerified: verified !== 'unverified',
      givenName: 'Grace',
      locale: 'fr',
    };
  },
};

describe('Compte : mot de passe oublié, Google Sign-In, RGPD (intégration)', () => {
  let app: INestApplication;
  let mail: MailService;
  const prisma = new PrismaClient();
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp([{ provide: GoogleOidcClient, useValue: fakeGoogle }]);
    mail = app.get(MailService);
  });
  beforeEach(() => {
    mail.outbox.length = 0;
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  describe('mot de passe oublié', () => {
    const tokenFrom = (text: string) => decodeURIComponent(/token=([^\s]+)/.exec(text)![1]!);

    it("SÉCURITÉ : une panne SMTP ne change pas la réponse (pas d'énumération des comptes)", async () => {
      const grace = await registerUser(app, 'Grace');
      const original = mail.send.bind(mail);
      mail.send = () => Promise.reject(new Error('SMTP down'));
      try {
        const known = await http()
          .post('/v1/auth/password/forgot')
          .set(CSRF)
          .send({ email: grace.email });
        const unknown = await http()
          .post('/v1/auth/password/forgot')
          .set(CSRF)
          .send({ email: 'x@example.test' });
        expect([known.status, unknown.status]).toEqual([202, 202]);
        expect(known.body).toEqual(unknown.body);
      } finally {
        await new Promise((r) => setTimeout(r, 200));
        mail.send = original;
      }
    });

    it('envoie un lien, réinitialise, révoque les sessions, usage unique', async () => {
      const grace = await registerUser(app, 'Grace');
      await http()
        .post('/v1/auth/password/forgot')
        .set(CSRF)
        .send({ email: grace.email.toUpperCase() })
        .expect(202);
      // Envoi en arrière-plan (réponse immédiate et identique pour tous les emails).
      await vi.waitFor(() => expect(mail.outbox).toHaveLength(1));
      expect(mail.outbox[0]).toMatchObject({
        to: grace.email,
        subject: 'Réinitialisation de votre mot de passe',
      });
      expect(mail.outbox[0]!.html).toContain('/reset-password?token=');
      const token = tokenFrom(mail.outbox[0]!.text);

      await http()
        .post('/v1/auth/password/reset')
        .set(CSRF)
        .send({ token, password: 'nouveau mot de passe' })
        .expect(204);
      await http().get('/v1/me').set(grace.auth).expect(401); // anciennes sessions révoquées
      await http()
        .post('/v1/auth/login')
        .set(CSRF)
        .send({ email: grace.email, password: 'correct horse battery' })
        .expect(401);
      await http()
        .post('/v1/auth/login')
        .set(CSRF)
        .send({ email: grace.email, password: 'nouveau mot de passe' })
        .expect(200);

      const reuse = await http()
        .post('/v1/auth/password/reset')
        .set(CSRF)
        .send({ token, password: 'encore un autre' })
        .expect(400);
      expect(reuse.body.error.code).toBe('RESET_TOKEN_INVALID');
    });

    it("ne révèle pas si l'email existe ; un nouveau lien invalide le précédent ; lien expiré refusé", async () => {
      await http()
        .post('/v1/auth/password/forgot')
        .set(CSRF)
        .send({ email: 'inconnu@example.test' })
        .expect(202);
      await new Promise((r) => setTimeout(r, 300));
      expect(mail.outbox).toHaveLength(0);

      const grace = await registerUser(app, 'Grace');
      await http()
        .post('/v1/auth/password/forgot')
        .set(CSRF)
        .send({ email: grace.email })
        .expect(202);
      await vi.waitFor(() => expect(mail.outbox).toHaveLength(1));
      await http()
        .post('/v1/auth/password/forgot')
        .set(CSRF)
        .send({ email: grace.email })
        .expect(202);
      await vi.waitFor(() => expect(mail.outbox).toHaveLength(2));
      const [first, second] = mail.outbox.map((m) => tokenFrom(m.text));
      await http()
        .post('/v1/auth/password/reset')
        .set(CSRF)
        .send({ token: first, password: 'nouveau mot de passe' })
        .expect(400);

      await prisma.passwordResetToken.updateMany({
        where: { user: { email: grace.email } },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await http()
        .post('/v1/auth/password/reset')
        .set(CSRF)
        .send({ token: second, password: 'nouveau mot de passe' })
        .expect(400);
    });
  });

  describe('Google Sign-In', () => {
    async function googleFlow(code: (state: string) => string, cookieJar?: string[]) {
      const start = await http()
        .get('/v1/auth/google/start?next=/tasks')
        .set('Cookie', cookieJar ?? [])
        .expect(302);
      const state = new URL(start.headers.location!).searchParams.get('state')!;
      const flowCookie = (start.headers['set-cookie'] as unknown as string[]).find((c) =>
        c.startsWith('gn_oauth='),
      )!;
      return http()
        .get(`/v1/auth/google/callback?code=${encodeURIComponent(code(state))}&state=${state}`)
        .set('Cookie', [flowCookie.split(';')[0]!, ...(cookieJar ?? [])])
        .expect(302);
    }

    it('fournisseurs disponibles', async () => {
      const res = await http().get('/v1/auth/providers').expect(200);
      expect(res.body).toEqual({ google: true, registration: true, passwordReset: true });
    });

    it('première connexion : compte créé, session ouverte, redirection vers `next` ; puis reconnexion', async () => {
      const email = `g.${Date.now()}@gmail.test`;
      const res = await googleFlow(() => `sub-${email}|${email}|verified`);
      expect(res.headers.location).toBe('/tasks');
      const cookies = res.headers['set-cookie'] as unknown as string[];
      const access = cookies.find((c) => c.startsWith('gn_at='))!.split(';')[0]!;
      const me = await http().get('/v1/me').set('Cookie', access).expect(200);
      expect(me.body).toMatchObject({ email, displayName: 'Grace' });

      const again = await googleFlow(() => `sub-${email}|${email}|verified`);
      expect(again.headers.location).toBe('/tasks');
      expect(await prisma.user.count({ where: { email } })).toBe(1);
    });

    it('SÉCURITÉ : jamais de rattachement automatique à un compte existant ayant le même email', async () => {
      const grace = await registerUser(app, 'Grace');
      const res = await googleFlow(() => `attacker-sub|${grace.email}|verified`);
      expect(res.headers.location).toBe('/login?error=GOOGLE_EMAIL_EXISTS');
      expect(await prisma.authIdentity.count({ where: { providerSubject: 'attacker-sub' } })).toBe(
        0,
      );
    });

    it('refuse : state invalide, email non vérifié, échange en échec', async () => {
      const forged = await http().get('/v1/auth/google/callback?code=a&state=forged').expect(302);
      expect(forged.headers.location).toBe('/login?error=GOOGLE_FAILED');
      const unverified = await googleFlow(() => `u-${Date.now()}|u${Date.now()}@z.test|unverified`);
      expect(unverified.headers.location).toBe('/login?error=GOOGLE_FAILED');
      const failed = await googleFlow(() => 'bad');
      expect(failed.headers.location).toBe('/login?error=GOOGLE_FAILED');
    });

    it('rattacher Google depuis les Réglages (connecté)', async () => {
      const login = await http()
        .post('/v1/auth/register')
        .set(CSRF)
        .send({
          email: `n.${Date.now()}@example.test`,
          password: 'correct horse battery',
          displayName: 'Nicolas',
        })
        .expect(201);
      const access = (login.headers['set-cookie'] as unknown as string[])
        .find((c) => c.startsWith('gn_at='))!
        .split(';')[0]!;
      const start = await http()
        .get('/v1/auth/google/start?mode=link')
        .set('Cookie', access)
        .expect(302);
      const state = new URL(start.headers.location!).searchParams.get('state')!;
      const flowCookie = (start.headers['set-cookie'] as unknown as string[])
        .find((c) => c.startsWith('gn_oauth='))!
        .split(';')[0]!;
      const sub = `link-${Date.now()}`;
      const res = await http()
        .get(
          `/v1/auth/google/callback?code=${encodeURIComponent(`${sub}|other@gmail.test|verified`)}&state=${state}`,
        )
        .set('Cookie', [flowCookie])
        .expect(302);
      expect(res.headers.location).toBe('/settings?linked=google');
      expect(
        await prisma.authIdentity.findFirst({ where: { providerSubject: sub } }),
      ).toMatchObject({ userId: login.body.user.id });
    });
  });

  describe('RGPD', () => {
    it('export : mes données, dont mes tâches personnelles, jamais celles du partenaire', async () => {
      const h = await coupleHousehold(app);
      await http()
        .post(`${h.base}/tasks`)
        .set(h.grace.auth)
        .send({ title: 'Ma note perso', visibility: 'PERSONAL' })
        .expect(201);
      await http()
        .post(`${h.base}/tasks`)
        .set(h.nicolas.auth)
        .send({ title: 'Secret de Nicolas', visibility: 'PERSONAL' })
        .expect(201);
      await http()
        .post(`${h.base}/tasks`)
        .set(h.nicolas.auth)
        .send({ title: 'Courses', assigneeIds: [h.grace.memberId] })
        .expect(201);
      const res = await http().get('/v1/me/export').set(h.grace.auth).expect(200);
      expect(res.headers['content-disposition']).toMatch(
        /attachment; filename="agenda-export-\d{4}-\d{2}-\d{2}\.json"/,
      );
      expect(res.body.account.email).toBe(h.grace.email);
      expect(res.body.tasksCreated.map((t: { title: string }) => t.title)).toEqual([
        'Ma note perso',
      ]);
      expect(res.body.assignedOccurrences.map((o: { title: string }) => o.title)).toEqual(
        expect.arrayContaining(['Ma note perso', 'Courses']),
      );
      expect(JSON.stringify(res.body)).not.toContain('Secret de Nicolas');
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|refreshTokenHash/);
    });

    it('suppression : confirmation exigée, compte effacé, foyer conservé et anonymisé pour le partenaire', async () => {
      const h = await coupleHousehold(app); // Nicolas = propriétaire
      await http()
        .post(`${h.base}/tasks`)
        .set(h.nicolas.auth)
        .send({ title: 'Perso Nicolas', visibility: 'PERSONAL' })
        .expect(201);
      const shared = await http()
        .post(`${h.base}/tasks`)
        .set(h.nicolas.auth)
        .send({ title: 'Réparer le vélo', assigneeIds: [h.nicolas.memberId] })
        .expect(201);

      const refused = await http()
        .delete('/v1/me')
        .set(h.nicolas.auth)
        .send({ password: 'mauvais' })
        .expect(403);
      expect(refused.body.error.code).toBe('CONFIRMATION_REQUIRED');
      await http()
        .delete('/v1/me')
        .set(h.nicolas.auth)
        .send({ password: 'correct horse battery' })
        .expect(204);

      await http().get('/v1/me').set(h.nicolas.auth).expect(401);
      await http()
        .post('/v1/auth/login')
        .set(CSRF)
        .send({ email: h.nicolas.email, password: 'correct horse battery' })
        .expect(401);
      expect(await prisma.user.count({ where: { email: h.nicolas.email } })).toBe(0);
      expect(await prisma.task.count({ where: { title: 'Perso Nicolas' } })).toBe(0);

      const household = await http().get(h.base).set(h.grace.auth).expect(200);
      expect(household.body.members).toEqual([
        expect.objectContaining({ displayName: 'Grace', role: 'OWNER' }),
      ]);
      const task = await http()
        .get(`${h.base}/occurrences/${shared.body.id}`)
        .set(h.grace.auth)
        .expect(200);
      expect(task.body).toMatchObject({ title: 'Réparer le vélo', assigneeIds: [] }); // devient « à définir »
      const former = await prisma.householdMember.findUniqueOrThrow({
        where: { id: h.nicolas.memberId },
      });
      expect(former).toMatchObject({ userId: null, displayName: 'Ancien membre' });
    });

    it('suppression du seul membre : le foyer entier disparaît', async () => {
      const solo = await registerUser(app, 'Solo');
      const h = await http()
        .post('/v1/households')
        .set(solo.auth)
        .send({ name: 'Solo' })
        .expect(201);
      await http()
        .post(`/v1/households/${h.body.id}/tasks`)
        .set(solo.auth)
        .send({ title: 'x' })
        .expect(201);
      await http()
        .delete('/v1/me')
        .set(solo.auth)
        .send({ password: 'correct horse battery' })
        .expect(204);
      expect(await prisma.household.count({ where: { id: h.body.id } })).toBe(0);
      expect(await prisma.task.count({ where: { householdId: h.body.id } })).toBe(0);
    });
  });
});
