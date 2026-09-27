import { INestApplication } from '@nestjs/common';
import { todayIn } from '@agenda/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coupleHousehold, createTestApp } from './app';

describe('Commentaires sur une tâche (intégration)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const today = todayIn('Europe/Brussels');

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('commenter, notifier l’autre, compter, supprimer (auteur seulement)', async () => {
    const h = await coupleHousehold(app);
    const occ = (
      await http()
        .post(`${h.base}/tasks`)
        .set(h.grace.auth)
        .send({ title: 'Vidange', date: today, assigneeIds: [h.nicolas.memberId] })
        .expect(201)
    ).body as { id: string };

    const c = await http()
      .post(`${h.base}/occurrences/${occ.id}/comments`)
      .set(h.grace.auth)
      .send({ body: '  Le bidon est au garage  ' })
      .expect(201);
    expect(c.body).toMatchObject({ authorId: h.grace.memberId, body: 'Le bidon est au garage' });
    await http()
      .post(`${h.base}/occurrences/${occ.id}/comments`)
      .set(h.grace.auth)
      .send({ body: '   ' })
      .expect(400);

    // Nicolas (responsable) est prévenu, sans le texte ; Grace (autrice) non.
    const notes = (await http().get(`${h.base}/notifications`).set(h.nicolas.auth).expect(200))
      .body as { items: { type: string; title: string; byName: string; occurrenceId: string }[] };
    expect(notes.items[0]).toMatchObject({
      type: 'TASK_COMMENT',
      title: 'Vidange',
      byName: 'Grace',
      occurrenceId: occ.id,
    });
    const mine = (await http().get(`${h.base}/notifications`).set(h.grace.auth).expect(200))
      .body as { items: { type: string }[] };
    expect(mine.items.filter((n) => n.type === 'TASK_COMMENT')).toHaveLength(0);

    // Réponse de Nicolas → Grace (créatrice et autrice) est prévenue.
    await http()
      .post(`${h.base}/occurrences/${occ.id}/comments`)
      .set(h.nicolas.auth)
      .send({ body: 'Merci !' })
      .expect(201);
    const back = (await http().get(`${h.base}/notifications`).set(h.grace.auth).expect(200))
      .body as { items: { type: string; byName: string }[] };
    expect(back.items[0]).toMatchObject({ type: 'TASK_COMMENT', byName: 'Nicolas' });

    const list = (
      await http().get(`${h.base}/occurrences/${occ.id}/comments`).set(h.nicolas.auth).expect(200)
    ).body as { id: string; body: string }[];
    expect(list.map((x) => x.body)).toEqual(['Le bidon est au garage', 'Merci !']);
    const dto = (await http().get(`${h.base}/occurrences/${occ.id}`).set(h.grace.auth).expect(200))
      .body as { commentCount: number };
    expect(dto.commentCount).toBe(2);

    await http().delete(`${h.base}/comments/${list[0]!.id}`).set(h.nicolas.auth).expect(403);
    await http().delete(`${h.base}/comments/${list[0]!.id}`).set(h.grace.auth).expect(204);
  });

  it('tâche personnelle : commentaires invisibles pour l’autre ; isolation des foyers', async () => {
    const h = await coupleHousehold(app);
    const occ = (
      await http()
        .post(`${h.base}/tasks`)
        .set(h.grace.auth)
        .send({ title: 'Cadeau', date: today, visibility: 'PERSONAL' })
        .expect(201)
    ).body as { id: string };
    await http()
      .post(`${h.base}/occurrences/${occ.id}/comments`)
      .set(h.grace.auth)
      .send({ body: 'Idée : un livre' })
      .expect(201);
    await http().get(`${h.base}/occurrences/${occ.id}/comments`).set(h.nicolas.auth).expect(404);
    const other = await coupleHousehold(app);
    await http()
      .get(`${other.base}/occurrences/${occ.id}/comments`)
      .set(other.grace.auth)
      .expect(404);
  });
});
