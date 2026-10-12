import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coupleHousehold, createTestApp, registerUser } from './app';

/** Réponse binaire lue en entier. */
const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

const PASSPHRASE = 'quatre mots pour la sauvegarde';

describe('Sauvegarde chiffrée par une phrase de passe', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('fichier .tandem illisible sans la phrase, restauré avec ; phrase fausse ou fichier modifié refusés', async () => {
    const h = await coupleHousehold(app);
    await http()
      .post(`${h.base}/shopping`)
      .set(h.grace.auth)
      .send({ text: 'Café en grains' })
      .expect(201);

    // Phrase trop courte : refusée avant tout.
    await http()
      .post(`${h.base}/backup`)
      .set(h.grace.auth)
      .send({ passphrase: 'court' })
      .expect(400);

    const res = await http()
      .post(`${h.base}/backup`)
      .set(h.grace.auth)
      .send({ passphrase: PASSPHRASE })
      .buffer(true)
      .parse(binary)
      .expect(200);
    expect(res.headers['content-type']).toBe('application/octet-stream');
    expect(res.headers['content-disposition']).toMatch(
      /filename="tandem-foyer-\d{4}-\d{2}-\d{2}\.tandem"/,
    );
    const file = res.body as Buffer;
    expect(file.subarray(0, 8).toString()).toBe('TNDMENC1');
    // Ni signature .zip ni texte du foyer en clair.
    expect(file.includes(Buffer.from('PK\u0003\u0004'))).toBe(false);
    expect(file.includes(Buffer.from('Café en grains'))).toBe(false);

    const restore = (user: { auth: Record<string, string> }, body: Buffer, passphrase?: string) => {
      const req = http()
        .post('/v1/households/restore')
        .set(user.auth)
        .attach('file', body, 'tandem-foyer.tandem');
      return passphrase === undefined ? req : req.field('passphrase', passphrase);
    };
    const emma = await registerUser(app, 'Emma');
    expect((await restore(emma, file).expect(400)).body.error.code).toBe(
      'BACKUP_PASSPHRASE_REQUIRED',
    );
    expect((await restore(emma, file, 'pas la bonne phrase').expect(400)).body.error.code).toBe(
      'BACKUP_PASSPHRASE_INVALID',
    );
    // Un octet changé au milieu : l'étiquette d'authenticité ne correspond plus.
    const tampered = Buffer.from(file);
    const middle = Math.floor(tampered.length / 2);
    tampered[middle] = tampered[middle]! ^ 1;
    expect((await restore(emma, tampered, PASSPHRASE).expect(400)).body.error.code).toBe(
      'BACKUP_PASSPHRASE_INVALID',
    );

    const restored = await restore(emma, file, PASSPHRASE).expect(201);
    expect(restored.body.household.name).toBe('G & N');
    const list = await http()
      .get(`/v1/households/${restored.body.household.id}/shopping`)
      .set(emma.auth)
      .expect(200);
    expect(JSON.stringify(list.body)).toContain('Café en grains');
  });
});
