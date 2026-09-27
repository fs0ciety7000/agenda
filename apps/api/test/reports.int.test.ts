import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resetEnvCache } from '../src/config/env';
import { MailService } from '../src/mail/mail.service';
import { ReportsService } from '../src/reports/reports.service';
import { coupleHousehold, createTestApp } from './app';

// PNG 1×1 transparent.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

describe('Signalements (intégration)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    delete process.env.ADMIN_EMAILS;
    resetEnvCache();
    await app.close();
    await prisma.$disconnect();
  });

  it('envoi, capture, admin (alerte, réponse, état), confidentialité, effacement', async () => {
    const h = await coupleHousehold(app);
    process.env.ADMIN_EMAILS = h.nicolas.email;
    resetEnvCache();
    const outbox = app.get(MailService).outbox;
    const sent = outbox.length;

    // Validation : titre et description trop courts, informations techniques inconnues refusées.
    await http()
      .post('/v1/reports')
      .set(h.grace.auth)
      .send({ kind: 'BUG', title: 'x', description: 'court' })
      .expect(400);
    await http()
      .post('/v1/reports')
      .set(h.grace.auth)
      .send({
        kind: 'BUG',
        title: 'La liste ne se charge pas',
        description: 'Quand j’ouvre les courses, la page reste blanche.',
        diagnostics: { platform: 'web', taskTitle: 'fuite' },
      })
      .expect(400);

    const created = await http()
      .post('/v1/reports')
      .set(h.grace.auth)
      .send({
        kind: 'BUG',
        title: 'La liste ne se charge pas',
        description: 'Quand j’ouvre les courses, la page reste blanche.',
        allowContact: true,
        diagnostics: { platform: 'web', appVersion: '1.0', page: '/shopping', online: true },
      })
      .expect(201);
    expect(created.body).toMatchObject({
      status: 'OPEN',
      hasScreenshot: false,
      reply: null,
      diagnostics: { platform: 'web', page: '/shopping' },
    });
    const id = created.body.id as string;

    // Les administrateurs sont prévenus.
    await expect.poll(() => outbox.length).toBe(sent + 1);
    expect(outbox.at(-1)).toMatchObject({ to: h.nicolas.email });
    expect(outbox.at(-1)?.subject).toContain('La liste ne se charge pas');

    // Capture : image seulement.
    await http()
      .post(`/v1/reports/${id}/screenshot`)
      .set(h.grace.auth)
      .attach('file', Buffer.from('<svg/>'), { filename: 'x.svg', contentType: 'image/svg+xml' })
      .expect(400);
    const withShot = await http()
      .post(`/v1/reports/${id}/screenshot`)
      .set(h.grace.auth)
      .attach('file', PNG, { filename: 'capture.png', contentType: 'image/png' })
      .expect(201);
    expect(withShot.body.hasScreenshot).toBe(true);
    const shot = await http().get(`/v1/reports/${id}/screenshot`).set(h.grace.auth).expect(200);
    expect(shot.headers['content-type']).toBe('image/png');

    // Chacun ne voit que les siens ; un non-admin n'accède pas à l'administration.
    expect((await http().get('/v1/reports').set(h.nicolas.auth).expect(200)).body).toEqual([]);
    await http().get(`/v1/reports/${id}/screenshot`).set(h.nicolas.auth).expect(404);
    await http().delete(`/v1/reports/${id}`).set(h.nicolas.auth).expect(404);
    await http().get('/v1/admin/reports').set(h.grace.auth).expect(404);

    // Administration : liste « à traiter », capture, réponse (e-mail : contact accepté), état.
    const list = await http().get('/v1/admin/reports').set(h.nicolas.auth).expect(200);
    expect(list.body[0]).toMatchObject({ id, author: { email: h.grace.email } });
    await http().get(`/v1/admin/reports/${id}/screenshot`).set(h.nicolas.auth).expect(200);
    const overview = await http().get('/v1/admin/overview').set(h.nicolas.auth).expect(200);
    expect(overview.body.counts.openReports).toBe(1);

    const replied = await http()
      .patch(`/v1/admin/reports/${id}`)
      .set(h.nicolas.auth)
      .send({ status: 'RESOLVED', reply: 'Corrigé dans la prochaine version, merci !' })
      .expect(200);
    expect(replied.body).toMatchObject({ status: 'RESOLVED', reply: expect.any(String) });
    expect(outbox.at(-1)).toMatchObject({ to: h.grace.email });
    expect(outbox.at(-1)?.text).toContain('Corrigé dans la prochaine version');
    expect((await http().get('/v1/admin/reports').set(h.nicolas.auth)).body).toEqual([]);
    const mine = await http().get('/v1/reports').set(h.grace.auth).expect(200);
    expect(mine.body[0]).toMatchObject({ status: 'RESOLVED', reply: expect.any(String) });

    // Export RGPD : le signalement y figure (sans l'image).
    const exported = await http().get('/v1/me/export').set(h.grace.auth).expect(200);
    expect(exported.body.reports[0]).toMatchObject({
      title: 'La liste ne se charge pas',
      screenshot: true,
    });

    // Conservation : clos depuis plus de 180 jours → effacé.
    await prisma.report.update({
      where: { id },
      data: { closedAt: new Date(Date.now() - 181 * 86_400_000) },
    });
    expect(await app.get(ReportsService).purge()).toBe(1);
    expect((await http().get('/v1/reports').set(h.grace.auth)).body).toEqual([]);
  });

  it('pas de contact sans accord ; retrait par l’auteur ; limite quotidienne', async () => {
    const h = await coupleHousehold(app);
    process.env.ADMIN_EMAILS = h.nicolas.email;
    resetEnvCache();
    const outbox = app.get(MailService).outbox;
    const body = {
      kind: 'IDEA',
      title: 'Mode vacances',
      description: 'Pouvoir mettre toutes les tâches en pause une semaine.',
    };
    const { body: report } = await http()
      .post('/v1/reports')
      .set(h.grace.auth)
      .send(body)
      .expect(201);
    expect(report).toMatchObject({ allowContact: false, diagnostics: null });
    await expect.poll(() => outbox.at(-1)?.to).toBe(h.nicolas.email);
    const sent = outbox.length;
    await http()
      .patch(`/v1/admin/reports/${report.id}`)
      .set(h.nicolas.auth)
      .send({ reply: 'Bonne idée !' })
      .expect(200);
    // Réponse visible dans l'app, mais aucun e-mail : l'auteur ne l'a pas accepté.
    expect(outbox.length).toBe(sent);

    await http().delete(`/v1/reports/${report.id}`).set(h.grace.auth).expect(204);
    expect(await prisma.report.count({ where: { id: report.id } })).toBe(0);

    for (let i = 0; i < 10; i++) {
      await http().post('/v1/reports').set(h.grace.auth).send(body).expect(201);
    }
    const limited = await http().post('/v1/reports').set(h.grace.auth).send(body).expect(429);
    expect(limited.body.error.code).toBe('RATE_LIMITED');
  });
});
