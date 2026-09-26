import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, registerUser } from './app';

describe('Foyers & isolation multi-tenant (intégration)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(async () => {
    await app.close();
  });

  async function coupleHousehold() {
    const nicolas = await registerUser(app, 'Nicolas');
    const grace = await registerUser(app, 'Grace');
    const created = await http()
      .post('/v1/households')
      .set(nicolas.auth)
      .send({ name: 'G & N' })
      .expect(201);
    const householdId = created.body.id as string;
    const invite = await http()
      .post(`/v1/households/${householdId}/invitations`)
      .set(nicolas.auth)
      .send({})
      .expect(201);
    await http()
      .post('/v1/invitations/accept')
      .set(grace.auth)
      .send({ token: invite.body.token })
      .expect(201);
    return { nicolas, grace, householdId, inviteToken: invite.body.token as string };
  }

  it('crée un foyer avec les 13 catégories par défaut, en français', async () => {
    const { nicolas, householdId } = await coupleHousehold();
    const res = await http()
      .get(`/v1/households/${householdId}/categories`)
      .set(nicolas.auth)
      .expect(200);
    expect(res.body).toHaveLength(13);
    expect(res.body[0]).toMatchObject({ name: 'Maison', emoji: '🏠', position: 0 });
    expect(res.body.map((c: { name: string }) => c.name)).toContain('Ménage');
  });

  it('invitation : Grace rejoint le foyer de Nicolas avec une autre couleur', async () => {
    const { grace, householdId } = await coupleHousehold();
    const res = await http().get(`/v1/households/${householdId}`).set(grace.auth).expect(200);
    expect(res.body.timezone).toBe('Europe/Brussels');
    expect(res.body.members.map((m: { displayName: string }) => m.displayName)).toEqual([
      'Nicolas',
      'Grace',
    ]);
    expect(res.body.members[0].role).toBe('OWNER');
    expect(res.body.members[0].color).not.toBe(res.body.members[1].color);
  });

  it("une invitation n'est utilisable qu'une fois", async () => {
    const { inviteToken } = await coupleHousehold();
    const intruder = await registerUser(app, 'Intrus');
    const res = await http()
      .post('/v1/invitations/accept')
      .set(intruder.auth)
      .send({ token: inviteToken })
      .expect(400);
    expect(res.body.error.code).toBe('INVITATION_INVALID');
  });

  it('invitation nominative : refusée pour un autre email', async () => {
    const nicolas = await registerUser(app, 'Nicolas');
    const other = await registerUser(app, 'Autre');
    const h = await http()
      .post('/v1/households')
      .set(nicolas.auth)
      .send({ name: 'Maison' })
      .expect(201);
    const invite = await http()
      .post(`/v1/households/${h.body.id}/invitations`)
      .set(nicolas.auth)
      .send({ email: 'grace@example.test' })
      .expect(201);
    await http()
      .post('/v1/invitations/accept')
      .set(other.auth)
      .send({ token: invite.body.token })
      .expect(400);
  });

  it("ISOLATION : un utilisateur ne peut pas lire un autre foyer en changeant l'id (404, pas 403)", async () => {
    const { householdId } = await coupleHousehold();
    const stranger = await registerUser(app, 'Voisin');
    const own = await http()
      .post('/v1/households')
      .set(stranger.auth)
      .send({ name: 'Voisins' })
      .expect(201);

    for (const path of ['', '/categories']) {
      const res = await http()
        .get(`/v1/households/${householdId}${path}`)
        .set(stranger.auth)
        .expect(404);
      expect(res.body.error.code).toBe('HOUSEHOLD_NOT_FOUND');
    }
    await http()
      .post(`/v1/households/${householdId}/invitations`)
      .set(stranger.auth)
      .send({})
      .expect(404);

    // Son propre foyer reste accessible ; la liste ne contient que ses foyers.
    await http().get(`/v1/households/${own.body.id}`).set(stranger.auth).expect(200);
    const list = await http().get('/v1/households').set(stranger.auth).expect(200);
    expect(list.body.map((h: { id: string }) => h.id)).toEqual([own.body.id]);
  });

  it('ISOLATION : identifiants malformés ou inexistants ⇒ 404', async () => {
    const user = await registerUser(app, 'Grace');
    await http().get('/v1/households/not-a-uuid').set(user.auth).expect(404);
    await http()
      .get('/v1/households/00000000-0000-4000-8000-000000000000')
      .set(user.auth)
      .expect(404);
  });

  it('les routes foyer exigent une authentification', async () => {
    const { householdId } = await coupleHousehold();
    await http().get(`/v1/households/${householdId}`).expect(401);
  });

  it('validation : nom vide et fuseau invalide ⇒ 400 VALIDATION_FAILED', async () => {
    const user = await registerUser(app, 'Grace');
    const res = await http()
      .post('/v1/households')
      .set(user.auth)
      .send({ name: '', timezone: 'Mars/Olympus' })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});
