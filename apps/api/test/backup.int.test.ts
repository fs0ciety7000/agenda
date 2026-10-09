import { INestApplication } from '@nestjs/common';
import { addDays, todayIn } from '@agenda/domain';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service';
import { coupleHousehold, createTestApp, CSRF, registerUser } from './app';

/** Réponse binaire (archive .zip) lue en entier. */
const binary = (res: request.Response, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

const PDF = Buffer.from('%PDF-1.4\n% facture fictive\n');
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

describe('Sauvegarde du foyer et restauration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const http = () => request(app.getHttpServer());
  const today = todayIn('Europe/Brussels');

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });
  afterAll(() => app.close());

  /** Un foyer bien rempli : de chaque chose un peu, dont des éléments personnels. */
  async function filledHousehold() {
    const h = await coupleHousehold(app);
    const g = h.grace;
    const n = h.nicolas;
    const post = async (path: string, who: typeof g, body: object) => {
      const res = await http().post(`${h.base}${path}`).set(who.auth).send(body);
      if (res.status !== 201)
        throw new Error(`${path} → ${res.status} ${JSON.stringify(res.body)}`);
      return res;
    };

    const weekly = await post('/tasks', g, {
      title: 'Salle de bain',
      date: today,
      startMinute: 600,
      durationMinutes: 45,
      recurrence: {
        rule: { freq: 'DAILY' },
        rotation: { mode: 'ALTERNATE', memberIds: [g.memberId, n.memberId] },
      },
    });
    // La création renvoie la première occurrence (aujourd'hui).
    const occ = weekly.body as { id: string };
    await http().post(`${h.base}/occurrences/${occ.id}/complete`).set(n.auth).expect(200);
    await post(`/occurrences/${occ.id}/checklist`, n, { text: 'Éponge' });
    await post(`/occurrences/${occ.id}/comments`, g, { body: 'Merci !' });
    await http()
      .post(`${h.base}/occurrences/${occ.id}/attachments`)
      .set(g.auth)
      .attach('file', PDF, { filename: 'facture.pdf', contentType: 'application/pdf' })
      .expect(201);
    await post('/tasks', g, { title: 'Cadeau de Tom (perso Grace)', visibility: 'PERSONAL' });
    await post('/tasks', n, {
      title: 'Surprise pour Grace (perso Nicolas)',
      visibility: 'PERSONAL',
    });
    await post('/templates', g, {
      name: 'Samedi',
      items: [{ title: 'Aspirateur', assigneeIds: [n.memberId] }],
    });
    await post('/shopping', g, { text: '2 kg de pommes' });
    await http()
      .put(`${h.base}/shopping-barcodes/2001234567893`)
      .set(g.auth)
      .send({ name: 'Lait de la ferme' })
      .expect(200);
    await post('/meals', g, {
      date: today,
      slot: 'DINNER',
      title: 'Soupe',
      ingredients: ['Poireaux'],
    });
    const note = await post('/notes', g, { title: 'Wi-Fi', body: 'Code : 1234', secret: true });
    await http()
      .patch(`${h.base}/notes/${note.body.id}`)
      .set(n.auth)
      .send({ body: 'Code : 5678', version: note.body.version })
      .expect(200);
    await post('/important-dates', g, {
      title: 'Anniversaire de mamie',
      kind: 'BIRTHDAY',
      month: 3,
      day: 14,
    });
    const expense = await post('/expenses', g, {
      paidById: g.memberId,
      amountCents: 4210,
      date: today,
      title: 'Pharmacie',
    });
    await http()
      .post(`${h.base}/expenses/${expense.body.id}/receipt`)
      .set(g.auth)
      .attach('file', PNG, { filename: 'ticket.png', contentType: 'image/png' })
      .expect(201);
    await post('/expenses', n, {
      paidById: n.memberId,
      amountCents: 999,
      date: today,
      title: 'Perso Nicolas',
      split: 'PERSONAL',
    });
    await post('/expenses/recurring', n, {
      paidById: n.memberId,
      amountCents: 95000,
      title: 'Loyer',
      category: 'HOUSING',
      startDate: today,
    });
    await post('/absences', n, {
      memberId: g.memberId,
      startDate: addDays(today, 5),
      endDate: addDays(today, 6),
    });
    return h;
  }

  const download = (base: string, auth: Record<string, string>, body: object = {}) =>
    http().post(`${base}/backup`).set(auth).send(body).buffer(true).parse(binary);

  it('export : archive complète, sans les éléments personnels de l’autre, puis restauration', async () => {
    const h = await filledHousehold();
    const res = await download(h.base, h.grace.auth).expect(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="tandem-foyer-/);
    const files = unzipSync(new Uint8Array(res.body as Buffer));
    const backup = JSON.parse(strFromU8(files['tandem-backup.json']!));
    expect(backup).toMatchObject({ kind: 'tandem-household-backup', version: 1 });
    const titles = (backup.data.tasks as { title: string }[]).map((t) => t.title);
    expect(titles).toContain('Cadeau de Tom (perso Grace)');
    expect(titles).not.toContain('Surprise pour Grace (perso Nicolas)');
    expect((backup.data.expenses as { title: string }[]).map((e) => e.title)).toContain(
      'Pharmacie',
    );
    expect((backup.data.expenses as { title: string }[]).map((e) => e.title)).not.toContain(
      'Perso Nicolas',
    );
    // Fichiers rangés à part ; la colonne binaire n'est pas dans le JSON.
    const attachment = backup.data.attachments[0];
    expect(attachment.data).toBeUndefined();
    expect(Buffer.from(files[`files/attachments/${attachment.id}`]!)).toEqual(PDF);
    expect(Object.keys(files).filter((f) => f.startsWith('files/expenseReceipts/'))).toHaveLength(
      1,
    );
    // Comptes : l'adresse seulement (pour retrouver chacun), jamais de mot de passe.
    expect(JSON.stringify(backup)).not.toMatch(/passwordHash|\$argon2/);
    expect(backup.members.map((m: { email: string }) => m.email).sort()).toEqual(
      [h.grace.email, h.nicolas.email].sort(),
    );

    // Une autre instance : un compte neuf, sans foyer, restaure l'archive.
    const emma = await registerUser(app, 'Emma');
    const restored = await http()
      .post('/v1/households/restore')
      .set(emma.auth)
      .attach('file', res.body as Buffer, {
        filename: 'sauvegarde.zip',
        contentType: 'application/zip',
      })
      .expect(201);
    const newId = restored.body.household.id as string;
    expect(newId).not.toBe(h.householdId);
    // Adresse inconnue dans la sauvegarde : Emma reprend le membre de celle qui a exporté.
    const members = restored.body.household.members as {
      id: string;
      displayName: string;
      userId: string | null;
      pending?: boolean;
    }[];
    const meGrace = members.find((m) => m.displayName === 'Grace')!;
    const otherNicolas = members.find((m) => m.displayName === 'Nicolas')!;
    expect(meGrace.userId).toBe(emma.userId);
    expect(otherNicolas).toMatchObject({ userId: null, pending: true });
    expect(restored.body.invitations).toEqual([
      expect.objectContaining({
        displayName: 'Nicolas',
        email: h.nicolas.email,
        memberId: otherNicolas.id,
      }),
    ]);
    expect(restored.body.counts).toMatchObject({
      tasks: 2,
      attachments: 1,
      expenseReceipts: 1,
      notes: 1,
    });

    // Tout est neuf (aucun identifiant repris) et rattaché au nouveau foyer.
    const newBase = `/v1/households/${newId}`;
    const tasks = await prisma.task.findMany({ where: { householdId: newId } });
    expect(tasks.map((t) => t.title).sort()).toEqual([
      'Cadeau de Tom (perso Grace)',
      'Salle de bain',
    ]);
    const oldTaskIds = new Set(
      (await prisma.task.findMany({ where: { householdId: h.householdId } })).map((t) => t.id),
    );
    expect(tasks.some((t) => oldTaskIds.has(t.id))).toBe(false);
    const done = await prisma.taskOccurrence.findFirst({
      where: { householdId: newId, status: 'DONE' },
    });
    expect(done?.completedById).toBe(otherNicolas.id);
    const template = await prisma.taskTemplate.findFirst({ where: { householdId: newId } });
    expect((template!.items as { assigneeIds: string[] }[])[0]!.assigneeIds).toEqual([
      otherNicolas.id,
    ]);
    // Fichiers repris à l'octet près.
    const attach = await prisma.taskAttachment.findFirst({ where: { householdId: newId } });
    expect(Buffer.from(attach!.data)).toEqual(PDF);
    const receipt = await prisma.expenseReceipt.findFirst({ where: { householdId: newId } });
    expect(Buffer.from(receipt!.data)).toEqual(PNG);
    // Note sensible : toujours sensible, avec son historique.
    const note = await prisma.note.findFirst({
      where: { householdId: newId },
      include: { revisions: true },
    });
    expect(note).toMatchObject({ secret: true, body: 'Code : 5678' });
    expect(note!.revisions.map((r) => r.body)).toEqual(['Code : 1234']);
    expect(await prisma.shoppingBarcode.count({ where: { householdId: newId } })).toBe(1);
    // Le foyer restauré se lit par l'API comme un autre.
    const list = await http().get(`${newBase}/shopping`).set(emma.auth).expect(200);
    expect(list.body.map((i: { text: string }) => i.text)).toEqual(['pommes']);

    // Nicolas arrive sur l'instance avec son adresse : il reprend son membre et son historique.
    await http()
      .post('/v1/invitations/accept')
      .set(h.nicolas.auth)
      .send({ token: restored.body.invitations[0].token })
      .expect(201);
    const after = await http().get(newBase).set(h.nicolas.auth).expect(200);
    const nicolasNow = after.body.members.find(
      (m: { displayName: string }) => m.displayName === 'Nicolas',
    );
    expect(nicolasNow).toMatchObject({ id: otherNicolas.id, userId: h.nicolas.userId });
    expect(nicolasNow.pending).toBeUndefined();
    expect(after.body.members).toHaveLength(2);
  });

  it('restaurer depuis un compte qui a déjà un foyer, ou une archive invalide : refusé', async () => {
    const h = await filledHousehold();
    const zip = (await download(h.base, h.grace.auth).expect(200)).body as Buffer;
    const upload = (auth: Record<string, string>, body: Buffer) =>
      http()
        .post('/v1/households/restore')
        .set(auth)
        .attach('file', body, { filename: 'sauvegarde.zip', contentType: 'application/zip' });
    await upload(h.grace.auth, zip).expect(409);

    const lea = await registerUser(app, 'Lea');
    const bad = async (archive: Uint8Array) => {
      const r = await upload(lea.auth, Buffer.from(archive)).expect(422);
      expect(r.body.error.code).toBe('BACKUP_INVALID');
    };
    await bad(strToU8('pas un zip'));
    await bad(zipSync({ 'autre.json': strToU8('{}') }));
    const backup = JSON.parse(strFromU8(unzipSync(new Uint8Array(zip))['tandem-backup.json']!));
    // Référence vers une tâche inexistante : rien n'est créé.
    const tampered = structuredClone(backup);
    tampered.data.occurrences[0].taskId = '00000000-0000-4000-8000-000000000000';
    await bad(zipSync({ 'tandem-backup.json': strToU8(JSON.stringify(tampered)) }));
    // Mauvais type de colonne.
    const typed = structuredClone(backup);
    typed.data.tasks[0].priority = 'TRES_URGENT';
    await bad(zipSync({ 'tandem-backup.json': strToU8(JSON.stringify(typed)) }));
    // Fichier annoncé mais absent.
    await bad(zipSync({ 'tandem-backup.json': strToU8(JSON.stringify(backup)) }));
    // Version inconnue.
    await bad(
      zipSync({ 'tandem-backup.json': strToU8(JSON.stringify({ ...backup, version: 99 })) }),
    );
    expect(await prisma.householdMember.count({ where: { userId: lea.userId } })).toBe(0);
  });

  it('export : membres du foyer seulement ; sur le site, mot de passe demandé', async () => {
    const h = await coupleHousehold(app);
    const other = await coupleHousehold(app);
    const denied = await download(h.base, other.grace.auth);
    expect([403, 404]).toContain(denied.status);

    // Connexion par le site (cookie) : coffre fermé, mot de passe demandé.
    const login = await http()
      .post('/v1/auth/login')
      .set(CSRF)
      .send({ email: h.grace.email, password: 'correct horse battery' })
      .expect(200);
    const cookie = (login.headers['set-cookie'] as unknown as string[])
      .map((c) => c.split(';')[0])
      .join('; ');
    const web = { cookie, ...CSRF };
    const locked = await download(h.base, web).expect(403);
    expect(JSON.parse((locked.body as Buffer).toString()).error).toMatchObject({
      code: 'VAULT_LOCKED',
      details: { method: 'password' },
    });
    await download(h.base, web, { password: 'mauvais mot de passe' }).expect(403);
    await download(h.base, web, { password: 'correct horse battery' }).expect(200);
  });
});
