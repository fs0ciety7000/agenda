import { INestApplication } from '@nestjs/common';
import { addDays, todayIn } from '@agenda/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { extractToken, titleFrom } from '../src/inbound/inbound-email.service';
import { CSRF, coupleHousehold, createTestApp } from './app';

const SECRET = { authorization: 'Bearer inbound-secret-inbound-secret-inbound', ...CSRF };

describe('Tâches par e-mail', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const today = todayIn('Europe/Brussels');

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('adresse personnelle ; un e-mail transféré devient une tâche (sujet analysé, message en notes)', async () => {
    const h = await coupleHousehold(app);
    const initial = await http().get(`${h.base}/inbound-email`).set(h.grace.auth).expect(200);
    expect(initial.body).toEqual({ available: true, address: null });
    const created = await http().post(`${h.base}/inbound-email`).set(h.grace.auth).expect(200);
    const address = created.body.address as string;
    expect(address).toMatch(/^agenda\+[a-f0-9]{32}@example\.test$/);

    const res = await http()
      .post('/v1/inbound/email')
      .set(SECRET)
      .send({
        to: `Agenda <${address}>`,
        from: 'Fournisseur <factures@example.com>',
        subject: 'Fwd: TR: Payer la facture demain',
        text: 'Montant : 42 €\nÉchéance dans 30 jours.',
      })
      .expect(201);
    const o = (
      await http().get(`${h.base}/occurrences/${res.body.occurrenceId}`).set(h.nicolas.auth)
    ).body;
    expect(o).toMatchObject({ title: 'Payer la facture', date: addDays(today, 1) });
    expect(o.notes).toContain('factures@example.com');
    expect(o.notes).toContain('Montant : 42 €');

    // Journal : créée par Grace (propriétaire de l'adresse).
    const log = (await http().get(`${h.base}/activity`).set(h.nicolas.auth)).body;
    expect(log.items[0]).toMatchObject({ action: 'task.created', actorId: h.grace.memberId });

    // Nouvelle adresse : l'ancienne ne fonctionne plus.
    await http().post(`${h.base}/inbound-email`).set(h.grace.auth).expect(200);
    await http()
      .post('/v1/inbound/email')
      .set(SECRET)
      .send({ to: address, subject: 'Autre chose' })
      .expect(404);
    await http().delete(`${h.base}/inbound-email`).set(h.grace.auth).expect(204);
    expect((await http().get(`${h.base}/inbound-email`).set(h.grace.auth)).body.address).toBeNull();
  });

  it('secret du Worker obligatoire ; adresse inconnue refusée', async () => {
    const h = await coupleHousehold(app);
    const { address } = (await http().post(`${h.base}/inbound-email`).set(h.grace.auth)).body;
    await http()
      .post('/v1/inbound/email')
      .set({ ...CSRF, authorization: 'Bearer wrong' })
      .send({ to: address, subject: 'Test' })
      .expect(401);
    await http()
      .post('/v1/inbound/email')
      .set(CSRF)
      .send({ to: address, subject: 'Test' })
      .expect(401);
    await http()
      .post('/v1/inbound/email')
      .set(SECRET)
      .send({ to: 'agenda+0123456789abcdef0123456789abcdef@example.test', subject: 'Test' })
      .expect(404);
    // Sans sujet : la première ligne du message.
    const res = await http()
      .post('/v1/inbound/email')
      .set(SECRET)
      .send({ to: address, text: '\n> cité\nRappeler le plombier\nMerci' })
      .expect(201);
    const o = (await http().get(`${h.base}/occurrences/${res.body.occurrenceId}`).set(h.grace.auth))
      .body;
    expect(o.title).toBe('Rappeler le plombier');
  });

  it('extraction du jeton et du titre', () => {
    expect(extractToken('"A" <AGENDA+ABCDEF0123456789ABCDEF0123456789@example.test>, b@x.be')).toBe(
      'abcdef0123456789abcdef0123456789',
    );
    expect(extractToken('agenda@example.test')).toBeNull();
    expect(titleFrom('RE: Fwd:  Réserver   le garage', '')).toBe('Réserver le garage');
    expect(titleFrom('', '')).toBe('');
  });
});
