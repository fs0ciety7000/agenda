import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CSRF, coupleHousehold, createTestApp, registerUser } from './app';

describe('Notes partagées', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('créer, lister (épinglées d’abord), modifier, supprimer ; visible par l’autre membre', async () => {
    const h = await coupleHousehold(app);
    const wifi = await http()
      .post(`${h.base}/notes`)
      .set(h.grace.auth)
      .send({ title: '  Wi-Fi  ', body: 'Réseau : Maison\nCode : 1234' })
      .expect(201);
    expect(wifi.body).toMatchObject({
      title: 'Wi-Fi',
      pinned: false,
      version: 1,
      createdById: h.grace.memberId,
    });
    await http()
      .post(`${h.base}/notes`)
      .set(h.nicolas.auth)
      .send({ title: 'Idées cadeaux', pinned: true })
      .expect(201);
    await http().post(`${h.base}/notes`).set(h.grace.auth).send({ title: '' }).expect(400);

    const list = await http().get(`${h.base}/notes`).set(h.nicolas.auth).expect(200);
    expect(list.body.map((n: { title: string }) => n.title)).toEqual(['Idées cadeaux', 'Wi-Fi']);

    // Nicolas modifie la note de Grace.
    const edited = await http()
      .patch(`${h.base}/notes/${wifi.body.id}`)
      .set(h.nicolas.auth)
      .send({ body: 'Code : 5678', pinned: true, version: 1 })
      .expect(200);
    expect(edited.body).toMatchObject({
      body: 'Code : 5678',
      pinned: true,
      version: 2,
      updatedById: h.nicolas.memberId,
    });

    await http().delete(`${h.base}/notes/${wifi.body.id}`).set(h.grace.auth).expect(204);
    await http().delete(`${h.base}/notes/${wifi.body.id}`).set(h.grace.auth).expect(404);
  });

  it('modification simultanée : 409 avec la version actuelle', async () => {
    const h = await coupleHousehold(app);
    const note = await http()
      .post(`${h.base}/notes`)
      .set(h.grace.auth)
      .send({ title: 'Mesures', body: 'Fenêtre : 120 cm' })
      .expect(201);
    await http()
      .patch(`${h.base}/notes/${note.body.id}`)
      .set(h.nicolas.auth)
      .send({ body: 'Fenêtre : 125 cm', version: 1 })
      .expect(200);
    const conflict = await http()
      .patch(`${h.base}/notes/${note.body.id}`)
      .set(h.grace.auth)
      .send({ body: 'Fenêtre : 118 cm', version: 1 })
      .expect(409);
    expect(conflict.body.error.code).toBe('VERSION_CONFLICT');
    expect(conflict.body.error.details.current).toMatchObject({
      body: 'Fenêtre : 125 cm',
      version: 2,
    });
  });

  it('aucun accès depuis un autre foyer, même avec l’identifiant', async () => {
    const h = await coupleHousehold(app);
    const note = await http()
      .post(`${h.base}/notes`)
      .set(h.grace.auth)
      .send({ title: 'Code alarme', body: '0000' })
      .expect(201);
    const other = await coupleHousehold(app);
    // Un membre d'un autre foyer ne voit rien, ni par la liste, ni par l'identifiant.
    expect(
      (await http().get(`${other.base}/notes`).set(other.grace.auth).expect(200)).body,
    ).toEqual([]);
    await http()
      .patch(`${other.base}/notes/${note.body.id}`)
      .set(other.grace.auth)
      .send({ title: 'Piraté', version: 1 })
      .expect(404);
    await http().delete(`${other.base}/notes/${note.body.id}`).set(other.grace.auth).expect(404);
    const outsider = await registerUser(app, 'Intrus');
    await http().get(`${h.base}/notes`).set(outsider.auth).expect(404);

    const exported = await http().get('/v1/me/export').set(h.grace.auth).expect(200);
    expect(exported.body.notesCreated).toEqual([
      expect.objectContaining({ title: 'Code alarme', body: '0000' }),
    ]);
  });

  it('historique : chaque modification garde l’ancienne version, restaurable', async () => {
    const h = await coupleHousehold(app);
    const url = `${h.base}/notes`;
    const note = await http()
      .post(url)
      .set(h.grace.auth)
      .send({ title: 'Wi-Fi', body: 'zèbre-42' })
      .expect(201);
    const id = note.body.id as string;
    // Épingler ne crée pas de version ; changer le texte, si.
    await http()
      .patch(`${url}/${id}`)
      .set(h.grace.auth)
      .send({ pinned: true, version: 1 })
      .expect(200);
    await http()
      .patch(`${url}/${id}`)
      .set(h.nicolas.auth)
      .send({ body: 'girafe-7', version: 2 })
      .expect(200);
    const revisions = await http().get(`${url}/${id}/revisions`).set(h.grace.auth).expect(200);
    expect(revisions.body).toEqual([
      expect.objectContaining({
        title: 'Wi-Fi',
        body: 'zèbre-42',
        version: 2,
        editedById: h.grace.memberId,
      }),
    ]);

    // Restaurer : version périmée refusée, puis restauration ; le texte remplacé est gardé.
    const revisionId = revisions.body[0].id as string;
    await http()
      .post(`${url}/${id}/revisions/${revisionId}/restore`)
      .set(h.grace.auth)
      .send({ version: 2 })
      .expect(409);
    const restored = await http()
      .post(`${url}/${id}/revisions/${revisionId}/restore`)
      .set(h.grace.auth)
      .send({ version: 3 })
      .expect(200);
    expect(restored.body).toMatchObject({ body: 'zèbre-42', version: 4, pinned: true });
    const after = await http().get(`${url}/${id}/revisions`).set(h.grace.auth).expect(200);
    expect(after.body.map((r: { body: string }) => r.body)).toEqual(['girafe-7', 'zèbre-42']);

    // Export RGPD : les versions écrites par la personne.
    const exported = await http().get('/v1/me/export').set(h.nicolas.auth).expect(200);
    expect(exported.body.noteVersionsWritten).toEqual([
      expect.objectContaining({ body: 'girafe-7', noteTitle: 'Wi-Fi' }),
    ]);

    // Vingt versions au plus.
    for (let v = 4; v < 30; v++) {
      await http()
        .patch(`${url}/${id}`)
        .set(h.grace.auth)
        .send({ body: `texte ${v}`, version: v })
        .expect(200);
    }
    const capped = await http().get(`${url}/${id}/revisions`).set(h.grace.auth).expect(200);
    expect(capped.body).toHaveLength(20);
    expect(capped.body[0].version).toBe(29);

    // Un autre foyer ne voit ni ne restaure rien.
    const other = await coupleHousehold(app);
    await http().get(`${other.base}/notes/${id}/revisions`).set(other.grace.auth).expect(404);
    await http()
      .post(`${other.base}/notes/${id}/revisions/${revisionId}/restore`)
      .set(other.grace.auth)
      .send({ version: 30 })
      .expect(404);
    await http().get(`${h.base}/notes/${id}/revisions`).set(other.grace.auth).expect(404);
  });

  it('note sensible : contenu masqué partout, affiché après vérification', async () => {
    const h = await coupleHousehold(app);
    const url = `${h.base}/notes`;
    const created = await http()
      .post(url)
      .set(h.grace.auth)
      .send({ title: 'Digicode', body: 'A-2468-zèbre', secret: true })
      .expect(201);
    expect(created.body).toMatchObject({ secret: true, body: '' });
    const id = created.body.id as string;

    // Liste, recherche, historique : jamais le contenu.
    const list = await http().get(url).set(h.nicolas.auth).expect(200);
    expect(list.body).toEqual([expect.objectContaining({ title: 'Digicode', body: '' })]);
    const byBody = await http().get(`${h.base}/search?q=2468`).set(h.nicolas.auth).expect(200);
    expect(byBody.body.notes).toEqual([]);
    const byTitle = await http().get(`${h.base}/search?q=Digi`).set(h.nicolas.auth).expect(200);
    expect(byTitle.body.notes).toEqual([{ id, title: 'Digicode', snippet: '' }]);
    await http()
      .patch(`${url}/${id}`)
      .set(h.grace.auth)
      .send({ body: 'B-1357-girafe', version: 1 })
      .expect(200);
    const revisions = await http().get(`${url}/${id}/revisions`).set(h.grace.auth).expect(200);
    expect(revisions.body).toEqual([expect.objectContaining({ body: '' })]);

    // Android (jeton) : vérifié sur l'appareil.
    const android = await http()
      .post(`${url}/${id}/reveal`)
      .set(h.nicolas.auth)
      .send({})
      .expect(200);
    expect(android.body).toEqual({ body: 'B-1357-girafe' });

    // Site (cookie) : mot de passe, puis coffre ouvert pour la session.
    const login = await http()
      .post('/v1/auth/login')
      .set(CSRF)
      .send({ email: h.grace.email, password: 'correct horse battery' })
      .expect(200);
    const web = {
      cookie: (login.headers['set-cookie'] as unknown as string[]).join('; '),
      ...CSRF,
    };
    const locked = await http().post(`${url}/${id}/reveal`).set(web).send({}).expect(403);
    expect(locked.body.error).toMatchObject({
      code: 'VAULT_LOCKED',
      details: { method: 'password' },
    });
    const wrong = await http()
      .post(`${url}/${id}/reveal`)
      .set(web)
      .send({ password: 'pas le bon' })
      .expect(403);
    expect(wrong.body.error.code).toBe('CURRENT_PASSWORD_INVALID');
    await http()
      .post(`${url}/${id}/reveal`)
      .set(web)
      .send({ password: 'correct horse battery' })
      .expect(200);
    const again = await http().post(`${url}/${id}/reveal`).set(web).send({}).expect(200);
    expect(again.body).toEqual({ body: 'B-1357-girafe' });

    // Un autre foyer : rien. L'export RGPD, lui, rend le contenu à son auteur.
    const other = await coupleHousehold(app);
    await http()
      .post(`${other.base}/notes/${id}/reveal`)
      .set(other.grace.auth)
      .send({})
      .expect(404);
    await http().post(`${h.base}/notes/${id}/reveal`).set(other.grace.auth).send({}).expect(404);
    const exported = await http().get('/v1/me/export').set(h.grace.auth).expect(200);
    expect(exported.body.notesCreated).toEqual([
      expect.objectContaining({ title: 'Digicode', body: 'B-1357-girafe' }),
    ]);
  });
});
