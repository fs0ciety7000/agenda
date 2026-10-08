import { INestApplication } from '@nestjs/common';
import { addDays, todayIn } from '@agenda/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ImportantDatesService } from '../src/important-dates/important-dates.service';
import { importantDatePushText } from '../src/notifications/notifications.service';
import { coupleHousehold, createTestApp, registerUser } from './app';

type Notif = { type: string; title: string | null; date: string | null; daysLeft: number | null };

describe('Dates importantes', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const today = todayIn('Europe/Brussels');
  const md = (iso: string) => ({ month: Number(iso.slice(5, 7)), day: Number(iso.slice(8, 10)) });

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('créer, lister (les plus proches d’abord), âge, modifier, supprimer ; validations', async () => {
    const h = await coupleHousehold(app);
    const inTen = addDays(today, 10);
    const mamie = await http()
      .post(`${h.base}/important-dates`)
      .set(h.grace.auth)
      .send({ title: 'Anniversaire de mamie', kind: 'BIRTHDAY', ...md(inTen), year: 1950 })
      .expect(201);
    expect(mamie.body).toMatchObject({
      nextDate: inTen,
      daysLeft: 10,
      years: Number(inTen.slice(0, 4)) - 1950,
      repeatsYearly: true,
      remindDaysBefore: 7,
    });
    await http()
      .post(`${h.base}/important-dates`)
      .set(h.nicolas.auth)
      .send({
        title: 'Entretien chaudière',
        kind: 'MAINTENANCE',
        ...md(addDays(today, 2)),
        remindDaysBefore: 14,
      })
      .expect(201);
    // 30 février ; date unique sans année.
    await http()
      .post(`${h.base}/important-dates`)
      .set(h.grace.auth)
      .send({ title: 'X', month: 2, day: 30 })
      .expect(400);
    await http()
      .post(`${h.base}/important-dates`)
      .set(h.grace.auth)
      .send({ title: 'X', month: 5, day: 3, repeatsYearly: false })
      .expect(400);

    const list = await http().get(`${h.base}/important-dates`).set(h.nicolas.auth).expect(200);
    expect(list.body.map((d: { title: string }) => d.title)).toEqual([
      'Entretien chaudière',
      'Anniversaire de mamie',
    ]);

    const edited = await http()
      .put(`${h.base}/important-dates/${mamie.body.id}`)
      .set(h.nicolas.auth)
      .send({
        title: 'Anniversaire de mamie',
        kind: 'BIRTHDAY',
        ...md(inTen),
        year: null,
        remindDaysBefore: 3,
      })
      .expect(200);
    expect(edited.body).toMatchObject({ years: null, remindDaysBefore: 3 });

    await http().delete(`${h.base}/important-dates/${mamie.body.id}`).set(h.grace.auth).expect(204);
    await http().delete(`${h.base}/important-dates/${mamie.body.id}`).set(h.grace.auth).expect(404);
  });

  it('rappel : à tout le foyer, à partir de 8 h, une seule fois par occurrence', async () => {
    const h = await coupleHousehold(app);
    const inFive = addDays(today, 5);
    await http()
      .post(`${h.base}/important-dates`)
      .set(h.grace.auth)
      .send({ title: 'Anniversaire de mariage', kind: 'ANNIVERSARY', ...md(inFive), year: 2015 })
      .expect(201);
    // Trop loin : rappel 2 jours avant seulement.
    await http()
      .post(`${h.base}/important-dates`)
      .set(h.grace.auth)
      .send({ title: 'Contrôle technique', ...md(inFive), remindDaysBefore: 2 })
      .expect(201);
    const bell = async (auth: Record<string, string>) =>
      (
        (await http().get(`${h.base}/notifications`).set(auth).expect(200)).body.items as Notif[]
      ).filter((n) => n.type === 'IMPORTANT_DATE');
    const reminders = app.get(ImportantDatesService);

    // 6 h à Bruxelles : trop tôt.
    await reminders.sendReminders(new Date(`${today}T04:00:00Z`));
    expect(await bell(h.grace.auth)).toHaveLength(0);

    await reminders.sendReminders(new Date(`${today}T08:30:00Z`));
    const forNicolas = await bell(h.nicolas.auth);
    expect(forNicolas).toEqual([
      expect.objectContaining({ title: 'Anniversaire de mariage', date: inFive, daysLeft: 5 }),
    ]);
    // Celle qui l'a ajoutée est prévenue aussi : personne n'a « fait » l'action.
    expect(await bell(h.grace.auth)).toHaveLength(1);

    await reminders.sendReminders(new Date(`${today}T12:00:00Z`));
    expect(await bell(h.nicolas.auth)).toHaveLength(1);
  });

  it('aucun accès depuis un autre foyer ; export RGPD', async () => {
    const h = await coupleHousehold(app);
    const d = await http()
      .post(`${h.base}/important-dates`)
      .set(h.grace.auth)
      .send({ title: 'Anniversaire de Lou', kind: 'BIRTHDAY', month: 3, day: 12, year: 2019 })
      .expect(201);
    const other = await coupleHousehold(app);
    expect(
      (await http().get(`${other.base}/important-dates`).set(other.grace.auth).expect(200)).body,
    ).toEqual([]);
    await http()
      .put(`${other.base}/important-dates/${d.body.id}`)
      .set(other.grace.auth)
      .send({ title: 'Piraté', month: 1, day: 1 })
      .expect(404);
    await http()
      .delete(`${other.base}/important-dates/${d.body.id}`)
      .set(other.grace.auth)
      .expect(404);
    const outsider = await registerUser(app, 'Intrus');
    await http().get(`${h.base}/important-dates`).set(outsider.auth).expect(404);

    const exported = await http().get('/v1/me/export').set(h.grace.auth).expect(200);
    expect(exported.body.importantDatesCreated).toEqual([
      expect.objectContaining({ title: 'Anniversaire de Lou', month: 3, day: 12, year: 2019 }),
    ]);
  });

  it('texte du rappel dans les trois langues', () => {
    const p = { dateId: 'x', date: '2026-10-14', daysLeft: 7 };
    expect(importantDatePushText('fr', 'Anniversaire de mamie', p).body).toBe(
      'Anniversaire de mamie : dans 7 jours (mercredi 14 octobre)',
    );
    expect(importantDatePushText('en', 'Granny’s birthday', { ...p, daysLeft: 1 }).body).toBe(
      'Granny’s birthday: tomorrow (Wednesday 14 October)',
    );
    expect(importantDatePushText('nl', 'Verjaardag oma', { ...p, daysLeft: 0 }).body).toBe(
      'Verjaardag oma: vandaag',
    );
  });
});
