import { INestApplication } from '@nestjs/common';
import { addDays, todayIn } from '@agenda/domain';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { extractToken, titleFrom } from '../src/inbound/inbound-email.service';
import { htmlToText } from '../src/inbound/html-to-text';
import {
  type ReceivedEmail,
  ResendReceivingClient,
  ResendUnavailableError,
} from '../src/inbound/resend-receiving.client';
import { signSvix, verifySvix } from '../src/inbound/svix';
import { coupleHousehold, createTestApp } from './app';

/** Faux client Resend : e-mails « reçus », par identifiant. */
const inbox = new Map<string, ReceivedEmail>();
let resendDown = false;
const fakeResend = {
  get: async (id: string) => {
    if (resendDown) throw new ResendUnavailableError('down');
    const email = inbox.get(id);
    if (!email) throw new ResendUnavailableError('404');
    return email;
  },
};

describe('Tâches par e-mail (Resend)', () => {
  let app: INestApplication;
  const http = () => request(app.getHttpServer());
  const today = todayIn('Europe/Brussels');
  const secret = process.env.RESEND_WEBHOOK_SECRET!;

  /** Livre un e-mail comme Resend : webhook signé, corps récupéré par l'API. */
  const deliver = (to: string, email: Partial<ReceivedEmail>, emailId = randomUUID()) => {
    inbox.set(emailId, {
      from: 'x@example.com',
      to: [to],
      subject: '',
      text: null,
      html: null,
      ...email,
    });
    const body = JSON.stringify({
      type: 'email.received',
      created_at: new Date().toISOString(),
      data: { email_id: emailId, from: email.from ?? '', to: [to], subject: email.subject ?? '' },
    });
    const id = `msg_${randomUUID()}`;
    const ts = Math.floor(Date.now() / 1000);
    return http()
      .post('/v1/inbound/resend')
      .set({
        'content-type': 'application/json',
        'svix-id': id,
        'svix-timestamp': String(ts),
        'svix-signature': signSvix(secret, id, ts, body),
      })
      .send(body);
  };

  beforeAll(async () => {
    app = await createTestApp([{ provide: ResendReceivingClient, useValue: fakeResend }]);
  });
  afterAll(() => app.close());

  it('adresse personnelle ; un e-mail transféré devient une tâche (sujet analysé, message en notes)', async () => {
    const h = await coupleHousehold(app);
    const initial = await http().get(`${h.base}/inbound-email`).set(h.grace.auth).expect(200);
    expect(initial.body).toEqual({ available: true, address: null });
    const created = await http().post(`${h.base}/inbound-email`).set(h.grace.auth).expect(200);
    const address = created.body.address as string;
    expect(address).toMatch(/^[a-f0-9]{32}@tasks\.example\.test$/);

    const res = await deliver(address, {
      from: 'factures@example.com',
      headers: { from: 'Fournisseur <factures@example.com>' },
      subject: 'Fwd: TR: Payer la facture demain',
      text: 'Montant : 42 €\nÉchéance dans 30 jours.',
    }).expect(200);
    const o = (
      await http().get(`${h.base}/occurrences/${res.body.occurrenceId}`).set(h.nicolas.auth)
    ).body;
    expect(o).toMatchObject({ title: 'Payer la facture', date: addDays(today, 1) });
    expect(o.notes).toContain('Fournisseur <factures@example.com>');
    expect(o.notes).toContain('Montant : 42 €');
    const log = (await http().get(`${h.base}/activity`).set(h.nicolas.auth)).body;
    expect(log.items[0]).toMatchObject({ action: 'task.created', actorId: h.grace.memberId });

    // Nouvelle adresse : l'ancienne ne crée plus rien (ignorée, sans nouvel essai de Resend).
    await http().post(`${h.base}/inbound-email`).set(h.grace.auth).expect(200);
    expect((await deliver(address, { subject: 'Autre chose' }).expect(200)).body).toEqual({
      ignored: 'address',
    });
    await http().delete(`${h.base}/inbound-email`).set(h.grace.auth).expect(204);
    expect((await http().get(`${h.base}/inbound-email`).set(h.grace.auth)).body.address).toBeNull();
  });

  it('signature obligatoire ; doublon ignoré ; Resend indisponible → nouvel essai', async () => {
    const h = await coupleHousehold(app);
    const { address } = (await http().post(`${h.base}/inbound-email`).set(h.grace.auth)).body;
    await http()
      .post('/v1/inbound/resend')
      .set({ 'svix-id': 'x', 'svix-timestamp': String(Math.floor(Date.now() / 1000)) })
      .set('svix-signature', 'v1,AAAA')
      .send({ type: 'email.received', data: { email_id: 'x', to: [address] } })
      .expect(401);

    // HTML seul, sans sujet : la première ligne devient le titre.
    const emailId = randomUUID();
    const first = await deliver(
      address,
      { html: '<p>Rappeler le plombier</p><p>Merci</p>' },
      emailId,
    ).expect(200);
    const o = (
      await http().get(`${h.base}/occurrences/${first.body.occurrenceId}`).set(h.grace.auth)
    ).body;
    expect(o.title).toBe('Rappeler le plombier');
    // Même e-mail livré deux fois par Resend : une seule tâche.
    expect((await deliver(address, {}, emailId).expect(200)).body).toEqual({
      ignored: 'duplicate',
    });

    resendDown = true;
    const retryId = randomUUID();
    await deliver(address, { subject: 'Réessayer' }, retryId).expect(502);
    resendDown = false;
    const retried = await deliver(address, { subject: 'Réessayer' }, retryId).expect(200);
    expect(retried.body.occurrenceId).toBeTruthy();
  });

  it('extraction du jeton, du titre et du texte ; signature Svix', () => {
    expect(extractToken('"A" <ABCDEF0123456789ABCDEF0123456789@tasks.example.test>, b@x.be')).toBe(
      'abcdef0123456789abcdef0123456789',
    );
    expect(extractToken('agenda@tasks.example.test')).toBeNull();
    expect(titleFrom('RE: Fwd:  Réserver   le garage', '')).toBe('Réserver le garage');
    expect(titleFrom('', '')).toBe('');
    expect(
      htmlToText(
        `data:text/html;base64,${Buffer.from('<style>p{}</style><p>Bonjour&nbsp;!</p><li>Un</li>').toString('base64')}`,
      ),
    ).toBe('Bonjour !\nUn');
    const s = `whsec_${Buffer.from('k').toString('base64')}`;
    const now = Date.now();
    const sig = signSvix(s, 'id', Math.floor(now / 1000), '{}');
    expect(
      verifySvix(
        s,
        { id: 'id', timestamp: String(Math.floor(now / 1000)), signature: `v0,x ${sig}` },
        '{}',
        now,
      ),
    ).toBe(true);
    // Trop ancien (rejeu) ou corps modifié : refusé.
    expect(
      verifySvix(
        s,
        { id: 'id', timestamp: String(Math.floor(now / 1000)), signature: sig },
        '{} ',
        now,
      ),
    ).toBe(false);
    expect(
      verifySvix(
        s,
        { id: 'id', timestamp: String(Math.floor(now / 1000)), signature: sig },
        '{}',
        now + 10 * 60_000,
      ),
    ).toBe(false);
  });
});
