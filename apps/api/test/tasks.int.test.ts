import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { addDays, todayIn } from '@agenda/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coupleHousehold, createTestApp, registerUser } from './app';

describe('Tâches (intégration)', () => {
  let app: INestApplication;
  const prisma = new PrismaClient();
  const http = () => request(app.getHttpServer());
  const today = () => todayIn('Europe/Brussels');

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it('création minimale (titre seul) → « sans date », non attribuée', async () => {
    const h = await coupleHousehold(app);
    const res = await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({ title: 'Appeler le plombier' })
      .expect(201);
    expect(res.body).toMatchObject({
      title: 'Appeler le plombier',
      status: 'TODO',
      date: null,
      assigneeIds: [],
      visibility: 'SHARED',
      priority: 'NORMAL',
      isRecurring: false,
      version: 1,
      createdById: h.grace.memberId,
    });
    const unscheduled = await http()
      .get(`${h.base}/occurrences?view=unscheduled`)
      .set(h.nicolas.auth)
      .expect(200);
    expect(unscheduled.body.map((o: { id: string }) => o.id)).toEqual([res.body.id]);
  });

  it('création complète : horaires calculés dans le fuseau du foyer (été/hiver)', async () => {
    const h = await coupleHousehold(app);
    const summer = await http()
      .post(`${h.base}/tasks`)
      .set(h.nicolas.auth)
      .send({
        title: 'Salle de bain',
        date: '2026-09-26',
        startMinute: 600,
        durationMinutes: 45,
        assigneeIds: [h.nicolas.memberId],
      })
      .expect(201);
    const winter = await http()
      .post(`${h.base}/tasks`)
      .set(h.nicolas.auth)
      .send({ title: 'Salle de bain', date: '2026-12-05', startMinute: 600, durationMinutes: 45 })
      .expect(201);
    const rows = await prisma.taskOccurrence.findMany({
      where: { id: { in: [summer.body.id, winter.body.id] } },
    });
    const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(byId[summer.body.id]!.startsAt!.toISOString()).toBe('2026-09-26T08:00:00.000Z');
    expect(byId[summer.body.id]!.endsAt!.toISOString()).toBe('2026-09-26T08:45:00.000Z');
    expect(byId[winter.body.id]!.startsAt!.toISOString()).toBe('2026-12-05T09:00:00.000Z');
  });

  it('quick add : « Sortir les poubelles demain 19h @nicolas #ménage »', async () => {
    const h = await coupleHousehold(app);
    const res = await http()
      .post(`${h.base}/tasks/quick`)
      .set(h.grace.auth)
      .send({ text: 'Sortir les poubelles demain 19h @nicolas #ménage' })
      .expect(201);
    expect(res.body).toMatchObject({
      title: 'Sortir les poubelles',
      date: addDays(today(), 1),
      startMinute: 1140,
      assigneeIds: [h.nicolas.memberId],
      category: { name: 'Ménage', emoji: '🧹' },
    });
    const preview = await http()
      .post(`${h.base}/quick-add/parse`)
      .set(h.grace.auth)
      .send({ text: 'Courses @nous' })
      .expect(200);
    expect(preview.body.assigneeIds.sort()).toEqual([h.grace.memberId, h.nicolas.memberId].sort());
    const empty = await http()
      .post(`${h.base}/tasks/quick`)
      .set(h.grace.auth)
      .send({ text: 'demain 19h' })
      .expect(400);
    expect(empty.body.error.code).toBe('TASK_TITLE_REQUIRED');
  });

  it('vues : aujourd’hui, à venir, en retard, terminées', async () => {
    const h = await coupleHousehold(app);
    const make = (title: string, date: string) =>
      http().post(`${h.base}/tasks`).set(h.grace.auth).send({ title, date }).expect(201);
    const t = await make('Aujourd’hui', today());
    const u = await make('Demain', addDays(today(), 1));
    const o = await make('Hier', addDays(today(), -1));
    const ids = async (view: string) =>
      (
        await http().get(`${h.base}/occurrences?view=${view}`).set(h.grace.auth).expect(200)
      ).body.map((x: { id: string }) => x.id);
    expect(await ids('today')).toEqual([t.body.id]);
    expect(await ids('upcoming')).toEqual([u.body.id]);
    expect(await ids('overdue')).toEqual([o.body.id]);
    await http().post(`${h.base}/occurrences/${o.body.id}/complete`).set(h.grace.auth).expect(200);
    expect(await ids('overdue')).toEqual([]);
    expect(await ids('done')).toEqual([o.body.id]);
  });

  it('cocher est idempotent ; décocher annule', async () => {
    const h = await coupleHousehold(app);
    const t = await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({ title: 'Lessive' })
      .expect(201);
    const done1 = await http()
      .post(`${h.base}/occurrences/${t.body.id}/complete`)
      .set(h.nicolas.auth)
      .expect(200);
    const done2 = await http()
      .post(`${h.base}/occurrences/${t.body.id}/complete`)
      .set(h.grace.auth)
      .expect(200);
    expect(done1.body).toMatchObject({
      status: 'DONE',
      completedById: h.nicolas.memberId,
      version: 2,
    });
    expect(done2.body).toEqual(done1.body); // rejeu sans effet
    const reopened = await http()
      .post(`${h.base}/occurrences/${t.body.id}/reopen`)
      .set(h.grace.auth)
      .expect(200);
    expect(reopened.body).toMatchObject({
      status: 'TODO',
      completedAt: null,
      completedById: null,
      version: 3,
    });
  });

  it('modification : changement de responsable, de date, retrait de la date', async () => {
    const h = await coupleHousehold(app);
    const t = await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({ title: 'Courses', date: today(), startMinute: 1080, assigneeIds: [h.grace.memberId] })
      .expect(201);
    const both = await http()
      .patch(`${h.base}/occurrences/${t.body.id}`)
      .set(h.nicolas.auth)
      .send({ version: 1, assigneeIds: [h.grace.memberId, h.nicolas.memberId], priority: 'HIGH' })
      .expect(200);
    expect(both.body).toMatchObject({ priority: 'HIGH', startMinute: 1080, version: 2 });
    expect(both.body.assigneeIds).toHaveLength(2);
    const undated = await http()
      .patch(`${h.base}/occurrences/${t.body.id}`)
      .set(h.nicolas.auth)
      .send({ version: 2, date: null })
      .expect(200);
    expect(undated.body).toMatchObject({ date: null, startMinute: null });
    const bad = await http()
      .patch(`${h.base}/occurrences/${t.body.id}`)
      .set(h.nicolas.auth)
      .send({ version: 3, startMinute: 600 })
      .expect(400);
    expect(bad.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('CONFLIT : une modification basée sur une version périmée renvoie 409 + état actuel', async () => {
    const h = await coupleHousehold(app);
    const t = await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({ title: 'Vaisselle' })
      .expect(201);
    await http()
      .patch(`${h.base}/occurrences/${t.body.id}`)
      .set(h.grace.auth)
      .send({ version: 1, title: 'Vaisselle (G)' })
      .expect(200);
    const res = await http()
      .patch(`${h.base}/occurrences/${t.body.id}`)
      .set(h.nicolas.auth)
      .send({ version: 1, title: 'Vaisselle (N)' })
      .expect(409);
    expect(res.body.error.code).toBe('VERSION_CONFLICT');
    expect(res.body.error.details.current).toMatchObject({ title: 'Vaisselle (G)', version: 2 });
  });

  it('suppression : la tâche disparaît pour tout le monde', async () => {
    const h = await coupleHousehold(app);
    const t = await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({ title: 'Doublon' })
      .expect(201);
    await http().delete(`${h.base}/occurrences/${t.body.id}`).set(h.nicolas.auth).expect(204);
    await http().get(`${h.base}/occurrences/${t.body.id}`).set(h.grace.auth).expect(404);
    const all = await http().get(`${h.base}/occurrences`).set(h.grace.auth).expect(200);
    expect(all.body).toEqual([]);
  });

  it('VIE PRIVÉE : une tâche personnelle est invisible et inaccessible pour le partenaire', async () => {
    const h = await coupleHousehold(app);
    const perso = await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({
        title: 'Cadeau pour Nicolas',
        visibility: 'PERSONAL',
        date: today(),
        assigneeIds: [h.nicolas.memberId],
      })
      .expect(201);
    // Une tâche personnelle est toujours attribuée à son créateur.
    expect(perso.body.assigneeIds).toEqual([h.grace.memberId]);

    const nicolasSees = await http().get(`${h.base}/occurrences`).set(h.nicolas.auth).expect(200);
    expect(nicolasSees.body).toEqual([]);
    await http().get(`${h.base}/occurrences/${perso.body.id}`).set(h.nicolas.auth).expect(404);
    await http()
      .patch(`${h.base}/occurrences/${perso.body.id}`)
      .set(h.nicolas.auth)
      .send({ version: 1, title: 'x' })
      .expect(404);
    await http()
      .post(`${h.base}/occurrences/${perso.body.id}/complete`)
      .set(h.nicolas.auth)
      .expect(404);
    await http().delete(`${h.base}/occurrences/${perso.body.id}`).set(h.nicolas.auth).expect(404);
    const search = await http()
      .get(`${h.base}/occurrences?q=cadeau`)
      .set(h.nicolas.auth)
      .expect(200);
    expect(search.body).toEqual([]);
    const balance = await http().get(`${h.base}/balance`).set(h.nicolas.auth).expect(200);
    expect(balance.body.members.every((m: { count: number }) => m.count === 0)).toBe(true);

    const graceSees = await http()
      .get(`${h.base}/occurrences?visibility=PERSONAL`)
      .set(h.grace.auth)
      .expect(200);
    expect(graceSees.body.map((o: { id: string }) => o.id)).toEqual([perso.body.id]);
  });

  it("VIE PRIVÉE : seul le créateur peut changer la visibilité d'une tâche", async () => {
    const h = await coupleHousehold(app);
    const t = await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({ title: 'Partagée' })
      .expect(201);
    await http()
      .patch(`${h.base}/occurrences/${t.body.id}`)
      .set(h.nicolas.auth)
      .send({ version: 1, visibility: 'PERSONAL' })
      .expect(403);
  });

  it('ISOLATION : aucun accès aux tâches d’un autre foyer, même avec les bons identifiants', async () => {
    const h = await coupleHousehold(app);
    const t = await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({ title: 'Secret du foyer' })
      .expect(201);
    const stranger = await registerUser(app, 'Voisin');
    const other = await http()
      .post('/v1/households')
      .set(stranger.auth)
      .send({ name: 'Voisins' })
      .expect(201);
    const otherBase = `/v1/households/${other.body.id}`;

    // Via son propre foyer + l'id d'occurrence d'autrui : 404 partout.
    await http().get(`${otherBase}/occurrences/${t.body.id}`).set(stranger.auth).expect(404);
    await http()
      .patch(`${otherBase}/occurrences/${t.body.id}`)
      .set(stranger.auth)
      .send({ version: 1, title: 'pwned' })
      .expect(404);
    await http()
      .post(`${otherBase}/occurrences/${t.body.id}/complete`)
      .set(stranger.auth)
      .expect(404);
    await http().delete(`${otherBase}/occurrences/${t.body.id}`).set(stranger.auth).expect(404);
    // Via le foyer d'autrui : 404 (non-membre).
    await http().get(`${h.base}/occurrences`).set(stranger.auth).expect(404);
    await http().post(`${h.base}/tasks`).set(stranger.auth).send({ title: 'intrus' }).expect(404);

    // Références étrangères refusées : responsable et catégorie d'un autre foyer.
    const res = await http()
      .post(`${otherBase}/tasks`)
      .set(stranger.auth)
      .send({ title: 'x', assigneeIds: [h.grace.memberId] })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    const cats = await http().get(`${h.base}/categories`).set(h.grace.auth).expect(200);
    await http()
      .post(`${otherBase}/tasks`)
      .set(stranger.auth)
      .send({ title: 'x', categoryId: cats.body[0].id })
      .expect(400);

    const unchanged = await http()
      .get(`${h.base}/occurrences/${t.body.id}`)
      .set(h.grace.auth)
      .expect(200);
    expect(unchanged.body).toMatchObject({ title: 'Secret du foyer', status: 'TODO', version: 1 });
  });

  it('filtres : personne, à deux, à définir, catégorie, priorité, recherche', async () => {
    const h = await coupleHousehold(app);
    const cats = (await http().get(`${h.base}/categories`).set(h.grace.auth)).body as {
      id: string;
      name: string;
    }[];
    const courses = cats.find((c) => c.name === 'Courses')!.id;
    const post = (body: object) =>
      http().post(`${h.base}/tasks`).set(h.grace.auth).send(body).expect(201);
    const g = await post({
      title: 'Pharmacie',
      assigneeIds: [h.grace.memberId],
      categoryId: courses,
    });
    const n = await post({
      title: 'Poubelles',
      assigneeIds: [h.nicolas.memberId],
      priority: 'URGENT',
    });
    const both = await post({
      title: 'Grand ménage',
      assigneeIds: [h.grace.memberId, h.nicolas.memberId],
    });
    const none = await post({ title: 'Réparer la porte' });
    const ids = async (qs: string, who = h.grace) =>
      (await http().get(`${h.base}/occurrences?${qs}`).set(who.auth).expect(200)).body
        .map((x: { id: string }) => x.id)
        .sort();

    expect(await ids(`assignee=${h.nicolas.memberId}`)).toEqual([n.body.id, both.body.id].sort());
    expect(await ids('assignee=me')).toEqual([g.body.id, both.body.id].sort());
    expect(await ids('assignee=me', h.nicolas)).toEqual([n.body.id, both.body.id].sort());
    expect(await ids('assignee=together')).toEqual([both.body.id]);
    expect(await ids('assignee=unassigned')).toEqual([none.body.id]);
    expect(await ids(`categoryId=${courses}`)).toEqual([g.body.id]);
    expect(await ids('priority=URGENT')).toEqual([n.body.id]);
    expect(await ids('q=MÉNAGE')).toEqual([both.body.id]);
    await http().get(`${h.base}/occurrences?assignee=grace`).set(h.grace.auth).expect(400);
  });

  it('répartition de la semaine : par personne, à deux, à définir, minutes estimées', async () => {
    const h = await coupleHousehold(app);
    const post = (body: object) =>
      http()
        .post(`${h.base}/tasks`)
        .set(h.grace.auth)
        .send({ date: today(), ...body })
        .expect(201);
    await post({ title: 'A', assigneeIds: [h.grace.memberId], durationMinutes: 30 });
    await post({ title: 'B', assigneeIds: [h.grace.memberId], durationMinutes: 15 });
    await post({ title: 'C', assigneeIds: [h.nicolas.memberId] });
    await post({
      title: 'D',
      assigneeIds: [h.grace.memberId, h.nicolas.memberId],
      durationMinutes: 60,
    });
    await post({ title: 'E' });
    await post({ title: 'F', date: addDays(today(), 30), assigneeIds: [h.nicolas.memberId] }); // hors semaine
    const res = await http().get(`${h.base}/balance`).set(h.nicolas.auth).expect(200);
    const byMember = Object.fromEntries(
      res.body.members.map((m: { memberId: string }) => [m.memberId, m]),
    );
    expect(byMember[h.grace.memberId]).toMatchObject({ count: 2, minutes: 45 });
    expect(byMember[h.nicolas.memberId]).toMatchObject({ count: 1, minutes: 0 });
    expect(res.body.together).toEqual({ count: 1, minutes: 60 });
    expect(res.body.unassigned).toEqual({ count: 1, minutes: 0 });
  });

  it('journal d’activité : titre et noms de champs, jamais le contenu des notes', async () => {
    const h = await coupleHousehold(app);
    const t = await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({ title: 'Titre', notes: 'Code de la porte : zèbre' })
      .expect(201);
    await http()
      .patch(`${h.base}/occurrences/${t.body.id}`)
      .set(h.grace.auth)
      .send({ version: 1, title: 'Nouveau titre', notes: 'Code : girafe' })
      .expect(200);
    const logs = await prisma.activityLog.findMany({
      where: { householdId: h.householdId },
      orderBy: { createdAt: 'asc' },
    });
    expect(logs.map((l) => [l.action, l.title])).toEqual([
      ['task.created', 'Titre'],
      ['occurrence.updated', 'Nouveau titre'],
    ]);
    expect(logs[1]!.data).toMatchObject({ fields: ['title', 'notes'] });
    // Mots absents des identifiants (des chiffres comme « 5678 » peuvent tomber dans un UUID).
    expect(JSON.stringify(logs)).not.toMatch(/zèbre|girafe/);
  });
});

describe('Catégories (intégration)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  it('créer, renommer, refuser un doublon (insensible à la casse), supprimer', async () => {
    const h = await coupleHousehold(app);
    const created = await http()
      .post(`${h.base}/categories`)
      .set(h.grace.auth)
      .send({ name: 'Jardin', emoji: '🌷' })
      .expect(201);
    expect(created.body.position).toBe(13);
    const dup = await http()
      .post(`${h.base}/categories`)
      .set(h.nicolas.auth)
      .send({ name: 'jardin' })
      .expect(409);
    expect(dup.body.error.code).toBe('CATEGORY_NAME_TAKEN');
    await http()
      .patch(`${h.base}/categories/${created.body.id}`)
      .set(h.nicolas.auth)
      .send({ name: 'Potager' })
      .expect(200);

    const task = await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({ title: 'Semer', categoryId: created.body.id })
      .expect(201);
    await http().delete(`${h.base}/categories/${created.body.id}`).set(h.grace.auth).expect(204);
    const after = await http()
      .get(`${h.base}/occurrences/${task.body.id}`)
      .set(h.grace.auth)
      .expect(200);
    expect(after.body.category).toBeNull();
    // Le nom est de nouveau disponible après suppression.
    await http()
      .post(`${h.base}/categories`)
      .set(h.grace.auth)
      .send({ name: 'Potager' })
      .expect(201);
  });

  it('ISOLATION : impossible de modifier une catégorie d’un autre foyer', async () => {
    const h = await coupleHousehold(app);
    const cats = await http().get(`${h.base}/categories`).set(h.grace.auth).expect(200);
    const stranger = await registerUser(app, 'Voisin');
    const other = await http()
      .post('/v1/households')
      .set(stranger.auth)
      .send({ name: 'Voisins' })
      .expect(201);
    await http()
      .patch(`/v1/households/${other.body.id}/categories/${cats.body[0].id}`)
      .set(stranger.auth)
      .send({ name: 'pwned' })
      .expect(404);
    await http()
      .delete(`/v1/households/${other.body.id}/categories/${cats.body[0].id}`)
      .set(stranger.auth)
      .expect(404);
  });
});
