import { INestApplication } from '@nestjs/common';
import { addDays, todayIn } from '@agenda/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ActivityService } from '../src/tasks/activity.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { coupleHousehold, createTestApp } from './app';

describe('Corbeille et journal d’activité', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const today = todayIn('Europe/Brussels');

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('supprimer puis restaurer une tâche ; le journal garde qui et quoi', async () => {
    const h = await coupleHousehold(app);
    const t = await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({ title: 'Payer la facture', date: today })
      .expect(201);
    await http()
      .post(`${h.base}/occurrences/${t.body.id}/complete`)
      .set(h.nicolas.auth)
      .expect(200);
    await http().delete(`${h.base}/occurrences/${t.body.id}`).set(h.nicolas.auth).expect(204);
    await http().get(`${h.base}/occurrences/${t.body.id}`).set(h.grace.auth).expect(404);

    const trash = await http().get(`${h.base}/trash`).set(h.grace.auth).expect(200);
    expect(trash.body).toHaveLength(1);
    expect(trash.body[0]).toMatchObject({
      kind: 'task',
      title: 'Payer la facture',
      date: today,
      deletedById: h.nicolas.memberId,
    });

    const restored = await http()
      .post(`${h.base}/trash/${trash.body[0].id}/restore`)
      .set(h.grace.auth)
      .expect(200);
    expect(restored.body).toEqual({ occurrenceId: t.body.id });
    await http().get(`${h.base}/occurrences/${t.body.id}`).set(h.grace.auth).expect(200);
    expect((await http().get(`${h.base}/trash`).set(h.grace.auth)).body).toEqual([]);
    // Deuxième restauration : plus rien à restaurer.
    await http().post(`${h.base}/trash/${trash.body[0].id}/restore`).set(h.grace.auth).expect(404);

    const log = await http().get(`${h.base}/activity`).set(h.grace.auth).expect(200);
    expect(
      log.body.items.map((i: { action: string; actorId: string }) => [
        i.action,
        i.actorId === h.grace.memberId ? 'Grace' : 'Nicolas',
      ]),
    ).toEqual([
      ['task.restored', 'Grace'],
      ['task.deleted', 'Nicolas'],
      ['occurrence.completed', 'Nicolas'],
      ['task.created', 'Grace'],
    ]);
    expect(log.body.items.every((i: { title: string }) => i.title === 'Payer la facture')).toBe(
      true,
    );
    expect(log.body.next).toBeNull();
  });

  it('une seule fois, ou « les suivantes » d’une répétition : restaurables', async () => {
    const h = await coupleHousehold(app);
    await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({ title: 'Nourrir le chat', date: today, recurrence: { rule: { freq: 'DAILY' } } })
      .expect(201);
    const list = async () =>
      (
        await http()
          .get(`${h.base}/occurrences`)
          .query({ from: today, to: addDays(today, 4) })
          .set(h.grace.auth)
      ).body as { id: string; date: string; title: string }[];
    const before = (await list()).filter((o) => o.title === 'Nourrir le chat');
    expect(before).toHaveLength(5);

    // « Cette fois » : l'occurrence de demain.
    await http()
      .delete(`${h.base}/occurrences/${before[1]!.id}`)
      .query({ scope: 'this' })
      .set(h.grace.auth)
      .expect(204);
    // « Les suivantes » à partir d'après-demain.
    await http()
      .delete(`${h.base}/occurrences/${before[2]!.id}`)
      .query({ scope: 'following' })
      .set(h.nicolas.auth)
      .expect(204);
    expect((await list()).map((o) => o.date)).toEqual([today]);

    const trash = (await http().get(`${h.base}/trash`).set(h.grace.auth)).body as {
      id: string;
      kind: string;
      date: string;
    }[];
    expect(trash.map((i) => [i.kind, i.date])).toEqual([
      ['following', addDays(today, 2)],
      ['occurrence', addDays(today, 1)],
    ]);
    const following = await http()
      .post(`${h.base}/trash/${trash[0]!.id}/restore`)
      .set(h.grace.auth)
      .expect(200);
    expect(following.body.occurrenceId).toBeTruthy();
    await http().post(`${h.base}/trash/${trash[1]!.id}/restore`).set(h.grace.auth).expect(200);
    expect((await list()).map((o) => o.date)).toEqual(
      [0, 1, 2, 3, 4].map((d) => addDays(today, d)),
    );
  });

  it('annuler depuis l’occurrence (bouton « Annuler »)', async () => {
    const h = await coupleHousehold(app);
    const t = await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({ title: 'Arroser', date: today, recurrence: { rule: { freq: 'DAILY' } } })
      .expect(201);
    await http()
      .delete(`${h.base}/occurrences/${t.body.id}`)
      .query({ scope: 'all' })
      .set(h.grace.auth)
      .expect(204);
    const undo = await http()
      .post(`${h.base}/occurrences/${t.body.id}/restore`)
      .set(h.grace.auth)
      .expect(200);
    expect(undo.body).toEqual({ occurrenceId: t.body.id });
    await http().get(`${h.base}/occurrences/${t.body.id}`).set(h.grace.auth).expect(200);
    await http().post(`${h.base}/occurrences/${t.body.id}/restore`).set(h.grace.auth).expect(404);
  });

  it('tâches personnelles de l’autre invisibles ; isolation entre foyers ; pagination', async () => {
    const h = await coupleHousehold(app);
    const other = await coupleHousehold(app);
    const secret = await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({ title: 'Cadeau surprise', visibility: 'PERSONAL' })
      .expect(201);
    await http().delete(`${h.base}/occurrences/${secret.body.id}`).set(h.grace.auth).expect(204);
    for (const n of [1, 2, 3])
      await http()
        .post(`${h.base}/tasks`)
        .set(h.nicolas.auth)
        .send({ title: `Tâche ${n}` })
        .expect(201);

    const nicolasLog = (await http().get(`${h.base}/activity`).set(h.nicolas.auth)).body;
    expect(nicolasLog.items.some((i: { title: string }) => i.title === 'Cadeau surprise')).toBe(
      false,
    );
    expect((await http().get(`${h.base}/trash`).set(h.nicolas.auth)).body).toEqual([]);
    const graceTrash = (await http().get(`${h.base}/trash`).set(h.grace.auth)).body;
    expect(graceTrash).toHaveLength(1);
    await http()
      .post(`${h.base}/trash/${graceTrash[0].id}/restore`)
      .set(h.nicolas.auth)
      .expect(404);
    await http()
      .post(`${other.base}/trash/${graceTrash[0].id}/restore`)
      .set(other.grace.auth)
      .expect(404);

    const page1 = (await http().get(`${h.base}/activity`).query({ limit: 2 }).set(h.grace.auth))
      .body;
    expect(page1.items).toHaveLength(2);
    const page2 = (
      await http()
        .get(`${h.base}/activity`)
        .query({ limit: 2, before: page1.next })
        .set(h.grace.auth)
    ).body;
    expect(page2.items.map((i: { id: string }) => i.id)).not.toContain(page1.items[0].id);
    expect(page1.items.length + page2.items.length).toBeGreaterThanOrEqual(4);
  });

  it('purge : tâches supprimées depuis plus de 30 jours, journal de plus d’un an', async () => {
    const h = await coupleHousehold(app);
    const t = await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({ title: 'Vieille tâche' })
      .expect(201);
    await http().delete(`${h.base}/occurrences/${t.body.id}`).set(h.grace.auth).expect(204);
    const prisma = app.get(PrismaService);
    const old = new Date(Date.now() - 31 * 86_400_000);
    await prisma.task.update({ where: { id: t.body.taskId }, data: { deletedAt: old } });
    await prisma.activityLog.updateMany({
      where: { householdId: h.householdId, action: 'task.deleted' },
      data: { createdAt: old },
    });
    expect((await http().get(`${h.base}/trash`).set(h.grace.auth)).body).toEqual([]);

    await app.get(ActivityService).purge();
    expect(await prisma.task.findUnique({ where: { id: t.body.taskId } })).toBeNull();
  });
});
