import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OpenFoodFactsClient } from '../src/shopping/open-food-facts.client';
import { coupleHousehold, createTestApp } from './app';

/** Codes-barres fictifs (test/fixtures/make-barcodes.py) ; zbar installé sur la machine. */
const SHARP = readFileSync(join(__dirname, 'fixtures/barcode-ean13.png'));
const PHOTO = readFileSync(join(__dirname, 'fixtures/barcode-photo.jpg'));
const RECEIPT = readFileSync(join(__dirname, 'fixtures/receipt-fr.png'));
const CODE = '2001234567893';

/** Open Food Facts simulé : seul le code part, compté pour vérifier la mémoire du foyer. */
const off = {
  calls: [] as string[],
  answer: 'Lait demi-écrémé' as string | null | undefined,
  productName(code: string) {
    off.calls.push(code);
    return Promise.resolve(off.answer);
  },
};

describe('Code-barres pour les courses', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp([{ provide: OpenFoodFactsClient, useValue: off }]);
  });
  afterAll(() => app.close());
  beforeEach(() => {
    off.calls = [];
    off.answer = 'Lait demi-écrémé';
  });

  it('photo lue, nom trouvé dans Open Food Facts puis retenu par le foyer', async () => {
    const h = await coupleHousehold(app);
    const scan = (file: Buffer, name: string, type: string) =>
      http()
        .post(`${h.base}/shopping-barcodes/scan`)
        .set(h.grace.auth)
        .attach('file', file, { filename: name, contentType: type });

    expect((await scan(PHOTO, 'photo.jpg', 'image/jpeg').expect(200)).body).toEqual({
      barcode: CODE,
      name: 'Lait demi-écrémé',
      source: 'OPEN_FOOD_FACTS',
    });
    // Deuxième fois (l'autre membre) : mémoire du foyer, pas de nouvelle requête.
    const again = await http()
      .post(`${h.base}/shopping-barcodes/scan`)
      .set(h.nicolas.auth)
      .attach('file', SHARP, { filename: 'code.png', contentType: 'image/png' })
      .expect(200);
    expect(again.body.name).toBe('Lait demi-écrémé');
    expect(off.calls).toEqual([CODE]);

    // Nom corrigé : il l'emporte, pour tout le foyer.
    await http()
      .put(`${h.base}/shopping-barcodes/${CODE}`)
      .set(h.nicolas.auth)
      .send({ name: 'Lait de la ferme' })
      .expect(200);
    expect(
      (await http().get(`${h.base}/shopping-barcodes/${CODE}`).set(h.grace.auth).expect(200)).body,
    ).toEqual({ barcode: CODE, name: 'Lait de la ferme', source: 'HOUSEHOLD' });

    // Pas de code-barres sur la photo, ou pas une image : rien, sans erreur.
    expect((await scan(RECEIPT, 'ticket.png', 'image/png').expect(200)).body).toEqual({
      barcode: null,
      name: null,
      source: null,
    });
    expect(
      (await scan(Buffer.from('/etc/passwd\n'), 'x.png', 'image/png').expect(200)).body.barcode,
    ).toBeNull();
    await scan(Buffer.from('%PDF-1.4'), 'x.pdf', 'application/pdf').expect(415);
  });

  it('produit inconnu ou service muet : code rendu sans nom, rien de retenu', async () => {
    const h = await coupleHousehold(app);
    off.answer = undefined; // Open Food Facts n'a pas répondu
    const res = await http().get(`${h.base}/shopping-barcodes/${CODE}`).set(h.grace.auth);
    expect(res.body).toEqual({ barcode: CODE, name: null, source: null });
    off.answer = null; // inconnu
    await http().get(`${h.base}/shopping-barcodes/${CODE}`).set(h.grace.auth).expect(200);
    expect(off.calls).toEqual([CODE, CODE]);
    // Code mal saisi (clé de contrôle fausse) : refusé avant toute requête.
    await http().get(`${h.base}/shopping-barcodes/2001234567890`).set(h.grace.auth).expect(422);
    await http()
      .put(`${h.base}/shopping-barcodes/2001234567890`)
      .set(h.grace.auth)
      .send({ name: 'x' })
      .expect(422);
    expect(off.calls).toHaveLength(2);
  });

  it('la mémoire reste propre au foyer', async () => {
    const h = await coupleHousehold(app);
    const other = await coupleHousehold(app);
    await http()
      .put(`${h.base}/shopping-barcodes/${CODE}`)
      .set(h.grace.auth)
      .send({ name: 'Notre lait' })
      .expect(200);
    off.answer = null;
    const theirs = await http()
      .get(`${other.base}/shopping-barcodes/${CODE}`)
      .set(other.grace.auth)
      .expect(200);
    expect(theirs.body.name).toBeNull();
    const res = await http().get(`${h.base}/shopping-barcodes/${CODE}`).set(other.grace.auth);
    expect([403, 404]).toContain(res.status);
    await http().get(`${h.base}/shopping-barcodes/${CODE}`).expect(401);
  });
});
