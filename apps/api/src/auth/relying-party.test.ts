import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resetEnvCache } from '../config/env';
import { relyingParty } from './passkeys.service';

const set = (rpId?: string, origins?: string) => {
  if (rpId === undefined) delete process.env.WEBAUTHN_RP_ID;
  else process.env.WEBAUTHN_RP_ID = rpId;
  if (origins === undefined) delete process.env.WEBAUTHN_ORIGINS;
  else process.env.WEBAUTHN_ORIGINS = origins;
  resetEnvCache();
};

beforeEach(() => {
  process.env.DATABASE_URL ||= 'postgresql://unit@localhost/unit_test';
  process.env.JWT_SECRET ||= 'unit-secret-unit-secret-unit-secret-1234';
  process.env.WEB_ORIGIN = 'https://tandem-agenda.app';
});
afterEach(() => set());

describe('passkeys : domaine et origines', () => {
  it('par défaut : WEB_ORIGIN', () => {
    set();
    expect(relyingParty()).toEqual({
      id: 'tandem-agenda.app',
      origins: ['https://tandem-agenda.app'],
    });
  });

  it('origine sans https:// complétée', () => {
    set('tandem-agenda.app', 'tandem-agenda.app');
    expect(relyingParty().origins).toEqual(['https://tandem-agenda.app']);
  });

  it('domaine parent accepté pour un sous-domaine', () => {
    set('tandem-agenda.app', 'https://app.tandem-agenda.app');
    expect(relyingParty().id).toBe('tandem-agenda.app');
  });

  it('faute de frappe dans le domaine : ignorée, retour à WEB_ORIGIN', () => {
    set('tandem-afenda.app', 'tandem-agenda.app');
    expect(relyingParty()).toEqual({
      id: 'tandem-agenda.app',
      origins: ['https://tandem-agenda.app'],
    });
  });
});
