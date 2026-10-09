import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { todayIn } from '@agenda/domain';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { coupleHousehold, createTestApp } from './app';

/** Ticket fictif : total 6,94 €, daté du 05/10/2026 (Tesseract installé sur la machine). */
const RECEIPT = readFileSync(join(__dirname, 'fixtures/receipt-fr.png'));

describe('Lecture d’une photo de ticket', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('propose montant, date et commerçant ; la photo n’est pas enregistrée', async () => {
    const h = await coupleHousehold(app);
    const res = await http()
      .post(`${h.base}/expenses/receipt/scan`)
      .set(h.grace.auth)
      .attach('file', RECEIPT, { filename: 'ticket.png', contentType: 'image/png' })
      .expect(200);
    // Date du ticket retenue tant qu'elle a moins de deux ans (sinon jugée improbable).
    const twoYearsAgo = `${Number(todayIn('Europe/Brussels').slice(0, 4)) - 2}${todayIn('Europe/Brussels').slice(4)}`;
    expect(res.body).toEqual({
      amountCents: 694,
      date: '2026-10-05' >= twoYearsAgo ? '2026-10-05' : null,
      merchant: 'Epicerie Des Tilleuls',
    });
    // Rien n'est ajouté au foyer : ni dépense, ni ticket stocké.
    const list = await http()
      .get(`${h.base}/expenses?month=${todayIn('Europe/Brussels').slice(0, 7)}`)
      .set(h.grace.auth)
      .expect(200);
    expect(list.body).toEqual([]);
  });

  it(
    'photos difficiles : tournée, penchée sur une table, terne, orientée par l’EXIF',
    { timeout: 60_000 },
    async () => {
      const h = await coupleHousehold(app);
      const twoYearsAgo = `${Number(todayIn('Europe/Brussels').slice(0, 4)) - 2}${todayIn('Europe/Brussels').slice(4)}`;
      for (const [file, type] of [
        ['receipt-rot90.png', 'image/png'],
        ['receipt-table-skew.jpg', 'image/jpeg'],
        ['receipt-small-dull.jpg', 'image/jpeg'],
        ['receipt-exif-rot.jpg', 'image/jpeg'],
      ] as const) {
        const res = await http()
          .post(`${h.base}/expenses/receipt/scan`)
          .set(h.grace.auth)
          .attach('file', readFileSync(join(__dirname, 'fixtures', file)), {
            filename: file,
            contentType: type,
          })
          .expect(200);
        expect(res.body, file).toEqual({
          amountCents: 2573,
          date: '2026-10-05' >= twoYearsAgo ? '2026-10-05' : null,
          merchant: 'Epicerie Des Tilleuls',
        });
      }
    },
  );

  it('refuse un autre foyer, un format non lisible et l’absence de fichier', async () => {
    const h = await coupleHousehold(app);
    const other = await coupleHousehold(app);
    await http()
      .post(`${h.base}/expenses/receipt/scan`)
      .set(other.grace.auth)
      .attach('file', RECEIPT, { filename: 'ticket.png', contentType: 'image/png' })
      .expect(404);
    await http()
      .post(`${h.base}/expenses/receipt/scan`)
      .set(h.grace.auth)
      .attach('file', Buffer.from('%PDF-1.4'), {
        filename: 'ticket.pdf',
        contentType: 'application/pdf',
      })
      .expect(415);
    await http().post(`${h.base}/expenses/receipt/scan`).set(h.grace.auth).expect(400);
  });

  it('faux fichier image : rien de lu, et jamais un fichier du serveur', async () => {
    const h = await coupleHousehold(app);
    const none = { amountCents: null, date: null, merchant: null };
    // Tesseract lirait ce texte comme un chemin : le ticket du test serait lu depuis le disque.
    const path = join(__dirname, 'fixtures/receipt-fr.png');
    for (const body of [Buffer.from(path), Buffer.from('not really a png')]) {
      const res = await http()
        .post(`${h.base}/expenses/receipt/scan`)
        .set(h.grace.auth)
        .attach('file', body, { filename: 'ticket.png', contentType: 'image/png' })
        .expect(200);
      expect(res.body).toEqual(none);
    }
    // En-tête PNG correct, contenu abîmé : rien de lu non plus.
    const broken = Buffer.concat([RECEIPT.subarray(0, 64), Buffer.alloc(64)]);
    const res = await http()
      .post(`${h.base}/expenses/receipt/scan`)
      .set(h.grace.auth)
      .attach('file', broken, { filename: 'ticket.png', contentType: 'image/png' })
      .expect(200);
    expect(res.body).toEqual(none);
  });
});
