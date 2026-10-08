import { INestApplication } from '@nestjs/common';
import { todayIn } from '@agenda/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coupleHousehold, createTestApp, registerUser } from './app';

type Notif = { type: string; code: string | null; byName: string | null; occurrenceId: string };

describe('Échange de tour', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const today = todayIn('Europe/Brussels');

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  const setup = async () => {
    const h = await coupleHousehold(app);
    const task = await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({ title: 'Vaisselle', date: today, assigneeIds: [h.grace.memberId] })
      .expect(201);
    return { h, id: task.body.id as string };
  };
  const bell = async (h: Awaited<ReturnType<typeof coupleHousehold>>, who: 'grace' | 'nicolas') =>
    (await http().get(`${h.base}/notifications`).set(h[who].auth).expect(200)).body
      .items as Notif[];

  it('demander, accepter : la tâche change de responsable, chacun est prévenu', async () => {
    const { h, id } = await setup();
    const asked = await http()
      .post(`${h.base}/occurrences/${id}/swap`)
      .set(h.grace.auth)
      .send({ toMemberId: h.nicolas.memberId, note: 'Je rentre tard' })
      .expect(201);
    expect(asked.body).toMatchObject({
      title: 'Vaisselle',
      status: 'PENDING',
      note: 'Je rentre tard',
    });

    const lists = await http().get(`${h.base}/swaps`).set(h.nicolas.auth).expect(200);
    expect(lists.body.incoming).toHaveLength(1);
    expect(lists.body.outgoing).toHaveLength(0);
    expect((await bell(h, 'nicolas')).find((n) => n.type === 'TASK_SWAP_REQUEST')).toMatchObject({
      byName: 'Grace',
      occurrenceId: id,
    });

    // Seul le destinataire répond ; un autre ne voit même pas la demande.
    await http().post(`${h.base}/swaps/${asked.body.id}/accept`).set(h.grace.auth).expect(404);
    const accepted = await http()
      .post(`${h.base}/swaps/${asked.body.id}/accept`)
      .set(h.nicolas.auth)
      .expect(200);
    expect(accepted.body.status).toBe('ACCEPTED');
    const o = await http().get(`${h.base}/occurrences/${id}`).set(h.grace.auth).expect(200);
    expect(o.body.assigneeIds).toEqual([h.nicolas.memberId]);
    expect((await bell(h, 'grace')).find((n) => n.type === 'TASK_SWAP_ANSWER')).toMatchObject({
      code: 'ACCEPTED',
      byName: 'Nicolas',
    });
    // Plus rien en attente.
    const after = await http().get(`${h.base}/swaps`).set(h.grace.auth).expect(200);
    expect(after.body.outgoing).toHaveLength(0);
  });

  it('refuser ou annuler ne change pas la tâche ; règles de la demande', async () => {
    const { h, id } = await setup();
    // Pas responsable, soi-même, déjà responsable, membre inconnu : refusé.
    await http()
      .post(`${h.base}/occurrences/${id}/swap`)
      .set(h.nicolas.auth)
      .send({ toMemberId: h.grace.memberId })
      .expect(400);
    await http()
      .post(`${h.base}/occurrences/${id}/swap`)
      .set(h.grace.auth)
      .send({ toMemberId: h.grace.memberId })
      .expect(400);
    await http()
      .post(`${h.base}/occurrences/${id}/swap`)
      .set(h.grace.auth)
      .send({ toMemberId: '00000000-0000-4000-8000-000000000000' })
      .expect(400);

    const first = await http()
      .post(`${h.base}/occurrences/${id}/swap`)
      .set(h.grace.auth)
      .send({ toMemberId: h.nicolas.memberId })
      .expect(201);
    await http().post(`${h.base}/swaps/${first.body.id}/decline`).set(h.nicolas.auth).expect(200);
    expect((await bell(h, 'grace')).find((n) => n.type === 'TASK_SWAP_ANSWER')?.code).toBe(
      'DECLINED',
    );
    const o = await http().get(`${h.base}/occurrences/${id}`).set(h.grace.auth).expect(200);
    expect(o.body.assigneeIds).toEqual([h.grace.memberId]);

    // Une nouvelle demande remplace l'ancienne ; l'auteur peut l'annuler.
    const second = await http()
      .post(`${h.base}/occurrences/${id}/swap`)
      .set(h.grace.auth)
      .send({ toMemberId: h.nicolas.memberId })
      .expect(201);
    await http().delete(`${h.base}/swaps/${second.body.id}`).set(h.nicolas.auth).expect(404);
    await http().delete(`${h.base}/swaps/${second.body.id}`).set(h.grace.auth).expect(204);
    await http().post(`${h.base}/swaps/${second.body.id}/accept`).set(h.nicolas.auth).expect(404);

    // Une tâche faite entre-temps : accepter échoue (409) sans rien changer.
    const third = await http()
      .post(`${h.base}/occurrences/${id}/swap`)
      .set(h.grace.auth)
      .send({ toMemberId: h.nicolas.memberId })
      .expect(201);
    await http().post(`${h.base}/occurrences/${id}/complete`).set(h.grace.auth).expect(200);
    await http().post(`${h.base}/swaps/${third.body.id}/accept`).set(h.nicolas.auth).expect(409);

    // Un autre foyer ne voit rien.
    const outsider = await registerUser(app, 'Intrus');
    await http().get(`${h.base}/swaps`).set(outsider.auth).expect(404);
  });

  it('export RGPD et suppression du compte', async () => {
    const { h, id } = await setup();
    await http()
      .post(`${h.base}/occurrences/${id}/swap`)
      .set(h.grace.auth)
      .send({ toMemberId: h.nicolas.memberId, note: 'Merci !' })
      .expect(201);
    const exported = await http().get('/v1/me/export').set(h.grace.auth).expect(200);
    expect(exported.body.swaps).toEqual([
      expect.objectContaining({ task: 'Vaisselle', askedByMe: true, note: 'Merci !' }),
    ]);
  });
});
