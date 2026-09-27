import { INestApplication } from '@nestjs/common';
import { addDays, endOfWeek, todayIn } from '@agenda/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coupleHousehold, createTestApp } from './app';

describe('Échéance souple (tâches sans date)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const today = todayIn('Europe/Brussels');

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('créée, dépassée ⇒ en retard ; planifier retire l’échéance ; ajout rapide « cette semaine »', async () => {
    const h = await coupleHousehold(app);
    const late = await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({ title: 'Rappeler le garage', dueDate: addDays(today, -1) })
      .expect(201);
    expect(late.body).toMatchObject({ date: null, dueDate: addDays(today, -1) });
    const later = await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({ title: 'Trier les papiers', dueDate: addDays(today, 20) })
      .expect(201);

    const overdue = await http().get(`${h.base}/occurrences?view=overdue`).set(h.grace.auth);
    expect(overdue.body.map((o: { title: string }) => o.title)).toEqual(['Rappeler le garage']);
    const unscheduled = await http()
      .get(`${h.base}/occurrences?view=unscheduled`)
      .set(h.grace.auth);
    // Triées par échéance.
    expect(unscheduled.body.map((o: { title: string }) => o.title)).toEqual([
      'Rappeler le garage',
      'Trier les papiers',
    ]);

    // Planifiée : l'échéance disparaît (et la tâche n'est plus en retard).
    const planned = await http()
      .patch(`${h.base}/occurrences/${late.body.id}`)
      .set(h.grace.auth)
      .send({ version: late.body.version, date: addDays(today, 1) })
      .expect(200);
    expect(planned.body).toMatchObject({ date: addDays(today, 1), dueDate: null });
    // Échéance retirée explicitement.
    const cleared = await http()
      .patch(`${h.base}/occurrences/${later.body.id}`)
      .set(h.grace.auth)
      .send({ version: later.body.version, dueDate: null })
      .expect(200);
    expect(cleared.body.dueDate).toBeNull();

    const quick = await http()
      .post(`${h.base}/tasks/quick`)
      .set(h.grace.auth)
      .send({ text: 'Réserver le restaurant cette semaine Nicolas' })
      .expect(201);
    expect(quick.body).toMatchObject({
      title: 'Réserver le restaurant',
      date: null,
      dueDate: endOfWeek(today),
      assigneeIds: [h.nicolas.memberId],
    });
  });

  it('une échéance est ignorée quand la tâche a une date', async () => {
    const h = await coupleHousehold(app);
    const both = await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({ title: 'Dentiste', date: today, dueDate: addDays(today, -3) })
      .expect(201);
    expect(both.body.dueDate).toBeNull();
  });
});
