import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { addDays, todayIn, weekdayOf, WEEKDAYS } from '@agenda/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coupleHousehold, createTestApp, registerUser } from './app';

type Occ = {
  id: string;
  date: string;
  title: string;
  assigneeIds: string[];
  status: string;
  version: number;
  seriesId: string;
  isException: boolean;
  startMinute: number | null;
  taskId: string;
};

describe('Tâches récurrentes & rotation (intégration)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const http = () => request(app.getHttpServer());
  const today = todayIn('Europe/Brussels');
  const WD = WEEKDAYS[weekdayOf(today)]!;

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function setup() {
    const h = await coupleHousehold(app);
    const list = async (qs = `from=${today}&to=${addDays(today, 27)}`, who = h.grace) =>
      (await http().get(`${h.base}/occurrences?${qs}`).set(who.auth).expect(200)).body as Occ[];
    const weekly = (extra: object = {}) =>
      http()
        .post(`${h.base}/tasks`)
        .set(h.grace.auth)
        .send({
          title: 'Nettoyer la salle de bain',
          date: today,
          startMinute: 600,
          durationMinutes: 45,
          recurrence: {
            rule: { freq: 'WEEKLY', byWeekday: [WD] },
            rotation: { mode: 'ALTERNATE', memberIds: [h.grace.memberId, h.nicolas.memberId] },
          },
          ...extra,
        })
        .expect(201);
    return { ...h, list, weekly };
  }

  it('création : chaque semaine, alternance Grace / Nicolas, horizon de 90 jours', async () => {
    const h = await setup();
    const first = await h.weekly();
    expect(first.body).toMatchObject({
      date: today,
      startMinute: 600,
      isRecurring: true,
      assigneeIds: [h.grace.memberId],
    });
    const occs = await h.list();
    expect(occs.map((o) => o.date)).toEqual([0, 7, 14, 21].map((d) => addDays(today, d)));
    expect(occs.map((o) => o.assigneeIds[0])).toEqual([
      h.grace.memberId,
      h.nicolas.memberId,
      h.grace.memberId,
      h.nicolas.memberId,
    ]);
    const total = await prisma.taskOccurrence.count({ where: { seriesId: first.body.seriesId } });
    expect(total).toBe(Math.floor(90 / 7) + 1);
  });

  it('rotation par semaine + « G, G, N, N » + nombre d’occurrences', async () => {
    const h = await setup();
    const seq = await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({
        title: 'Vaisselle',
        date: today,
        recurrence: {
          rule: { freq: 'DAILY' },
          count: 6,
          rotation: {
            mode: 'SEQUENCE',
            sequence: [
              [h.grace.memberId],
              [h.grace.memberId],
              [h.nicolas.memberId],
              [h.nicolas.memberId],
            ],
          },
        },
      })
      .expect(201);
    const occs = (await h.list(`from=${today}&to=${addDays(today, 30)}`)).filter(
      (o) => o.seriesId === seq.body.seriesId,
    );
    expect(occs).toHaveLength(6);
    const G = h.grace.memberId;
    const N = h.nicolas.memberId;
    expect(occs.map((o) => o.assigneeIds[0])).toEqual([G, G, N, N, G, G]);
  });

  it('modifier UNIQUEMENT cette occurrence : exception conservée même si la série change ensuite', async () => {
    const h = await setup();
    await h.weekly();
    const [, second, third] = await h.list();
    const edited = await http()
      .patch(`${h.base}/occurrences/${second!.id}?scope=this`)
      .set(h.nicolas.auth)
      .send({
        version: second!.version,
        title: 'Salle de bain (grand nettoyage)',
        assigneeIds: [h.grace.memberId, h.nicolas.memberId],
        startMinute: 840,
      })
      .expect(200);
    expect(edited.body).toMatchObject({
      isException: true,
      title: 'Salle de bain (grand nettoyage)',
      startMinute: 840,
    });
    const after = await h.list();
    expect(after[2]).toMatchObject({
      id: third!.id,
      title: 'Nettoyer la salle de bain',
      startMinute: 600,
    });

    // Toute la série passe à 11:00 : l'exception garde 14:00 et ses deux responsables.
    const [first] = after;
    await http()
      .patch(`${h.base}/occurrences/${first!.id}?scope=all`)
      .set(h.grace.auth)
      .send({ version: first!.version, startMinute: 660 })
      .expect(200);
    const final = await h.list();
    expect(final.map((o) => o.startMinute)).toEqual([660, 840, 660, 660]);
    expect(final[1]!.assigneeIds).toHaveLength(2);
  });

  it('modifier CETTE OCCURRENCE ET LES SUIVANTES : historique intact, rotation qui continue', async () => {
    const h = await setup();
    const created = await h.weekly();
    const [first, second, third] = await h.list();
    await http().post(`${h.base}/occurrences/${first!.id}/complete`).set(h.grace.auth).expect(200);

    const res = await http()
      .patch(`${h.base}/occurrences/${third!.id}?scope=following`)
      .set(h.grace.auth)
      .send({ version: third!.version, title: 'Salle de bain + miroirs', durationMinutes: 60 })
      .expect(200);
    expect(res.body).toMatchObject({
      date: third!.date,
      title: 'Salle de bain + miroirs',
      durationMinutes: 60,
    });
    expect(res.body.seriesId).not.toBe(created.body.seriesId);
    expect(res.body.taskId).not.toBe(created.body.taskId);
    // La rotation reprend au même tour : la 3e occurrence reste à Grace, la 4e à Nicolas.
    expect(res.body.assigneeIds).toEqual(third!.assigneeIds);

    const after = await h.list(`from=${today}&to=${addDays(today, 27)}&status=TODO`);
    const all = await h.list(`from=${today}&to=${addDays(today, 27)}&view=all`);
    expect(all.map((o) => o.title)).toEqual([
      'Nettoyer la salle de bain',
      'Nettoyer la salle de bain',
      'Salle de bain + miroirs',
      'Salle de bain + miroirs',
    ]);
    expect(all[0]).toMatchObject({ id: first!.id, status: 'DONE' }); // historique conservé
    expect(all[1]).toMatchObject({ id: second!.id });
    expect(after.at(-1)!.assigneeIds).toEqual([h.nicolas.memberId]);
    const oldSeries = await prisma.taskSeries.findUniqueOrThrow({
      where: { id: created.body.seriesId },
    });
    expect(oldSeries.untilDate!.toISOString().slice(0, 10)).toBe(addDays(third!.date, -1));
  });

  it('modifier TOUTE LA SÉRIE : rotation remplacée, occurrence déjà faite intacte', async () => {
    const h = await setup();
    await h.weekly();
    const [first, second] = await h.list();
    await http()
      .post(`${h.base}/occurrences/${first!.id}/complete`)
      .set(h.nicolas.auth)
      .expect(200);
    await http()
      .patch(`${h.base}/occurrences/${second!.id}?scope=all`)
      .set(h.grace.auth)
      .send({
        version: second!.version,
        title: 'Salle de bain',
        recurrence: {
          rule: { freq: 'WEEKLY', byWeekday: [WD] },
          rotation: { mode: 'FIXED', memberIds: [h.nicolas.memberId] },
        },
      })
      .expect(200);
    const all = await h.list(`from=${today}&to=${addDays(today, 27)}&view=all`);
    expect(all[0]).toMatchObject({
      id: first!.id,
      status: 'DONE',
      assigneeIds: [h.grace.memberId],
    });
    expect(all.slice(1).map((o) => o.assigneeIds)).toEqual([
      [h.nicolas.memberId],
      [h.nicolas.memberId],
      [h.nicolas.memberId],
    ]);
    expect(new Set(all.map((o) => o.title))).toEqual(new Set(['Salle de bain']));
  });

  it('supprimer une occurrence / les suivantes / toute la série', async () => {
    const h = await setup();
    const created = await h.weekly();
    const [, second, third] = await h.list();

    await http()
      .delete(`${h.base}/occurrences/${second!.id}?scope=this`)
      .set(h.grace.auth)
      .expect(204);
    let dates = (await h.list()).map((o) => o.date);
    expect(dates).not.toContain(second!.date);
    // L'occurrence annulée n'est jamais régénérée, même si l'horizon est recalculé.
    await prisma.taskSeries.update({
      where: { id: created.body.seriesId },
      data: { generatedUntil: null },
    });
    dates = (await h.list()).map((o) => o.date);
    expect(dates).toEqual([today, third!.date, addDays(today, 21)]);

    await http()
      .delete(`${h.base}/occurrences/${third!.id}?scope=following`)
      .set(h.grace.auth)
      .expect(204);
    expect((await h.list(`from=${today}&to=${addDays(today, 200)}`)).map((o) => o.date)).toEqual([
      today,
    ]);

    const [first] = await h.list();
    await http()
      .delete(`${h.base}/occurrences/${first!.id}?scope=all`)
      .set(h.grace.auth)
      .expect(204);
    expect(await h.list()).toEqual([]);
  });

  it('matérialisation paresseuse au-delà de 90 jours et sans doublons en concurrence', async () => {
    const h = await setup();
    const created = await h.weekly();
    const far = await h.list(`from=${addDays(today, 180)}&to=${addDays(today, 200)}`);
    expect(far.length).toBeGreaterThanOrEqual(2);

    await prisma.taskOccurrence.deleteMany({
      where: { seriesId: created.body.seriesId, date: { gt: new Date(`${today}T00:00:00Z`) } },
    });
    await prisma.taskSeries.update({
      where: { id: created.body.seriesId },
      data: { generatedUntil: new Date(`${today}T00:00:00Z`) },
    });
    await Promise.all(Array.from({ length: 6 }, () => h.list()));
    const rows = await prisma.taskOccurrence.groupBy({
      by: ['originalDate'],
      where: { seriesId: created.body.seriesId },
      _count: true,
    });
    expect(rows.every((r) => r._count === 1)).toBe(true);
  });

  it('convertir une tâche ponctuelle en tâche récurrente', async () => {
    const h = await setup();
    const one = await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({ title: 'Poubelles', date: today, startMinute: 1140 })
      .expect(201);
    const res = await http()
      .patch(`${h.base}/occurrences/${one.body.id}`)
      .set(h.grace.auth)
      .send({
        version: 1,
        recurrence: {
          rule: { freq: 'DAILY' },
          rotation: { mode: 'ALTERNATE', memberIds: [h.nicolas.memberId, h.grace.memberId] },
        },
      })
      .expect(200);
    expect(res.body).toMatchObject({
      isRecurring: true,
      date: today,
      startMinute: 1140,
      assigneeIds: [h.nicolas.memberId],
    });
    expect(
      (await h.list(`from=${today}&to=${addDays(today, 3)}`)).map((o) => o.assigneeIds[0]),
    ).toEqual([h.nicolas.memberId, h.grace.memberId, h.nicolas.memberId, h.grace.memberId]);
  });

  it('séries : liste avec prochaine date, aperçu de rotation ; vie privée et isolation', async () => {
    const h = await setup();
    const created = await h.weekly();
    await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({
        title: 'Sport',
        visibility: 'PERSONAL',
        date: today,
        recurrence: { rule: { freq: 'DAILY' } },
      })
      .expect(201);

    const graceSeries = (await http().get(`${h.base}/series`).set(h.grace.auth).expect(200)).body;
    const nicolasSeries = (await http().get(`${h.base}/series`).set(h.nicolas.auth).expect(200))
      .body;
    expect(graceSeries).toHaveLength(2);
    expect(nicolasSeries).toHaveLength(1);
    expect(nicolasSeries[0]).toMatchObject({
      id: created.body.seriesId,
      nextDate: today,
      rule: { freq: 'WEEKLY', byWeekday: [WD], interval: 1 },
      rotation: { mode: 'ALTERNATE', memberIds: [h.grace.memberId, h.nicolas.memberId] },
    });
    // Une tâche personnelle récurrente est toujours attribuée à son créateur.
    const sport = graceSeries.find((s: { title: string }) => s.title === 'Sport');
    expect(sport.rotation).toEqual({ mode: 'FIXED', memberIds: [h.grace.memberId] });
    await http().get(`${h.base}/series/${sport.id}`).set(h.nicolas.auth).expect(404);

    const preview = await http()
      .post(`${h.base}/recurrence/preview`)
      .set(h.grace.auth)
      .send({
        startDate: '2026-09-29',
        limit: 4,
        recurrence: {
          rule: { freq: 'WEEKLY', byWeekday: ['TU', 'FR'] },
          rotation: { mode: 'ALTERNATE', memberIds: [h.grace.memberId, h.nicolas.memberId] },
        },
      })
      .expect(200);
    expect(preview.body).toEqual([
      { date: '2026-09-29', assigneeIds: [h.grace.memberId] },
      { date: '2026-10-02', assigneeIds: [h.nicolas.memberId] },
      { date: '2026-10-06', assigneeIds: [h.grace.memberId] },
      { date: '2026-10-09', assigneeIds: [h.nicolas.memberId] },
    ]);

    // Membre d'un autre foyer dans la rotation : refusé.
    const stranger = await registerUser(app, 'Voisin');
    const other = await http()
      .post('/v1/households')
      .set(stranger.auth)
      .send({ name: 'Voisins' })
      .expect(201);
    const intruder = other.body.members[0].id;
    await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({
        title: 'x',
        date: today,
        recurrence: {
          rule: { freq: 'DAILY' },
          rotation: { mode: 'ALTERNATE', memberIds: [h.grace.memberId, intruder] },
        },
      })
      .expect(400);
    await http()
      .get(`/v1/households/${other.body.id}/series/${created.body.seriesId}`)
      .set(stranger.auth)
      .expect(404);
  });

  it('conflit de version sur une modification de série', async () => {
    const h = await setup();
    await h.weekly();
    const [first] = await h.list();
    await http()
      .patch(`${h.base}/occurrences/${first!.id}?scope=all`)
      .set(h.grace.auth)
      .send({ version: first!.version, durationMinutes: 30 })
      .expect(200);
    const res = await http()
      .patch(`${h.base}/occurrences/${first!.id}?scope=all`)
      .set(h.nicolas.auth)
      .send({ version: first!.version, durationMinutes: 90 })
      .expect(409);
    expect(res.body.error.details.current.durationMinutes).toBe(30);
  });

  it('modifier toute la série conserve les identifiants des occurrences (futurs événements Google)', async () => {
    const h = await setup();
    await h.weekly();
    const before = await h.list();
    await http()
      .patch(`${h.base}/occurrences/${before[0]!.id}?scope=all`)
      .set(h.grace.auth)
      .send({
        version: before[0]!.version,
        startMinute: 480,
        recurrence: {
          rule: { freq: 'WEEKLY', byWeekday: [WD] },
          rotation: { mode: 'FIXED', memberIds: [h.nicolas.memberId] },
        },
      })
      .expect(200);
    const after = await h.list();
    expect(after.map((o) => o.id)).toEqual(before.map((o) => o.id));
    expect(
      after.every((o) => o.startMinute === 480 && o.assigneeIds[0] === h.nicolas.memberId),
    ).toBe(true);
  });

  describe('« après la dernière fois »', () => {
    const create = (h: Awaited<ReturnType<typeof setup>>, date = addDays(today, -2)) =>
      http()
        .post(`${h.base}/tasks`)
        .set(h.grace.auth)
        .send({
          title: 'Détartrer la bouilloire',
          date,
          recurrence: {
            rule: { freq: 'AFTER', interval: 3, unit: 'WEEK' },
            rotation: { mode: 'ALTERNATE', memberIds: [h.grace.memberId, h.nicolas.memberId] },
          },
        })
        .expect(201);
    const pending = async (seriesId: string) =>
      prisma.taskOccurrence.findMany({
        where: { seriesId, status: 'TODO' },
        include: { assignees: true },
      });

    it('une seule occurrence à la fois ; la suivante part du jour où elle est faite', async () => {
      const h = await setup();
      const first = (await create(h)).body as Occ & { lastDone: unknown };
      expect(first).toMatchObject({ date: addDays(today, -2), lastDone: null });
      expect(await pending(first.seriesId)).toHaveLength(1);

      // Faite aujourd'hui (en retard de 2 jours) → dans 3 semaines à partir d'aujourd'hui, par Nicolas.
      await http().post(`${h.base}/occurrences/${first.id}/complete`).set(h.grace.auth).expect(200);
      const next = await pending(first.seriesId);
      expect(next).toHaveLength(1);
      const nextDto = (
        await http().get(`${h.base}/occurrences/${next[0]!.id}`).set(h.grace.auth).expect(200)
      ).body as Occ & { lastDone: { memberId: string } };
      expect(nextDto).toMatchObject({
        date: addDays(today, 21),
        assigneeIds: [h.nicolas.memberId],
        lastDone: { memberId: h.grace.memberId },
      });

      // Annuler (décocher) : la suivante disparaît, la tâche redevient à faire.
      await http().post(`${h.base}/occurrences/${first.id}/reopen`).set(h.grace.auth).expect(200);
      const back = await pending(first.seriesId);
      expect(back.map((o) => o.id)).toEqual([first.id]);

      // Recochée : la suivante revient, même tour de rotation.
      await http().post(`${h.base}/occurrences/${first.id}/complete`).set(h.grace.auth).expect(200);
      const again = await pending(first.seriesId);
      expect(again).toHaveLength(1);
      expect(again[0]!.assignees.map((a) => a.memberId)).toEqual([h.nicolas.memberId]);
    });

    it('supprimer « cette fois » relance la suivante ; changer l’intervalle la déplace', async () => {
      const h = await setup();
      const first = (await create(h, today)).body as Occ;
      await http()
        .delete(`${h.base}/occurrences/${first.id}?scope=this`)
        .set(h.grace.auth)
        .expect(204);
      const [next] = await pending(first.seriesId);
      expect(next!.originalDate!.toISOString().slice(0, 10)).toBe(addDays(today, 21));

      // Faite, puis intervalle passé à 10 jours : la suivante = dernière fois + 10 jours.
      await http().post(`${h.base}/occurrences/${next!.id}/complete`).set(h.grace.auth).expect(200);
      const [third] = await pending(first.seriesId);
      const dto = (
        await http().get(`${h.base}/occurrences/${third!.id}`).set(h.grace.auth).expect(200)
      ).body as Occ;
      const moved = await http()
        .patch(`${h.base}/occurrences/${third!.id}?scope=all`)
        .set(h.grace.auth)
        .send({
          version: dto.version,
          recurrence: {
            rule: { freq: 'AFTER', interval: 10, unit: 'DAY' },
            rotation: { mode: 'ALTERNATE', memberIds: [h.grace.memberId, h.nicolas.memberId] },
          },
        })
        .expect(200);
      expect(moved.body).toMatchObject({ id: third!.id, date: addDays(today, 10) });
      expect(await pending(first.seriesId)).toHaveLength(1);
    });

    it('refuse un nombre d’occurrences', async () => {
      const h = await setup();
      await http()
        .post(`${h.base}/tasks`)
        .set(h.grace.auth)
        .send({
          title: 'Filtre',
          date: today,
          recurrence: { rule: { freq: 'AFTER', interval: 2, unit: 'MONTH' }, count: 3 },
        })
        .expect(400);
    });
  });
});
