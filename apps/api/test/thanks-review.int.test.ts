import { INestApplication } from '@nestjs/common';
import { addDays, startOfWeek, todayIn } from '@agenda/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coupleHousehold, createTestApp } from './app';

describe('Merci et revue de la semaine', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const today = todayIn('Europe/Brussels');

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('merci : seulement pour une tâche faite par un autre, une fois, notifié, retiré en rouvrant', async () => {
    const h = await coupleHousehold(app);
    const task = await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({ title: 'Sortir les poubelles', date: today })
      .expect(201);
    const id = task.body.id as string;

    await http().post(`${h.base}/occurrences/${id}/thanks`).set(h.nicolas.auth).expect(400); // pas faite
    await http().post(`${h.base}/occurrences/${id}/complete`).set(h.grace.auth).expect(200);
    await http().post(`${h.base}/occurrences/${id}/thanks`).set(h.grace.auth).expect(400); // soi-même

    const thanked = await http()
      .post(`${h.base}/occurrences/${id}/thanks`)
      .set(h.nicolas.auth)
      .expect(200);
    expect(thanked.body.thankedBy).toEqual([h.nicolas.memberId]);
    await http().post(`${h.base}/occurrences/${id}/thanks`).set(h.nicolas.auth).expect(200); // idempotent

    const bell = await http().get(`${h.base}/notifications`).set(h.grace.auth).expect(200);
    const thanks = bell.body.items.filter((n: { type: string }) => n.type === 'TASK_THANKS');
    expect(thanks).toHaveLength(1);
    expect(thanks[0]).toMatchObject({
      byName: 'Nicolas',
      title: 'Sortir les poubelles',
      occurrenceId: id,
    });

    const review = await http().get(`${h.base}/review`).set(h.grace.auth).expect(200);
    expect(review.body.from).toBe(startOfWeek(today));
    expect(review.body.done).toBe(1);
    expect(review.body.byMember).toContainEqual(
      expect.objectContaining({ memberId: h.grace.memberId, done: 1, thanks: 1 }),
    );

    const removed = await http()
      .delete(`${h.base}/occurrences/${id}/thanks`)
      .set(h.nicolas.auth)
      .expect(200);
    expect(removed.body.thankedBy).toEqual([]);
    await http().post(`${h.base}/occurrences/${id}/thanks`).set(h.nicolas.auth).expect(200);
    const reopened = await http()
      .post(`${h.base}/occurrences/${id}/reopen`)
      .set(h.grace.auth)
      .expect(200);
    expect(reopened.body.thankedBy).toEqual([]);
  });

  it('revue : tâches glissées et charge de la semaine suivante', async () => {
    const h = await coupleHousehold(app);
    const monday = startOfWeek(today);
    const nextMonday = addDays(monday, 7);
    await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({ title: 'Courses', date: nextMonday, assigneeIds: [h.nicolas.memberId] })
      .expect(201);
    await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({ title: 'Vitres', date: addDays(nextMonday, 2) })
      .expect(201);
    const lastWeek = await http()
      .get(`${h.base}/review?date=${addDays(monday, -7)}`)
      .set(h.grace.auth)
      .expect(200);
    expect(lastWeek.body.from).toBe(addDays(monday, -7));
    const review = await http().get(`${h.base}/review`).set(h.grace.auth).expect(200);
    expect(review.body.next).toMatchObject({ from: nextMonday, total: 2, unassigned: 1 });
    expect(review.body.next.byMember).toContainEqual({ memberId: h.nicolas.memberId, count: 1 });
  });
});
