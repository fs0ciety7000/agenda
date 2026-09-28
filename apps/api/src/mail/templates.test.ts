import { beforeAll, describe, expect, it } from 'vitest';
import { resetEnvCache } from '../config/env';
import { passwordResetEmail, testEmail } from './templates';

beforeAll(() => {
  process.env.DATABASE_URL ||= 'postgresql://unit@localhost/unit_test';
  process.env.JWT_SECRET ||= 'unit-secret-unit-secret-unit-secret-1234';
  process.env.WEB_ORIGIN = 'http://localhost:3000';
  resetEnvCache();
});

describe('mise en page des e-mails', () => {
  it('logo, bouton, liens du pied (confidentialité, aide…) en HTML comme en texte', () => {
    const mail = passwordResetEmail(
      'fr',
      'Grace',
      'http://localhost:3000/reset-password?token=abc',
    );
    expect(mail.html).toContain('http://localhost:3000/icons/icon-192.png');
    expect(mail.html).toContain('href="http://localhost:3000/reset-password?token=abc"');
    for (const part of [mail.html, mail.text]) {
      expect(part).toContain('http://localhost:3000/privacy');
      expect(part).toContain('/guide/faq');
      expect(part).toContain('L’équilibre parfait pour votre foyer.');
    }
    expect(mail.text).toContain(
      'Choisir un nouveau mot de passe : http://localhost:3000/reset-password?token=abc',
    );
  });

  it('anglais et contenu échappé', () => {
    const mail = testEmail('en');
    expect(mail.html).toContain('lang="en"');
    expect(mail.html).toContain('Privacy');
    expect(mail.text).toContain('The perfect balance for your household.');
    expect(passwordResetEmail('fr', '<b>x</b>', 'http://x').html).not.toContain('<b>x</b>');
  });
});
