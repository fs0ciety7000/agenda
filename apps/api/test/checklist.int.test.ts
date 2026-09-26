import { INestApplication } from '@nestjs/common';
import { todayIn } from '@agenda/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coupleHousehold, createTestApp } from './app';

describe('Sous-tâches / liste (intégration)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const today = () => todayIn('Europe/Brussels');

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('liste à la création, ajout, cocher à deux, renommer, retirer — sans conflit de version', async () => {
    const h = await coupleHousehold(app);
    const created = await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({ title: 'Courses', date: today(), checklist: ['Lait', 'Pain'] })
      .expect(201);
    const id = created.body.id as string;
    expect(created.body.checklist.map((i: { text: string }) => i.text)).toEqual(['Lait', 'Pain']);
    const version = created.body.version;

    const added = await http()
      .post(`${h.base}/occurrences/${id}/checklist`)
      .set(h.nicolas.auth)
      .send({ text: '  Café  ' })
      .expect(201);
    expect(added.body.checklist.map((i: { text: string }) => i.text)).toEqual([
      'Lait',
      'Pain',
      'Café',
    ]);

    const milk = added.body.checklist[0].id;
    const ticked = await http()
      .patch(`${h.base}/occurrences/${id}/checklist/${milk}`)
      .set(h.nicolas.auth)
      .send({ done: true })
      .expect(200);
    expect(ticked.body.checklist[0]).toMatchObject({ done: true, doneById: h.nicolas.memberId });
    // Cocher un article ne change pas la version : l'autre peut encore modifier la tâche.
    expect(ticked.body.version).toBe(version);

    const renamed = await http()
      .patch(`${h.base}/occurrences/${id}/checklist/${milk}`)
      .set(h.grace.auth)
      .send({ text: 'Lait demi-écrémé', done: false })
      .expect(200);
    expect(renamed.body.checklist[0]).toMatchObject({
      text: 'Lait demi-écrémé',
      done: false,
      doneById: null,
    });

    const removed = await http()
      .delete(`${h.base}/occurrences/${id}/checklist/${milk}`)
      .set(h.grace.auth)
      .expect(200);
    expect(removed.body.checklist).toHaveLength(2);
    // Idempotent (déjà retiré depuis l'autre téléphone).
    await http()
      .delete(`${h.base}/occurrences/${id}/checklist/${milk}`)
      .set(h.grace.auth)
      .expect(200);

    // Visible dans les listes.
    const list = await http()
      .get(`${h.base}/occurrences?view=today`)
      .set(h.nicolas.auth)
      .expect(200);
    expect(list.body.find((o: { id: string }) => o.id === id).checklist).toHaveLength(2);
  });

  it('validation et isolation : texte vide refusé, tâche personnelle de l’autre et autre foyer inaccessibles', async () => {
    const h = await coupleHousehold(app);
    const other = await coupleHousehold(app);
    const perso = await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({ title: 'Cadeau surprise', visibility: 'PERSONAL', checklist: ['Fleurs'] })
      .expect(201);
    const id = perso.body.id as string;
    const item = perso.body.checklist[0].id as string;

    await http()
      .post(`${h.base}/occurrences/${id}/checklist`)
      .set(h.grace.auth)
      .send({ text: '  ' })
      .expect(400);
    await http()
      .post(`${h.base}/occurrences/${id}/checklist`)
      .set(h.nicolas.auth)
      .send({ text: 'x' })
      .expect(404);
    await http()
      .patch(`${h.base}/occurrences/${id}/checklist/${item}`)
      .set(h.nicolas.auth)
      .send({ done: true })
      .expect(404);
    await http()
      .patch(`${other.base}/occurrences/${id}/checklist/${item}`)
      .set(other.grace.auth)
      .send({ done: true })
      .expect(404);
    // Un article d'une autre tâche ne peut pas être modifié via cette tâche.
    const shared = await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({ title: 'Autre' })
      .expect(201);
    await http()
      .patch(`${h.base}/occurrences/${shared.body.id}/checklist/${item}`)
      .set(h.grace.auth)
      .send({ done: true })
      .expect(404);
  });
});
