import PostalMime from 'postal-mime';
import { describe, expect, it } from 'vitest';
import { htmlToText, toPayload } from './index';

const RAW = [
  'From: =?UTF-8?Q?Garage_M=C3=BCller?= <contact@garage.example>',
  'To: agenda+0123456789abcdef0123456789abcdef@fs0ciety.org',
  'Subject: =?UTF-8?Q?Fwd:_Contr=C3=B4le_technique_vendredi?=',
  'MIME-Version: 1.0',
  'Content-Type: multipart/alternative; boundary="b1"',
  '',
  '--b1',
  'Content-Type: text/plain; charset=utf-8',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  'Rendez-vous =C3=A0 9 h.',
  '--b1',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<p>Rendez-vous <b>à 9 h</b>.</p>',
  '--b1--',
  '',
].join('\r\n');

describe('email worker', () => {
  it('extrait expéditeur, sujet et texte brut (MIME, quoted-printable, UTF-8)', async () => {
    const email = await PostalMime.parse(RAW);
    expect(toPayload('agenda+abc@fs0ciety.org', email)).toEqual({
      to: 'agenda+abc@fs0ciety.org',
      from: 'Garage Müller <contact@garage.example>',
      subject: 'Fwd: Contrôle technique vendredi',
      text: 'Rendez-vous à 9 h.',
    });
  });

  it('HTML seul : converti en texte', () => {
    expect(
      htmlToText('<style>p{}</style><p>Bonjour&nbsp;!</p><ul><li>Un</li><li>Deux</li></ul>'),
    ).toBe('Bonjour !\nUn\nDeux');
  });
});
