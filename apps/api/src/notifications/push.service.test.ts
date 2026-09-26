import { describe, expect, it } from 'vitest';
import { parseServiceAccount } from './push.service';

const account = {
  type: 'service_account',
  project_id: 'agenda-gn',
  client_email: 'push@agenda-gn.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n',
};

describe('FCM_SERVICE_ACCOUNT : formats acceptés', () => {
  it('vide = désactivé', () => {
    expect(parseServiceAccount(undefined)).toBeNull();
    expect(parseServiceAccount('   ')).toBeNull();
  });

  it('JSON brut, entre guillemets, ou en base64', () => {
    const raw = JSON.stringify(account);
    expect(parseServiceAccount(raw)?.project_id).toBe('agenda-gn');
    expect(parseServiceAccount(`'${raw}'`)?.project_id).toBe('agenda-gn');
    expect(parseServiceAccount(Buffer.from(raw).toString('base64'))?.client_email).toBe(
      account.client_email,
    );
  });

  it('« \\n » littéraux dans la clé : convertis en retours à la ligne', () => {
    const raw = JSON.stringify({
      ...account,
      private_key: account.private_key.replace(/\n/g, '\\n'),
    });
    expect(parseServiceAccount(raw)?.private_key).toBe(account.private_key);
  });

  it('invalide : erreur claire, sans recopier le secret', () => {
    expect(() => parseServiceAccount('{"type":"service_account"')).toThrow('JSON illisible');
    expect(() => parseServiceAccount('{"project_id":"x"}')).toThrow(/missing/);
    try {
      parseServiceAccount('{"private_key":"SECRET-KEY-MATERIAL",');
    } catch (e) {
      expect((e as Error).message).not.toContain('SECRET');
    }
  });
});
