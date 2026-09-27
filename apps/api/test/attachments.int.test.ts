import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { safeFilename } from '../src/tasks/attachments.service';
import { coupleHousehold, createTestApp } from './app';

describe('Pièces jointes', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    app = await createTestApp();
  });
  afterAll(() => app.close());

  it('joindre, lire (types dangereux jamais affichés), supprimer ; journal', async () => {
    const h = await coupleHousehold(app);
    const t = await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({ title: 'Garantie frigo' })
      .expect(201);
    const up = await http()
      .post(`${h.base}/occurrences/${t.body.id}/attachments`)
      .set(h.grace.auth)
      .attach('file', Buffer.from('%PDF-1.4'), {
        filename: 'garantie été.pdf',
        contentType: 'application/pdf',
      })
      .expect(201);
    expect(up.body.attachments).toEqual([
      expect.objectContaining({
        filename: 'garantie été.pdf',
        contentType: 'application/pdf',
        size: 8,
      }),
    ]);
    const html = await http()
      .post(`${h.base}/occurrences/${t.body.id}/attachments`)
      .set(h.grace.auth)
      .attach('file', Buffer.from('<script>alert(1)</script>'), {
        filename: 'x.html',
        contentType: 'text/html',
      })
      .expect(201);
    const htmlId = html.body.attachments[1].id;

    const pdf = await http()
      .get(`${h.base}/attachments/${up.body.attachments[0].id}`)
      .set(h.nicolas.auth)
      .expect(200);
    expect(pdf.headers['content-disposition']).toBe(
      "inline; filename*=UTF-8''garantie%20%C3%A9t%C3%A9.pdf",
    );
    const dangerous = await http()
      .get(`${h.base}/attachments/${htmlId}`)
      .set(h.nicolas.auth)
      .expect(200);
    expect(dangerous.headers['content-type']).toBe('application/octet-stream');
    expect(dangerous.headers['content-disposition']).toMatch(/^attachment;/);
    expect(dangerous.headers['content-security-policy']).toContain('sandbox');

    await http().delete(`${h.base}/attachments/${htmlId}`).set(h.nicolas.auth).expect(204);
    const after = (await http().get(`${h.base}/occurrences/${t.body.id}`).set(h.grace.auth)).body;
    expect(after.attachments).toHaveLength(1);
    const log = (await http().get(`${h.base}/activity`).set(h.grace.auth)).body;
    expect(log.items.slice(0, 3).map((i: { action: string }) => i.action)).toEqual([
      'attachment.deleted',
      'attachment.added',
      'attachment.added',
    ]);
  });

  it('isolation, tâche personnelle, taille maximale', async () => {
    const h = await coupleHousehold(app);
    const other = await coupleHousehold(app);
    const secret = await http()
      .post(`${h.base}/tasks`)
      .set(h.grace.auth)
      .send({ title: 'Cadeau', visibility: 'PERSONAL' })
      .expect(201);
    const up = await http()
      .post(`${h.base}/occurrences/${secret.body.id}/attachments`)
      .set(h.grace.auth)
      .attach('file', Buffer.from('idée'), 'idee.txt')
      .expect(201);
    const id = up.body.attachments[0].id;
    await http().get(`${h.base}/attachments/${id}`).set(h.nicolas.auth).expect(404);
    await http().delete(`${h.base}/attachments/${id}`).set(h.nicolas.auth).expect(404);
    await http().get(`${other.base}/attachments/${id}`).set(other.grace.auth).expect(404);
    await http()
      .post(`${h.base}/occurrences/${secret.body.id}/attachments`)
      .set(h.nicolas.auth)
      .attach('file', Buffer.from('x'), 'x.txt')
      .expect(404);

    const big = await http()
      .post(`${h.base}/occurrences/${secret.body.id}/attachments`)
      .set(h.grace.auth)
      .attach('file', Buffer.alloc(10 * 1024 * 1024 + 10), 'gros.bin')
      .expect(413);
    expect(big.body.error.code).toBe('ATTACHMENT_TOO_LARGE');
  });

  it('noms de fichiers sûrs', () => {
    expect(safeFilename('../../etc/passwd')).toBe('passwd');
    expect(safeFilename('C:\\\\a\\\\b.txt')).toBe('b.txt');
    expect(safeFilename('a"\u0000b.pdf')).toBe('ab.pdf');
    expect(safeFilename('')).toBe('fichier');
  });
});
