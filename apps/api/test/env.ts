import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Charge apps/api/.env si présent (en CI, l'environnement est fourni directement). */
export function loadTestEnv(): string {
  const file = join(__dirname, '..', '.env');
  if (existsSync(file)) process.loadEnvFile(file);
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is required for integration tests');
  if (!/_test\b|test\?/.test(new URL(url).pathname + '?')) {
    throw new Error('TEST_DATABASE_URL must point to a database whose name contains "_test"');
  }
  process.env.DATABASE_URL = url;
  process.env.NODE_ENV = 'test';
  process.env.AUTH_RATE_LIMIT ??= '1000';
  // Intégration Google Calendar « configurée » (le client HTTP est remplacé par un faux en test).
  process.env.GOOGLE_CLIENT_ID ||= 'test-client.apps.googleusercontent.com';
  process.env.GOOGLE_CLIENT_SECRET ||= 'test-secret';
  process.env.TOKEN_ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString('base64');
  process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-123456';
  return url;
}
