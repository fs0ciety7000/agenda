import { INestApplication } from '@nestjs/common';
import { addDays, todayIn } from '@agenda/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coupleHousehold, createTestApp } from './app';

type Occ = { id: string; date: string; title: string; assigneeIds: string[] };

describe('Mode absence (intégration)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const today = todayIn('Europe/Brussels');

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('les tâches partagées de l’absent passent à l’autre, puis la rotation reprend', async () => {
    const h = await coupleHousehold(app);
    const G = h.grace.memberId;
    const N = h.nicolas.memberId;
    // Chaque jour, chacun son tour (G, N, G, N…).
    await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({
        title: 'Vaisselle',
        date: today,
        recurrence: {
          rule: { freq: 'DAILY', interval: 1 },
          rotation: { mode: 'ALTERNATE', memberIds: [G, N] },
        },
      })
      .expect(201);
    // Ponctuelle confiée à Grace pendant l'absence, et une tâche personnelle de Grace.
    await http()
      .post(`${h.base}/tasks`)
      .set(h.nicolas.auth)
      .send({ title: 'Appeler le garage', date: addDays(today, 2), assigneeIds: [G] })
      .expect(201);
    await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({ title: 'Dentiste', date: addDays(today, 2), visibility: 'PERSONAL' })
      .expect(201);

    const list = async () =>
      (
        await http()
          .get(`${h.base}/occurrences?from=${today}&to=${addDays(today, 6)}`)
          .set(h.grace.auth)
          .expect(200)
      ).body as Occ[];
    const who = (occs: Occ[], title: string) =>
      occs.filter((o) => o.title === title).map((o) => o.assigneeIds.join('+'));

    // Grace absente de J+1 à J+3 (déclarée par Nicolas).
    const absence = await http()
      .post(`${h.base}/absences`)
      .set(h.nicolas.auth)
      .send({ memberId: G, startDate: addDays(today, 1), endDate: addDays(today, 3) })
      .expect(201);

    let occs = await list();
    expect(who(occs, 'Vaisselle')).toEqual([G, N, N, N, G, N, G]);
    expect(who(occs, 'Appeler le garage')).toEqual([N]);
    expect(who(occs, 'Dentiste')).toEqual([G]);

    // Le foyer indique l'absence en cours (commence demain : pas encore absente).
    const hh = (await http().get(h.base).set(h.grace.auth).expect(200)).body as {
      members: { id: string; absentUntil: string | null }[];
    };
    expect(hh.members.find((m) => m.id === G)!.absentUntil).toBeNull();
    const listed = (await http().get(`${h.base}/absences`).set(h.grace.auth).expect(200)).body;
    expect(listed).toEqual([
      {
        id: absence.body.id,
        memberId: G,
        startDate: addDays(today, 1),
        endDate: addDays(today, 3),
      },
    ]);

    // Les nouvelles dates générées pendant l'absence en tiennent compte aussi (matérialisation).
    // Annulation : la répétition reprend sa rotation ; la ponctuelle reste à Nicolas.
    await http().delete(`${h.base}/absences/${absence.body.id}`).set(h.grace.auth).expect(204);
    occs = await list();
    expect(who(occs, 'Vaisselle')).toEqual([G, N, G, N, G, N, G]);
    expect(who(occs, 'Appeler le garage')).toEqual([N]);
  });

  it('absence en cours visible dans le foyer ; validations ; isolation', async () => {
    const h = await coupleHousehold(app);
    const G = h.grace.memberId;
    await http()
      .post(`${h.base}/absences`)
      .set(h.grace.auth)
      .send({ memberId: G, startDate: today, endDate: addDays(today, 7) })
      .expect(201);
    const hh = (await http().get(h.base).set(h.grace.auth).expect(200)).body as {
      members: { id: string; absentUntil: string | null }[];
    };
    expect(hh.members.find((m) => m.id === G)!.absentUntil).toBe(addDays(today, 7));

    await http()
      .post(`${h.base}/absences`)
      .set(h.grace.auth)
      .send({ memberId: G, startDate: addDays(today, 3), endDate: addDays(today, 1) })
      .expect(400);
    await http()
      .post(`${h.base}/absences`)
      .set(h.grace.auth)
      .send({ memberId: G, startDate: addDays(today, -9), endDate: addDays(today, -2) })
      .expect(400);
    const other = await coupleHousehold(app);
    await http()
      .post(`${h.base}/absences`)
      .set(h.grace.auth)
      .send({ memberId: other.grace.memberId, startDate: today, endDate: today })
      .expect(400);
    await http().get(`${h.base}/absences`).set(other.grace.auth).expect(404);
  });
});
