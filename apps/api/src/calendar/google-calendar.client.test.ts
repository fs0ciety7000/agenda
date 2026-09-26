import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpGoogleCalendarClient } from './google-calendar.client';

process.env.DATABASE_URL ||= 'postgresql://unit@localhost/unit';
process.env.JWT_SECRET ||= 'unit-test-secret-unit-test-secret-1234';

describe('HttpGoogleCalendarClient — erreurs OAuth', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('invalid_client : la description de Google figure dans le message (logs)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { error: 'invalid_client', error_description: 'Unauthorized' },
          { status: 401 },
        ),
      ),
    );
    const err = await new HttpGoogleCalendarClient()
      .exchangeCode({ code: 'c', redirectUri: 'https://x.test/cb', codeVerifier: 'v' })
      .catch((e: Error) => e);
    expect(err).toMatchObject({ kind: 'unauthorized', status: 401 });
    expect((err as Error).message).toBe(
      'Google API 401 unauthorized (invalid_client: Unauthorized)',
    );
  });

  it('invalid_grant reste classé invalid_grant', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          { error: 'invalid_grant', error_description: 'Bad Request' },
          { status: 400 },
        ),
      ),
    );
    const err = await new HttpGoogleCalendarClient().refresh('rt').catch((e: Error) => e);
    expect(err).toMatchObject({ kind: 'invalid_grant' });
  });
});
