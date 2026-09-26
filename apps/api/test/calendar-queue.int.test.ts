import { INestApplication } from '@nestjs/common';
import { todayIn } from '@agenda/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { GoogleCalendarClient } from '../src/calendar/google-calendar.client';
import { resetEnvCache } from '../src/config/env';
import { coupleHousehold, createTestApp } from './app';
import { FakeGoogleCalendar } from '../src/calendar/fake-google-calendar';

/** Chemin de production : BullMQ + Redis, déclenché par les modifications de tâches. */
describe('Google Calendar — file BullMQ (intégration, Redis réel)', () => {
  let app: INestApplication;
  const google = new FakeGoogleCalendar();
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    process.env.CALENDAR_SYNC_MODE = 'queue';
    process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15';
    resetEnvCache();
    app = await createTestApp([{ provide: GoogleCalendarClient, useValue: google }]);
  });
  afterAll(async () => {
    await app.close();
    delete process.env.CALENDAR_SYNC_MODE;
    delete process.env.REDIS_URL;
    resetEnvCache();
  });

  it('créer puis cocher des tâches déclenche la synchro en arrière-plan (sans appel explicite)', async () => {
    const h = await coupleHousehold(app);
    const calendarId = `commun-queue-${h.householdId}`;
    google.addCalendar(calendarId, 'Commun G & N');
    const start = await http().get('/v1/calendar/google/connect').set(h.nicolas.auth).expect(302);
    const state = new URL(start.headers.location!).searchParams.get('state')!;
    const flow = (start.headers['set-cookie'] as unknown as string[])
      .find((c) => c.startsWith('gn_cal_oauth='))!
      .split(';')[0]!;
    await http()
      .get(
        `/v1/calendar/google/callback?code=${encodeURIComponent(`q-${h.householdId}|n@gmail.test`)}&state=${state}`,
      )
      .set('Cookie', flow)
      .expect(302);
    await http()
      .put(`${h.base}/calendar/link`)
      .set(h.nicolas.auth)
      .send({ calendarId })
      .expect(200);

    const today = todayIn('Europe/Brussels');
    const created = await Promise.all(
      ['Poubelles', 'Courses', 'Lessive'].map((title) =>
        http()
          .post(`${h.base}/tasks`)
          .set(h.grace.auth)
          .send({ title, date: today, syncToCalendar: true })
          .expect(201),
      ),
    );
    await vi.waitFor(
      () =>
        expect(
          google
            .events(calendarId)
            .map((e) => e.summary)
            .sort(),
        ).toEqual(['Courses', 'Lessive', 'Poubelles']),
      {
        timeout: 15_000,
        interval: 200,
      },
    );

    await http()
      .post(`${h.base}/occurrences/${created[0]!.body.id}/complete`)
      .set(h.grace.auth)
      .expect(200);
    await vi.waitFor(
      () => expect(google.events(calendarId).map((e) => e.summary)).toContain('✓ Poubelles'),
      { timeout: 15_000, interval: 200 },
    );
    const status = await http().get(`${h.base}/calendar`).set(h.grace.auth).expect(200);
    expect(status.body.stats).toMatchObject({ synced: 3, pending: 0, errors: 0 });
  });
});
